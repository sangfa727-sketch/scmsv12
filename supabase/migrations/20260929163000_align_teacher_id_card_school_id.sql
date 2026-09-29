-- Align teacher ID card tenancy key with the existing SCMS school_id contract.
-- teachers.school_id and app_web_sessions.school_id are text identifiers
-- such as SCH-60457, not UUIDs. The card table must use the same type.
alter table public.teacher_id_cards
  alter column school_id type text
  using school_id::text;