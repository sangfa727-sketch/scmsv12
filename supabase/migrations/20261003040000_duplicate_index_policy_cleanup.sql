-- Remove confirmed duplicate non-constraint indexes and redundant service-role policies.
DROP INDEX IF EXISTS public.idx_attendance_date;
DROP INDEX IF EXISTS public.idx_attendance_school_date;
DROP INDEX IF EXISTS public.idx_attendance_student_date;
DROP INDEX IF EXISTS public.idx_dr_date;
DROP INDEX IF EXISTS public.idx_ms_ym;
DROP INDEX IF EXISTS public.n8n_state_tg_uq;
DROP INDEX IF EXISTS public.students_school_idx;
DROP INDEX IF EXISTS public.students_class_idx;
DROP INDEX IF EXISTS public.teachers_school_idx;
DROP INDEX IF EXISTS public.teachers_tg_idx;

DROP POLICY IF EXISTS svc_all ON public.n8n_state;
DROP POLICY IF EXISTS srv_all ON public.n8n_state;
DROP POLICY IF EXISTS service_role_all_n8n_state ON public.n8n_state;
