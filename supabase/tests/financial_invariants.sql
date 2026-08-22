-- Read-only production check. Every *_violations column should be zero.
with ledger_by_user as (
  select user_id,
         coalesce(sum(delta_available_micros), 0)::bigint as available_micros,
         coalesce(sum(delta_reserved_micros), 0)::bigint as reserved_micros
  from public.wallet_ledger
  group by user_id
),
open_reserves as (
  select user_id, coalesce(sum(reserve_micros), 0)::bigint as reserved_micros
  from public.api_requests
  where status in ('reserved', 'dispatching', 'streaming', 'failed_ambiguous')
  group by user_id
),
wallet_checks as (
  select w.user_id,
         w.available_micros - coalesce(l.available_micros, 0) as available_ledger_diff,
         w.reserved_micros - coalesce(l.reserved_micros, 0) as reserved_ledger_diff,
         w.reserved_micros - coalesce(r.reserved_micros, 0) as reserved_request_diff
  from public.wallets w
  left join ledger_by_user l using (user_id)
  left join open_reserves r using (user_id)
),
request_ledger as (
  select r.id,
         r.status,
         count(*) filter (where l.kind = 'reserve') as reserve_entries,
         count(*) filter (where l.kind in ('settle_refund', 'settle_extra')) as settle_entries,
         count(*) filter (where l.kind = 'release') as release_entries
  from public.api_requests r
  left join public.wallet_ledger l
    on l.reference_type = 'api_request' and l.reference_id = r.id
  group by r.id, r.status
),
topup_ledger as (
  select t.id,
         t.status,
         t.bonus_micros,
         count(*) filter (where l.kind = 'topup') as topup_entries,
         count(*) filter (where l.kind = 'bonus') as bonus_entries
  from public.topups t
  left join public.wallet_ledger l
    on l.reference_type = 'topup' and l.reference_id = t.id
  group by t.id, t.status, t.bonus_micros
),
settled_retail as (
  select r.id,
         r.retail_cost_micros,
         case
           when r.pricing_mode_snapshot = 'flat_total' then
             ceil(
               ((r.input_tokens::numeric + r.output_tokens::numeric)
                 * r.retail_flat_micros_per_mtoken_snapshot::numeric) / 1000000
             )::bigint
           when r.pricing_mode_snapshot = 'split_io' then
             (
               ceil((r.input_tokens::numeric * r.retail_input_micros_per_mtoken_snapshot::numeric) / 1000000)
               + ceil((r.output_tokens::numeric * r.retail_output_micros_per_mtoken_snapshot::numeric) / 1000000)
             )::bigint
         end as expected_retail_cost_micros
  from public.api_requests r
  where r.status = 'settled'
),
succeeded_attempt as (
  select a.api_request_id,
         a.provider_id,
         a.provider_request_id,
         a.input_tokens,
         a.output_tokens,
         (
           ceil((a.input_tokens::numeric * a.upstream_input_micros_per_mtoken_snapshot::numeric) / 1000000)
           + ceil((a.output_tokens::numeric * a.upstream_output_micros_per_mtoken_snapshot::numeric) / 1000000)
         )::bigint as expected_upstream_cost_micros
  from public.provider_attempts a
  where a.status = 'succeeded'
),
settled_upstream as (
  select r.id,
         a.api_request_id is null as missing_attempt,
         r.provider_id is distinct from a.provider_id
           or r.provider_request_id is distinct from a.provider_request_id
           or r.input_tokens is distinct from a.input_tokens
           or r.output_tokens is distinct from a.output_tokens
           or r.upstream_cost_micros is distinct from a.expected_upstream_cost_micros
           as mismatch
  from public.api_requests r
  left join succeeded_attempt a on a.api_request_id = r.id
  where r.status = 'settled'
)
select
  (select count(*) from wallet_checks
    where available_ledger_diff <> 0 or reserved_ledger_diff <> 0)
    as wallet_ledger_violations,
  (select count(*) from wallet_checks where reserved_request_diff <> 0)
    as wallet_open_reserve_violations,
  (select count(*)
    from public.api_requests r
    left join public.wallets w on w.user_id = r.user_id
    where r.status in ('reserved', 'dispatching', 'streaming', 'failed_ambiguous')
      and w.user_id is null)
    as open_request_missing_wallet_violations,
  (select count(*) from request_ledger
    where reserve_entries <> 1
      or (status = 'settled' and (settle_entries <> 1 or release_entries <> 0))
      or (status = 'released' and (release_entries <> 1 or settle_entries <> 0))
      or (
        status in ('reserved', 'dispatching', 'streaming', 'failed_ambiguous')
        and (settle_entries <> 0 or release_entries <> 0)
      ))
    as request_ledger_violations,
  (select count(*) from topup_ledger
    where status = 'paid'
      and (
        topup_entries <> 1
        or (bonus_micros > 0 and bonus_entries <> 1)
        or (bonus_micros = 0 and bonus_entries <> 0)
      ))
    as paid_topup_ledger_violations,
  (select count(*) from public.topups
    where amount_micros::numeric <> payable_vnd::numeric * 1000)
    as topup_amount_violations,
  (select count(*) from settled_retail
    where retail_cost_micros is distinct from expected_retail_cost_micros)
    as settled_retail_cost_violations,
  (select count(*) from settled_upstream where missing_attempt or mismatch)
    as settled_upstream_cost_violations,
  (select count(*) from public.api_requests
    where status = 'released'
      and error_code = 'UPSTREAM_HTTP_401_SAFE_RELEASE'
      and provider_id is distinct from 'a6api')
    as non_a6_401_release_violations,
  (select count(*) from public.api_requests where status = 'failed_ambiguous')
    as ambiguous_requests_requiring_reconciliation,
  (select coalesce(sum(reserve_micros), 0) from public.api_requests
    where status = 'failed_ambiguous')
    as ambiguous_reserved_micros;
