-- VietAPI-style credential invariant: one user has at most one active API key.
-- Keep historical revoked rows for existing audit/FK data, but future rotations update
-- the same active row so api_requests and Telegram linkage do not accumulate key rows.

with ranked_active as (
  select
    id,
    row_number() over (partition by user_id order by created_at desc, id desc) as rn
  from public.api_keys
  where status = 'active'
)
update public.api_keys k
set status = 'revoked'
from ranked_active r
where k.id = r.id
  and r.rn > 1;

create unique index if not exists api_keys_one_active_per_user_idx
  on public.api_keys (user_id)
  where status = 'active';

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
  v_key public.api_keys;
begin
  if p_user_id is null or p_key_id is null then
    raise exception 'USER_AND_KEY_REQUIRED';
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

  select * into v_key
  from public.api_keys
  where id = p_key_id
    and user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'API_KEY_NOT_ACTIVE';
  end if;

  update public.api_keys
  set
    name = 'Default',
    prefix = p_prefix,
    last_four = p_last_four,
    secret_hash = p_secret_hash,
    last_used_at = null
  where id = p_key_id
    and user_id = p_user_id
  returning * into v_key;

  -- Resetting the master key invalidates any Telegram session linked through the
  -- previous secret. The user must prove possession of the new key to relink.
  delete from public.telegram_account_links
  where user_id = p_user_id;

  return v_key;
end;
$$;

revoke all on function public.rotate_api_key(uuid,uuid,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.rotate_api_key(uuid,uuid,text,text,text,text)
  to service_role;
