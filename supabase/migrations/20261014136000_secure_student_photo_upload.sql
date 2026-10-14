-- Student photos must be uploaded through the trusted Edge Function, not directly
-- by any anonymous browser using the public anon key. Public read is preserved
-- for compatibility; changing student-photo visibility requires a separate UI
-- and consent decision because stored URLs are currently public.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_authorize_student_photo_upload(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_student_id text;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND t.status = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND sc.status = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  IF NOT private.web_has_student_permission(
    p_session_token,
    'students.edit',
    p_student_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.student_id
    INTO v_student_id
    FROM public.students AS s
   WHERE s.student_id = p_student_id
     AND s.school_id = v_sess.school_id
   LIMIT 1;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'school_id', v_sess.school_id,
    'student_id', v_student_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  TO service_role;

DROP POLICY IF EXISTS "anon upload student photos" ON storage.objects;

-- Keep public object URLs working for existing UI surfaces, but do not let
-- anonymous clients enumerate the full student-photo object inventory.
DROP POLICY IF EXISTS "public read student photos" ON storage.objects;

COMMIT;
