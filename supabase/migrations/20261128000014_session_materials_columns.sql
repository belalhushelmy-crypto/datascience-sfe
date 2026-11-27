-- Ensure session_materials has all columns used by the app.

alter table public.session_materials add column if not exists content text;
alter table public.session_materials add column if not exists mime_type text;
alter table public.session_materials add column if not exists language text;

notify pgrst, 'reload schema';
