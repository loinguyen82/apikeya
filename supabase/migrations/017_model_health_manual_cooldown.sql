create table if not exists public.model_health_scan_control (
  id text primary key,
  last_scan_at timestamptz,
  constraint model_health_scan_control_singleton_check check (id = 'global')
);

alter table public.model_health_scan_control enable row level security;

insert into public.model_health_scan_control (id, last_scan_at)
values ('global', null)
on conflict (id) do nothing;

create or replace function public.claim_model_health_scan(p_cooldown_seconds integer default 120)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_last timestamptz;
  v_cooldown integer := greatest(1, least(coalesce(p_cooldown_seconds, 120), 3600));
  v_elapsed numeric;
begin
  insert into public.model_health_scan_control (id, last_scan_at)
  values ('global', null)
  on conflict (id) do nothing;

  select last_scan_at
    into v_last
  from public.model_health_scan_control
  where id = 'global'
  for update;

  if v_last is null then
    update public.model_health_scan_control
      set last_scan_at = v_now
    where id = 'global';
    return query select true, 0;
    return;
  end if;

  v_elapsed := extract(epoch from (v_now - v_last));

  if v_elapsed >= v_cooldown then
    update public.model_health_scan_control
      set last_scan_at = v_now
    where id = 'global';
    return query select true, 0;
  else
    return query select false, greatest(1, ceil(v_cooldown - v_elapsed)::integer);
  end if;
end;
$$;

revoke all on function public.claim_model_health_scan(integer) from public;
revoke all on function public.claim_model_health_scan(integer) from anon;
revoke all on function public.claim_model_health_scan(integer) from authenticated;
grant execute on function public.claim_model_health_scan(integer) to service_role;
