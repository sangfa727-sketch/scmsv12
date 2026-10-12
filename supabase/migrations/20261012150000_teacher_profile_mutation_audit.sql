-- Attribute successful teacher creation and profile changes to the authenticated admin.
-- Audit payloads contain identifiers and changed field names only, never passwords or PINs.
CREATE OR REPLACE FUNCTION public.rpc_admin_create_teacher_v2(
  p_session_token text,
  p_teacher_id text,
  p_login_name text,
  p_teacher_name text,
  p_initial_pin text,
  p_role text DEFAULT 'teacher',
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin record;
  v_login_name text := trim(p_login_name);
  v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  SELECT s.teacher_id, s.school_id, s.role AS session_role, t.role AS teacher_role
    INTO v_admin
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
     AND t.role IN ('admin', 'super_admin')
   LIMIT 1;

  IF v_admin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin', 'message', 'Admin login လိုအပ်ပါတယ်');
  END IF;

  IF p_role IS NULL OR p_role NOT IN (
    'teacher', 'assistant_teacher', 'senior_teacher',
    'school_coordinator', 'administrative_assistant', 'admin', 'super_admin'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF p_role IN ('admin', 'super_admin')
     AND v_admin.teacher_role <> 'super_admin'
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF p_teacher_id IS NULL OR trim(p_teacher_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_id_required');
  END IF;

  IF p_teacher_name IS NULL OR char_length(trim(p_teacher_name)) < 1
     OR char_length(trim(p_teacher_name)) > 120
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_teacher_name');
  END IF;

  IF v_login_name IS NULL OR char_length(v_login_name) < 3
     OR char_length(v_login_name) > 64
     OR v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  THEN
  END IF;

  IF p_initial_pin IS NULL OR char_length(p_initial_pin) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_too_short');
  END IF;

  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(teacher_id) = lower(p_teacher_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_id');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(login_name) = lower(v_login_name)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_login_name');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(trim(email)) = v_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email');
  END IF;

  INSERT INTO public.teachers
    (teacher_id, login_name, teacher_name, school_id, status, role, email,
     password_hash, must_change_password, password_changed_at)
  VALUES
    (p_teacher_id, v_login_name, p_teacher_name, v_admin.school_id, 'active',
     p_role, v_email, public._scms_hash_password(p_initial_pin), true, now());

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_admin.teacher_id, 'teacher.create', v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id, 'role', p_role)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'teacher_id', p_teacher_id,
    'login_name', v_login_name,
    'teacher_name', p_teacher_name,
    'school_id', v_admin.school_id,
    'role', p_role,
    'message', 'Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် password ပြောင်းရပါမယ်။'
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.rpc_admin_update_teacher_profile(
  p_session_token text,
  p_teacher_id text,
  p_teacher_name text,
  p_login_name text,
  p_email text DEFAULT NULL,
  p_role text DEFAULT 'teacher'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin record;
  v_target_role text;
  v_role text := lower(trim(coalesce(p_role, 'teacher')));
  v_name text := trim(coalesce(p_teacher_name, ''));
  v_login text := trim(coalesce(p_login_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_old record;
  v_teacher record;
  v_changed_fields text[];
BEGIN
  SELECT s.teacher_id, s.school_id, t.role AS admin_role
    INTO v_admin
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_admin IS NULL OR v_admin.admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF v_role NOT IN ('teacher', 'assistant_teacher', 'senior_teacher', 'school_coordinator', 'administrative_assistant', 'admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_role IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  SELECT teacher_id, teacher_name, login_name, email, role
    INTO v_old
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
   FOR UPDATE;

  IF v_old IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_old.role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_teacher_name');
  END IF;

  IF char_length(v_login) < 3 OR char_length(v_login) > 64
     OR v_login !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_login_name');
  END IF;

  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_required', 'message', 'Teacher email လိုအပ်ပါတယ်');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(login_name) = lower(v_login) AND teacher_id <> p_teacher_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_login_name');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(trim(email)) = v_email AND teacher_id <> p_teacher_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email');
  END IF;

  v_changed_fields := array_remove(ARRAY[
    CASE WHEN v_old.teacher_name IS DISTINCT FROM v_name THEN 'teacher_name' END,
    CASE WHEN v_old.login_name IS DISTINCT FROM v_login THEN 'login_name' END,
    CASE WHEN lower(trim(coalesce(v_old.email, ''))) IS DISTINCT FROM v_email THEN 'email' END,
    CASE WHEN v_old.role IS DISTINCT FROM v_role THEN 'role' END
  ], NULL);

  UPDATE public.teachers
     SET teacher_name = v_name,
         login_name = v_login,
         email = v_email,
         teacher_email = v_email,
         role = v_role,
         updated_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
  RETURNING teacher_id, login_name, teacher_name, role, email, teacher_email, photo_url, status
       INTO v_teacher;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_admin.teacher_id,
    'teacher.profile_update', v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id, 'changed_fields', to_jsonb(v_changed_fields))
  );

  RETURN jsonb_build_object('ok', true, 'teacher', to_jsonb(v_teacher));
END;
$function$;

  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_login_name');
  END IF;

  IF char_length(p_initial_pin) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_too_short');
  END IF;

  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(teacher_id) = lower(p_teacher_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_id');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(login_name) = lower(v_login_name)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_login_name');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(trim(email)) = v_email) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email');
  END IF;

  INSERT INTO public.teachers
    (teacher_id, login_name, teacher_name, school_id, status, role, email,
     password_hash, must_change_password, password_changed_at)
  VALUES
    (p_teacher_id, v_login_name, p_teacher_name, v_admin.school_id, 'active',
     p_role, v_email, public._scms_hash_password(p_initial_pin), true, now());

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_admin.teacher_id, 'teacher.create', v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id, 'role', p_role)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'teacher_id', p_teacher_id,
    'login_name', v_login_name,
    'teacher_name', p_teacher_name,
    'school_id', v_admin.school_id,
    'role', p_role,
    'message', 'Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် password ပြောင်းရပါမယ်။'
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.rpc_admin_update_teacher_profile(
  p_session_token text,
  p_teacher_id text,
  p_teacher_name text,
  p_login_name text,
  p_email text DEFAULT NULL,
  p_role text DEFAULT 'teacher'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin record;
  v_target_role text;
  v_role text := lower(trim(coalesce(p_role, 'teacher')));
  v_name text := trim(coalesce(p_teacher_name, ''));
  v_login text := trim(coalesce(p_login_name, ''));
  v_email text := lower(trim(coalesce(p_email, '')));
  v_old record;
  v_teacher record;
  v_changed_fields text[];
BEGIN
  SELECT s.teacher_id, s.school_id, t.role AS admin_role
    INTO v_admin
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_admin IS NULL OR v_admin.admin_role NOT IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF v_role NOT IN ('teacher', 'assistant_teacher', 'senior_teacher', 'school_coordinator', 'administrative_assistant', 'admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_role IN ('admin', 'super_admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  SELECT teacher_id, teacher_name, login_name, email, role
    INTO v_old
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
   FOR UPDATE;

  IF v_old IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_old.role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_teacher_name');
  END IF;

  IF char_length(v_login) < 3 OR char_length(v_login) > 64
     OR v_login !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_login_name');
  END IF;

  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_required', 'message', 'Teacher email လိုအပ်ပါတယ်');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(login_name) = lower(v_login) AND teacher_id <> p_teacher_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_login_name');
  END IF;

  IF EXISTS (SELECT 1 FROM public.teachers WHERE lower(trim(email)) = v_email AND teacher_id <> p_teacher_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_email');
  END IF;

  v_changed_fields := array_remove(ARRAY[
    CASE WHEN v_old.teacher_name IS DISTINCT FROM v_name THEN 'teacher_name' END,
    CASE WHEN v_old.login_name IS DISTINCT FROM v_login THEN 'login_name' END,
    CASE WHEN lower(trim(coalesce(v_old.email, ''))) IS DISTINCT FROM v_email THEN 'email' END,
    CASE WHEN v_old.role IS DISTINCT FROM v_role THEN 'role' END
  ], NULL);

  UPDATE public.teachers
     SET teacher_name = v_name,
         login_name = v_login,
         email = v_email,
         teacher_email = v_email,
         role = v_role,
         updated_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
  RETURNING teacher_id, login_name, teacher_name, role, email, teacher_email, photo_url, status
       INTO v_teacher;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_admin.teacher_id,
    'teacher.profile_update', v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id, 'changed_fields', to_jsonb(v_changed_fields))
  );

  RETURN jsonb_build_object('ok', true, 'teacher', to_jsonb(v_teacher));
END;
$function$;
