-- Admin-assigned teacher responsible for a student's grading.

alter table public.profiles
  add column if not exists grading_teacher_id uuid
    references public.profiles(id) on delete set null;

create index if not exists profiles_grading_teacher_id_idx
  on public.profiles (grading_teacher_id);

notify pgrst, 'reload schema';
