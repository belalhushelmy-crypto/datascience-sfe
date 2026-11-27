-- Legacy material_kind is required by the old table but unused by the current app.

alter table public.session_materials alter column kind set default 'file';

notify pgrst, 'reload schema';
