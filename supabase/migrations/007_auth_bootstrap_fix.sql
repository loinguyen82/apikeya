create or replace function public.bootstrap_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_display_name is null then
    v_display_name := nullif(split_part(coalesce(new.email, ''), '@', 1), '');
  end if;

  insert into public.profiles(id, display_name)
  values (new.id, coalesce(v_display_name, 'User'))
  on conflict (id) do nothing;

  insert into public.wallets(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.bootstrap_user() from public;
revoke all on function public.bootstrap_user() from anon;
revoke all on function public.bootstrap_user() from authenticated;
grant execute on function public.bootstrap_user() to supabase_auth_admin;
grant execute on function public.bootstrap_user() to service_role;
