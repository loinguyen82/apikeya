create extension if not exists pgcrypto;

create type public.user_role as enum ('customer','admin');
create type public.api_key_status as enum ('active','revoked');
create type public.model_status as enum ('active','degraded','disabled');
create type public.provider_status as enum ('healthy','degraded','disabled');
create type public.api_request_status as enum ('reserved','dispatching','streaming','settled','released','failed_ambiguous');
create type public.provider_attempt_status as enum ('dispatching','streaming','succeeded','safe_failed','ambiguous_failed');
create type public.topup_status as enum ('pending','paid','expired','cancelled','refunded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_micros bigint not null default 0 check (available_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  updated_at timestamptz not null default now()
);

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('topup','bonus','reserve','release','settle_refund','settle_extra','manual_adjustment','refund')),
  delta_available_micros bigint not null,
  delta_reserved_micros bigint not null,
  reference_type text not null,
  reference_id uuid not null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index wallet_ledger_idem_unique on public.wallet_ledger(idempotency_key) where idempotency_key is not null;
create index wallet_ledger_user_created_idx on public.wallet_ledger(user_id,created_at desc);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  prefix text not null,
  secret_hash text not null unique,
  status public.api_key_status not null default 'active',
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index api_keys_user_idx on public.api_keys(user_id,created_at desc);

create table public.providers (
  id text primary key,
  name text not null,
  base_url text not null,
  api_key_secret_name text not null,
  status public.provider_status not null default 'healthy',
  timeout_ms integer not null default 45000 check (timeout_ms between 1000 and 120000),
  safe_no_charge_statuses integer[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.models (
  id text primary key,
  display_name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  status public.model_status not null default 'active',
  pricing_mode text not null check (pricing_mode in ('flat_total','split_io')),
  retail_flat_micros_per_mtoken bigint check (retail_flat_micros_per_mtoken is null or retail_flat_micros_per_mtoken > 0),
  retail_input_micros_per_mtoken bigint check (retail_input_micros_per_mtoken is null or retail_input_micros_per_mtoken > 0),
  retail_output_micros_per_mtoken bigint check (retail_output_micros_per_mtoken is null or retail_output_micros_per_mtoken > 0),
  default_max_output_tokens integer not null default 2048,
  max_output_tokens integer not null default 8192,
  streaming_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (pricing_mode='flat_total' and retail_flat_micros_per_mtoken is not null)
    or
    (pricing_mode='split_io' and retail_input_micros_per_mtoken is not null and retail_output_micros_per_mtoken is not null)
  )
);

create table public.provider_models (
  provider_id text not null references public.providers(id) on delete cascade,
  model_id text not null references public.models(id) on delete cascade,
  upstream_model text not null,
  priority integer not null default 100,
  enabled boolean not null default true,
  supports_stream_usage boolean not null default false,
  upstream_input_micros_per_mtoken bigint not null check (upstream_input_micros_per_mtoken >= 0),
  upstream_output_micros_per_mtoken bigint not null check (upstream_output_micros_per_mtoken >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(provider_id,model_id)
);

create table public.api_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  api_key_id uuid references public.api_keys(id) on delete restrict,
  channel text not null default 'api' check (channel in ('api','playground')),
  model_id text not null references public.models(id) on delete restrict,
  status public.api_request_status not null,
  idempotency_key text,
  reserve_micros bigint not null check (reserve_micros >= 0),
  pricing_mode_snapshot text not null check (pricing_mode_snapshot in ('flat_total','split_io')),
  retail_flat_micros_per_mtoken_snapshot bigint,
  retail_input_micros_per_mtoken_snapshot bigint,
  retail_output_micros_per_mtoken_snapshot bigint,
  reserve_estimated_input_tokens integer not null default 0 check (reserve_estimated_input_tokens >= 0),
  reserve_max_output_tokens integer not null default 0 check (reserve_max_output_tokens >= 0),
  retail_cost_micros bigint not null default 0 check (retail_cost_micros >= 0),
  upstream_cost_micros bigint not null default 0 check (upstream_cost_micros >= 0),
  billing_gap_micros bigint not null default 0 check (billing_gap_micros >= 0),
  input_tokens integer,
  output_tokens integer,
  provider_id text references public.providers(id),
  provider_request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create unique index api_requests_idem_unique on public.api_requests(user_id,idempotency_key) where idempotency_key is not null;
create index api_requests_user_created_idx on public.api_requests(user_id,created_at desc);

create table public.provider_attempts (
  id uuid primary key default gen_random_uuid(),
  api_request_id uuid not null references public.api_requests(id) on delete restrict,
  provider_id text not null references public.providers(id) on delete restrict,
  upstream_model text not null,
  priority_snapshot integer not null,
  upstream_input_micros_per_mtoken_snapshot bigint not null check (upstream_input_micros_per_mtoken_snapshot >= 0),
  upstream_output_micros_per_mtoken_snapshot bigint not null check (upstream_output_micros_per_mtoken_snapshot >= 0),
  status public.provider_attempt_status not null,
  provider_request_id text,
  input_tokens integer,
  output_tokens integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index provider_attempts_request_idx on public.provider_attempts(api_request_id,created_at);

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create table public.topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  amount_micros bigint not null check (amount_micros > 0),
  bonus_micros bigint not null default 0 check (bonus_micros >= 0),
  payable_vnd bigint not null check (payable_vnd > 0),
  payment_provider text not null,
  external_id text,
  status public.topup_status not null default 'pending',
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index topups_external_unique on public.topups(payment_provider,external_id) where external_id is not null;

create or replace function public.bootstrap_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id) values(new.id) on conflict do nothing;
  insert into public.wallets(user_id) values(new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.bootstrap_user();
