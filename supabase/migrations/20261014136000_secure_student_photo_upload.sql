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
  v_student RECORD;
  v_session_type text;
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

  IF v_sess IS NOT NULL THEN
    v_session_type := 'web';
  ELSE
    SELECT t.teacher_id, t.school_id, t.role
      INTO v_sess
      FROM public.app_sessions AS a
      JOIN public.teachers AS t
        ON t.teacher_id = a.teacher_id
       AND t.school_id = a.school_id
       AND t.telegram_id = a.telegram_id
       AND t.status = 'active'
      JOIN public.schools AS sc
        ON sc.school_id = t.school_id
       AND sc.status = 'active'
     WHERE a.token = p_session_token
       AND a.status = 'linked'
       AND length(a.token) >= 32
     LIMIT 1;

    IF v_sess IS NOT NULL THEN
      v_session_type := 'telegram';
    END IF;
  END IF;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  SELECT s.student_id, s.class
    INTO v_student
    FROM public.students AS s
   WHERE s.student_id = p_student_id
     AND s.school_id = v_sess.school_id
   LIMIT 1;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  IF v_session_type = 'web' THEN
    IF NOT private.web_has_student_permission(
      p_session_token,
      'students.edit',
      p_student_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
    END IF;
  ELSIF v_sess.role NOT IN (
    'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'school_id', v_sess.school_id,
    'student_id', v_student.student_id
  );
END;
$function$

REVOKE ALL ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  TO service_role;

DROP POLICY IF EXISTS "anon upload student photos" ON storage.objects;

-- Keep public object URLs working for existing UI surfaces, but do not let
-- anonymous clients enumerate the full student-photo object inventory.
DROP POLICY IF EXISTS "public read student photos" ON storage.objects;

COMMIT;
