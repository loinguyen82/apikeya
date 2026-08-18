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
    id,user_id,api_key_id,channel,model_id,status,reserve_micros,idempotency_key,started_at,
    pricing_mode_snapshot,retail_flat_micros_per_mtoken_snapshot,retail_input_micros_per_mtoken_snapshot,
    retail_output_micros_per_mtoken_snapshot,reserve_estimated_input_tokens,reserve_max_output_tokens
  ) values(
    p_request_id,p_user_id,p_api_key_id,p_channel,p_model_id,'reserved',p_reserve_micros,p_idempotency_key,now(),
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
  p_output_tokens integer,
  p_provider_id text,
  p_provider_request_id text default null
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
  select * into r from public.api_requests where id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status='settled' then return r; end if;
  if r.status='released' then raise exception 'REQUEST_ALREADY_RELEASED'; end if;
  select * into w from public.wallets where user_id=r.user_id for update;

  if p_retail_cost_micros <= r.reserve_micros then
    refund := r.reserve_micros - p_retail_cost_micros;
    update public.wallets set reserved_micros=reserved_micros-r.reserve_micros, available_micros=available_micros+refund, updated_at=now() where user_id=r.user_id;
    if refund>0 then
      insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
        values(r.user_id,'settle_refund',refund,-r.reserve_micros,'api_request',r.id,'settle:'||r.id::text);
    else
      insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
        values(r.user_id,'settle_refund',0,-r.reserve_micros,'api_request',r.id,'settle:'||r.id::text);
    end if;
    gap := 0;
  else
    extra_needed := p_retail_cost_micros - r.reserve_micros;
    extra_collected := least(extra_needed, w.available_micros);
    gap := extra_needed - extra_collected;
    update public.wallets set reserved_micros=reserved_micros-r.reserve_micros, available_micros=available_micros-extra_collected, updated_at=now() where user_id=r.user_id;
    insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key,metadata)
      values(r.user_id,'settle_extra',-extra_collected,-r.reserve_micros,'api_request',r.id,'settle:'||r.id::text,jsonb_build_object('billing_gap_micros',gap));
  end if;

  update public.api_requests set
    status='settled', retail_cost_micros=p_retail_cost_micros, upstream_cost_micros=p_upstream_cost_micros,
    billing_gap_micros=gap, input_tokens=p_input_tokens, output_tokens=p_output_tokens,
    provider_id=p_provider_id, provider_request_id=p_provider_request_id, completed_at=now()
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

-- Revoke execute from public/anon/authenticated and grant strictly to service_role
revoke all on function public.reserve_api_request(uuid,uuid,uuid,text,text,bigint,text,text,bigint,bigint,bigint,integer,integer) from public, anon, authenticated;
revoke all on function public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.release_api_request(uuid,text) from public, anon, authenticated;
revoke all on function public.apply_paid_topup(uuid,text) from public, anon, authenticated;

grant execute on function public.reserve_api_request(uuid,uuid,uuid,text,text,bigint,text,text,bigint,bigint,bigint,integer,integer) to service_role;
grant execute on function public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text) to service_role;
grant execute on function public.release_api_request(uuid,text) to service_role;
grant execute on function public.apply_paid_topup(uuid,text) to service_role;
