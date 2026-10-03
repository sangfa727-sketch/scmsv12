-- Student lookup response hardening
-- Keep authorization and school isolation unchanged; return only fields
-- required by the generic student lookup flow.

CREATE OR REPLACE FUNCTION public.rpc_get_student_by_id(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sess record;
  v_row  record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.teacher_id, s.school_id
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT *
    INTO v_row
    FROM public.students
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
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
      'home_color', v_row.home_color
    )
  );
END
$function$;
