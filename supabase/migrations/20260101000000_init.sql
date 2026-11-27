-- ============================================================================
-- Data Science SFE — core schema, RLS, storage policies, leaderboard
-- File: supabase/migrations/20260101000000_init.sql
--
-- Run this first in Supabase Studio → SQL Editor (or `supabase db push`).
-- It is safe to re-run: tables/types are created idempotently and every
-- policy/function/view is replaced.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('student', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'absent', 'late');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_status as enum ('pending', 'graded', 'flagged');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles
-- One row per auth user. student_code is stable, usernames can change.
-- ---------------------------------------------------------------------------
create sequence if not exists public.student_code_seq start with 1 increment by 1;

create table if not exists public.profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  student_code            text not null unique
                            default ('CS-' || lpad(nextval('public.student_code_seq')::text, 4, '0')),
  username                text not null unique
                            check (username = lower(username) and username ~ '^[a-z0-9_]{3,20}$'),
  full_name               text not null check (char_length(full_name) between 1 and 80),
  display_name            text not null check (char_length(display_name) between 1 and 80),
  role                    public.user_role not null default 'student',
  opted_out_of_leaderboard boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_username_trgm_idx on public.profiles (lower(username));

-- ---------------------------------------------------------------------------
-- sessions
-- attendance_code is deliberately NOT selectable by students (see grants).
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 120),
  session_date      date not null default current_date,
  attendance_code   text check (attendance_code is null or attendance_code ~ '^[A-Z0-9]{4,12}$'),
  code_expires_at   timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists sessions_date_idx on public.sessions (session_date desc);
create index if not exists sessions_active_code_idx
  on public.sessions (upper(attendance_code)) where attendance_code is not null;

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  status      public.attendance_status not null default 'present',
  marked_by   text not null default 'admin' check (marked_by in ('self_code', 'admin')),
  created_at  timestamptz not null default now(),
  unique (session_id, student_id)
);

create index if not exists attendance_student_idx on public.attendance (student_id);
create index if not exists attendance_session_idx on public.attendance (session_id);

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
create table if not exists public.assignments (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (char_length(title) between 1 and 160),
  description     text not null default '',
  rubric          text not null default '',
  expected_output text,
  max_score       numeric(6, 2) not null default 100 check (max_score > 0),
  deadline        timestamptz,
  allow_resubmit  boolean not null default true,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists assignments_deadline_idx on public.assignments (deadline);

-- ---------------------------------------------------------------------------
-- submissions — every attempt is kept; best final_score counts.
-- ---------------------------------------------------------------------------
create table if not exists public.submissions (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references public.assignments (id) on delete cascade,
  student_id        uuid not null references public.profiles (id) on delete cascade,
  file_path         text not null,
  code_text         text not null,
  ai_score          numeric(6, 2) check (ai_score is null or ai_score >= 0),
  ai_feedback       text,
  ai_feedback_ar    text,
  ai_issues         jsonb not null default '[]'::jsonb,
  ai_model          text,
  ai_graded_at      timestamptz,
  final_score       numeric(6, 2) check (final_score is null or final_score >= 0),
  status            public.submission_status not null default 'pending',
  similarity_flag   boolean not null default false,
  similarity_score  numeric(5, 2) check (similarity_score is null or similarity_score between 0 and 100),
  graded_at         timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists submissions_student_idx on public.submissions (student_id, assignment_id);
create index if not exists submissions_assignment_idx on public.submissions (assignment_id, created_at desc);
create index if not exists submissions_status_idx on public.submissions (status);

-- ---------------------------------------------------------------------------
-- submission_similarity — suspicious pairs for admin review (Phase 5).
-- ---------------------------------------------------------------------------
create table if not exists public.submission_similarity (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  submission_a   uuid not null references public.submissions (id) on delete cascade,
  submission_b   uuid not null references public.submissions (id) on delete cascade,
  similarity     numeric(5, 2) not null check (similarity between 0 and 100),
  reviewed       boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (submission_a, submission_b),
  check (submission_a <> submission_b)
);

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 160),
  body        text not null default '',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists announcements_created_idx on public.announcements (created_at desc);

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
create table if not exists public.badges (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_en        text not null,
  name_ar        text not null,
  description_en text not null default '',
  description_ar text not null default '',
  icon           text not null default '🏅',
  created_at     timestamptz not null default now()
);

create table if not exists public.student_badges (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  badge_id    uuid not null references public.badges (id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  unique (student_id, badge_id)
);

create index if not exists student_badges_student_idx on public.student_badges (student_id);

-- ---------------------------------------------------------------------------
-- points_config — exactly one row (id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.points_config (
  id                 smallint primary key default 1 check (id = 1),
  homework_weight    numeric(4, 2) not null default 1.00 check (homework_weight >= 0),
  attendance_points  numeric(6, 2) not null default 10 check (attendance_points >= 0),
  on_time_bonus      numeric(6, 2) not null default 5 check (on_time_bonus >= 0),
  streak_bonus       numeric(6, 2) not null default 15 check (streak_bonus >= 0),
  leaderboard_visible boolean not null default true,
  weekly_reset_at    timestamptz not null default date_trunc('week', now()),
  updated_at         timestamptz not null default now()
);

insert into public.points_config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists announcements_set_updated_at on public.announcements;
create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

drop trigger if exists points_config_set_updated_at on public.points_config;
create trigger points_config_set_updated_at
  before update on public.points_config
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin check (SECURITY DEFINER so it can read profiles under RLS)
-- ---------------------------------------------------------------------------
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
-- Auth hook: every new auth user gets a profile.
-- Role comes from raw_app_meta_data (writable only with the service role),
-- never from user-editable metadata.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username  text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))));
  v_full_name text := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name',
                                          new.raw_user_meta_data ->> 'display_name', 'Student')), 80);
  v_display   text := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', v_full_name)), 80);
  v_role      public.user_role := 'student';
