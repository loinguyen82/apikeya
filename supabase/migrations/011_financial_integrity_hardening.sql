-- Harden every money transition around one rule: the wallet, ledger and business
-- row must either move together in one transaction or not move at all.

-- Migration 010 was intended to release A6 authentication failures only. Stop
-- here if an earlier run ever released another provider so it can be reviewed
-- manually; automatically reversing a credit may make a wallet negative.
do $$
begin
  if exists (
    select 1
    from public.api_requests
    where status = 'released'
      and error_code = 'UPSTREAM_HTTP_401_SAFE_RELEASE'
      and provider_id is distinct from 'a6api'
  ) then
    raise exception 'NON_A6_401_RELEASE_REQUIRES_MANUAL_RECONCILIATION';
  end if;
end;
$$;

-- Bind the signed provider amount to the amount credited to the wallet.
alter table public.topups
  add constraint topups_amount_matches_payable_vnd
  check (amount_micros::numeric = payable_vnd::numeric * 1000);

alter table public.topups
  add constraint topups_payment_provider_nonempty
  check (length(btrim(payment_provider)) > 0);

-- Price snapshots are the source of truth for settlement. Direct table writes
-- must not be able to create an unpriceable request.
alter table public.api_requests
  add constraint api_requests_price_snapshot_valid
  check (
    (
      pricing_mode_snapshot = 'flat_total'
      and retail_flat_micros_per_mtoken_snapshot > 0
    )
    or
    (
      pricing_mode_snapshot = 'split_io'
      and retail_input_micros_per_mtoken_snapshot > 0
      and retail_output_micros_per_mtoken_snapshot > 0
    )
  );

alter table public.api_requests
  add constraint api_requests_api_channel_has_key
  check (channel <> 'api' or api_key_id is not null);

alter table public.api_requests
  add constraint api_requests_settled_usage_complete
  check (
    status <> 'settled'
    or (
      input_tokens is not null
      and input_tokens >= 0
      and output_tokens is not null
      and output_tokens >= 0
      and provider_id is not null
    )
  );

alter table public.provider_attempts
  add constraint provider_attempts_succeeded_usage_complete
  check (
    status <> 'succeeded'
    or (
      input_tokens is not null
      and input_tokens >= 0
      and output_tokens is not null
      and output_tokens >= 0
    )
  );

alter table public.wallet_ledger
  add constraint wallet_ledger_financial_delta_shape
  check (
    case kind
      when 'reserve' then
        delta_available_micros < 0
        and delta_reserved_micros = -delta_available_micros
      when 'release' then
        delta_available_micros > 0
        and delta_reserved_micros = -delta_available_micros
      when 'settle_refund' then
        delta_available_micros >= 0
        and delta_reserved_micros < 0
        and delta_available_micros <= -delta_reserved_micros
      when 'settle_extra' then
        delta_available_micros <= 0
        and delta_reserved_micros < 0
      when 'topup' then
        delta_available_micros > 0 and delta_reserved_micros = 0
      when 'bonus' then
        delta_available_micros > 0 and delta_reserved_micros = 0
      else true
    end
  );

-- The status row is the primary idempotency gate; these indexes are a second
-- line of defence against a stale/manual status causing a second wallet move.
create unique index wallet_ledger_request_reserve_unique
  on public.wallet_ledger(reference_id)
  where reference_type = 'api_request' and kind = 'reserve';

create unique index wallet_ledger_request_terminal_unique
  on public.wallet_ledger(reference_id)
  where reference_type = 'api_request'
    and kind in ('settle_refund', 'settle_extra', 'release');

create unique index wallet_ledger_topup_kind_unique
  on public.wallet_ledger(reference_id, kind)
  where reference_type = 'topup' and kind in ('topup', 'bonus');

create unique index provider_attempts_one_success_per_request
  on public.provider_attempts(api_request_id)
  where status = 'succeeded';

