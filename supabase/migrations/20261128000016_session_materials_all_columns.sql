-- Ensure all columns the app writes to session_materials exist.

alter table public.session_materials add column if not exists file_path text;
alter table public.session_materials add column if not exists mime_type text;
alter table public.session_materials add column if not exists content text;
alter table public.session_materials add column if not exists language text;
alter table public.session_materials add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.session_materials add column if not exists created_at timestamptz not null default now();

notify pgrst, 'reload schema';
