-- Revoke web sessions whenever the teacher's tenant, role, or active status changes.
-- Also expire any already-stale session identity bindings during deployment.
-- This migration does not alter teacher/student business data.

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.revoke_web_sessions_on_teacher_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.school_id IS DISTINCT FROM NEW.school_id
     OR OLD.role IS DISTINCT FROM NEW.role
     OR OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.app_web_sessions
       SET expires_at = LEAST(expires_at, now()),
           last_seen_at = now()
     WHERE teacher_id = OLD.teacher_id
       AND expires_at > now();
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS teachers_revoke_web_sessions_on_identity_change
  ON public.teachers;

CREATE TRIGGER teachers_revoke_web_sessions_on_identity_change
AFTER UPDATE OF school_id, role, status ON public.teachers
FOR EACH ROW
EXECUTE FUNCTION private.revoke_web_sessions_on_teacher_identity_change();

-- Fail closed for sessions created under an old school, old role, deleted teacher,
-- or inactive account. Never select or return session tokens in this migration.
UPDATE public.app_web_sessions AS s
   SET expires_at = LEAST(s.expires_at, now()),
       last_seen_at = now()
 WHERE s.expires_at > now()
   AND NOT EXISTS (
     SELECT 1
       FROM public.teachers AS t
      WHERE t.teacher_id = s.teacher_id
        AND t.school_id = s.school_id
        AND t.role = s.role
        AND t.status = 'active'
   );

COMMIT;
