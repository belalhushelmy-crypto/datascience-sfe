-- Google Drive file id for .ipynb submissions opened in Colab.

alter table public.submissions
  add column if not exists notebook_drive_file_id text;

create index if not exists submissions_notebook_drive_file_idx
  on public.submissions (notebook_drive_file_id)
  where notebook_drive_file_id is not null;

notify pgrst, 'reload schema';
