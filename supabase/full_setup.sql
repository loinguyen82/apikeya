-- ============================================================================
-- AI API RESELLER V4 — FULL ALL-IN-ONE SETUP SCRIPT CHO SUPABASE
-- Chạy toàn bộ file này trong SQL Editor của Supabase (Chỉ cần chạy 1 lần duy nhất)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS & ENUMS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('customer','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.api_key_status as enum ('active','revoked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.model_status as enum ('active','degraded','disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provider_status as enum ('healthy','degraded','disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.api_request_status as enum ('reserved','dispatching','streaming','settled','released','failed_ambiguous');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provider_attempt_status as enum ('dispatching','streaming','succeeded','safe_failed','ambiguous_failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.topup_status as enum ('pending','paid','expired','cancelled','refunded');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. TABLES & INDEXES
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  available_micros bigint not null default 0 check (available_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
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
create unique index if not exists wallet_ledger_idem_unique on public.wallet_ledger(idempotency_key) where idempotency_key is not null;
create index if not exists wallet_ledger_user_created_idx on public.wallet_ledger(user_id,created_at desc);

create table if not exists public.api_keys (
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
create index if not exists api_keys_user_idx on public.api_keys(user_id,created_at desc);

create table if not exists public.providers (
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

create table if not exists public.models (
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
  context_window_tokens integer check (context_window_tokens is null or context_window_tokens > 0),
  tokenizer_family text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (pricing_mode='flat_total' and retail_flat_micros_per_mtoken is not null)
    or
    (pricing_mode='split_io' and retail_input_micros_per_mtoken is not null and retail_output_micros_per_mtoken is not null)
  )
);

create table if not exists public.provider_models (
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

create table if not exists public.api_requests (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  api_key_id uuid references public.api_keys(id) on delete restrict,
  channel text not null default 'api' check (channel in ('api','playground')),
  model_id text not null references public.models(id) on delete restrict,
  requested_model_id text,
  stream boolean not null default false,
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
  cached_input_tokens integer check (cached_input_tokens is null or cached_input_tokens >= 0),
  cache_creation_input_tokens integer check (cache_creation_input_tokens is null or cache_creation_input_tokens >= 0),
  output_tokens integer,
  reasoning_tokens integer check (reasoning_tokens is null or reasoning_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  provider_id text references public.providers(id),
  provider_request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  first_token_at timestamptz,
  completed_at timestamptz
);
create unique index if not exists api_requests_idem_unique on public.api_requests(user_id,idempotency_key) where idempotency_key is not null;
create index if not exists api_requests_user_created_idx on public.api_requests(user_id,created_at desc);
create index if not exists api_requests_user_created_id_idx on public.api_requests(user_id,created_at desc,id desc);

create table if not exists public.provider_attempts (
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
  cached_input_tokens integer check (cached_input_tokens is null or cached_input_tokens >= 0),
  cache_creation_input_tokens integer check (cache_creation_input_tokens is null or cache_creation_input_tokens >= 0),
  output_tokens integer,
  reasoning_tokens integer check (reasoning_tokens is null or reasoning_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  first_token_at timestamptz,
  completed_at timestamptz
);
create index if not exists provider_attempts_request_idx on public.provider_attempts(api_request_id,created_at);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.topups (
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
create unique index if not exists topups_external_unique on public.topups(payment_provider,external_id) where external_id is not null;
create unique index if not exists topups_one_pending_per_user on public.topups(user_id) where status='pending';

-- ----------------------------------------------------------------------------
-- 3. USER BOOTSTRAP TRIGGER
-- ----------------------------------------------------------------------------
create or replace function public.bootstrap_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id) values(new.id) on conflict do nothing;
  insert into public.wallets(user_id) values(new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.bootstrap_user();

-- ----------------------------------------------------------------------------
-- 4. ATOMIC BILLING & TOPUP RPC FUNCTIONS (SECURITY DEFINER)
-- ----------------------------------------------------------------------------
create or replace function public.reserve_api_request(
  p_request_id uuid,
  p_user_id uuid,
  p_api_key_id uuid,
  p_channel text,
  p_model_id text,
  p_requested_model_id text,
  p_reserve_micros bigint,
  p_idempotency_key text default null,
  p_pricing_mode_snapshot text default null,
  p_retail_flat_snapshot bigint default null,
  p_retail_input_snapshot bigint default null,
  p_retail_output_snapshot bigint default null,
  p_estimated_input_tokens integer default 0,
  p_max_output_tokens integer default 0,
  p_stream boolean default false
) returns public.api_requests
language plpgsql security definer set search_path=public as $$
declare
  v_wallet public.wallets;
  v_existing public.api_requests;
  v_request public.api_requests;
begin
  if p_reserve_micros <= 0 then raise exception 'INVALID_RESERVE'; end if;
  if p_channel not in ('api','playground') then raise exception 'INVALID_CHANNEL'; end if;
  if p_channel='api' and p_api_key_id is null then raise exception 'API_KEY_REQUIRED'; end if;
  if p_pricing_mode_snapshot not in ('flat_total','split_io') then raise exception 'INVALID_PRICE_SNAPSHOT'; end if;
  if p_idempotency_key is not null and length(p_idempotency_key)>128 then raise exception 'IDEMPOTENCY_KEY_TOO_LONG'; end if;
  
  if p_idempotency_key is not null then
    select * into v_existing from public.api_requests where user_id=p_user_id and idempotency_key=p_idempotency_key;
    if found then return v_existing; end if;
  end if;
  
  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;
  if v_wallet.available_micros < p_reserve_micros then raise exception 'INSUFFICIENT_BALANCE'; end if;
  
  update public.wallets
    set available_micros=available_micros-p_reserve_micros,
        reserved_micros=reserved_micros+p_reserve_micros,
        updated_at=now()
    where user_id=p_user_id;
    
  insert into public.api_requests(
    id,user_id,api_key_id,channel,model_id,requested_model_id,status,reserve_micros,idempotency_key,started_at,stream,
    pricing_mode_snapshot,retail_flat_micros_per_mtoken_snapshot,retail_input_micros_per_mtoken_snapshot,
    retail_output_micros_per_mtoken_snapshot,reserve_estimated_input_tokens,reserve_max_output_tokens
  ) values(
    p_request_id,p_user_id,p_api_key_id,p_channel,p_model_id,p_requested_model_id,'reserved',p_reserve_micros,p_idempotency_key,now(),coalesce(p_stream,false),
    p_pricing_mode_snapshot,p_retail_flat_snapshot,p_retail_input_snapshot,p_retail_output_snapshot,
    p_estimated_input_tokens,p_max_output_tokens
  ) returning * into v_request;
  
  insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
    values(p_user_id,'reserve',-p_reserve_micros,p_reserve_micros,'api_request',p_request_id,case when p_idempotency_key is null then null else 'reserve:'||p_idempotency_key end);
    
  return v_request;
exception when unique_violation then
  if p_idempotency_key is not null then
    select * into v_existing from public.api_requests where user_id=p_user_id and idempotency_key=p_idempotency_key;
    return v_existing;
  end if;
  raise;
end; $$;

create or replace function public.settle_api_request(
  p_request_id uuid,
  p_retail_cost_micros bigint,
  p_upstream_cost_micros bigint,
  p_input_tokens integer,
  p_cached_input_tokens integer,
  p_cache_creation_input_tokens integer,
  p_output_tokens integer,
  p_reasoning_tokens integer,
  p_total_tokens integer,
  p_provider_id text,
  p_provider_request_id text default null,
  p_first_token_at timestamptz default null
) returns public.api_requests
language plpgsql security definer set search_path=public as $$
declare
  r public.api_requests;
  w public.wallets;
  extra_needed bigint;
  extra_collected bigint;
  refund bigint;
  gap bigint;
begin
  if p_retail_cost_micros < 0 or p_upstream_cost_micros < 0
    or p_input_tokens < 0 or p_output_tokens < 0
    or (p_cached_input_tokens is not null and p_cached_input_tokens < 0)
    or (p_cache_creation_input_tokens is not null and p_cache_creation_input_tokens < 0)
    or (p_reasoning_tokens is not null and p_reasoning_tokens < 0)
    or (p_total_tokens is not null and p_total_tokens < 0) then
    raise exception 'INVALID_SETTLEMENT_VALUES';
  end if;
  if p_provider_id is null or length(trim(p_provider_id)) = 0 then
    raise exception 'PROVIDER_REQUIRED';
  end if;
  select * into r from public.api_requests where id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status='settled' then return r; end if;
  if r.status='released' then raise exception 'REQUEST_ALREADY_RELEASED'; end if;
  if r.status='failed_ambiguous' then raise exception 'REQUEST_NOT_SETTLEABLE'; end if;
  if r.status not in ('reserved', 'dispatching', 'streaming') then raise exception 'INVALID_REQUEST_STATE'; end if;
  select * into w from public.wallets where user_id=r.user_id for update;
  if not found then raise exception 'WALLET_NOT_FOUND'; end if;

  if p_retail_cost_micros <= r.reserve_micros then
    refund := r.reserve_micros - p_retail_cost_micros;
    update public.wallets set reserved_micros=reserved_micros-r.reserve_micros, available_micros=available_micros+refund, updated_at=now() where user_id=r.user_id;
    insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
      values(r.user_id,'settle_refund',refund,-r.reserve_micros,'api_request',r.id,'settle:'||r.id::text)
      on conflict do nothing;
    gap := 0;
  else
    extra_needed := p_retail_cost_micros - r.reserve_micros;
    extra_collected := least(extra_needed, w.available_micros);
    gap := extra_needed - extra_collected;
    update public.wallets set reserved_micros=reserved_micros-r.reserve_micros, available_micros=available_micros-extra_collected, updated_at=now() where user_id=r.user_id;
    insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key,metadata)
      values(r.user_id,'settle_extra',-extra_collected,-r.reserve_micros,'api_request',r.id,'settle:'||r.id::text,jsonb_build_object('billing_gap_micros',gap))
      on conflict do nothing;
  end if;

  update public.api_requests set
    status='settled', retail_cost_micros=p_retail_cost_micros, upstream_cost_micros=p_upstream_cost_micros,
    billing_gap_micros=gap, input_tokens=p_input_tokens, cached_input_tokens=p_cached_input_tokens,
    cache_creation_input_tokens=p_cache_creation_input_tokens, output_tokens=p_output_tokens,
    reasoning_tokens=p_reasoning_tokens, total_tokens=p_total_tokens, provider_id=p_provider_id,
    provider_request_id=p_provider_request_id, first_token_at=coalesce(first_token_at,p_first_token_at), completed_at=now()
    where id=r.id returning * into r;
  return r;
end; $$;

create or replace function public.release_api_request(
  p_request_id uuid,
  p_error_code text
) returns public.api_requests
language plpgsql security definer set search_path=public as $$
declare
  r public.api_requests;
begin
  select * into r from public.api_requests where id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status='released' then return r; end if;
  if r.status='settled' then raise exception 'REQUEST_ALREADY_SETTLED'; end if;
  if r.status not in ('reserved', 'dispatching', 'streaming') then raise exception 'REQUEST_NOT_RELEASEABLE'; end if;
  
  update public.wallets set available_micros=available_micros+r.reserve_micros, reserved_micros=reserved_micros-r.reserve_micros, updated_at=now() where user_id=r.user_id;
  insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
    values(r.user_id,'release',r.reserve_micros,-r.reserve_micros,'api_request',r.id,'release:'||r.id::text)
    on conflict do nothing;
    
  update public.api_requests set status='released', error_code=p_error_code, completed_at=now() where id=r.id returning * into r;
  return r;
end; $$;

create or replace function public.apply_paid_topup(
  p_topup_id uuid,
  p_external_id text
) returns public.topups
language plpgsql security definer set search_path=public as $$
declare
  t public.topups;
begin
  select * into t from public.topups where id=p_topup_id for update;
  if not found then raise exception 'TOPUP_NOT_FOUND'; end if;
  if t.status='paid' then return t; end if;
  if t.status<>'pending' then raise exception 'TOPUP_NOT_PENDING'; end if;
  if t.expires_at <= now() then
    update public.topups set status='expired' where id=t.id returning * into t;
    return t;
  end if;
  
  update public.wallets set available_micros=available_micros+t.amount_micros+t.bonus_micros, updated_at=now() where user_id=t.user_id;
  insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
    values(t.user_id,'topup',t.amount_micros,0,'topup',t.id,'topup:'||t.id::text)
    on conflict do nothing;
    
  if t.bonus_micros>0 then
    insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
      values(t.user_id,'bonus',t.bonus_micros,0,'topup',t.id,'bonus:'||t.id::text)
      on conflict do nothing;
  end if;
  
  update public.topups set status='paid', external_id=p_external_id, paid_at=now() where id=t.id returning * into t;
  return t;
end; $$;

-- Phân quyền cho RPC
revoke all on function public.reserve_api_request(uuid,uuid,uuid,text,text,text,bigint,text,text,bigint,bigint,bigint,integer,integer,boolean) from public, anon, authenticated;
revoke all on function public.settle_api_request(uuid,bigint,bigint,integer,integer,integer,integer,integer,integer,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.release_api_request(uuid,text) from public, anon, authenticated;
revoke all on function public.apply_paid_topup(uuid,text) from public, anon, authenticated;

grant execute on function public.reserve_api_request(uuid,uuid,uuid,text,text,text,bigint,text,text,bigint,bigint,bigint,integer,integer,boolean) to service_role;
grant execute on function public.settle_api_request(uuid,bigint,bigint,integer,integer,integer,integer,integer,integer,text,text,timestamptz) to service_role;
grant execute on function public.release_api_request(uuid,text) to service_role;
grant execute on function public.apply_paid_topup(uuid,text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.api_keys enable row level security;
alter table public.models enable row level security;
alter table public.api_requests enable row level security;
alter table public.topups enable row level security;
alter table public.providers enable row level security;
alter table public.provider_models enable row level security;
alter table public.provider_attempts enable row level security;
alter table public.admin_audit_log enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select using (auth.uid()=id);

drop policy if exists wallets_self_read on public.wallets;
create policy wallets_self_read on public.wallets for select using (auth.uid()=user_id);

drop policy if exists ledger_self_read on public.wallet_ledger;
create policy ledger_self_read on public.wallet_ledger for select using (auth.uid()=user_id);

drop policy if exists api_keys_self_read on public.api_keys;
create policy api_keys_self_read on public.api_keys for select using (auth.uid()=user_id);

drop policy if exists models_public_read on public.models;
create policy models_public_read on public.models for select using (status<>'disabled');

drop policy if exists requests_self_read on public.api_requests;
create policy requests_self_read on public.api_requests for select using (auth.uid()=user_id);

drop policy if exists topups_self_read on public.topups;
create policy topups_self_read on public.topups for select using (auth.uid()=user_id);

-- ----------------------------------------------------------------------------
-- 6. SEED DATA (PROVIDERS & REAL MODELS)
-- ----------------------------------------------------------------------------
insert into public.providers(id,name,base_url,api_key_secret_name,status,timeout_ms,safe_no_charge_statuses) values
('a6api','A6API','https://api.a6api.com/v1','A6API_KEY','healthy',60000,'{}')
on conflict(id) do update set name=excluded.name, base_url=excluded.base_url, timeout_ms=excluded.timeout_ms;

insert into public.models(id,display_name,description,tags,status,pricing_mode,retail_flat_micros_per_mtoken,default_max_output_tokens,max_output_tokens,streaming_enabled) values
('kimi-k2.6','Kimi K2.6','Giá siêu rẻ, phù hợp chat và tác vụ thường ngày.',array['Giá rẻ','Chat'],'active','flat_total',300000,2048,8192,true),
('deepseek-v4','DeepSeek V4','Mô hình suy luận và lập trình chi phí cực thấp.',array['Code','Tiết kiệm'],'active','flat_total',800000,4096,8192,true),
('claude-sonnet-5','Claude Sonnet 5','Khả năng code xuất sắc, phân tích logic ngữ cảnh dài.',array['Code','Phân tích'],'active','flat_total',2500000,4096,8192,true),
('gpt-5.6-terra','GPT-5.6 Terra','Cân bằng hoàn hảo giữa tốc độ và độ thông minh.',array['Đa năng','Nhanh'],'active','flat_total',3000000,4096,8192,true),
('gpt-5.6-luna','GPT-5.6 Luna','Phiên bản tối ưu cho sáng tạo nội dung và tác vụ phức tạp.',array['Sáng tạo','Viết lách'],'active','flat_total',3500000,4096,8192,true),
('gpt-5.6-sol','GPT-5.6 Sol','Mô hình mạnh mẽ nhất cho reasoning và giải toán khó.',array['Reasoning','Logic'],'active','flat_total',4000000,4096,8192,true)
on conflict(id) do update set
  display_name=excluded.display_name,
  description=excluded.description,
  tags=excluded.tags,
  status=excluded.status,
  pricing_mode=excluded.pricing_mode,
  retail_flat_micros_per_mtoken=excluded.retail_flat_micros_per_mtoken,
  default_max_output_tokens=excluded.default_max_output_tokens,
  max_output_tokens=excluded.max_output_tokens,
  streaming_enabled=excluded.streaming_enabled;

insert into public.provider_models(provider_id,model_id,upstream_model,priority,enabled,supports_stream_usage,upstream_input_micros_per_mtoken,upstream_output_micros_per_mtoken) values
('a6api','kimi-k2.6','kimi-k2.6',10,true,true,15000,15000),
('a6api','deepseek-v4','deepseek-v4',10,true,true,35000,35000),
('a6api','claude-sonnet-5','claude-sonnet-5',10,true,true,80000,80000),
('a6api','gpt-5.6-terra','gpt-5.6-terra',10,true,true,200000,200000),
('a6api','gpt-5.6-luna','gpt-5.6-luna',10,true,true,250000,250000),
('a6api','gpt-5.6-sol','gpt-5.6-sol',10,true,true,330000,330000)
on conflict(provider_id,model_id) do update set
  upstream_model=excluded.upstream_model,
  priority=excluded.priority,
  enabled=excluded.enabled,
  supports_stream_usage=excluded.supports_stream_usage,
  upstream_input_micros_per_mtoken=excluded.upstream_input_micros_per_mtoken,
  upstream_output_micros_per_mtoken=excluded.upstream_output_micros_per_mtoken;
