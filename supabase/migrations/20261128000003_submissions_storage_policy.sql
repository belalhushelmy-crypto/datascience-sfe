-- Submissions: allow any file format in the private bucket.
-- The app validates the per-assignment format list; Storage only enforces that
-- a student writes inside their own folder.

drop policy if exists "submissions_student_upload_own_folder" on storage.objects;
create policy "submissions_student_upload_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
