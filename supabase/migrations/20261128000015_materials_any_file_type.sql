-- Session materials accept any file type; staff choose what to share.

update storage.buckets
  set allowed_mime_types = null
  where id = 'session-materials';

notify pgrst, 'reload schema';
