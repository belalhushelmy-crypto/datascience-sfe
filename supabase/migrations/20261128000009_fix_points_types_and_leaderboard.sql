-- Fix longest_streak type and allow the leaderboard view to read student_points.

grant execute on function public.student_points(timestamptz) to authenticated;

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
  v_week_start timestamptz;
begin
  if not public.is_teacher_or_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select date_trunc('week', current_date) into v_week_start;

  return query
  with cfg as (
    select homework_weight, attendance_points, on_time_bonus, streak_bonus
    from public.points_config where id = 1
  ),
  best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score,
           max(s.created_at) as created_at
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
      and s.created_at >= v_week_start
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
    where s.session_date >= v_week_start::date
    group by a.student_id
  ),
  ontime as (
    select b.student_id,
           count(*) * (select on_time_bonus from cfg) as pts
    from best b
    join public.assignments a on a.id = b.assignment_id
    where a.deadline is not null
      and b.best_score = a.max_score
      and b.created_at >= v_week_start
    group by b.student_id
  ),
  streak as (
    select p.student_id,
           (select streak_bonus from cfg) * greatest(p.longest_streak - 1, 0) as pts
    from (
      select a.student_id,
             max(attended) as longest_streak
      from (
        select a.student_id,
               s.session_date,
               count(*) filter (where a.status in ('present', 'late')) over (partition by a.student_id order by s.session_date rows between unbounded preceding and current row) as attended
        from public.attendance a
        join public.sessions s on s.id = a.session_id
      ) a
      group by a.student_id
    ) p
  ),
  manual_all as (
    select pa.student_id, sum(pa.points) as pts
    from public.point_adjustments pa
    group by pa.student_id
  ),
  manual_week as (
    select pa.student_id, sum(pa.points) as pts
    from public.point_adjustments pa
    where pa.created_at >= v_week_start
    group by pa.student_id
  )
  select p.id,
         p.username,
         p.full_name,
         p.student_code,
         coalesce(h.pts, 0) + coalesce(a.pts, 0) + coalesce(o.pts, 0) + coalesce(s.pts, 0) + coalesce(ma.pts, 0) as total_points,
         coalesce(h.pts, 0) + coalesce(mw.pts, 0) as weekly_points,
         coalesce(h.pts, 0) as homework_points,
         coalesce(a.pts, 0) as attendance_points,
         coalesce(o.pts, 0) as on_time_points,
         coalesce(s.pts, 0) as streak_points,
         coalesce(att.attended, 0) as attended_count,
         coalesce(att.late, 0) as late_count,
         coalesce(st.longest_streak, 0)::integer as longest_streak,
         (select count(*) from public.student_badges sb where sb.student_id = p.id) as badge_count,
         p.opted_out_of_leaderboard as opted_out,
         coalesce(ma.pts, 0) as manual_points
  from public.profiles p
  left join hw h on h.student_id = p.id
  left join att a on a.student_id = p.id
  left join ontime o on o.student_id = p.id
  left join streak s on s.student_id = p.id
  left join manual_all ma on ma.student_id = p.id
  left join manual_week mw on mw.student_id = p.id
  left join (
    select a.student_id,
           count(*) filter (where a.status in ('present', 'late')) as attended,
           count(*) filter (where a.status = 'late') as late
    from public.attendance a
    join public.sessions s on s.id = a.session_id
    group by a.student_id
  ) att on att.student_id = p.id
  left join (
    select a.student_id,
           max(attended) as longest_streak
    from (
      select a.student_id,
             s.session_date,
             count(*) filter (where a.status in ('present', 'late')) over (partition by a.student_id order by s.session_date rows between unbounded preceding and current row) as attended
      from public.attendance a
      join public.sessions s on s.id = a.session_id
    ) a
    group by a.student_id
  ) st on st.student_id = p.id
  where p.role = 'student'
  order by total_points desc, p.full_name;
end;
$points_overview$;

revoke all on function public.admin_points_overview() from public, anon;
grant execute on function public.admin_points_overview() to authenticated;

notify pgrst, 'reload schema';