create or replace function public.reserve_api_request(
  p_request_id uuid,
  p_user_id uuid,
  p_api_key_id uuid,
  p_channel text,
  p_model_id text,
  p_reserve_micros bigint,
  p_idempotency_key text default null,
  p_pricing_mode_snapshot text default null,
  p_retail_flat_snapshot bigint default null,
  p_retail_input_snapshot bigint default null,
  p_retail_output_snapshot bigint default null,
  p_estimated_input_tokens integer default 0,
  p_max_output_tokens integer default 0
) returns public.api_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet public.wallets;
  v_existing public.api_requests;
  v_request public.api_requests;
  v_api_key_id uuid;
  v_minimum_reserve numeric;
begin
  if p_request_id is null or p_user_id is null then
    raise exception 'REQUEST_AND_USER_REQUIRED';
  end if;
  if p_reserve_micros is null or p_reserve_micros <= 0 then
    raise exception 'INVALID_RESERVE';
  end if;
  if p_channel is null or p_channel not in ('api', 'playground') then
    raise exception 'INVALID_CHANNEL';
  end if;
  if p_estimated_input_tokens is null or p_estimated_input_tokens < 0
    or p_max_output_tokens is null or p_max_output_tokens <= 0 then
    raise exception 'INVALID_RESERVATION_TOKEN_COUNTS';
  end if;
  if p_idempotency_key is not null
    and (length(btrim(p_idempotency_key)) = 0 or length(p_idempotency_key) > 128) then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;

  if p_pricing_mode_snapshot = 'flat_total' then
    if p_retail_flat_snapshot is null or p_retail_flat_snapshot <= 0 then
      raise exception 'INVALID_PRICE_SNAPSHOT';
    end if;
    v_minimum_reserve := ceil(
      ((p_estimated_input_tokens::numeric + p_max_output_tokens::numeric)
        * p_retail_flat_snapshot::numeric) / 1000000
    );
  elsif p_pricing_mode_snapshot = 'split_io' then
    if p_retail_input_snapshot is null or p_retail_input_snapshot <= 0
      or p_retail_output_snapshot is null or p_retail_output_snapshot <= 0 then
      raise exception 'INVALID_PRICE_SNAPSHOT';
    end if;
    v_minimum_reserve :=
      ceil((p_estimated_input_tokens::numeric * p_retail_input_snapshot::numeric) / 1000000)
      + ceil((p_max_output_tokens::numeric * p_retail_output_snapshot::numeric) / 1000000);
  else
    raise exception 'INVALID_PRICE_SNAPSHOT';
  end if;

  if v_minimum_reserve > 9223372036854775807::numeric
    or p_reserve_micros::numeric < v_minimum_reserve then
    raise exception 'RESERVE_BELOW_PRICE_SNAPSHOT';
  end if;

  if p_channel = 'api' then
    if p_api_key_id is null then
      raise exception 'API_KEY_REQUIRED';
    end if;

    select key_row.id into v_api_key_id
    from public.api_keys as key_row
    where key_row.id = p_api_key_id
      and key_row.user_id = p_user_id
      and key_row.status = 'active'
      and (key_row.expires_at is null or key_row.expires_at > now())
    for key share;

    if not found then
      raise exception 'API_KEY_INVALID';
    end if;
  elsif p_api_key_id is not null then
    raise exception 'PLAYGROUND_API_KEY_NOT_ALLOWED';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.api_requests
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select * into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  -- A second check after the wallet lock closes the concurrent replay race
  -- without catching unrelated unique violations and returning NULL.
  if p_idempotency_key is not null then
    select * into v_existing
    from public.api_requests
    where user_id = p_user_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  if v_wallet.available_micros < p_reserve_micros then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.api_requests(
    id, user_id, api_key_id, channel, model_id, status, reserve_micros,
    idempotency_key, started_at, pricing_mode_snapshot,
    retail_flat_micros_per_mtoken_snapshot,
    retail_input_micros_per_mtoken_snapshot,
    retail_output_micros_per_mtoken_snapshot,
    reserve_estimated_input_tokens, reserve_max_output_tokens
  ) values (
    p_request_id, p_user_id, p_api_key_id, p_channel, p_model_id, 'reserved',
    p_reserve_micros, p_idempotency_key, now(), p_pricing_mode_snapshot,
    p_retail_flat_snapshot, p_retail_input_snapshot, p_retail_output_snapshot,
    p_estimated_input_tokens, p_max_output_tokens
  ) returning * into v_request;

  insert into public.wallet_ledger(
    user_id, kind, delta_available_micros, delta_reserved_micros,
    reference_type, reference_id, idempotency_key
  ) values (
    p_user_id, 'reserve', -p_reserve_micros, p_reserve_micros,
    'api_request', p_request_id, 'reserve:' || p_request_id::text
  );

  update public.wallets
  set available_micros = available_micros - p_reserve_micros,
      reserved_micros = reserved_micros + p_reserve_micros,
      updated_at = now()
  where user_id = p_user_id;

  return v_request;
