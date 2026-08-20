-- Keep billing transitions and accounting inputs valid even when called outside the gateway.
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
  if p_retail_cost_micros < 0 or p_upstream_cost_micros < 0
    or p_input_tokens < 0 or p_output_tokens < 0 then
    raise exception 'INVALID_SETTLEMENT_VALUES';
  end if;
  if p_provider_id is null or length(trim(p_provider_id)) = 0 then
    raise exception 'PROVIDER_REQUIRED';
  end if;

  select * into r from public.api_requests where id=p_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if r.status='settled' then return r; end if;
  if r.status in ('released', 'failed_ambiguous') then raise exception 'REQUEST_NOT_SETTLEABLE'; end if;
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
  if r.status not in ('reserved', 'dispatching', 'streaming') then raise exception 'REQUEST_NOT_RELEASEABLE'; end if;

  update public.wallets set available_micros=available_micros+r.reserve_micros, reserved_micros=reserved_micros-r.reserve_micros, updated_at=now() where user_id=r.user_id;
  insert into public.wallet_ledger(user_id,kind,delta_available_micros,delta_reserved_micros,reference_type,reference_id,idempotency_key)
    values(r.user_id,'release',r.reserve_micros,-r.reserve_micros,'api_request',r.id,'release:'||r.id::text)
    on conflict do nothing;
  update public.api_requests set status='released', error_code=p_error_code, completed_at=now() where id=r.id returning * into r;
  return r;
end; $$;

revoke all on function public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text) from public, anon, authenticated;
revoke all on function public.release_api_request(uuid,text) from public, anon, authenticated;
grant execute on function public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text) to service_role;
grant execute on function public.release_api_request(uuid,text) to service_role;