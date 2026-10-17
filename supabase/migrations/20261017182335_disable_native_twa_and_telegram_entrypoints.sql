-- Temporarily disable native/TWA and Telegram-linked entry points.
-- Preserve the main web Staff and Parent Portal authorization paths.
BEGIN;

DO $disable_native$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prokind = 'f'
       AND n.nspname = 'public'
       AND (p.proname LIKE 'rpc_app_%'
            OR p.proname IN ('rpc_telegram_connect_start',
                             'rpc_telegram_connect_finish',
                             'rpc_telegram_disconnect'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.signature);
  END LOOP;
END;
$disable_native$;

CREATE OR REPLACE FUNCTION public.rpc_authorize_student_photo_read(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_web record;
  v_parent record;
  v_student record;
  v_path text;
BEGIN
  IF nullif(trim(p_session_token), '') IS NULL
     OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_params');
  END IF;

  SELECT ps.student_id, ps.school_id
    INTO v_parent
    FROM public.parent_sessions ps
    JOIN public.schools sc
      ON sc.school_id = ps.school_id AND lower(sc.status) = 'active'
   WHERE ps.session_token = p_session_token
     AND ps.student_id = p_student_id
     AND ps.expires_at > now()
   LIMIT 1;

  IF v_parent IS NOT NULL THEN
    SELECT s.student_id, s.school_id, s.photo_url
      INTO v_student
      FROM public.students s
     WHERE s.student_id = v_parent.student_id
       AND s.school_id = v_parent.school_id
       AND s.status = 'Active'
     LIMIT 1;
  ELSE
    SELECT ws.teacher_id, ws.school_id, ws.role
      INTO v_web
      FROM public.app_web_sessions ws
      JOIN public.teachers t
        ON t.teacher_id = ws.teacher_id
       AND t.school_id = ws.school_id
       AND t.role = ws.role
       AND lower(t.status) = 'active'
      JOIN public.schools sc
        ON sc.school_id = t.school_id AND lower(sc.status) = 'active'
     WHERE ws.session_token = p_session_token
       AND ws.expires_at > now()
     LIMIT 1;

    IF v_web IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_session_or_permission_denied');
    END IF;

    SELECT s.student_id, s.school_id, s.photo_url
      INTO v_student
      FROM public.students s
     WHERE s.student_id = p_student_id
       AND s.school_id = v_web.school_id
       AND s.status = 'Active'
     LIMIT 1;

    IF v_student IS NOT NULL
       AND private.web_has_student_permission(p_session_token, 'students.view', p_student_id) IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
    END IF;
  END IF;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  v_path := substring(v_student.photo_url
    from '/storage/v1/object/public/student-photos/([^?]+)');
  IF v_path IS NULL
     OR left(v_path, length(v_student.school_id::text) + 1) <> v_student.school_id::text || '/'
     OR position('..' in v_path) > 0
     OR position(chr(92) in v_path) > 0
     OR v_path ~* '%(2e|2f|5c)'
     OR (
       strpos(substr(v_path, length(v_student.school_id::text) + 2), '/') > 0
       AND split_part(v_path, '/', 2) <> v_student.student_id::text
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'photo_not_available');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', v_student.student_id,
    'school_id', v_student.school_id,
    'object_path', v_path
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_authorize_student_photo_upload(
  p_session_token text,
  p_student_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_student RECORD;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND lower(t.status) = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND lower(sc.status) = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  SELECT s.student_id
    INTO v_student
    FROM public.students AS s
   WHERE s.student_id = p_student_id
     AND s.school_id = v_sess.school_id
   LIMIT 1;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_not_found');
  END IF;

  IF private.web_has_student_permission(
    p_session_token, 'students.edit', p_student_id
  ) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'school_id', v_sess.school_id,
    'student_id', v_student.student_id
  );
END;
$function$;

COMMIT;