end;
$$;

create or replace function public.settle_api_request(
  p_request_id uuid,
  p_retail_cost_micros bigint,
  p_upstream_cost_micros bigint,
  p_input_tokens integer,
  p_output_tokens integer,
  p_provider_id text,
  p_provider_request_id text default null
) returns public.api_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.api_requests;
  w public.wallets;
  a public.provider_attempts;
  v_expected_retail numeric;
  v_expected_upstream numeric;
  v_extra_needed bigint;
  v_extra_collected bigint;
  v_refund bigint;
  v_gap bigint;
  v_was_ambiguous boolean;
begin
  if p_retail_cost_micros is null or p_retail_cost_micros < 0
    or p_upstream_cost_micros is null or p_upstream_cost_micros < 0
    or p_input_tokens is null or p_input_tokens < 0
    or p_output_tokens is null or p_output_tokens < 0 then
    raise exception 'INVALID_SETTLEMENT_VALUES';
  end if;
  if p_provider_id is null or length(btrim(p_provider_id)) = 0 then
    raise exception 'PROVIDER_REQUIRED';
  end if;

  select * into r
  from public.api_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if r.status = 'settled' then
    if r.retail_cost_micros is distinct from p_retail_cost_micros
      or r.upstream_cost_micros is distinct from p_upstream_cost_micros
      or r.input_tokens is distinct from p_input_tokens
      or r.output_tokens is distinct from p_output_tokens
      or r.provider_id is distinct from p_provider_id
      or r.provider_request_id is distinct from p_provider_request_id then
      raise exception 'SETTLEMENT_REPLAY_MISMATCH';
    end if;
    return r;
  end if;

  if r.status = 'released' then
    raise exception 'REQUEST_ALREADY_RELEASED';
  end if;
  if r.status not in ('reserved', 'dispatching', 'streaming', 'failed_ambiguous') then
    raise exception 'REQUEST_NOT_SETTLEABLE';
  end if;

  if r.pricing_mode_snapshot = 'flat_total' then
    v_expected_retail := ceil(
      ((p_input_tokens::numeric + p_output_tokens::numeric)
        * r.retail_flat_micros_per_mtoken_snapshot::numeric) / 1000000
    );
  elsif r.pricing_mode_snapshot = 'split_io' then
    v_expected_retail :=
      ceil((p_input_tokens::numeric * r.retail_input_micros_per_mtoken_snapshot::numeric) / 1000000)
      + ceil((p_output_tokens::numeric * r.retail_output_micros_per_mtoken_snapshot::numeric) / 1000000);
  else
    raise exception 'INVALID_PRICE_SNAPSHOT';
  end if;

  if v_expected_retail > 9223372036854775807::numeric
    or p_retail_cost_micros::numeric <> v_expected_retail then
    raise exception 'RETAIL_COST_MISMATCH';
  end if;

  select * into a
  from public.provider_attempts
  where api_request_id = r.id
    and provider_id = p_provider_id
    and status = 'succeeded'
  limit 1
  for share;

  if not found then
    raise exception 'SUCCEEDED_PROVIDER_ATTEMPT_REQUIRED';
  end if;
  if a.input_tokens is distinct from p_input_tokens
    or a.output_tokens is distinct from p_output_tokens
    or a.provider_request_id is distinct from p_provider_request_id then
    raise exception 'PROVIDER_ATTEMPT_MISMATCH';
  end if;

  v_expected_upstream :=
    ceil((p_input_tokens::numeric * a.upstream_input_micros_per_mtoken_snapshot::numeric) / 1000000)
    + ceil((p_output_tokens::numeric * a.upstream_output_micros_per_mtoken_snapshot::numeric) / 1000000);

  if v_expected_upstream > 9223372036854775807::numeric
    or p_upstream_cost_micros::numeric <> v_expected_upstream then
    raise exception 'UPSTREAM_COST_MISMATCH';
  end if;

  select * into w
  from public.wallets
  where user_id = r.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if w.reserved_micros < r.reserve_micros then
    raise exception 'WALLET_RESERVED_DRIFT';
  end if;

  v_was_ambiguous := r.status = 'failed_ambiguous';

  if p_retail_cost_micros <= r.reserve_micros then
    v_refund := r.reserve_micros - p_retail_cost_micros;
    v_gap := 0;

    insert into public.wallet_ledger(
      user_id, kind, delta_available_micros, delta_reserved_micros,
      reference_type, reference_id, idempotency_key, metadata
    ) values (
      r.user_id, 'settle_refund', v_refund, -r.reserve_micros,
      'api_request', r.id, 'settle:' || r.id::text,
      jsonb_build_object(
        'reconciled_from_ambiguous', v_was_ambiguous,
        'previous_error_code', r.error_code
      )
    );

    update public.wallets
    set reserved_micros = reserved_micros - r.reserve_micros,
        available_micros = available_micros + v_refund,
        updated_at = now()
    where user_id = r.user_id;
  else
    v_extra_needed := p_retail_cost_micros - r.reserve_micros;
    v_extra_collected := least(v_extra_needed, w.available_micros);
    v_gap := v_extra_needed - v_extra_collected;

    insert into public.wallet_ledger(
      user_id, kind, delta_available_micros, delta_reserved_micros,
      reference_type, reference_id, idempotency_key, metadata
    ) values (
      r.user_id, 'settle_extra', -v_extra_collected, -r.reserve_micros,
      'api_request', r.id, 'settle:' || r.id::text,
      jsonb_build_object(
        'billing_gap_micros', v_gap,
        'reconciled_from_ambiguous', v_was_ambiguous,
        'previous_error_code', r.error_code
      )
    );

    update public.wallets
    set reserved_micros = reserved_micros - r.reserve_micros,
        available_micros = available_micros - v_extra_collected,
        updated_at = now()
    where user_id = r.user_id;
  end if;

  update public.api_requests
  set status = 'settled',
      retail_cost_micros = p_retail_cost_micros,
      upstream_cost_micros = p_upstream_cost_micros,
      billing_gap_micros = v_gap,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      provider_id = p_provider_id,
      provider_request_id = p_provider_request_id,
      error_code = null,
      completed_at = now()
  where id = r.id
  returning * into r;

  return r;
