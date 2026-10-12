-- Record successful teacher password resets with the authenticated administrator as actor.
-- Never include the password or password hash in audit payloads.
CREATE OR REPLACE FUNCTION public.rpc_admin_reset_teacher_password(
  p_session_token text,
  p_teacher_id text,
  p_new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin record;
  v_target_role text;
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

  IF p_teacher_id IS NULL OR trim(p_teacher_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_id_required');
  END IF;

  IF p_new_password IS NULL OR char_length(p_new_password) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pin_too_short');
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

  UPDATE public.teachers
     SET password_hash = public._scms_hash_password(p_new_password),
         must_change_password = true,
         password_changed_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  DELETE FROM public.app_web_sessions
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web',
    v_admin.teacher_id,
    'teacher.password_reset',
    v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id)
  );

  RETURN jsonb_build_object('ok', true);
END;
$function$;
