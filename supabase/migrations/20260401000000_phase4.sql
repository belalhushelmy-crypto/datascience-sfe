-- ============================================================================
-- Data Science SFE — Phase 4: points engine UI, leaderboard, badges
--
-- Adds read models for the points breakdown / weekly trend / leaderboard,
-- one admin overview, an explicit badge re-evaluation helper, and automatic
-- badge awarding when submissions or attendance change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Badge evaluation
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_student_badges(p_student uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_submission  boolean := false;
  v_first_to_submit boolean := false;
  v_streak_five     boolean := false;
  v_perfect         boolean := false;
  v_comeback        boolean := false;
begin
  if p_student is null then
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_student and role = 'student'
  ) then
    return;
  end if;

  select exists (
    select 1 from public.submissions s where s.student_id = p_student
  ) into v_has_submission;

  select exists (
    select 1
    from public.assignments a
    where (
      select s.student_id
      from public.submissions s
      where s.assignment_id = a.id
      order by s.created_at asc, s.id asc
      limit 1
    ) = p_student
  ) into v_first_to_submit;

  select coalesce(max(x.run_len), 0) >= 5
  into v_streak_five
  from (
    select count(*) as run_len
    from (
      select s.session_date
             - (row_number() over (order by s.session_date))::int as grp
      from public.attendance a
      join public.sessions s on s.id = a.session_id
      where a.student_id = p_student
        and a.status in ('present', 'late')
    ) g
    group by g.grp
  ) x;

  select exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.student_id = p_student
      and s.status = 'graded'
      and s.final_score is not null
      and s.final_score >= a.max_score
  ) into v_perfect;

  select exists (
    select 1
    from public.submissions earlier
    join public.submissions later
      on later.assignment_id = earlier.assignment_id
     and later.student_id = earlier.student_id
     and later.created_at > earlier.created_at
    where earlier.student_id = p_student
      and coalesce(earlier.final_score, earlier.ai_score) is not null
      and coalesce(later.final_score, later.ai_score)
          > coalesce(earlier.final_score, earlier.ai_score)
  ) into v_comeback;

  if v_has_submission then
    insert into public.student_badges (student_id, badge_id)
    select p_student, b.id from public.badges b where b.code = 'first_submission'
    on conflict (student_id, badge_id) do nothing;
  end if;

  if v_first_to_submit then
    insert into public.student_badges (student_id, badge_id)
    select p_student, b.id from public.badges b where b.code = 'first_to_submit'
    on conflict (student_id, badge_id) do nothing;
  end if;

  if v_streak_five then
    insert into public.student_badges (student_id, badge_id)
    select p_student, b.id from public.badges b where b.code = 'attendance_streak_5'
    on conflict (student_id, badge_id) do nothing;
  end if;

  if v_perfect then
    insert into public.student_badges (student_id, badge_id)
    select p_student, b.id from public.badges b where b.code = 'perfect_score'
    on conflict (student_id, badge_id) do nothing;
  end if;

  if v_comeback then
    insert into public.student_badges (student_id, badge_id)
    select p_student, b.id from public.badges b where b.code = 'comeback'
    on conflict (student_id, badge_id) do nothing;
  end if;
end;
$$;

revoke all on function public.evaluate_student_badges(uuid) from public, anon, authenticated;

create or replace function public.award_badges_after_submission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_student_badges(new.student_id);
  return null;
end;
$$;

revoke all on function public.award_badges_after_submission() from public, anon, authenticated;

drop trigger if exists submissions_award_badges on public.submissions;
create trigger submissions_award_badges
  after insert or update of status, final_score, ai_score on public.submissions
  for each row execute function public.award_badges_after_submission();

create or replace function public.award_badges_after_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.evaluate_student_badges(new.student_id);
  return null;
end;
$$;

revoke all on function public.award_badges_after_attendance() from public, anon, authenticated;

drop trigger if exists attendance_award_badges on public.attendance;
create trigger attendance_award_badges
  after insert or update of status on public.attendance
  for each row execute function public.award_badges_after_attendance();

