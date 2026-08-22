-- MB Bank poller reconciliation: durable payment codes, idempotent bank events,
-- and atomic wallet crediting. The poller is an external VPS service; only
-- service_role may invoke the reconciliation RPC.

alter table public.topups
  add column if not exists payment_code text;

update public.topups
set payment_code = 'APV' || upper(substr(replace(id::text, '-', ''), 1, 10))
where payment_code is null;

-- Keep old web instances compatible during a rolling deploy: after this
-- migration, an insert that does not yet send payment_code still gets one.
alter table public.topups
  alter column payment_code set default ('APV' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10))),
  alter column payment_code set not null;

create unique index if not exists topups_payment_code_unique
  on public.topups(payment_code);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  bank text not null,
  external_id text not null,
  amount_vnd bigint not null check (amount_vnd > 0),
  description text not null default '',
  occurred_at timestamptz not null,
  payment_code text,
  status text not null default 'unmatched' check (status in ('unmatched','matched','review')),
  matched_topup_id uuid references public.topups(id) on delete restrict,
  match_reason text,
  raw jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(bank, external_id)
);

create index if not exists bank_transactions_status_created_idx
  on public.bank_transactions(status, first_seen_at desc);
create index if not exists bank_transactions_payment_code_idx
  on public.bank_transactions(payment_code) where payment_code is not null;

alter table public.bank_transactions enable row level security;

create or replace function public.ingest_bank_transaction(
  p_bank text,
  p_external_id text,
  p_amount_vnd bigint,
  p_description text,
  p_occurred_at timestamptz,
  p_payment_code text default null,
  p_raw jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  b public.bank_transactions;
  t public.topups;
  v_code text;
begin
  if p_bank is null or length(trim(p_bank)) = 0 then
    raise exception 'BANK_REQUIRED';
  end if;
  if p_external_id is null or length(trim(p_external_id)) = 0 or length(p_external_id) > 160 then
    raise exception 'INVALID_EXTERNAL_ID';
  end if;
  if p_amount_vnd <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_occurred_at is null then
    raise exception 'OCCURRED_AT_REQUIRED';
  end if;

  v_code := case
    when p_payment_code is null then null
    else upper(trim(p_payment_code))
  end;

  insert into public.bank_transactions(
    bank, external_id, amount_vnd, description, occurred_at, payment_code, raw
  ) values (
    lower(trim(p_bank)), trim(p_external_id), p_amount_vnd, coalesce(p_description, ''),
    p_occurred_at, v_code, coalesce(p_raw, '{}'::jsonb)
  )
  on conflict (bank, external_id) do update
    set last_seen_at = now(),
        description = excluded.description,
        occurred_at = excluded.occurred_at,
        payment_code = coalesce(public.bank_transactions.payment_code, excluded.payment_code),
        raw = case
          when excluded.raw = '{}'::jsonb then public.bank_transactions.raw
          else excluded.raw
        end
  returning * into b;

  if b.matched_topup_id is not null then
    return jsonb_build_object(
      'status', b.status,
      'bank_transaction_id', b.id,
      'topup_id', b.matched_topup_id,
      'duplicate', true
    );
  end if;

  if v_code is null then
    update public.bank_transactions
      set status='unmatched', match_reason='payment_code_missing', last_seen_at=now()
      where id=b.id
      returning * into b;
    return jsonb_build_object('status','unmatched','bank_transaction_id',b.id,'reason','payment_code_missing');
  end if;

  select * into t
  from public.topups
  where payment_code = v_code
    and payable_vnd = p_amount_vnd
  for update;

  if not found then
    update public.bank_transactions
      set status='unmatched', match_reason='topup_not_found_or_amount_mismatch', last_seen_at=now()
      where id=b.id
      returning * into b;
    return jsonb_build_object('status','unmatched','bank_transaction_id',b.id,'reason','topup_not_found_or_amount_mismatch');
  end if;

  if t.status = 'paid' then
    update public.bank_transactions
      set status='review', matched_topup_id=t.id, match_reason='topup_already_paid', last_seen_at=now()
      where id=b.id
      returning * into b;
    return jsonb_build_object('status','review','bank_transaction_id',b.id,'topup_id',t.id,'reason','topup_already_paid');
  end if;

  if t.status in ('cancelled','refunded') then
    update public.bank_transactions
      set status='review', matched_topup_id=t.id, match_reason='topup_not_creditable', last_seen_at=now()
      where id=b.id
      returning * into b;
    return jsonb_build_object('status','review','bank_transaction_id',b.id,'topup_id',t.id,'reason','topup_not_creditable');
  end if;

  -- The QR is shown for 15 minutes, but a uniquely-coded transfer is still
  -- accepted for 24h so a delayed bank history response cannot strand money.
  if p_occurred_at < t.created_at - interval '5 minutes'
     or p_occurred_at > t.expires_at + interval '24 hours' then
    update public.bank_transactions
      set status='review', matched_topup_id=t.id, match_reason='transaction_outside_reconciliation_window', last_seen_at=now()
      where id=b.id
      returning * into b;
    return jsonb_build_object('status','review','bank_transaction_id',b.id,'topup_id',t.id,'reason','transaction_outside_reconciliation_window');
  end if;

  if t.status not in ('pending','expired') then
    update public.bank_transactions
      set status='review', matched_topup_id=t.id, match_reason='unexpected_topup_state', last_seen_at=now()
      where id=b.id
      returning * into b;
    return jsonb_build_object('status','review','bank_transaction_id',b.id,'topup_id',t.id,'reason','unexpected_topup_state');
  end if;

  -- Ledger rows are inserted without ON CONFLICT. If accounting is already
  -- inconsistent, fail the whole database transaction instead of risking a
  -- second wallet credit.
  insert into public.wallet_ledger(
    user_id, kind, delta_available_micros, delta_reserved_micros,
    reference_type, reference_id, idempotency_key,
    metadata
  ) values (
    t.user_id, 'topup', t.amount_micros, 0,
    'topup', t.id, 'topup:' || t.id::text,
    jsonb_build_object('bank', lower(trim(p_bank)), 'bank_external_id', trim(p_external_id))
  );

  if t.bonus_micros > 0 then
    insert into public.wallet_ledger(
      user_id, kind, delta_available_micros, delta_reserved_micros,
      reference_type, reference_id, idempotency_key,
      metadata
    ) values (
      t.user_id, 'bonus', t.bonus_micros, 0,
      'topup', t.id, 'bonus:' || t.id::text,
      jsonb_build_object('bank', lower(trim(p_bank)), 'bank_external_id', trim(p_external_id))
    );
  end if;

  update public.wallets
    set available_micros = available_micros + t.amount_micros + t.bonus_micros,
        updated_at = now()
    where user_id = t.user_id;
  if not found then
    raise exception 'WALLET_NOT_FOUND';
  end if;

  update public.topups
    set status='paid',
        external_id=lower(trim(p_bank)) || ':' || trim(p_external_id),
        paid_at=p_occurred_at
    where id=t.id
    returning * into t;

  update public.bank_transactions
    set status='matched',
        matched_topup_id=t.id,
        match_reason='payment_code_and_amount_match',
        last_seen_at=now()
    where id=b.id
    returning * into b;

  return jsonb_build_object(
    'status','matched',
    'bank_transaction_id',b.id,
    'topup_id',t.id,
    'payment_code',t.payment_code
  );
end;
$$;

revoke all on function public.ingest_bank_transaction(text,text,bigint,text,timestamptz,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.ingest_bank_transaction(text,text,bigint,text,timestamptz,text,jsonb)
  to service_role;
