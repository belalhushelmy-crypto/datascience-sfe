-- Sync auth email into profiles and backfill existing rows.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $handle_new_user$
declare
  v_username  text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_full_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', '')), 80);
  v_display   text := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', v_full_name)), 80);
  v_role      public.user_role := 'student';
begin
  if v_username = '' or v_full_name = '' then
    raise exception 'handle_new_user: username and full_name metadata are required'
      using errcode = '22023';
  end if;

  if new.raw_app_meta_data ->> 'role' = 'admin' then
    v_role := 'admin';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username for auth user %', new.id using errcode = '22023';
  end if;

  insert into public.profiles (id, username, full_name, display_name, role, email)
  values (new.id, v_username, v_full_name, v_display, v_role, new.email)
  on conflict (id) do update set email = excluded.email;

  return new;
end;
$handle_new_user$;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and (p.email is null or p.email = '');

notify pgrst, 'reload schema';
