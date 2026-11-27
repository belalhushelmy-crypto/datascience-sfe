-- Username may be changed once every 7 days.

alter table public.profiles
  add column if not exists username_changed_at timestamptz;

notify pgrst, 'reload schema';
