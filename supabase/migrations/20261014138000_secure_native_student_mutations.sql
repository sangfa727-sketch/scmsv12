-- Secure native/TWA student mutations with the linked Telegram session.
-- Replaces anonymous direct REST table writes, which are intentionally denied.

BEGIN;

CREATE OR REPLACE FUNCTION private.app_session_identity(p_token text)
RETURNS TABLE(teacher_id text, school_id text, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  SELECT t.teacher_id, t.school_id, t.role
    FROM public.app_sessions AS a
    JOIN public.teachers AS t
      ON t.teacher_id = a.teacher_id
     AND t.school_id = a.school_id
     AND t.telegram_id = a.telegram_id
     AND t.status = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND sc.status = 'active'
   WHERE a.token = p_token
     AND a.status = 'linked'
     AND length(a.token) >= 32
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION private.app_session_identity(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_app_update_student(
  p_token text,
  p_student_id text,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_row RECORD;
  v_allowed CONSTANT text[] := ARRAY[
    'name_en', 'name_mm', 'name_local', 'class', 'grade', 'gender',
    'date_of_birth', 'home_color', 'parent_name', 'parent_phone',
    'parent_phone2', 'parent_email'
  ];
BEGIN
  SELECT * INTO v_sess FROM private.app_session_identity(p_token) LIMIT 1;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF v_sess.role NOT IN (
    'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL
     OR p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object'
     OR p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_request');
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key)
     WHERE NOT (k.key = ANY(v_allowed))
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unsupported_fields');
  END IF;

  IF p_patch ? 'name_en' AND nullif(trim(p_patch->>'name_en'), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_en_required');
  END IF;
  IF p_patch ? 'class' AND nullif(trim(p_patch->>'class'), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'class_required');
  END IF;

  UPDATE public.students AS st
     SET name_en = CASE WHEN p_patch ? 'name_en' THEN trim(p_patch->>'name_en') ELSE st.name_en END,
         name_mm = CASE WHEN p_patch ? 'name_mm' THEN nullif(trim(p_patch->>'name_mm'), '')
                        WHEN p_patch ? 'name_local' THEN coalesce(nullif(trim(p_patch->>'name_local'), ''), st.name_en)
                        ELSE st.name_mm END,
         name_local = CASE WHEN p_patch ? 'name_local' THEN nullif(trim(p_patch->>'name_local'), '') ELSE st.name_local END,
         class = CASE WHEN p_patch ? 'class' THEN trim(p_patch->>'class') ELSE st.class END,
         grade = CASE WHEN p_patch ? 'grade' THEN nullif(trim(p_patch->>'grade'), '') ELSE st.grade END,
         gender = CASE WHEN p_patch ? 'gender' THEN nullif(trim(p_patch->>'gender'), '') ELSE st.gender END,
         date_of_birth = CASE WHEN p_patch ? 'date_of_birth' THEN nullif(p_patch->>'date_of_birth', '')::date ELSE st.date_of_birth END,
         dob = CASE WHEN p_patch ? 'date_of_birth' THEN nullif(p_patch->>'date_of_birth', '')::date ELSE st.dob END,
         home_color = CASE WHEN p_patch ? 'home_color' THEN nullif(trim(p_patch->>'home_color'), '') ELSE st.home_color END,
         house_color = CASE WHEN p_patch ? 'home_color' THEN nullif(trim(p_patch->>'home_color'), '') ELSE st.house_color END,
         house = CASE WHEN p_patch ? 'home_color' THEN nullif(trim(p_patch->>'home_color'), '') ELSE st.house END,
         parent_name = CASE WHEN p_patch ? 'parent_name' THEN nullif(trim(p_patch->>'parent_name'), '') ELSE st.parent_name END,
         parent_phone = CASE WHEN p_patch ? 'parent_phone' THEN nullif(trim(p_patch->>'parent_phone'), '') ELSE st.parent_phone END,
         parent_phone2 = CASE WHEN p_patch ? 'parent_phone2' THEN nullif(trim(p_patch->>'parent_phone2'), '') ELSE st.parent_phone2 END,
         parent_email = CASE WHEN p_patch ? 'parent_email' THEN nullif(lower(trim(p_patch->>'parent_email')), '') ELSE st.parent_email END,
         updated_at = now()
   WHERE st.student_id = p_student_id
     AND st.school_id = v_sess.school_id
  RETURNING st.student_id, st.name_mm, st.name_en, st.name_local, st.class, st.grade,
            st.gender, st.date_of_birth, st.status, st.photo_url, st.house,
            st.home_color, st.parent_name, st.parent_phone, st.parent_phone2,
            st.parent_email, st.enrollment_date
       INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'telegram', v_sess.teacher_id, 'student.update', v_sess.school_id,
    jsonb_build_object('student_id', v_row.student_id, 'name_en', v_row.name_en, 'class', v_row.class, 'grade', v_row.grade)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_strip_nulls(jsonb_build_object(
      'student_id', v_row.student_id, 'name_mm', v_row.name_mm, 'name_en', v_row.name_en,
      'name_local', v_row.name_local, 'class', v_row.class, 'grade', v_row.grade,
      'gender', v_row.gender, 'date_of_birth', v_row.date_of_birth, 'status', v_row.status,
      'photo_url', v_row.photo_url, 'house', v_row.house, 'home_color', v_row.home_color,
      'parent_name', v_row.parent_name, 'parent_phone', v_row.parent_phone,
      'parent_phone2', v_row.parent_phone2, 'parent_email', v_row.parent_email,
      'enrollment_date', v_row.enrollment_date
    ))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_app_delete_student(
  p_token text,
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
  SELECT * INTO v_sess FROM private.app_session_identity(p_token) LIMIT 1;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF v_sess.role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  UPDATE public.students
     SET status = 'Inactive', updated_at = now()
   WHERE student_id = p_student_id
     AND school_id = v_sess.school_id
     AND status = 'Active'
  RETURNING student_id INTO v_student_id;

  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_not_active');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES ('telegram', v_sess.teacher_id, 'student.deactivate', v_sess.school_id,
          jsonb_build_object('student_id', v_student_id));

  RETURN jsonb_build_object('ok', true, 'student_id', v_student_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_app_set_student_photo(
  p_token text,
  p_student_id text,
  p_photo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_student_id text;
  v_url_pattern text;
BEGIN
  SELECT * INTO v_sess FROM private.app_session_identity(p_token) LIMIT 1;
  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;
  IF v_sess.role NOT IN (
    'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  IF p_photo_url IS NOT NULL THEN
    v_url_pattern := '^https://[^/]+/storage/v1/object/public/student-photos/'
      || regexp_replace(v_sess.school_id, '([.^$*+?()|{}\[\]\\-])', '\\\1', 'g')
      || '/[0-9a-fA-F-]+\.(jpg|png|webp)REVOKE ALL ON FUNCTION public.rpc_app_delete_student(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_app_set_student_photo(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_app_update_student(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_app_delete_student(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_app_set_student_photo(text, text, text) TO anon, authenticated, service_role;

COMMIT;
;
    IF p_photo_url !~ v_url_pattern THEN
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

REVOKE ALL ON FUNCTION public.rpc_app_update_student(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_app_delete_student(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_app_update_student(text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_app_delete_student(text, text) TO anon, authenticated, service_role;

COMMIT;
