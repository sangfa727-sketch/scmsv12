-- Security fix: require both the existing student assignment and the target class assignment
-- for teacher-like roles when editing a student's class.
CREATE OR REPLACE FUNCTION public.rpc_update_student(
  p_session_token text,
  p_student_id text,
  p_name_local text,
  p_name_en text,
  p_class text,
  p_grade text,
  p_gender text,
  p_date_of_birth date,
  p_home_color text,
  p_parent_name text,
  p_parent_phone text,
  p_parent_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role INTO v_sess
  FROM public.app_web_sessions s
  JOIN public.teachers t ON t.teacher_id = s.teacher_id
   AND t.school_id = s.school_id
   AND t.role = s.role
  WHERE s.session_token = p_session_token
    AND s.expires_at > now()
    AND t.status = 'active'
  LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT private.web_has_student_permission(p_session_token, 'students.edit', p_student_id)
     OR NOT private.web_has_student_class_permission(p_session_token, 'students.edit', p_class) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_student_id IS NULL OR trim(p_student_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;
  IF p_name_en IS NULL OR trim(p_name_en) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_en_required');
  END IF;
  IF p_class IS NULL OR trim(p_class) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'class_required');
  END IF;

  UPDATE public.students SET
    name_local = nullif(trim(coalesce(p_name_local, '')), ''),
    name_mm = coalesce(nullif(trim(coalesce(p_name_local, '')), ''), p_name_en),
    name_en = trim(p_name_en),
    class = trim(p_class),
    grade = p_grade,
    gender = p_gender,
    date_of_birth = p_date_of_birth,
    dob = p_date_of_birth,
    home_color = p_home_color,
    house_color = p_home_color,
    house = p_home_color,
    parent_name = nullif(trim(coalesce(p_parent_name, '')), ''),
    parent_phone = nullif(trim(coalesce(p_parent_phone, '')), ''),
    parent_email = nullif(trim(coalesce(p_parent_email, '')), ''),
    updated_at = now()
  WHERE student_id = p_student_id
    AND school_id = v_sess.school_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_sess.teacher_id, 'student.update', v_sess.school_id,
    jsonb_build_object(
      'student_id', v_row.student_id,
      'name_en', v_row.name_en,
      'class', v_row.class,
      'grade', v_row.grade,
      'parent_name', v_row.parent_name,
      'parent_phone', v_row.parent_phone,
      'parent_email', v_row.parent_email
    )
  );

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.rpc_update_student(text,text,text,text,text,text,text,date,text,text,text,text)'::regprocedure)
    INTO v_def;
  IF v_def NOT LIKE '%OR NOT private.web_has_student_class_permission%' THEN
    RAISE EXCEPTION 'rpc_update_student class-scope contract missing';
  END IF;
END $$;
