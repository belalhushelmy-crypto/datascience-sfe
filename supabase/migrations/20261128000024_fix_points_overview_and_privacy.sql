-- Restore student_points privacy and rebuild the staff overview from the
-- leaderboard's point function (all-time + weekly) with correct components.

revoke all on function public.student_points(timestamptz) from public, anon, authenticated;

drop function if exists public.admin_points_overview();
create function public.admin_points_overview()
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
  opted_out          boolean,
  manual_points      numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $points_overview$
#variable_conflict use_column
declare
  v_week_start timestamptz := date_trunc('week', now());
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with cfg as (
    select homework_weight, attendance_points, on_time_bonus, streak_bonus
    from public.points_config where id = 1
  ),
  best_all as (
    select s.student_id, s.assignment_id, max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded' and s.final_score is not null
    group by s.student_id, s.assignment_id
  ),
  best_week as (
    select s.student_id, s.assignment_id, max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded' and s.final_score is not null and s.created_at >= v_week_start
    group by s.student_id, s.assignment_id
  ),
  homework as (
    select b.student_id, sum(b.best_score) * (select homework_weight from cfg) as pts
    from best_all b group by b.student_id
  ),
  attendance as (
    select a.student_id,
      sum(case a.status
        when 'present' then (select attendance_points from cfg)
        when 'late' then round((select attendance_points from cfg) / 2, 2)
        else 0 end) as pts
    from public.attendance a
    group by a.student_id
  ),
  ontime as (
    select b.student_id, count(*) * (select on_time_bonus from cfg) as pts
    from best_week b
    join public.assignments a on a.id = b.assignment_id
    where a.deadline is not null
      and exists (
        select 1 from public.submissions s
        where s.student_id = b.student_id
          and s.assignment_id = b.assignment_id
          and s.final_score is not null
          and s.created_at <= a.deadline
          and s.created_at >= v_week_start
      )
    group by b.student_id
  ),
  streak as (
    select x.student_id,
      floor(max(x.run_len) / 5.0) * (select streak_bonus from cfg) as pts,
      max(x.run_len)::integer as longest_streak
    from (
      select g.student_id, g.grp, count(*) as run_len
      from (
        select a.student_id, s.session_date,
          s.session_date - (row_number() over (partition by a.student_id order by s.session_date))::int as grp
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where a.status in ('present', 'late')
      ) g
      group by g.student_id, g.grp
    ) x
    group by x.student_id
  ),
  manual as (
    select pa.student_id, sum(pa.points) as pts
    from public.point_adjustments pa group by pa.student_id
  ),
  counts as (
    select a.student_id,
      count(*) filter (where a.status in ('present','late')) as attended,
      count(*) filter (where a.status = 'late') as late
    from public.attendance a group by a.student_id
  ),
  totals as (
    select sp.student_id, sp.points from public.student_points(null::timestamptz) sp
  ),
  weekly_totals as (
    select sp.student_id, sp.points from public.student_points(v_week_start) sp
  )
  select p.id, p.username, p.full_name, p.student_code,
    coalesce(totals.points, 0) as total_points,
    coalesce(weekly_totals.points, 0) as weekly_points,
    coalesce(homework.pts, 0) as homework_points,
    coalesce(attendance.pts, 0) as attendance_points,
    coalesce(ontime.pts, 0) as on_time_points,
    coalesce(streak.pts, 0) as streak_points,
    coalesce(counts.attended, 0) as attended_count,
    coalesce(counts.late, 0) as late_count,
    coalesce(streak.longest_streak, 0) as longest_streak,
    (select count(*) from public.student_badges sb where sb.student_id = p.id) as badge_count,
    p.opted_out_of_leaderboard as opted_out,
    coalesce(manual.pts, 0) as manual_points
  from public.profiles p
  left join totals on totals.student_id = p.id
  left join weekly_totals on weekly_totals.student_id = p.id
  left join homework on homework.student_id = p.id
  left join attendance on attendance.student_id = p.id
  left join ontime on ontime.student_id = p.id
  left join streak on streak.student_id = p.id
  left join manual on manual.student_id = p.id
  left join counts on counts.student_id = p.id
  where p.role = 'student'
  order by total_points desc, p.full_name;
end;
$points_overview$;

revoke all on function public.admin_points_overview() from public, anon;
grant execute on function public.admin_points_overview() to authenticated;

notify pgrst, 'reload schema';
