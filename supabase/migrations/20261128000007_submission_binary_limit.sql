-- Allow image and PDF submissions up to 10 MB.

update storage.buckets
  set file_size_limit = 10485760
  where id = 'submissions';

notify pgrst, 'reload schema';
