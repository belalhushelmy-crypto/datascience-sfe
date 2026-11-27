-- Assignments belong to a session when created from that session.

alter table public.assignments
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

create index if not exists assignments_session_id_idx
  on public.assignments (session_id)
  where session_id is not null;

notify pgrst, 'reload schema';
