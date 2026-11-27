-- ============================================================================
-- Data Science SFE — Phase 5: announcements, similarity review, analytics
--
-- Adds a pinned flag to announcements, a similarity-checked timestamp to
-- assignments, an admin-only analytics snapshot, and a review RPC for
-- submission similarity pairs. No existing point math changes here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------
alter table public.announcements
  add column if not exists pinned boolean not null default false;

create index if not exists announcements_pinned_idx
  on public.announcements (pinned desc, created_at desc);

alter table public.assignments
  add column if not exists similarity_checked_at timestamptz;

create index if not exists submission_similarity_assignment_idx
  on public.submission_similarity (assignment_id, similarity desc);

-- ---------------------------------------------------------------------------
-- admin_analytics() — one JSON snapshot for the teacher analytics page
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_totals  jsonb;
  v_weeks   jsonb;
  v_grades  jsonb;
  v_at_risk jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
    group by s.student_id, s.assignment_id
  ),
  grade_rows as (
    select b.student_id,
           round(
             least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)),
             1
           ) as pct
    from best b
    join public.assignments a on a.id = b.assignment_id
  ),
  student_attendance as (
    select p.id,
           count(a.id) filter (where a.status in ('present', 'late')) as attended
    from public.profiles p
    left join public.attendance a on a.student_id = p.id
    where p.role = 'student'
    group by p.id
  ),
  today_sessions as (
    select count(*) as total
    from public.sessions
    where session_date <= current_date
  )
  select jsonb_build_object(
    'students', (select count(*) from public.profiles where role = 'student'),
    'sessions', (select count(*) from public.sessions),
    'assignments', (select count(*) from public.assignments),
    'submissions', (select count(*) from public.submissions),
    'graded', (select count(*) from public.submissions where status = 'graded'),
    'pending', (select count(*) from public.submissions where status = 'pending'),
    'flagged', (select count(*) from public.submissions where status = 'flagged'),
    'attendance_percent', coalesce(
      (
        select round(
          sum(sa.attended)::numeric
            / nullif(
                (select count(*) from public.profiles where role = 'student')
                * (select total from today_sessions),
                0
              )
            * 100,
          1
        )
        from student_attendance sa
      ),
      0
    ),
    'average_percent', coalesce(
      (select round(avg(pct), 1) from grade_rows where pct is not null),
      0
    ),
    'unreviewed_pairs', (
      select count(*) from public.submission_similarity where reviewed = false
    )
  )
  into v_totals;

  with weeks as (
    select generate_series(
      date_trunc('week', now())::date - interval '7 weeks',
      date_trunc('week', now())::date,
      interval '1 week'
    )::date as ws
  ),
  counts as (
    select
      w.ws,
      (
        select count(*)
        from public.sessions s
        where s.session_date >= w.ws
          and s.session_date < w.ws + 7
      ) as sessions,
      (
        select count(*)
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where s.session_date >= w.ws
          and s.session_date < w.ws + 7
          and a.status in ('present', 'late')
      ) as attended,
      (
        select count(*)
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where s.session_date >= w.ws
          and s.session_date < w.ws + 7
          and a.status = 'late'
      ) as late,
      (
        select count(*)
        from public.attendance a
        join public.sessions s on s.id = a.session_id
        where s.session_date >= w.ws
          and s.session_date < w.ws + 7
      ) as marked
    from weeks w
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'week_start', c.ws,
        'sessions', c.sessions,
        'attended', c.attended,
        'late', c.late,
        'attendance_percent',
          case
            when c.marked = 0 then null
            else round(c.attended::numeric / c.marked * 100, 1)
          end
      )
      order by c.ws
    ),
    '[]'::jsonb
  )
  into v_weeks
  from counts c;

  with best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
    group by s.student_id, s.assignment_id
  ),
  grade_rows as (
    select case
             when least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)) < 50 then 0
             when least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)) < 60 then 1
             when least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)) < 70 then 2
             when least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)) < 80 then 3
             when least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)) < 90 then 4
             else 5
           end as bucket
    from best b
    join public.assignments a on a.id = b.assignment_id
  ),
  buckets as (
    select generate_series(0, 5) as bucket
  ),
  grade_counts as (
    select bucket, count(*) as total
    from grade_rows
    group by bucket
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket', b.bucket,
        'count', coalesce(gc.total, 0)
      )
      order by b.bucket
    ),
    '[]'::jsonb
  )
  into v_grades
  from buckets b
  left join grade_counts gc on gc.bucket = b.bucket;

  with best as (
    select s.student_id,
           s.assignment_id,
           max(coalesce(s.final_score, 0)) as best_score
    from public.submissions s
    where s.status = 'graded'
      and s.final_score is not null
    group by s.student_id, s.assignment_id
  ),
  grade_rows as (
    select b.student_id,
           round(
             least(100, greatest(0, b.best_score / nullif(a.max_score, 0) * 100)),
             1
           ) as pct
    from best b
    join public.assignments a on a.id = b.assignment_id
  ),
  student_grades as (
    select student_id, round(avg(pct), 1) as average_percent
    from grade_rows
    group by student_id
  ),
  session_total as (
    select count(*) as total
    from public.sessions
    where session_date <= current_date
  ),
  student_attendance as (
    select p.id,
           p.full_name,
           p.username,
           p.student_code,
           count(a.id) filter (where a.status in ('present', 'late')) as attended
    from public.profiles p
    left join public.attendance a on a.student_id = p.id
    where p.role = 'student'
    group by p.id, p.full_name, p.username, p.student_code
  ),
  stats as (
    select
      sa.full_name,
      sa.username,
      sa.student_code,
      case
        when st.total = 0 then null
        else round(sa.attended::numeric / st.total * 100, 1)
      end as attendance_percent,
      sg.average_percent
    from student_attendance sa
    cross join session_total st
    left join student_grades sg on sg.student_id = sa.id
  )
  select coalesce(
    jsonb_agg(
      to_jsonb(r)
      order by r.attendance_percent asc nulls last, r.average_percent asc nulls last
    ),
    '[]'::jsonb
  )
  into v_at_risk
  from (
    select full_name, username, student_code, attendance_percent, average_percent
    from stats
    where (attendance_percent is not null and attendance_percent < 70)
       or (average_percent is not null and average_percent < 60)
    order by attendance_percent asc nulls last, average_percent asc nulls last
    limit 10
  ) r;

  return jsonb_build_object(
    'totals', v_totals,
    'weeks', v_weeks,
    'grades', v_grades,
    'at_risk', v_at_risk
  );