-- ---------------------------------------------------------------------------
-- my_breakdown() — the student's own points, streak and rank
-- ---------------------------------------------------------------------------
create or replace function public.my_breakdown()
returns table (
  homework_points    numeric,
  attendance_points  numeric,
  on_time_points     numeric,
  streak_points      numeric,
  total_points       numeric,
  attended_count     bigint,
  late_count         bigint,
  longest_streak     integer,
  current_streak     integer,
  all_rank           bigint,
  all_gap            numeric,
  weekly_points      numeric,
  weekly_rank        bigint,
  weekly_gap         numeric,
  leaderboard_visible boolean,
  opted_out          boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_cfg        public.points_config%rowtype;
  v_homework   numeric := 0;
  v_attendance numeric := 0;
  v_on_time    numeric := 0;
  v_streak_pts numeric := 0;
  v_attended   bigint := 0;
  v_late       bigint := 0;
  v_longest    integer := 0;
  v_current    integer := 0;
  v_total      numeric := 0;
  v_weekly     numeric := 0;
  v_week_start timestamptz;
  v_visible    boolean := true;
  v_opted      boolean := false;
  v_all_rank   bigint;
  v_all_gap    numeric;
  v_week_rank  bigint;
  v_week_gap   numeric;
begin
  if v_uid is null then
    return;
  end if;

  select * into v_cfg from public.points_config where id = 1;
  v_visible := coalesce(v_cfg.leaderboard_visible, true);

  select p.opted_out_of_leaderboard into v_opted
  from public.profiles p
  where p.id = v_uid and p.role = 'student';

  if not found then
    return;
  end if;

  select coalesce(sum(b.best_score), 0) * v_cfg.homework_weight
  into v_homework
  from (
    select s.assignment_id, max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.student_id = v_uid
      and s.status = 'graded'
      and s.final_score is not null
    group by s.assignment_id
  ) b;

  select
    coalesce(sum(
      case a.status
        when 'present' then v_cfg.attendance_points
        when 'late' then round(v_cfg.attendance_points / 2, 2)
        else 0
      end
    ), 0),
    count(*) filter (where a.status in ('present', 'late')),
    count(*) filter (where a.status = 'late')
  into v_attendance, v_attended, v_late
  from public.attendance a
  where a.student_id = v_uid;

  select count(*) * v_cfg.on_time_bonus
  into v_on_time
  from (
    select s.assignment_id
    from public.submissions s
    where s.student_id = v_uid
      and s.final_score is not null
    group by s.assignment_id
  ) b
  join public.assignments a on a.id = b.assignment_id
  where a.deadline is not null
    and exists (
      select 1
      from public.submissions s2
      where s2.student_id = v_uid
        and s2.assignment_id = a.id
        and s2.final_score is not null
        and s2.created_at <= a.deadline
    );

  select coalesce(max(x.run_len), 0)
  into v_longest
  from (
    select count(*) as run_len
    from (
      select s.session_date
             - (row_number() over (order by s.session_date))::int as grp
      from public.attendance a
      join public.sessions s on s.id = a.session_id
      where a.student_id = v_uid
        and a.status in ('present', 'late')
    ) g
    group by g.grp
  ) x;

  with ordered as (
    select a.status,
           row_number() over (
             order by s.session_date desc, s.created_at desc
           ) as rn
    from public.sessions s
    left join public.attendance a
      on a.session_id = s.id and a.student_id = v_uid
    where s.session_date <= current_date
  ),
  last_miss as (
    select min(rn) as rn
    from ordered
    where status is null or status = 'absent'
  )
  select count(*) filter (where o.status in ('present', 'late'))::int
  into v_current
  from ordered o
  cross join last_miss m
  where o.rn < coalesce(m.rn, 2147483647);

  v_streak_pts := floor(v_longest / 5.0) * v_cfg.streak_bonus;

  select coalesce(
    (select sp.points from public.student_points(null::timestamptz) sp
      where sp.student_id = v_uid),
    0
  ) into v_total;

  select greatest(date_trunc('week', now()), v_cfg.weekly_reset_at)
  into v_week_start;

  select coalesce(
    (select sp.points from public.student_points(v_week_start) sp
      where sp.student_id = v_uid),
    0
  ) into v_weekly;

  if v_visible and not coalesce(v_opted, false) then
    select count(*) + 1 into v_all_rank
    from public.student_points(null::timestamptz) sp
    join public.profiles p on p.id = sp.student_id
    where p.role = 'student'
      and not p.opted_out_of_leaderboard
      and sp.points > v_total;

    select coalesce(min(sp.points) - v_total, 0) into v_all_gap
    from public.student_points(null::timestamptz) sp
    join public.profiles p on p.id = sp.student_id
    where p.role = 'student'
      and not p.opted_out_of_leaderboard
      and sp.points > v_total;

    select count(*) + 1 into v_week_rank
    from public.student_points(v_week_start) sp
    join public.profiles p on p.id = sp.student_id
    where p.role = 'student'
      and not p.opted_out_of_leaderboard
      and sp.points > v_weekly;

    select coalesce(min(sp.points) - v_weekly, 0) into v_week_gap
    from public.student_points(v_week_start) sp
    join public.profiles p on p.id = sp.student_id
    where p.role = 'student'
      and not p.opted_out_of_leaderboard
      and sp.points > v_weekly;
  end if;

  return query
  select
    round(v_homework, 2),
    round(v_attendance, 2),
    round(v_on_time, 2),
    round(v_streak_pts, 2),
    round(v_total, 2),
    v_attended,
    v_late,
    v_longest,
    v_current,
    v_all_rank,
    round(v_all_gap, 2),
    round(v_weekly, 2),
    v_week_rank,
    round(v_week_gap, 2),
    v_visible,
    coalesce(v_opted, false);
end;
$$;

revoke all on function public.my_breakdown() from public, anon;
grant execute on function public.my_breakdown() to authenticated;

-- ---------------------------------------------------------------------------
-- my_progress_weeks() — points per week for the progress chart
-- ---------------------------------------------------------------------------
create or replace function public.my_progress_weeks(p_weeks integer default 8)
returns table (
  week_start        date,
  points            numeric,
  cumulative_points numeric,
  attended_count    bigint,
  graded_count      bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_weeks integer := greatest(1, least(coalesce(p_weeks, 8), 26));
begin
  if v_uid is null then
    return;
  end if;

  return query
  with weeks as (
    select generate_series(
      date_trunc('week', now())::date - ((v_weeks - 1) * interval '1 week'),
      date_trunc('week', now())::date,
      interval '1 week'
    )::date as ws
  ),
  calc as (
    select
      w.ws,
      coalesce((
        select sp.points from public.student_points(w.ws::timestamptz) sp
        where sp.student_id = v_uid
      ), 0) as since_start,
      coalesce((
        select sp.points from public.student_points((w.ws + 7)::timestamptz) sp
        where sp.student_id = v_uid
      ), 0) as since_end,
      (
        select count(*)
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where a.student_id = v_uid
          and a.status in ('present', 'late')
          and s.session_date >= w.ws
          and s.session_date < w.ws + 7
      ) as attended,
      (
        select count(*)
        from public.submissions s
        where s.student_id = v_uid
          and s.status = 'graded'
          and s.created_at >= w.ws
          and s.created_at < w.ws + 7
      ) as graded
    from weeks w
  )
  select
    calc.ws,
    round(calc.since_start - calc.since_end, 2),
    round(
      sum(calc.since_start - calc.since_end)
        over (order by calc.ws),
      2
    ),
    calc.attended,
    calc.graded
  from calc
  order by calc.ws;
end;
$$;

revoke all on function public.my_progress_weeks(integer) from public, anon;
grant execute on function public.my_progress_weeks(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- leaderboard_page() — ranked rows with an is_me flag, no student ids
-- ---------------------------------------------------------------------------
create or replace function public.leaderboard_page(p_period text default 'all')
returns table (
  rank         bigint,
  display_name text,
  points       numeric,
  is_me        boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_since timestamptz := null;
begin
  if not coalesce(
    (select leaderboard_visible from public.points_config where id = 1),
    true
  ) then
    return;
  end if;

  if lower(coalesce(p_period, 'all')) = 'week' then
    select greatest(date_trunc('week', now()), weekly_reset_at)
    into v_since
    from public.points_config
    where id = 1;
  end if;

  return query
  select
    rank() over (order by sp.points desc),
    p.display_name,
    sp.points,
    p.id = v_uid
  from public.profiles p
  join public.student_points(v_since) sp on sp.student_id = p.id
  where p.role = 'student'
    and not p.opted_out_of_leaderboard
  order by sp.points desc, p.display_name asc;
end;
$$;

revoke all on function public.leaderboard_page(text) from public, anon;
grant execute on function public.leaderboard_page(text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_points_overview() — every student's points components
-- ---------------------------------------------------------------------------
create or replace function public.admin_points_overview()
returns table (
  student_id         uuid,
  username           text,
  full_name          text,
  student_code       text,
  total_points       numeric,
  weekly_points      numeric,
  homework_points    numeric,
  attendance_points  numeric,
  on_time_points     numeric,
  streak_points      numeric,
  attended_count     bigint,
  late_count         bigint,
  longest_streak     integer,
  badge_count        bigint,
  opted_out          boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_week_start timestamptz;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select greatest(date_trunc('week', now()), weekly_reset_at)
  into v_week_start
  from public.points_config
  where id = 1;

  return query
  with cfg as (
    select homework_weight as hw_weight,
           attendance_points as att_points,
           on_time_bonus as ontime_bonus,
           streak_bonus as streak_bonus
    from public.points_config
    where id = 1
  ),
  best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
    group by s.student_id, s.assignment_id
  ),
  hw as (
    select b.student_id, sum(b.best_score) * cfg.hw_weight as pts
    from best b cross join cfg
    group by b.student_id, cfg.hw_weight
  ),
  att as (
    select a.student_id,
           sum(
             case a.status
               when 'present' then cfg.att_points
               when 'late' then round(cfg.att_points / 2, 2)
               else 0
             end
           ) as pts,
           count(*) filter (where a.status in ('present', 'late')) as attended,
           count(*) filter (where a.status = 'late') as late
    from public.attendance a cross join cfg
    group by a.student_id
  ),
  ontime as (
    select b.student_id, count(*) * cfg.ontime_bonus as pts
    from best b
    cross join cfg
    join public.assignments a on a.id = b.assignment_id
    where a.deadline is not null
      and exists (
        select 1
        from public.submissions s2
        where s2.student_id = b.student_id
          and s2.assignment_id = b.assignment_id
          and s2.final_score is not null
          and s2.created_at <= a.deadline
      )
    group by b.student_id, cfg.ontime_bonus
  ),
  streak as (
    select x.student_id, max(x.run_len) as longest
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
      ) g
      group by g.student_id, g.grp
    ) x
    group by x.student_id
  ),
  badge_totals as (
    select sb.student_id, count(*) as badges
    from public.student_badges sb
    group by sb.student_id
  ),
  weekly as (
    select sp.student_id, sp.points
    from public.student_points(v_week_start) sp
  )
  select
    p.id,
    p.username,
    p.full_name,
    p.student_code,
    round(
      coalesce(hw.pts, 0)
      + coalesce(att.pts, 0)
      + coalesce(ontime.pts, 0)
      + floor(coalesce(st.longest, 0) / 5.0) * cfg.streak_bonus,
      2
    ) as total_points,
    round(coalesce(wk.points, 0), 2) as weekly_points,
    round(coalesce(hw.pts, 0), 2) as homework_points,
    round(coalesce(att.pts, 0), 2) as attendance_points,
    round(coalesce(ontime.pts, 0), 2) as on_time_points,
    round(floor(coalesce(st.longest, 0) / 5.0) * cfg.streak_bonus, 2) as streak_points,
    coalesce(att.attended, 0) as attended_count,
    coalesce(att.late, 0) as late_count,
    coalesce(st.longest, 0)::int as longest_streak,
    coalesce(bt.badges, 0) as badge_count,
    p.opted_out_of_leaderboard as opted_out
  from public.profiles p
  cross join cfg
  left join hw on hw.student_id = p.id
  left join att on att.student_id = p.id
  left join ontime on ontime.student_id = p.id
  left join streak st on st.student_id = p.id
  left join badge_totals bt on bt.student_id = p.id
  left join weekly wk on wk.student_id = p.id
  where p.role = 'student'
  order by total_points desc, p.display_name asc;
end;
$$;

revoke all on function public.admin_points_overview() from public, anon;
grant execute on function public.admin_points_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_recalculate_badges() — explicit backfill button
-- ---------------------------------------------------------------------------
create or replace function public.admin_recalculate_badges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before bigint;
  v_after  bigint;
  r        record;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select count(*) into v_before from public.student_badges;

  for r in select id from public.profiles where role = 'student' loop
    perform public.evaluate_student_badges(r.id);
  end loop;

  select count(*) into v_after from public.student_badges;
  return (v_after - v_before)::int;
end;
$$;

revoke all on function public.admin_recalculate_badges() from public, anon;
grant execute on function public.admin_recalculate_badges() to authenticated;

-- Backfill badges for data that already existed before this migration.
do $$
declare
  r record;
begin
  for r in select id from public.profiles where role = 'student' loop
    perform public.evaluate_student_badges(r.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
