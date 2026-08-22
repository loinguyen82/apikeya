-- A6 authentication failures happen before any model execution and are safe to
-- release. Keep this provider-specific instead of weakening the global retry policy.
update public.providers
set safe_no_charge_statuses = (
  select array_agg(distinct status order by status)
  from unnest(coalesce(safe_no_charge_statuses, '{}'::int[]) || array[401]) as status
),
updated_at = now()
where id = 'a6api';

-- Reconcile historical A6 401s that were conservatively marked ambiguous before
-- the provider's safe-no-charge contract was configured. Only rows with no prior
-- release ledger entry are touched, so this migration is idempotent.
with eligible as materialized (
  select r.id, r.user_id, r.reserve_micros
  from public.api_requests r
  where r.status = 'failed_ambiguous'
    and r.error_code = 'UPSTREAM_HTTP_401'
    and not exists (
      select 1
      from public.wallet_ledger l
      where l.idempotency_key = 'release:' || r.id::text
    )
  for update
),
wallet_totals as (
  select user_id, sum(reserve_micros) as total_release
  from eligible
  group by user_id
),
wallet_updates as (
  update public.wallets w
  set available_micros = w.available_micros + t.total_release,
      reserved_micros = w.reserved_micros - t.total_release,
      updated_at = now()
  from wallet_totals t
  where w.user_id = t.user_id
    and w.reserved_micros >= t.total_release
  returning w.user_id
),
ledger_inserts as (
  insert into public.wallet_ledger(
    user_id,
    kind,
    delta_available_micros,
    delta_reserved_micros,
    reference_type,
    reference_id,
    idempotency_key,
    metadata
  )
  select e.user_id,
         'release',
         e.reserve_micros,
         -e.reserve_micros,
         'api_request',
         e.id,
         'release:' || e.id::text,
         jsonb_build_object('reason', 'a6_http_401_safe_release')
  from eligible e
  join wallet_updates wu on wu.user_id = e.user_id
  on conflict do nothing
  returning reference_id
)
update public.api_requests r
set status = 'released',
    error_code = 'UPSTREAM_HTTP_401_SAFE_RELEASE',
    completed_at = coalesce(r.completed_at, now())
from eligible e
join wallet_updates wu on wu.user_id = e.user_id
where r.id = e.id;
