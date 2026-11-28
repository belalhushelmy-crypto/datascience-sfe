-- Self check-in is for students only.

create or replace function public.mark_attendance(p_code text)
returns table (session_id uuid, session_title text, status public.attendance_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid     uuid := (select auth.uid());
  v_session public.sessions;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_uid and role = 'student'::public.user_role
  ) then
    raise exception 'students_only' using errcode = '42501';
  end if;

  select s.* into v_session
  from public.sessions s
  where upper(s.attendance_code) = upper(trim(p_code))
    and s.code_expires_at is not null
    and s.code_expires_at > now()
  order by s.session_date desc
  limit 1;

  if not found then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  insert into public.attendance (session_id, student_id, status, marked_by)
  values (v_session.id, v_uid, 'present', 'self_code')
  on conflict (session_id, student_id) do nothing;

  return query
    select v_session.id, v_session.title, a.status
    from public.attendance a
    where a.session_id = v_session.id and a.student_id = v_uid;
end;
$$;

revoke all on function public.mark_attendance(text) from public;
grant execute on function public.mark_attendance(text) to authenticated;

notify pgrst, 'reload schema';
