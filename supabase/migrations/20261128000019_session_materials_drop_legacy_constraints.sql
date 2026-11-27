-- Legacy constraints assume note/link materials; they block plain file uploads.

alter table public.session_materials drop constraint if exists material_has_content;
alter table public.session_materials drop constraint if exists material_has_url;
alter table public.session_materials drop constraint if exists material_has_storage_path;
alter table public.session_materials drop constraint if exists session_materials_type_check;

notify pgrst, 'reload schema';
