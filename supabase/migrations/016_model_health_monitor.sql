alter table public.provider_models
  add column if not exists health_status text not null default 'unknown',
  add column if not exists health_consecutive_failures integer not null default 0,
  add column if not exists health_last_checked_at timestamptz,
  add column if not exists health_last_success_at timestamptz,
  add column if not exists health_latency_ms integer,
  add column if not exists health_http_status integer,
  add column if not exists health_error_code text,
  add column if not exists health_error_message text,
  add column if not exists health_changed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'provider_models_health_status_check'
  ) then
    alter table public.provider_models
      add constraint provider_models_health_status_check
      check (health_status in ('unknown', 'live', 'degraded', 'dead'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'provider_models_health_failures_check'
  ) then
    alter table public.provider_models
      add constraint provider_models_health_failures_check
      check (health_consecutive_failures >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'provider_models_health_latency_check'
  ) then
    alter table public.provider_models
      add constraint provider_models_health_latency_check
      check (health_latency_ms is null or health_latency_ms >= 0);
  end if;
end $$;

create index if not exists provider_models_health_status_idx
  on public.provider_models (health_status, model_id)
  where enabled = true;
