-- SCMS v12 — Timetable role grant alignment
-- Timetable visibility is available to operational roles.
-- Timetable editing follows the existing academic-edit authority model:
--   teacher, senior_teacher, school_coordinator, admin, super_admin.
-- Assistant teachers and administrative assistants may view but do not mutate
-- timetable entries through the web authorization layer.

update public.role_permissions
set allowed = case
  when role in ('teacher','senior_teacher','school_coordinator','admin','super_admin')
    then true
  when role in ('assistant_teacher','administrative_assistant')
    then false
  else allowed
end
where permission_key = 'timetable.edit';

update public.role_permissions
set allowed = true
where permission_key = 'timetable.view'
  and role in (
    'teacher',
    'assistant_teacher',
    'senior_teacher',
    'school_coordinator',
    'administrative_assistant',
    'admin',
    'super_admin'
  );