end;
$$;

create or replace function public.release_api_request(
  p_request_id uuid,
  p_error_code text
) returns public.api_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.api_requests;
  w public.wallets;
begin
  if p_error_code is null or length(btrim(p_error_code)) = 0 then
    raise exception 'ERROR_CODE_REQUIRED';
  end if;

  select * into r
  from public.api_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if r.status = 'released' then
    return r;
  end if;
  if r.status = 'settled' then
    raise exception 'REQUEST_ALREADY_SETTLED';
  end if;
  if r.status not in ('reserved', 'dispatching', 'streaming') then
    raise exception 'REQUEST_NOT_RELEASEABLE';
  end if;

  select * into w
  from public.wallets
  where user_id = r.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if w.reserved_micros < r.reserve_micros then
    raise exception 'WALLET_RESERVED_DRIFT';
  end if;

  insert into public.wallet_ledger(
    user_id, kind, delta_available_micros, delta_reserved_micros,
    reference_type, reference_id, idempotency_key
  ) values (
    r.user_id, 'release', r.reserve_micros, -r.reserve_micros,
    'api_request', r.id, 'release:' || r.id::text
  );

  update public.wallets
  set available_micros = available_micros + r.reserve_micros,
      reserved_micros = reserved_micros - r.reserve_micros,
      updated_at = now()
  where user_id = r.user_id;

  update public.api_requests
  set status = 'released',
      error_code = p_error_code,
      completed_at = now()
  where id = r.id
  returning * into r;

  return r;
