-- Per-assignment AI feedback approval gate.
-- When require_feedback_approval is true, AI feedback/score stays hidden from
-- students until a teacher/admin saves a review and releases it.

alter table public.assignments
  add column if not exists require_feedback_approval boolean not null default true;

alter table public.submissions
  add column if not exists feedback_approved_at timestamptz,
  add column if not exists feedback_approved_by uuid references public.profiles(id) on delete set null;

create index if not exists submissions_feedback_approved_idx
  on public.submissions (feedback_approved_at)
  where feedback_approved_at is not null;

notify pgrst, 'reload schema';
