create or replace function public.apply_paid_topup(
  p_topup_id uuid,
  p_external_id text
) returns public.topups
language plpgsql
security definer
set search_path=public
as $$
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

  update public.wallets
    set available_micros=available_micros+t.amount_micros+t.bonus_micros,
        updated_at=now()
    where user_id=t.user_id;
  insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
    values(t.user_id,'topup',t.amount_micros,0,'topup',t.id,'topup:'||t.id::text)
    on conflict do nothing;

  if t.bonus_micros>0 then
    insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
      values(t.user_id,'bonus',t.bonus_micros,0,'topup',t.id,'bonus:'||t.id::text)
      on conflict do nothing;
  end if;

  update public.topups
    set status='paid', external_id=p_external_id, paid_at=now()
    where id=t.id
    returning * into t;
  return t;
end;
$$;
