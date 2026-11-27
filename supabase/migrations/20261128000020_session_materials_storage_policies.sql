-- Correct bucket name in materials storage policies.

drop policy if exists "materials_student_read" on storage.objects;
create policy "materials_student_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'session-materials');

drop policy if exists "materials_staff_insert" on storage.objects;
create policy "materials_staff_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'session-materials' and public.is_teacher_or_admin());

drop policy if exists "materials_staff_update" on storage.objects;
create policy "materials_staff_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'session-materials' and public.is_teacher_or_admin())
  with check (bucket_id = 'session-materials' and public.is_teacher_or_admin());

drop policy if exists "materials_staff_delete" on storage.objects;
create policy "materials_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'session-materials' and public.is_teacher_or_admin());

notify pgrst, 'reload schema';
