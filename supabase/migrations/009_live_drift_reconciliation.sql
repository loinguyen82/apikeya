-- Reconcile production drift with the invariants already assumed by the web/gateway.
-- Safe for existing data: expired pending rows are closed first and no user
-- currently has duplicate active keys or duplicate active pending top-ups.

-- Pending orders past their TTL must not block creation of a fresh checkout.
update public.topups
set status = 'expired'
where status = 'pending'
  and expires_at <= now();

-- Defensive cleanup for any historical race before the unique index is added.
with ranked_pending as (
  select id,
         row_number() over (partition by user_id order by created_at desc, id desc) as row_number
  from public.topups
  where status = 'pending'
)
update public.topups as topup
set status = 'expired'
from ranked_pending
where topup.id = ranked_pending.id
  and ranked_pending.row_number > 1;

create unique index if not exists topups_one_pending_per_user
  on public.topups(user_id)
  where status = 'pending';

create unique index if not exists api_keys_one_active_per_user_idx
  on public.api_keys(user_id)
  where status = 'active';

-- A provider-confirmed payment is authoritative even when its webhook arrives
-- after the local checkout TTL. Expired orders may therefore transition to paid;
-- cancelled orders may not. The row lock + status transition keeps the credit
-- operation idempotent for duplicate provider webhooks.
create or replace function public.apply_paid_topup(
  p_topup_id uuid,
  p_external_id text
) returns public.topups
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.topups;
begin
  if p_external_id is null or length(btrim(p_external_id)) = 0 then
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
    if t.external_id is distinct from p_external_id then
      raise exception 'TOPUP_ALREADY_PAID_DIFFERENT_EXTERNAL_ID';
    end if;
    return t;
  end if;

  if t.status not in ('pending', 'expired') then
    raise exception 'TOPUP_NOT_PAYABLE';
  end if;

  if t.external_id is not null and t.external_id <> p_external_id then
    raise exception 'TOPUP_EXTERNAL_ID_MISMATCH';
  end if;

  update public.wallets
  set available_micros = available_micros + t.amount_micros + t.bonus_micros,
      updated_at = now()
  where user_id = t.user_id;

  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  insert into public.wallet_ledger(
    user_id,
    kind,
    delta_available_micros,
    delta_reserved_micros,
    reference_type,
    reference_id,
    idempotency_key
  ) values (
    t.user_id,
    'topup',
    t.amount_micros,
    0,
    'topup',
    t.id,
    'topup:' || t.id::text
  ) on conflict do nothing;

  if t.bonus_micros > 0 then
    insert into public.wallet_ledger(
      user_id,
      kind,
      delta_available_micros,
      delta_reserved_micros,
      reference_type,
      reference_id,
      idempotency_key
    ) values (
      t.user_id,
      'bonus',
      t.bonus_micros,
      0,
      'topup',
      t.id,
      'bonus:' || t.id::text
    ) on conflict do nothing;
  end if;

  update public.topups
  set status = 'paid',
      external_id = p_external_id,
      paid_at = now()
  where id = t.id
  returning * into t;

  return t;
end;
$$;

revoke all on function public.apply_paid_topup(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_paid_topup(uuid, text) to service_role;
