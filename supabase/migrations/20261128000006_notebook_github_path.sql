-- GitHub path used for the direct Colab link of a notebook submission.

alter table public.submissions
  add column if not exists notebook_github_path text;

create index if not exists submissions_notebook_github_path_idx
  on public.submissions (notebook_github_path)
  where notebook_github_path is not null;

notify pgrst, 'reload schema';
