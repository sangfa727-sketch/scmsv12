-- Transport route permission contract and session-school binding hardening.
-- Preserves existing route RPC signatures, response shapes, school filters, and business logic.

BEGIN;

INSERT INTO public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active, display_order)
VALUES
  ('transport.view', 'transport', 'View transport routes and route details', 'global', false, true, 92),
  ('transport.manage', 'transport', 'Manage transport routes', 'global', false, true, 93)
ON CONFLICT (permission_key) DO UPDATE
SET category = EXCLUDED.category,
    description = EXCLUDED.description,
    scope_type = EXCLUDED.scope_type,
    is_sensitive = EXCLUDED.is_sensitive,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order;

INSERT INTO public.role_permissions (role, permission_key, allowed)
VALUES
  ('admin', 'transport.view', true),
  ('admin', 'transport.manage', true),
  ('super_admin', 'transport.view', true),
  ('super_admin', 'transport.manage', true),
  ('teacher', 'transport.view', false),
  ('teacher', 'transport.manage', false)
ON CONFLICT (role, permission_key) DO UPDATE
SET allowed = EXCLUDED.allowed;

CREATE OR REPLACE FUNCTION public.rpc_get_routes(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'transport.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id AND t.school_id = s.school_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'route_name', r.route_name, 'driver_name', r.driver_name,
      'driver_phone', r.driver_phone, 'vehicle_info', r.vehicle_info, 'notes', r.notes,
      'student_count', COALESCE(st.n, 0)
    ) ORDER BY r.route_name), '[]'::jsonb)
    INTO v_rows
    FROM public.transport_routes r
    LEFT JOIN (
      SELECT route_id, count(*) n FROM public.student_transport
       WHERE route_id IS NOT NULL GROUP BY route_id
    ) st ON st.route_id = r.id
   WHERE r.school_id = v_sess.school_id;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_route_detail(p_session_token text, p_route_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_route record;
  v_students jsonb;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'transport.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id AND t.school_id = s.school_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT * INTO v_route FROM public.transport_routes
   WHERE id = p_route_id AND school_id = v_sess.school_id;
  IF v_route IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'student_id', st.student_id, 'name_en', st.name_en, 'class', st.class, 'photo_url', st.photo_url,
      'pickup_stop', stt.pickup_stop, 'pickup_time', stt.pickup_time, 'dropoff_time', stt.dropoff_time
    ) ORDER BY st.name_en), '[]'::jsonb)
    INTO v_students
    FROM public.student_transport stt
    JOIN public.students st ON st.student_id = stt.student_id
   WHERE stt.route_id = p_route_id AND stt.school_id = v_sess.school_id;

  RETURN jsonb_build_object('ok', true, 'route', to_jsonb(v_route), 'students', v_students);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_add_route(p_session_token text, p_route_name text, p_driver_name text DEFAULT NULL::text, p_driver_phone text DEFAULT NULL::text, p_vehicle_info text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'transport.manage', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id AND t.school_id = s.school_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF p_route_name IS NULL OR trim(p_route_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'route_name_required');
  END IF;

  INSERT INTO public.transport_routes (school_id, route_name, driver_name, driver_phone, vehicle_info, notes)
  VALUES (v_sess.school_id, trim(p_route_name), nullif(trim(p_driver_name), ''), nullif(trim(p_driver_phone), ''),
          nullif(trim(p_vehicle_info), ''), nullif(trim(p_notes), ''))
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'route', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_update_route(p_session_token text, p_id bigint, p_route_name text DEFAULT NULL::text, p_driver_name text DEFAULT NULL::text, p_driver_phone text DEFAULT NULL::text, p_vehicle_info text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_row record;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'transport.manage', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id AND t.school_id = s.school_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  UPDATE public.transport_routes SET
    route_name   = COALESCE(nullif(trim(p_route_name), ''), route_name),
    driver_name  = CASE WHEN p_driver_name IS NULL THEN driver_name ELSE nullif(trim(p_driver_name), '') END,
    driver_phone = CASE WHEN p_driver_phone IS NULL THEN driver_phone ELSE nullif(trim(p_driver_phone), '') END,
    vehicle_info = CASE WHEN p_vehicle_info IS NULL THEN vehicle_info ELSE nullif(trim(p_vehicle_info), '') END,
    notes        = CASE WHEN p_notes IS NULL THEN notes ELSE nullif(trim(p_notes), '') END
  WHERE id = p_id AND school_id = v_sess.school_id
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'route', to_jsonb(v_row));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_route(p_session_token text, p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_n int;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'transport.manage', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT s.teacher_id, s.school_id INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t ON t.teacher_id = s.teacher_id AND t.school_id = s.school_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  DELETE FROM public.transport_routes WHERE id = p_id AND school_id = v_sess.school_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE ALL ON FUNCTION public.rpc_get_routes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_route_detail(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_add_route(text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_route(text,bigint,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_route(text,bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_get_routes(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_route_detail(text,bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_add_route(text,text,text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_route(text,bigint,text,text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_route(text,bigint) TO anon, authenticated;

COMMIT;