end;
$$;

-- Ambiguous failures need an explicit reconciliation path. Normal release stays
-- conservative; this RPC records why an operator/provider confirmed no charge.
create or replace function public.release_ambiguous_api_request(
  p_request_id uuid,
  p_error_code text,
  p_reconciliation_reason text
) returns public.api_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.api_requests;
  w public.wallets;
begin
  if p_error_code is null or length(btrim(p_error_code)) = 0 then
    raise exception 'ERROR_CODE_REQUIRED';
  end if;
  if p_reconciliation_reason is null
    or length(btrim(p_reconciliation_reason)) = 0 then
    raise exception 'RECONCILIATION_REASON_REQUIRED';
  end if;

  select * into r
  from public.api_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if r.status = 'released' then
    return r;
  end if;
  if r.status <> 'failed_ambiguous' then
    raise exception 'REQUEST_NOT_AMBIGUOUS';
  end if;

  select * into w
  from public.wallets
  where user_id = r.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if w.reserved_micros < r.reserve_micros then
    raise exception 'WALLET_RESERVED_DRIFT';
  end if;

  insert into public.wallet_ledger(
    user_id, kind, delta_available_micros, delta_reserved_micros,
    reference_type, reference_id, idempotency_key, metadata
  ) values (
    r.user_id, 'release', r.reserve_micros, -r.reserve_micros,
    'api_request', r.id, 'release:' || r.id::text,
    jsonb_build_object(
      'reason', p_reconciliation_reason,
      'previous_error_code', r.error_code
    )
  );

  update public.wallets
  set available_micros = available_micros + r.reserve_micros,
      reserved_micros = reserved_micros - r.reserve_micros,
      updated_at = now()
  where user_id = r.user_id;

  update public.api_requests
  set status = 'released',
      error_code = p_error_code,
      completed_at = coalesce(completed_at, now())
  where id = r.id
  returning * into r;

  return r;
end;
$$;

create or replace function public.apply_paid_topup(
  p_topup_id uuid,
  p_external_id text
) returns public.topups
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.topups;
  w public.wallets;
  v_external_id text;
begin
  v_external_id := btrim(p_external_id);
  if v_external_id is null or length(v_external_id) = 0 then
    raise exception 'EXTERNAL_ID_REQUIRED';
  end if;

  select * into t
  from public.topups
  where id = p_topup_id
  for update;

  if not found then
    raise exception 'TOPUP_NOT_FOUND';
  end if;

  if t.status = 'paid' then
    if btrim(t.external_id) is distinct from v_external_id then
      raise exception 'TOPUP_ALREADY_PAID_DIFFERENT_EXTERNAL_ID';
    end if;
    return t;
  end if;

  if t.status not in ('pending', 'expired') then
    raise exception 'TOPUP_NOT_PAYABLE';
  end if;
  if t.external_id is not null and btrim(t.external_id) <> v_external_id then
    raise exception 'TOPUP_EXTERNAL_ID_MISMATCH';
  end if;
  if t.amount_micros::numeric <> t.payable_vnd::numeric * 1000 then
    raise exception 'TOPUP_AMOUNT_MISMATCH';
  end if;

  select * into w
  from public.wallets
  where user_id = t.user_id
  for update;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  insert into public.wallet_ledger(
    user_id, kind, delta_available_micros, delta_reserved_micros,
    reference_type, reference_id, idempotency_key
  ) values (
    t.user_id, 'topup', t.amount_micros, 0,
    'topup', t.id, 'topup:' || t.id::text
  );

  if t.bonus_micros > 0 then
    insert into public.wallet_ledger(
      user_id, kind, delta_available_micros, delta_reserved_micros,
      reference_type, reference_id, idempotency_key
    ) values (
      t.user_id, 'bonus', t.bonus_micros, 0,
      'topup', t.id, 'bonus:' || t.id::text
    );
  end if;

  update public.wallets
  set available_micros = available_micros + t.amount_micros + t.bonus_micros,
      updated_at = now()
  where user_id = t.user_id;

  update public.topups
  set status = 'paid',
      external_id = v_external_id,
      paid_at = now()
  where id = t.id
  returning * into t;

  return t;
