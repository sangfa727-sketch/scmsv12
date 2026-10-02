-- Student health delete permission hardening.

CREATE OR REPLACE FUNCTION public.rpc_delete_health_visit(p_session_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_n    int;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  DELETE FROM public.health_visits WHERE id = p_id AND school_id = v_sess.school_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_vaccination(p_session_token text, p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_n    int;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.edit', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  DELETE FROM public.immunizations WHERE id = p_id AND school_id = v_sess.school_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;

