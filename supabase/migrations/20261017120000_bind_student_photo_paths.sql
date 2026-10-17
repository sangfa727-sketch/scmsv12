-- Bind newly assigned student photo objects to the exact student record.
-- Legacy URLs already stored on rows remain readable; new writes must use the
-- school/student/object path emitted by upload-school-asset.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_set_student_photo(
  p_session_token text,
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
  v_row record;
  v_path text;
  v_expected_prefix text;
BEGIN
  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   JOIN public.schools sc
      ON sc.school_id = t.school_id
     AND lower(sc.status) = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND lower(t.status) = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF private.web_has_student_permission(
    p_session_token, 'students.edit', p_student_id
  ) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  -- NULL clears the photo. Any new URL must be a public-bucket URL whose
  -- object path is scoped to this school and this exact student.
  IF p_photo_url IS NOT NULL THEN
    v_path := substring(
      p_photo_url
      FROM '^https?://[^/]+/storage/v1/object/public/student-photos/([^?#]+)$'
    );
    v_expected_prefix := v_sess.school_id::text || '/' || p_student_id || '/';

    IF v_path IS NULL
       OR left(v_path, length(v_expected_prefix)) <> v_expected_prefix
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
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'student_id', v_row.student_id,
      'name_en', v_row.name_en,
      'name_local', v_row.name_local,
      'class', v_row.class,
      'status', v_row.status,
      'photo_url', v_row.photo_url
    )
  );
END;
$function$;

COMMIT;
