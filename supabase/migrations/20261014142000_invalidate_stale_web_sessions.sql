-- Revoke existing browser sessions when a teacher's authorization identity changes.
-- This is a branch migration only; Production deployment requires migration-history reconciliation.

BEGIN;

CREATE OR REPLACE FUNCTION private.invalidate_web_sessions_on_teacher_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.app_web_sessions AS s
     SET expires_at = LEAST(s.expires_at, statement_timestamp())
   WHERE s.teacher_id = OLD.teacher_id
     AND s.expires_at > statement_timestamp();

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.invalidate_web_sessions_on_teacher_identity_change()
  FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_invalidate_web_sessions_on_teacher_identity_change
  ON public.teachers;

CREATE TRIGGER trg_invalidate_web_sessions_on_teacher_identity_change
AFTER UPDATE OF school_id, role, status ON public.teachers
FOR EACH ROW
WHEN (
  OLD.school_id IS DISTINCT FROM NEW.school_id
  OR OLD.role IS DISTINCT FROM NEW.role
  OR OLD.status IS DISTINCT FROM NEW.status
)
EXECUTE FUNCTION private.invalidate_web_sessions_on_teacher_identity_change();

COMMIT;
