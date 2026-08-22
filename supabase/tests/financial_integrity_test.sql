\set ON_ERROR_STOP on

begin;

insert into auth.users(id, email) values
  ('10000000-0000-0000-0000-000000000001', 'finance-test-1@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'finance-test-2@example.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'finance-test-3@example.invalid'),
  ('10000000-0000-0000-0000-000000000004', 'finance-test-4@example.invalid'),
  ('10000000-0000-0000-0000-000000000005', 'finance-test-5@example.invalid'),
  ('10000000-0000-0000-0000-000000000006', 'finance-test-6@example.invalid');

insert into public.providers(
  id, name, base_url, api_key_secret_name, status, timeout_ms
) values (
  'finance-test-provider', 'Finance test provider', 'https://example.invalid/v1',
  'FINANCE_TEST_KEY', 'healthy', 1000
);

insert into public.models(
  id, display_name, status, pricing_mode,
  retail_flat_micros_per_mtoken, default_max_output_tokens, max_output_tokens
) values (
  'finance-test-model', 'Finance test model', 'active', 'flat_total',
  1000000, 100, 100
);

insert into public.api_keys(id, user_id, name, prefix, secret_hash, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'test', 'sk-test-1', 'finance-test-hash-1', 'active'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'test', 'sk-test-2', 'finance-test-hash-2', 'active'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'test', 'sk-test-3', 'finance-test-hash-3', 'active'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'test', 'sk-test-4', 'finance-test-hash-4', 'active'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'test', 'sk-test-5', 'finance-test-hash-5', 'active'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'test', 'sk-test-6', 'finance-test-hash-6', 'active');

update public.wallets
set available_micros = 100000
where user_id::text like '10000000-0000-0000-0000-00000000000%';

insert into public.wallet_ledger(
  user_id, kind, delta_available_micros, delta_reserved_micros,
  reference_type, reference_id, idempotency_key
)
select id, 'manual_adjustment', 100000, 0, 'test_funding', id, 'test-funding:' || id::text
from auth.users
where id::text like '10000000-0000-0000-0000-00000000000%';

-- The same client idempotency key is scoped per user. The old global ledger key
-- made the second reservation collide and the exception handler returned NULL.
do $$
declare
  v_first uuid;
  v_second uuid;
  v_replay uuid;
