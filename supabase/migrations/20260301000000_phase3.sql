-- ============================================================================
-- Data Science SFE — Phase 3: assignments, uploads, AI grading, review
--
-- The base schema already has assignments, submissions, submission_similarity
-- and the private `submissions` storage bucket. This migration adds the grading
-- queue bookkeeping, the teacher-review columns, the extra grants the review
-- screen needs, and one admin-only overview function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- submissions — grading queue + review bookkeeping
-- ---------------------------------------------------------------------------
alter table public.submissions
  add column if not exists grading_attempts integer not null default 0,
  add column if not exists grading_locked_at timestamptz,
  add column if not exists grading_error text,
  add column if not exists graded_by text,
  add column if not exists reviewed_at timestamptz;

alter table public.submissions
  drop constraint if exists submissions_grading_attempts_check;
alter table public.submissions
  add constraint submissions_grading_attempts_check
  check (grading_attempts between 0 and 50);

alter table public.submissions
  drop constraint if exists submissions_graded_by_check;
alter table public.submissions
  add constraint submissions_graded_by_check
  check (graded_by is null or graded_by in ('ai', 'teacher'));

-- The queue is "pending submissions, oldest first". A partial index keeps it
-- tiny even after thousands of graded attempts exist.
create index if not exists submissions_queue_idx
  on public.submissions (created_at)
  where status = 'pending';

-- Teachers record who reviewed a submission and when. Students have no UPDATE
-- policy at all, so these columns stay teacher-only.
grant update (graded_by, reviewed_at) on public.submissions to authenticated;

-- ---------------------------------------------------------------------------
-- admin_assignment_overview()
-- Per-assignment counts + class average, re-checking is_admin().
-- ---------------------------------------------------------------------------
create or replace function public.admin_assignment_overview()
returns table (
  assignment_id uuid,
  attempt_count bigint,
  student_count bigint,
  pending_count bigint,
  graded_count bigint,
  flagged_count bigint,
  average_percent numeric,
  last_submission_at timestamptz,
  class_size bigint
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
  with counts as (
    select s.assignment_id,
           count(*) as attempts,
           count(distinct s.student_id) as students,
           count(*) filter (where s.status = 'pending') as pending,
           count(*) filter (where s.status = 'graded') as graded,
           count(*) filter (where s.status = 'flagged') as flagged,
           max(s.created_at) as last_at
    from public.submissions s
    group by s.assignment_id
  ),
  best as (
    select s.assignment_id,
           s.student_id,
           max(coalesce(s.final_score, s.ai_score)) as best_score
    from public.submissions s
    where coalesce(s.final_score, s.ai_score) is not null
    group by s.assignment_id, s.student_id
  ),
  averages as (
    select b.assignment_id,
           round(avg(b.best_score / nullif(a.max_score, 0)) * 100, 1) as avg_percent
    from best b
    join public.assignments a on a.id = b.assignment_id
    group by b.assignment_id
  )
  select a.id,
         coalesce(c.attempts, 0),
         coalesce(c.students, 0),
         coalesce(c.pending, 0),
         coalesce(c.graded, 0),
         coalesce(c.flagged, 0),
         av.avg_percent,
         c.last_at,
         (select count(*) from public.profiles p where p.role = 'student')
  from public.assignments a
  left join counts c on c.assignment_id = a.id
  left join averages av on av.assignment_id = a.id;
end;
$$;

revoke all on function public.admin_assignment_overview() from public;
grant execute on function public.admin_assignment_overview() to authenticated;

notify pgrst, 'reload schema';
