-- SCMS v12 — teacher lifecycle authorization
-- Adds guarded deactivate/reactivate operations for teacher accounts.
-- Existing session verification already requires teachers.status = 'active';
-- deactivation also expires all sessions for the target immediately.

CREATE OR REPLACE FUNCTION public.rpc_admin_deactivate_teacher(
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
  v_target record;
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

  IF p_teacher_id = v_admin.teacher_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_deactivate_self');
  END IF;

  SELECT teacher_id, role, status
    INTO v_target
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
   LIMIT 1;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_target.role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF v_target.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  UPDATE public.teachers
     SET status = 'inactive',
         updated_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
     AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  UPDATE public.app_web_sessions
     SET expires_at = now(),
         last_seen_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web',
    v_admin.teacher_id,
    'teacher.deactivate',
    v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'teacher_id', p_teacher_id,
    'status', 'inactive'
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.rpc_admin_reactivate_teacher(
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
  v_target record;
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

  SELECT teacher_id, role, status
    INTO v_target
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
   LIMIT 1;

  IF v_target IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF v_admin.admin_role <> 'super_admin' AND v_target.role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF v_target.status <> 'inactive' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_inactive');
  END IF;

  UPDATE public.teachers
     SET status = 'active',
         updated_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = v_admin.school_id
     AND status = 'inactive';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_inactive');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web',
    v_admin.teacher_id,
    'teacher.reactivate',
    v_admin.school_id,
    jsonb_build_object('teacher_id', p_teacher_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'teacher_id', p_teacher_id,
    'status', 'active'
  );
END;
$function$;
