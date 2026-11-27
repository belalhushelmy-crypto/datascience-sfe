-- Compatibility: this project's session_materials table was created with an
-- older shape (kind/url/storage_path). Add the columns the current app uses.

alter table public.session_materials add column if not exists type text not null default 'file';
alter table public.session_materials add column if not exists file_path text;
alter table public.session_materials add column if not exists mime_type text;
alter table public.session_materials add column if not exists language text;

notify pgrst, 'reload schema';