end;
$$;

revoke all on function public.admin_analytics() from public, anon;
grant execute on function public.admin_analytics() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_similarity_pairs(assignment) — pairs with both student identities
-- ---------------------------------------------------------------------------
create or replace function public.admin_similarity_pairs(p_assignment uuid)
returns table (
  pair_id           uuid,
  similarity        numeric,
  reviewed          boolean,
  created_at        timestamptz,
  submission_a      uuid,
  submission_b      uuid,
  student_a_name    text,
  student_a_username text,
  student_a_code    text,
  student_a_status  public.submission_status,
  student_b_name    text,
  student_b_username text,
  student_b_code    text,
  student_b_status  public.submission_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    ss.id,
    ss.similarity,
    ss.reviewed,
    ss.created_at,
    sa.id,
    sb.id,
    pa.full_name,
    pa.username,
    pa.student_code,
    sa.status,
    pb.full_name,
    pb.username,
    pb.student_code,
    sb.status
  from public.submission_similarity ss
  join public.submissions sa on sa.id = ss.submission_a
  join public.submissions sb on sb.id = ss.submission_b
  join public.profiles pa on pa.id = sa.student_id
  join public.profiles pb on pb.id = sb.student_id
  where ss.assignment_id = p_assignment
  order by ss.reviewed asc, ss.similarity desc;
end;
$$;

revoke all on function public.admin_similarity_pairs(uuid) from public, anon;
grant execute on function public.admin_similarity_pairs(uuid) to authenticated;

notify pgrst, 'reload schema';
