-- SCMS v12: enforce existing student permission policy in student RPCs.
-- The permission catalog already defines students.view (global) and students.edit (global).
-- These SECURITY DEFINER RPCs must enforce those permissions before reading/mutating tenant data.

CREATE OR REPLACE FUNCTION public.rpc_get_students(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  SELECT s.school_id INTO v_sess
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

  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.class, x.name_en), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT *
    FROM public.students
    WHERE school_id = v_sess.school_id
      AND status = 'Active'
  ) x;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_register_student(
  p_session_token text,
  p_name_local text DEFAULT NULL,
  p_name_en text DEFAULT NULL,
  p_class text DEFAULT NULL,
  p_grade text DEFAULT NULL,
  p_gender text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL,
  p_home_color text DEFAULT NULL,
  p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL,
  p_parent_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_existing record;
  v_id text;
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

  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_name_en IS NULL OR trim(p_name_en) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_en_required');
  END IF;
  IF p_class IS NULL OR trim(p_class) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'class_required');
  END IF;

  SELECT student_id, name_en, class, grade INTO v_existing
  FROM public.students
  WHERE school_id = v_sess.school_id
    AND status = 'Active'
    AND lower(trim(class)) = lower(trim(p_class))
    AND lower(trim(name_en)) = lower(trim(p_name_en))
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'duplicate', true,
      'existing_student_id', v_existing.student_id,
      'message', 'A student named "' || v_existing.name_en || '" already exists in class ' || v_existing.class || '. Edit that record instead of creating a new one.'
    );
  END IF;

  v_id := 'STU-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(md5(random()::text), 1, 4);

  INSERT INTO public.students (
    student_id, school_id, name_local, name_mm, name_en, class, grade, gender,
    date_of_birth, dob, home_color, house_color, house,
    parent_name, parent_phone, parent_email, status, enrollment_date
  ) VALUES (
    v_id, v_sess.school_id,
    nullif(trim(p_name_local), ''),
    coalesce(nullif(trim(p_name_local), ''), p_name_en),
    trim(p_name_en), trim(p_class), p_grade, p_gender,
    p_date_of_birth, p_date_of_birth, p_home_color, p_home_color, p_home_color,
    nullif(trim(p_parent_name), ''),
    nullif(trim(p_parent_phone), ''),
    nullif(trim(p_parent_email), ''),
    'Active', current_date
  )
  RETURNING * INTO v_row;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_sess.teacher_id, 'student.create', v_sess.school_id,
    jsonb_build_object(
      'student_id', v_id,
      'name_en', v_row.name_en,
      'class', v_row.class,
      'grade', v_row.grade
    )
  );

  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

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

  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
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
