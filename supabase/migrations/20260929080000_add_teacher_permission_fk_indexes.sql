-- SCMS v12: cover foreign-key columns introduced by teacher access management.
-- Keeps FK checks and joins efficient without changing authorization behavior.

create index if not exists idx_role_permissions_permission_key
  on public.role_permissions (permission_key);

create index if not exists idx_teacher_class_assignments_teacher_id
  on public.teacher_class_assignments (teacher_id);

create index if not exists idx_teacher_subject_assignments_teacher_id
  on public.teacher_subject_assignments (teacher_id);

create index if not exists idx_teacher_subject_assignments_subject_id
  on public.teacher_subject_assignments (subject_id);

create index if not exists idx_teacher_permissions_permission_key
  on public.teacher_permissions (permission_key);
