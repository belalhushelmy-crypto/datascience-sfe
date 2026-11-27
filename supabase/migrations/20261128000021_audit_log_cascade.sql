-- Allow attendance records to be removed even when audit rows reference them.

alter table public.attendance_audit_log drop constraint if exists attendance_audit_log_attendance_id_fkey;
alter table public.attendance_audit_log
  add constraint attendance_audit_log_attendance_id_fkey
  foreign key (attendance_id) references public.attendance(id) on delete cascade;

notify pgrst, 'reload schema';
