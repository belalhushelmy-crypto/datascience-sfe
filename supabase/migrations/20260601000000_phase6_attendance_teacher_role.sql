-- ============================================================================
-- Data Science SFE — Phase 6: Teacher role, attendance RLS, points config
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add 'teacher' role to user_role enum
-- ---------------------------------------------------------------------------
do $$ begin
  alter type public.user_role add value if not exists 'teacher';
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Update attendance RLS: students read-only, teachers full access
-- ---------------------------------------------------------------------------
-- Drop existing policies
drop policy if exists "attendance_select_own" on public.attendance;
drop policy if exists "attendance_admin_select_all" on public.attendance;
drop policy if exists "attendance_admin_insert" on public.attendance;
drop policy if exists "attendance_admin_update" on public.attendance;
drop policy if exists "attendance_admin_delete" on public.attendance;

-- Students can only read their own attendance
create policy "attendance_select_own" on public.attendance
  for select to authenticated
  using (student_id = (select auth.uid()));

-- Teachers and admins can read all attendance
create policy "attendance_teacher_select_all" on public.attendance
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- Teachers and admins can insert attendance
create policy "attendance_teacher_insert" on public.attendance
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- Teachers and admins can update attendance
create policy "attendance_teacher_update" on public.attendance
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- Teachers and admins can delete attendance
create policy "attendance_teacher_delete" on public.attendance
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Update sessions RLS: teachers can also manage sessions
-- ---------------------------------------------------------------------------
drop policy if exists "sessions_admin_insert" on public.sessions;
drop policy if exists "sessions_admin_update" on public.sessions;
drop policy if exists "sessions_admin_delete" on public.sessions;

create policy "sessions_teacher_insert" on public.sessions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "sessions_teacher_update" on public.sessions
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "sessions_teacher_delete" on public.sessions
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Update assignments RLS: teachers can manage assignments
-- ---------------------------------------------------------------------------
drop policy if exists "assignments_admin_insert" on public.assignments;
drop policy if exists "assignments_admin_update" on public.assignments;
drop policy if exists "assignments_admin_delete" on public.assignments;

create policy "assignments_teacher_insert" on public.assignments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "assignments_teacher_update" on public.assignments
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "assignments_teacher_delete" on public.assignments
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Update points_config RLS: teachers can update
-- ---------------------------------------------------------------------------
drop policy if exists "points_config_admin_update" on public.points_config;

create policy "points_config_teacher_update" on public.points_config
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Update announcements RLS: teachers can manage
-- ---------------------------------------------------------------------------
drop policy if exists "announcements_admin_insert" on public.announcements;
drop policy if exists "announcements_admin_update" on public.announcements;
drop policy if exists "announcements_admin_delete" on public.announcements;

create policy "announcements_teacher_insert" on public.announcements
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "announcements_teacher_update" on public.announcements
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "announcements_teacher_delete" on public.announcements
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Update badges RLS: teachers can manage
-- ---------------------------------------------------------------------------
drop policy if exists "badges_admin_all" on public.badges;

create policy "badges_teacher_all" on public.badges
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Update student_badges RLS: teachers can manage
-- ---------------------------------------------------------------------------
drop policy if exists "student_badges_admin_write" on public.student_badges;

create policy "student_badges_teacher_write" on public.student_badges
  for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Update submissions RLS: teachers can manage
-- ---------------------------------------------------------------------------
drop policy if exists "submissions_admin_insert" on public.submissions;
drop policy if exists "submissions_admin_update" on public.submissions;
drop policy if exists "submissions_admin_delete" on public.submissions;

create policy "submissions_teacher_insert" on public.submissions
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "submissions_teacher_update" on public.submissions
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

create policy "submissions_teacher_delete" on public.submissions
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('teacher', 'admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 10. Update is_admin() to is_teacher_or_admin()
-- ---------------------------------------------------------------------------
create or replace function public.is_teacher_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('teacher', 'admin')::public.user_role[]
  );
$$;

revoke all on function public.is_teacher_or_admin() from public;
grant execute on function public.is_teacher_or_admin() to authenticated;

-- Keep is_admin() for backward compatibility
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.user_role
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Add attendance_points_per_session to points_config (default 10)
-- ---------------------------------------------------------------------------
alter table public.points_config
  add column if not exists attendance_points_per_session numeric(6, 2) not null default 10
    check (attendance_points_per_session >= 0);

-- Update the existing row if needed
update public.points_config
set attendance_points_per_session = 10
where id = 1 and attendance_points_per_session is null;

-- ---------------------------------------------------------------------------
-- 12. Notify PostgREST to reload schema
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';