begin
  if new.raw_app_meta_data ->> 'role' = 'admin' then
    v_role := 'admin';
  end if;

  if v_username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username for auth user %', new.id using errcode = '22023';
  end if;

  insert into public.profiles (id, username, full_name, display_name, role)
  values (new.id, v_username, v_full_name, v_display, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.sessions            enable row level security;
alter table public.attendance          enable row level security;
alter table public.assignments         enable row level security;
alter table public.submissions         enable row level security;
alter table public.submission_similarity enable row level security;
alter table public.announcements       enable row level security;
alter table public.badges              enable row level security;
alter table public.student_badges      enable row level security;
alter table public.points_config       enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_admin_select_all" on public.profiles;
create policy "profiles_admin_select_all" on public.profiles
  for select to authenticated
  using (public.is_admin());

-- Column grants below limit updates to display_name / full_name / opt-out.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "profiles_admin_update_all" on public.profiles;
create policy "profiles_admin_update_all" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- No INSERT/DELETE policies: rows are created by the auth trigger and
-- (dis)abled through the service role only.

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
drop policy if exists "sessions_select_authenticated" on public.sessions;
create policy "sessions_select_authenticated" on public.sessions
  for select to authenticated
  using (true);

drop policy if exists "sessions_admin_insert" on public.sessions;
create policy "sessions_admin_insert" on public.sessions
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "sessions_admin_update" on public.sessions;
create policy "sessions_admin_update" on public.sessions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "sessions_admin_delete" on public.sessions;
create policy "sessions_admin_delete" on public.sessions
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- attendance
-- ---------------------------------------------------------------------------
drop policy if exists "attendance_select_own" on public.attendance;
create policy "attendance_select_own" on public.attendance
  for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "attendance_admin_select_all" on public.attendance;
create policy "attendance_admin_select_all" on public.attendance
  for select to authenticated
  using (public.is_admin());

drop policy if exists "attendance_admin_insert" on public.attendance;
create policy "attendance_admin_insert" on public.attendance
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "attendance_admin_update" on public.attendance;
create policy "attendance_admin_update" on public.attendance
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "attendance_admin_delete" on public.attendance;
create policy "attendance_admin_delete" on public.attendance
  for delete to authenticated
  using (public.is_admin());
-- Students never insert directly: self check-in goes through mark_attendance().

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------
drop policy if exists "assignments_select_authenticated" on public.assignments;
create policy "assignments_select_authenticated" on public.assignments
  for select to authenticated
  using (true);

drop policy if exists "assignments_admin_insert" on public.assignments;
create policy "assignments_admin_insert" on public.assignments
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "assignments_admin_update" on public.assignments;
create policy "assignments_admin_update" on public.assignments
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "assignments_admin_delete" on public.assignments;
create policy "assignments_admin_delete" on public.assignments
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
drop policy if exists "submissions_select_own" on public.submissions;
create policy "submissions_select_own" on public.submissions
  for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "submissions_admin_select_all" on public.submissions;
create policy "submissions_admin_select_all" on public.submissions
  for select to authenticated
  using (public.is_admin());

-- Students may insert only their own attempt, before the deadline, and only
-- with grading fields empty. Resubmission is an extra INSERT (attempts kept);
-- whether resubmits are allowed is enforced by the upload route.
drop policy if exists "submissions_student_insert_own" on public.submissions;
create policy "submissions_student_insert_own" on public.submissions
  for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and status = 'pending'
    and ai_score is null
    and final_score is null
    and similarity_flag = false
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and (a.deadline is null or a.deadline > now())
    )
  );

