-- Account-centric developer console.
-- Existing credentials remain valid; new credentials may coexist per account.

drop index if exists public.api_keys_one_active_per_user_idx;

alter table public.api_keys
  add column if not exists last_four text;

alter table public.api_keys
  drop constraint if exists api_keys_last_four_shape;

alter table public.api_keys
  add constraint api_keys_last_four_shape
  check (last_four is null or length(last_four) = 4);

create index if not exists api_keys_user_status_created_idx
  on public.api_keys(user_id, status, created_at desc);

create index if not exists api_requests_user_key_created_idx
  on public.api_requests(user_id, api_key_id, created_at desc);

alter table public.models
  add column if not exists context_window integer;

alter table public.models
  drop constraint if exists models_context_window_positive;

alter table public.models
  add constraint models_context_window_positive
  check (context_window is null or context_window > 0);

create or replace function public.rotate_api_key(
  p_user_id uuid,
  p_key_id uuid,
  p_name text,
  p_prefix text,
  p_last_four text,
  p_secret_hash text
) returns public.api_keys
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.api_keys;
  v_new public.api_keys;
begin
  if p_user_id is null or p_key_id is null then
    raise exception 'USER_AND_KEY_REQUIRED';
  end if;
  if p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 80 then
    raise exception 'INVALID_KEY_NAME';
  end if;
  if p_prefix is null or p_prefix <> 'sk-apivn' then
    raise exception 'INVALID_KEY_PREFIX';
  end if;
  if p_last_four is null or length(p_last_four) <> 4 then
    raise exception 'INVALID_KEY_LAST_FOUR';
  end if;
  if p_secret_hash is null or length(p_secret_hash) <> 64 then
    raise exception 'INVALID_KEY_HASH';
  end if;

  select * into v_old
  from public.api_keys
  where id = p_key_id
    and user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'API_KEY_NOT_ACTIVE';
  end if;

  insert into public.api_keys(user_id, name, prefix, last_four, secret_hash, status)
  values (p_user_id, btrim(p_name), p_prefix, p_last_four, p_secret_hash, 'active')
  returning * into v_new;

  update public.api_keys
  set status = 'revoked'
  where id = v_old.id;

  return v_new;
end;
$$;

revoke all on function public.rotate_api_key(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.rotate_api_key(uuid,uuid,text,text,text,text)
  to service_role;
