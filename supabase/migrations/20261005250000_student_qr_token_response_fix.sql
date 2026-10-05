-- Restore the QR token required by the Student ID Card flow.
-- Keep the existing session, permission, active-status and school-isolation checks.

CREATE OR REPLACE FUNCTION public.rpc_get_or_create_student_qr(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  UPDATE public.students
     SET qr_token = coalesce(qr_token, encode(extensions.gen_random_bytes(20), 'hex'))
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
     AND status = 'Active'
   RETURNING student_id, name_mm, name_en, name_local, class, grade, gender,
             date_of_birth, status, photo_url, house, home_color, qr_token
        INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_active');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'student_id', v_row.student_id,
      'name_mm', v_row.name_mm,
      'name_en', v_row.name_en,
      'name_local', v_row.name_local,
      'class', v_row.class,
      'grade', v_row.grade,
      'gender', v_row.gender,
      'date_of_birth', v_row.date_of_birth,
      'status', v_row.status,
      'photo_url', v_row.photo_url,
      'house', v_row.house,
      'home_color', v_row.home_color,
      'qr_token', v_row.qr_token
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_regenerate_student_qr(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  UPDATE public.students
     SET qr_token = encode(extensions.gen_random_bytes(20), 'hex')
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
     AND status = 'Active'
   RETURNING student_id, name_mm, name_en, name_local, class, grade, gender,
             date_of_birth, status, photo_url, house, home_color, qr_token
        INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_active');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'student_id', v_row.student_id,
      'name_mm', v_row.name_mm,
      'name_en', v_row.name_en,
      'name_local', v_row.name_local,
      'class', v_row.class,
      'grade', v_row.grade,
      'gender', v_row.gender,
      'date_of_birth', v_row.date_of_birth,
      'status', v_row.status,
      'photo_url', v_row.photo_url,
      'house', v_row.house,
      'home_color', v_row.home_color,
      'qr_token', v_row.qr_token
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_get_or_create_student_qr(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_or_create_student_qr(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.rpc_regenerate_student_qr(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_regenerate_student_qr(text, text) TO anon, authenticated;
