-- Per-assignment file formats.
-- allow_any_file_extension = true (default) lets students upload any text/code
-- format, including .ipynb notebooks. Staff can uncheck it and set an explicit
-- list on each assignment.

alter table public.assignments
  add column if not exists allowed_file_extensions text[] not null default array[
    '.py', '.ipynb', '.js', '.jsx', '.ts', '.tsx', '.java',
    '.c', '.h', '.cpp', '.cs', '.go', '.rs', '.rb', '.php',
    '.sql', '.r', '.txt', '.md', '.json', '.csv',
    '.html', '.css', '.xml', '.yaml', '.yml'
  ]::text[],
  add column if not exists allow_any_file_extension boolean not null default true;

notify pgrst, 'reload schema';