begin
  select (public.reserve_api_request(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'api', 'finance-test-model', 210, 'shared-client-key',
    'flat_total', 1000000, null, null, 100, 100
  )).id into v_first;

  select (public.reserve_api_request(
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'api', 'finance-test-model', 210, 'shared-client-key',
    'flat_total', 1000000, null, null, 100, 100
  )).id into v_second;

  select (public.reserve_api_request(
    '30000000-0000-0000-0000-000000000099',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'api', 'finance-test-model', 210, 'shared-client-key',
    'flat_total', 1000000, null, null, 100, 100
  )).id into v_replay;

  if v_first <> '30000000-0000-0000-0000-000000000001'
    or v_second <> '30000000-0000-0000-0000-000000000002'
    or v_replay <> v_first then
    raise exception 'cross-user or replay idempotency assertion failed';
  end if;

  if (select available_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000001') <> 99790
    or (select reserved_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000001') <> 210 then
    raise exception 'idempotent replay moved wallet twice';
  end if;
end;
$$;

-- An API key cannot reserve another user's wallet.
do $$
begin
  begin
    perform public.reserve_api_request(
      '30000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000004',
      '20000000-0000-0000-0000-000000000001',
      'api', 'finance-test-model', 210, 'wrong-owner-key',
      'flat_total', 1000000, null, null, 100, 100
    );
    raise exception 'expected API_KEY_INVALID';
  exception when others then
    if sqlerrm = 'expected API_KEY_INVALID' or position('API_KEY_INVALID' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end;
$$;

-- A missing wallet must not produce a release ledger/status without a credit.
select public.reserve_api_request(
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000003',
  'api', 'finance-test-model', 210, 'missing-wallet-release',
  'flat_total', 1000000, null, null, 100, 100
);

delete from public.wallets
where user_id = '10000000-0000-0000-0000-000000000003';

do $$
begin
  begin
    perform public.release_api_request(
      '30000000-0000-0000-0000-000000000003', 'SAFE_FAILURE'
    );
    raise exception 'expected WALLET_NOT_FOUND';
  exception when others then
    if sqlerrm = 'expected WALLET_NOT_FOUND' or position('WALLET_NOT_FOUND' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  if (select status from public.api_requests where id = '30000000-0000-0000-0000-000000000003') <> 'reserved' then
    raise exception 'release changed status without a wallet';
  end if;
end;
$$;

-- Normal release is exactly once.
select public.release_api_request(
  '30000000-0000-0000-0000-000000000001', 'SAFE_FAILURE'
);
select public.release_api_request(
  '30000000-0000-0000-0000-000000000001', 'SAFE_FAILURE_RETRY'
);

do $$
begin
  if (select available_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000001') <> 100000
    or (select reserved_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'release wallet assertion failed';
  end if;
  if (select count(*) from public.wallet_ledger where reference_id = '30000000-0000-0000-0000-000000000001' and kind = 'release') <> 1 then
    raise exception 'release ledger is not idempotent';
  end if;
end;
$$;

-- Settlement is recomputed from immutable snapshots and a succeeded attempt.
insert into public.provider_attempts(
  api_request_id, provider_id, upstream_model, priority_snapshot,
  upstream_input_micros_per_mtoken_snapshot,
  upstream_output_micros_per_mtoken_snapshot,
  status, provider_request_id, input_tokens, output_tokens, completed_at
) values (
  '30000000-0000-0000-0000-000000000002', 'finance-test-provider',
  'upstream-test-model', 1, 500000, 500000, 'succeeded', 'upstream-1', 100, 100, now()
);

select public.settle_api_request(
  '30000000-0000-0000-0000-000000000002',
  200, 100, 100, 100, 'finance-test-provider', 'upstream-1'
);
select public.settle_api_request(
  '30000000-0000-0000-0000-000000000002',
  200, 100, 100, 100, 'finance-test-provider', 'upstream-1'
);

do $$
begin
  if (select available_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000002') <> 99800
    or (select reserved_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'settlement wallet assertion failed';
  end if;
  if (select count(*) from public.wallet_ledger where reference_id = '30000000-0000-0000-0000-000000000002' and kind = 'settle_refund') <> 1 then
    raise exception 'settlement ledger is not idempotent';
  end if;
end;
$$;

-- A caller-supplied retail cost cannot undercharge the snapshot.
select public.reserve_api_request(
  '30000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000004',
  '20000000-0000-0000-0000-000000000004',
  'api', 'finance-test-model', 210, 'settlement-mismatch',
  'flat_total', 1000000, null, null, 100, 100
);

insert into public.provider_attempts(
  api_request_id, provider_id, upstream_model, priority_snapshot,
  upstream_input_micros_per_mtoken_snapshot,
  upstream_output_micros_per_mtoken_snapshot,
  status, provider_request_id, input_tokens, output_tokens, completed_at
) values (
  '30000000-0000-0000-0000-000000000005', 'finance-test-provider',
  'upstream-test-model', 1, 500000, 500000, 'succeeded', 'upstream-2', 50, 50, now()
);

do $$
begin
  begin
    perform public.settle_api_request(
      '30000000-0000-0000-0000-000000000005',
      99, 50, 50, 50, 'finance-test-provider', 'upstream-2'
    );
    raise exception 'expected RETAIL_COST_MISMATCH';
  exception when others then
    if sqlerrm = 'expected RETAIL_COST_MISMATCH' or position('RETAIL_COST_MISMATCH' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  if (select status from public.api_requests where id = '30000000-0000-0000-0000-000000000005') <> 'reserved'
    or (select reserved_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000004') <> 210 then
    raise exception 'failed settlement changed financial state';
  end if;
end;
$$;

-- A provider-confirmed success can settle a request that was marked ambiguous.
select public.reserve_api_request(
  '30000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000005',
  '20000000-0000-0000-0000-000000000005',
  'api', 'finance-test-model', 210, 'ambiguous-settle',
  'flat_total', 1000000, null, null, 100, 100
);
update public.api_requests
set status = 'failed_ambiguous', error_code = 'SETTLEMENT_RECONCILE_REQUIRED'
where id = '30000000-0000-0000-0000-000000000006';

insert into public.provider_attempts(
  api_request_id, provider_id, upstream_model, priority_snapshot,
  upstream_input_micros_per_mtoken_snapshot,
  upstream_output_micros_per_mtoken_snapshot,
  status, provider_request_id, input_tokens, output_tokens, completed_at
) values (
  '30000000-0000-0000-0000-000000000006', 'finance-test-provider',
  'upstream-test-model', 1, 500000, 500000, 'succeeded', 'upstream-3', 25, 25, now()
);

select public.settle_api_request(
  '30000000-0000-0000-0000-000000000006',
  50, 26, 25, 25, 'finance-test-provider', 'upstream-3'
);

do $$
begin
  if (select status from public.api_requests where id = '30000000-0000-0000-0000-000000000006') <> 'settled'
    or (select error_code from public.api_requests where id = '30000000-0000-0000-0000-000000000006') is not null
    or (select available_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000005') <> 99950
    or (select reserved_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000005') <> 0 then
    raise exception 'ambiguous settlement reconciliation failed';
  end if;
end;
$$;

-- Ambiguous no-charge release requires the explicit audited RPC.
select public.reserve_api_request(
  '30000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000006',
  '20000000-0000-0000-0000-000000000006',
  'api', 'finance-test-model', 210, 'ambiguous-release',
  'flat_total', 1000000, null, null, 100, 100
);
update public.api_requests
set status = 'failed_ambiguous', error_code = 'UPSTREAM_UNKNOWN'
where id = '30000000-0000-0000-0000-000000000007';

do $$
begin
  begin
    perform public.release_api_request(
      '30000000-0000-0000-0000-000000000007', 'UNSAFE_GENERIC_RELEASE'
    );
    raise exception 'expected REQUEST_NOT_RELEASEABLE';
  exception when others then
    if sqlerrm = 'expected REQUEST_NOT_RELEASEABLE' or position('REQUEST_NOT_RELEASEABLE' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end;
$$;

select public.release_ambiguous_api_request(
  '30000000-0000-0000-0000-000000000007',
  'PROVIDER_CONFIRMED_NO_CHARGE',
  'test provider reconciliation evidence'
);
select public.release_ambiguous_api_request(
  '30000000-0000-0000-0000-000000000007',
  'PROVIDER_CONFIRMED_NO_CHARGE',
  'test provider reconciliation evidence'
);

do $$
begin
  if (select available_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000006') <> 100000
    or (select reserved_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000006') <> 0
    or (select metadata ->> 'reason' from public.wallet_ledger where reference_id = '30000000-0000-0000-0000-000000000007' and kind = 'release') <> 'test provider reconciliation evidence' then
    raise exception 'ambiguous release reconciliation failed';
  end if;
end;
$$;

-- A delayed provider callback credits an expired top-up exactly once.
insert into public.topups(
  id, user_id, amount_micros, bonus_micros, payable_vnd,
  payment_provider, status, expires_at
) values (
  '40000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000002',
  1000, 100, 1, 'finance-test-payments', 'expired', now() - interval '1 minute'
);

select public.apply_paid_topup(
  '40000000-0000-0000-0000-000000000001', ' external-1 '
);
select public.apply_paid_topup(
  '40000000-0000-0000-0000-000000000001', 'external-1'
);

do $$
begin
  if (select available_micros from public.wallets where user_id = '10000000-0000-0000-0000-000000000002') <> 100900 then
    raise exception 'top-up was not credited exactly once';
  end if;
  if (select count(*) from public.wallet_ledger where reference_id = '40000000-0000-0000-0000-000000000001' and kind in ('topup', 'bonus')) <> 2 then
    raise exception 'top-up ledger assertion failed';
  end if;
  if (select external_id from public.topups where id = '40000000-0000-0000-0000-000000000001') <> 'external-1' then
    raise exception 'external id was not canonicalized';
  end if;

  begin
    perform public.apply_paid_topup(
      '40000000-0000-0000-0000-000000000001', 'external-2'
    );
    raise exception 'expected TOPUP_ALREADY_PAID_DIFFERENT_EXTERNAL_ID';
  exception when others then
    if sqlerrm = 'expected TOPUP_ALREADY_PAID_DIFFERENT_EXTERNAL_ID'
      or position('TOPUP_ALREADY_PAID_DIFFERENT_EXTERNAL_ID' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    insert into public.topups(
      id, user_id, amount_micros, payable_vnd, payment_provider, expires_at
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002',
      2001, 2, 'finance-test-payments', now() + interval '1 minute'
    );
    raise exception 'expected topups_amount_matches_payable_vnd';
  exception when check_violation then
    null;
  end;
end;
$$;

-- Data API grants are explicit and financial RPCs remain service-only.
do $$
begin
  if has_function_privilege('anon', 'public.apply_paid_topup(uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.release_ambiguous_api_request(uuid,text,text)', 'execute')
    or not has_function_privilege('service_role', 'public.settle_api_request(uuid,bigint,bigint,integer,integer,text,text)', 'execute') then
    raise exception 'financial RPC privilege assertion failed';
  end if;

  if has_table_privilege('anon', 'public.wallets', 'update')
    or has_table_privilege('authenticated', 'public.wallets', 'update')
    or not has_table_privilege('authenticated', 'public.wallets', 'select')
    or not has_table_privilege('anon', 'public.models', 'select')
    or not has_table_privilege('service_role', 'public.wallets', 'update') then
    raise exception 'table privilege assertion failed';
  end if;
end;
$$;

-- Every surviving wallet still equals the sum of its immutable ledger deltas.
do $$
begin
  if exists (
    select 1
    from public.wallets w
    left join lateral (
      select coalesce(sum(delta_available_micros), 0)::bigint as available_micros,
             coalesce(sum(delta_reserved_micros), 0)::bigint as reserved_micros
      from public.wallet_ledger l
      where l.user_id = w.user_id
    ) ledger on true
    where w.available_micros <> ledger.available_micros
       or w.reserved_micros <> ledger.reserved_micros
  ) then
    raise exception 'wallet and ledger totals drifted';
  end if;
end;
$$;

rollback;
