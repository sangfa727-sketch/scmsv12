-- Fix native student-photo setter to validate the live app_sessions identity directly.
-- The production database does not expose private.app_session_identity(text).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_app_set_student_photo(
  p_token text,
  p_student_id text,
  p_photo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_student_id text;
  v_path text;
  v_expected_prefix text;
BEGIN
  SELECT t.teacher_id, t.school_id, t.role
    INTO v_sess
    FROM public.app_sessions a
    JOIN public.teachers t
      ON t.teacher_id = a.teacher_id
     AND t.school_id = a.school_id
     AND t.telegram_id = a.telegram_id
     AND lower(t.status) = 'active'
    JOIN public.schools sc
      ON sc.school_id = t.school_id
     AND lower(sc.status) = 'active'
   WHERE a.token = p_token
     AND a.status = 'linked'
     AND length(a.token) >= 32
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF lower(coalesce(v_sess.role, '')) NOT IN (
    'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL
     OR position('/' IN p_student_id) > 0
     OR position(chr(92) IN p_student_id) > 0
     OR position('..' IN p_student_id) > 0
     OR p_student_id ~* '%(2e|2f|5c)' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required_or_invalid');
  END IF;

  IF p_photo_url IS NOT NULL THEN
    v_path := substring(
      p_photo_url
      FROM '^https://[A-Za-z0-9.-]+[.]supabase[.]co/storage/v1/object/public/student-photos/([^?#]+)\Z'
    );
    v_expected_prefix := v_sess.school_id::text || '/' || p_student_id || '/';
    IF v_sess.school_id::text !~ '^[A-Za-z0-9_-]+\Z'
       OR v_path IS NULL
       OR left(v_path, length(v_expected_prefix)) <> v_expected_prefix
       OR substring(v_path FROM length(v_expected_prefix) + 1) !~ '^[0-9a-fA-F-]{36}[.](jpg|png|webp)\Z'
       OR position('..' IN v_path) > 0
       OR position(chr(92) IN v_path) > 0
       OR v_path ~* '%(2e|2f|5c)' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_photo_url');
    END IF;
  END IF;

  UPDATE public.students
     SET photo_url = p_photo_url,
         updated_at = now()
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
  RETURNING student_id INTO v_student_id;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES ('telegram', v_sess.teacher_id, 'student.photo.update', v_sess.school_id,
          jsonb_build_object('student_id', v_student_id, 'photo_removed', p_photo_url IS NULL));

  RETURN jsonb_build_object('ok', true, 'student_id', v_student_id, 'photo_url', p_photo_url);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_app_set_student_photo(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_app_set_student_photo(text, text, text)
  TO anon, authenticated, service_role;

COMMIT;