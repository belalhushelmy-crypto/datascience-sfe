-- Audit history must never block account deletion.

alter table public.attendance_audit_log drop constraint if exists attendance_audit_log_student_id_fkey;
alter table public.attendance_audit_log drop constraint if exists attendance_audit_log_changed_by_fkey;
alter table public.attendance_audit_log drop constraint if exists attendance_audit_log_attendance_id_fkey;

notify pgrst, 'reload schema';