drop policy if exists "submissions_admin_insert" on public.submissions;
create policy "submissions_admin_insert" on public.submissions
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "submissions_admin_update" on public.submissions;
create policy "submissions_admin_update" on public.submissions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "submissions_admin_delete" on public.submissions;
create policy "submissions_admin_delete" on public.submissions
  for delete to authenticated
  using (public.is_admin());
-- Students have no UPDATE/DELETE policy: grades are immutable to them.

-- ---------------------------------------------------------------------------
-- submission_similarity (admin only)
-- ---------------------------------------------------------------------------
drop policy if exists "similarity_admin_all" on public.submission_similarity;
create policy "similarity_admin_all" on public.submission_similarity
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- announcements
-- ---------------------------------------------------------------------------
drop policy if exists "announcements_select_authenticated" on public.announcements;
create policy "announcements_select_authenticated" on public.announcements
  for select to authenticated
  using (true);

drop policy if exists "announcements_admin_insert" on public.announcements;
create policy "announcements_admin_insert" on public.announcements
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "announcements_admin_update" on public.announcements;
create policy "announcements_admin_update" on public.announcements
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "announcements_admin_delete" on public.announcements;
create policy "announcements_admin_delete" on public.announcements
  for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- badges
-- ---------------------------------------------------------------------------
drop policy if exists "badges_select_authenticated" on public.badges;
create policy "badges_select_authenticated" on public.badges
  for select to authenticated
  using (true);

drop policy if exists "badges_admin_all" on public.badges;
create policy "badges_admin_all" on public.badges
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- student_badges
-- ---------------------------------------------------------------------------
drop policy if exists "student_badges_select_own" on public.student_badges;
create policy "student_badges_select_own" on public.student_badges
  for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "student_badges_admin_select_all" on public.student_badges;
create policy "student_badges_admin_select_all" on public.student_badges
  for select to authenticated
  using (public.is_admin());

drop policy if exists "student_badges_admin_write" on public.student_badges;
create policy "student_badges_admin_write" on public.student_badges
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- points_config
-- ---------------------------------------------------------------------------
drop policy if exists "points_config_select_authenticated" on public.points_config;
create policy "points_config_select_authenticated" on public.points_config
  for select to authenticated
  using (true);

drop policy if exists "points_config_admin_update" on public.points_config;
create policy "points_config_admin_update" on public.points_config
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- COLUMN-LEVEL GRANTS
-- Supabase grants ALL on public tables to anon/authenticated by default; we
-- narrow that down explicitly. RLS still decides which rows are visible.
-- ============================================================================

-- profiles: read allowed columns; students may only edit their own display
-- name / full name / leaderboard opt-out.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, display_name, opted_out_of_leaderboard) on public.profiles to authenticated;

-- sessions: students must not see attendance_code. Admins read codes through
-- the service role or admin_list_sessions(); the update grant is gated by RLS.
revoke all on public.sessions from anon, authenticated;
grant select (id, title, session_date, created_at, code_expires_at) on public.sessions to authenticated;
grant insert, update, delete on public.sessions to authenticated;

-- attendance: students read only (RLS own rows); writes are admin or via RPC.
revoke all on public.attendance from anon, authenticated;
grant select on public.attendance to authenticated;
grant insert, update, delete on public.attendance to authenticated;

-- assignments / announcements / badges / points: shared reads, admin writes.
revoke all on public.assignments from anon, authenticated;
grant select on public.assignments to authenticated;
grant insert, update, delete on public.assignments to authenticated;

revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;

revoke all on public.badges from anon, authenticated;
grant select on public.badges to authenticated;
grant insert, update, delete on public.badges to authenticated;

revoke all on public.student_badges from anon, authenticated;
grant select on public.student_badges to authenticated;
grant insert, update, delete on public.student_badges to authenticated;

revoke all on public.points_config from anon, authenticated;
grant select on public.points_config to authenticated;
grant update on public.points_config to authenticated;

revoke all on public.submission_similarity from anon, authenticated;
grant select, insert, update, delete on public.submission_similarity to authenticated;

-- submissions: students may only write the columns needed for an attempt.
revoke all on public.submissions from anon, authenticated;
grant select on public.submissions to authenticated;
grant insert (assignment_id, student_id, file_path, code_text) on public.submissions to authenticated;
grant update (ai_score, ai_feedback, ai_feedback_ar, ai_issues, ai_model,
              ai_graded_at, final_score, status, similarity_flag,
              similarity_score, graded_at) on public.submissions to authenticated;
grant delete on public.submissions to authenticated;

-- ============================================================================
-- FUNCTIONS: attendance codes & self check-in (used from Phase 2)
-- ============================================================================
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

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'no_profile' using errcode = '42501';
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

create or replace function public.generate_attendance_code(p_session_id uuid, p_minutes integer default 15)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code    text;
  v_expires timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_minutes < 1 or p_minutes > 240 then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;

  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           1 + floor(random() * 32)::int, 1), '')
  into v_code
  from generate_series(1, 6);

  v_expires := now() + make_interval(mins => p_minutes);

  update public.sessions
     set attendance_code = v_code,
         code_expires_at = v_expires
   where id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;

  code := v_code;
  expires_at := v_expires;
  return next;
end;
$$;

revoke all on function public.generate_attendance_code(uuid, integer) from public;
grant execute on function public.generate_attendance_code(uuid, integer) to authenticated;

create or replace function public.admin_list_sessions()
returns table (
  id uuid,
  title text,
  session_date date,
  attendance_code text,
  code_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select s.id, s.title, s.session_date, s.attendance_code, s.code_expires_at
    from public.sessions s
    order by s.session_date desc, s.created_at desc;
end;
$$;

revoke all on function public.admin_list_sessions() from public;
grant execute on function public.admin_list_sessions() to authenticated;

-- ============================================================================
-- POINTS + LEADERBOARD
-- ============================================================================
create or replace function public.student_points(p_since timestamptz default null)
returns table (student_id uuid, points numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select homework_weight, attendance_points, on_time_bonus, streak_bonus
    from public.points_config where id = 1
  ),
  -- Best graded attempt per assignment (within the period, when given).
  best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
      and (p_since is null or s.created_at >= p_since)
    group by s.student_id, s.assignment_id
  ),
  hw as (
    select b.student_id,
           sum(b.best_score) * (select homework_weight from cfg) as pts
    from best b
    group by b.student_id
  ),
  att as (
    select a.student_id,
           sum(case a.status
                 when 'present' then (select attendance_points from cfg)
                 when 'late'    then round((select attendance_points from cfg) / 2, 2)
                 else 0
               end) as pts
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    where p_since is null or s.session_date >= p_since::date
    group by a.student_id
  ),
  ontime as (
    select b.student_id,
           count(*) * (select on_time_bonus from cfg) as pts
    from best b
    join public.assignments a on a.id = b.assignment_id
    where a.deadline is not null
      and exists (
        select 1
        from public.submissions s2
        where s2.student_id = b.student_id
          and s2.assignment_id = b.assignment_id
          and s2.final_score is not null
          and s2.created_at <= a.deadline
          and (p_since is null or s2.created_at >= p_since)
      )
    group by b.student_id
  ),
  -- Longest run of consecutive attended sessions (all-time only).
  streak as (
    select x.student_id, max(x.run_len) as max_len
    from (
      select g.student_id, g.grp, count(*) as run_len
      from (
        select a.student_id,
               s.session_date,
               s.session_date - (row_number() over (
                 partition by a.student_id order by s.session_date
               ))::int as grp
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where a.status in ('present', 'late')
          and p_since is null
      ) g
      group by g.student_id, g.grp
    ) x
    group by x.student_id
  ),
  streak_bonus_pts as (
    select st.student_id,
           floor(st.max_len / 5.0) * (select streak_bonus from cfg) as pts
    from streak st
  )
  select p.id,
         round(
           coalesce(hw.pts, 0)
           + coalesce(att.pts, 0)
           + coalesce(ontime.pts, 0)
           + coalesce(streak_bonus_pts.pts, 0),
           2
         ) as points
  from public.profiles p
  left join hw on hw.student_id = p.id
  left join att on att.student_id = p.id
  left join ontime on ontime.student_id = p.id
  left join streak_bonus_pts on streak_bonus_pts.student_id = p.id
  where p.role = 'student';