end;
$$;

-- Re-run the A6 reconciliation with the provider predicate that migration 010
-- intended. The explicit ambiguous-release RPC keeps the action auditable.
do $$
declare
  v_request_id uuid;
begin
  for v_request_id in
    select id
    from public.api_requests
    where status = 'failed_ambiguous'
      and provider_id = 'a6api'
      and error_code = 'UPSTREAM_HTTP_401'
    order by id
  loop
    perform public.release_ambiguous_api_request(
      v_request_id,
      'UPSTREAM_HTTP_401_SAFE_RELEASE',
      'a6api authentication failure confirmed as no-charge'
    );
  end loop;
end;
$$;

-- Functions in public receive EXECUTE for PUBLIC by default. Keep financial
-- RPCs service-only, including on projects using the new explicit-grant mode.
revoke all on function public.reserve_api_request(uuid,uuid,uuid,text,text,bigint,text,text,bigint,bigint,bigint,integer,integer)
  from public, anon, authenticated;
revoke all on function public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text)
  from public, anon, authenticated;
revoke all on function public.release_api_request(uuid,text)
  from public, anon, authenticated;
revoke all on function public.release_ambiguous_api_request(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.apply_paid_topup(uuid,text)
  from public, anon, authenticated;

grant execute on function public.reserve_api_request(uuid,uuid,uuid,text,text,bigint,text,text,bigint,bigint,bigint,integer,integer)
  to service_role;
grant execute on function public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text)
  to service_role;
grant execute on function public.release_api_request(uuid,text)
  to service_role;
grant execute on function public.release_ambiguous_api_request(uuid,text,text)
  to service_role;
grant execute on function public.apply_paid_topup(uuid,text)
  to service_role;

-- Replace legacy blanket grants with the minimum Data API surface. RLS remains
-- the row-level boundary for authenticated reads; all mutations are server-side.
grant usage on schema public to anon, authenticated, service_role;

revoke all privileges on table
  public.profiles,
  public.wallets,
  public.wallet_ledger,
  public.api_keys,
  public.providers,
  public.models,
  public.provider_models,
  public.api_requests,
  public.provider_attempts,
  public.admin_audit_log,
  public.topups
from public, anon, authenticated;

grant select on table public.models to anon, authenticated;
grant select on table
  public.profiles,
  public.wallets,
  public.wallet_ledger,
  public.api_keys,
  public.api_requests,
  public.topups
to authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.wallets,
  public.wallet_ledger,
  public.api_keys,
  public.providers,
  public.models,
  public.provider_models,
  public.api_requests,
  public.provider_attempts,
  public.admin_audit_log,
  public.topups
to service_role;

-- Make policy audiences explicit and avoid evaluating auth.uid() once per row.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists wallets_self_read on public.wallets;
create policy wallets_self_read on public.wallets
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists ledger_self_read on public.wallet_ledger;
create policy ledger_self_read on public.wallet_ledger
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists api_keys_self_read on public.api_keys;
create policy api_keys_self_read on public.api_keys
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists models_public_read on public.models;
create policy models_public_read on public.models
  for select to anon, authenticated
  using (status <> 'disabled');

drop policy if exists requests_self_read on public.api_requests;
create policy requests_self_read on public.api_requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists topups_self_read on public.topups;
create policy topups_self_read on public.topups
  for select to authenticated
  using ((select auth.uid()) = user_id);
