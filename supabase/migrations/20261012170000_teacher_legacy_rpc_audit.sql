-- Harden and audit legacy teacher-management RPCs that remain callable but are not used by the current UI.
-- Preserve their public response contracts while ensuring successful mutations are attributable.
CREATE OR REPLACE FUNCTION public.rpc_admin_create_teacher(
  p_session_token text,
  p_teacher_id text,
  p_teacher_name text,
  p_initial_password text,
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
  v_teacher_id text := trim(coalesce(p_teacher_id, ''));
  v_name text := trim(coalesce(p_teacher_name, ''));
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

  IF p_role IS NULL OR p_role NOT IN ('admin', 'teacher') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF p_role = 'admin' AND v_admin.teacher_role <> 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF v_teacher_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_id_required');
  END IF;

  IF v_name = '' OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_teacher_name');
  END IF;

  IF p_initial_password IS NULL OR char_length(p_initial_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_too_short');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teachers
     WHERE lower(trim(teacher_id)) = lower(v_teacher_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_id', 'message', 'ဒီ Teacher ID နဲ့ account ရှိနေပါပြီ');
  END IF;

  INSERT INTO public.teachers
    (teacher_id, teacher_name, school_id, status, role, email,
     password_hash, must_change_password, password_changed_at)
  VALUES
    (v_teacher_id, v_name, v_admin.school_id, 'active', p_role, nullif(v_email, ''),
     public._scms_hash_password(p_initial_password), true, now());

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_admin.teacher_id, 'teacher.create', v_admin.school_id,
    jsonb_build_object('teacher_id', v_teacher_id, 'role', p_role, 'source_rpc', 'legacy')
  );

  RETURN jsonb_build_object(
    'ok', true, 'teacher_id', v_teacher_id, 'teacher_name', v_name,
    'school_id', v_admin.school_id, 'role', p_role,
    'message', 'Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် password ပြောင်းရပါမယ်။'
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.rpc_admin_set_teacher_login_name(
  p_session_token text,
  p_teacher_id text,
  p_login_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin record;
  v_target_role text;
  v_login_name text := trim(p_login_name);
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
     AND t.role IN ('admin', 'super_admin')
   LIMIT 1;

  IF v_admin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT role
    INTO v_target_role
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
   FOR UPDATE;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_target_role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF v_login_name IS NULL OR char_length(v_login_name) < 3
     OR char_length(v_login_name) > 64
     OR v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_login_name');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.teachers
     WHERE lower(login_name) = lower(v_login_name)
       AND teacher_id <> p_teacher_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_login_name');
  END IF;

  UPDATE public.teachers
     SET login_name = v_login_name
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_admin.teacher_id, 'teacher.login_name_update', v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id)
  );

  RETURN jsonb_build_object('ok', true, 'login_name', v_login_name);
END;
$function$;


CREATE OR REPLACE FUNCTION public.rpc_admin_revoke_teacher_card(
  p_session_token text,
  p_teacher_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin record;
  v_target_role text;
  v_revoked_count integer;
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
     AND t.role IN ('admin', 'super_admin')
   LIMIT 1;

  IF v_admin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT role
    INTO v_target_role
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
   FOR UPDATE;

  IF v_target_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_target_role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  UPDATE public.teacher_id_cards
     SET revoked_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
     AND revoked_at IS NULL;
  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;

  IF v_revoked_count > 0 THEN
    INSERT INTO public.audit_log(source, actor, action, school_id, payload)
    VALUES (
      'web', v_admin.teacher_id, 'teacher.id_card_revoke', v_admin.school_id,
      jsonb_build_object('teacher_id', p_teacher_id, 'revoked_count', v_revoked_count)
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$function$;