$$;

-- Only the leaderboard view / my_standing() may call this. It returns one row
-- per student, so direct access would leak the roster's point totals.
revoke all on function public.student_points(timestamptz) from public;
revoke all on function public.student_points(timestamptz) from anon, authenticated;

-- The ONLY leaderboard surface: four aggregate columns, opted-out rows and
-- the whole board hidden when the teacher switches leaderboard_visible off.
create or replace view public.leaderboard
with (security_invoker = false)
as
select
  rank() over (order by ap.points desc) as "rank",
  p.display_name,
  ap.points,
  wp.points as weekly_points,
  rank() over (order by wp.points desc) as weekly_rank
from public.profiles p
join public.student_points(null::timestamptz) ap on ap.student_id = p.id
join public.student_points(
  greatest(
    date_trunc('week', now()),
    (select weekly_reset_at from public.points_config where id = 1)
  )
) wp on wp.student_id = p.id
where p.role = 'student'
  and not p.opted_out_of_leaderboard
  and coalesce((select leaderboard_visible from public.points_config where id = 1), true);

revoke all on public.leaderboard from public, anon;
grant select on public.leaderboard to authenticated;

-- A student's own rank + gap to the next rank, without exposing the board.
create or replace function public.my_standing(p_period text default 'all')
returns table (rank bigint, points numeric, points_to_next numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_since  timestamptz;
  v_points numeric;
  v_rank   bigint;
  v_next   numeric;
begin
  if v_uid is null then
    return;
  end if;

  if not coalesce((select leaderboard_visible from public.points_config where id = 1), true) then
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_uid and role = 'student' and not opted_out_of_leaderboard
  ) then
    return;
  end if;

  if lower(coalesce(p_period, 'all')) = 'week' then
    select greatest(date_trunc('week', now()), weekly_reset_at)
    into v_since
    from public.points_config where id = 1;
  else
    v_since := null;
  end if;

  select sp.points into v_points
  from public.student_points(v_since) sp
  where sp.student_id = v_uid;

  if v_points is null then
    v_points := 0;
  end if;

  select count(*) + 1 into v_rank
  from public.student_points(v_since) sp
  join public.profiles p on p.id = sp.student_id
  where p.role = 'student'
    and not p.opted_out_of_leaderboard
    and sp.points > v_points;

  select coalesce(min(sp.points) - v_points, 0) into v_next
  from public.student_points(v_since) sp
  join public.profiles p on p.id = sp.student_id
  where p.role = 'student'
    and not p.opted_out_of_leaderboard
    and sp.points > v_points;

  rank := v_rank;
  points := v_points;
  points_to_next := v_next;
  return next;
end;
$$;

revoke all on function public.my_standing(text) from public;
grant execute on function public.my_standing(text) to authenticated;

-- ============================================================================
-- STORAGE: private .py submission bucket
-- Path convention: <student_id>/<assignment_id>/<timestamp>-<filename>.py
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 102400)
on conflict (id) do update
  set public = false,
      file_size_limit = 102400;

drop policy if exists "submissions_student_upload_own_folder" on storage.objects;
create policy "submissions_student_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and lower(name) like '%.py'
  );

drop policy if exists "submissions_read_own_or_admin" on storage.objects;
create policy "submissions_read_own_or_admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      split_part(name, '/', 1) = (select auth.uid())::text
      or public.is_admin()
    )
  );

drop policy if exists "submissions_admin_delete" on storage.objects;
create policy "submissions_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'submissions' and public.is_admin());

-- Tell PostgREST to pick up the new schema immediately.
notify pgrst, 'reload schema';
