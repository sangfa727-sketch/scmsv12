-- Forward-only repair for confirmed Production security drift.
-- This migration intentionally touches only the currently verified broken surfaces:
-- (1) browser grants on internal tables, (2) Parent Login RPC payload/grants,
-- (3) bounded Parent Login rate limiting, and (4) trusted student-photo upload authorization.
-- It does NOT make student-photos private because existing UI consumes public URLs;
-- that needs a separate URL-consumer migration and compatibility rollout.
-- Do not run the full historical backlog with db push until migration history is reconciled.

BEGIN;

-- 1) Browser roles must not mutate internal session/audit/automation state directly.
REVOKE ALL PRIVILEGES ON TABLE
  public.app_sessions,
  public.audit_log,
  public.n8n_state
FROM anon, authenticated;

-- 2) Return an explicit allowlist from Parent Login, never the full students row.
CREATE OR REPLACE FUNCTION public.rpc_parent_google_login(
  p_qr_token text,
  p_google_email text,
  p_device_ua text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_student record;
  v_token text;
BEGIN
  IF p_qr_token IS NULL OR p_google_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_params');
  END IF;

  SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,
         st.parent_email, st.school_id, st.status, sc.school_name
    INTO v_student
    FROM public.students st
    JOIN public.schools sc
      ON sc.school_id = st.school_id
     AND sc.status = 'active'
   WHERE st.qr_token = p_qr_token
     AND st.status = 'Active';

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_inactive');
  END IF;

  IF v_student.parent_email IS NULL OR trim(v_student.parent_email) = ''
     OR lower(trim(v_student.parent_email)) <> lower(trim(p_google_email)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.parent_sessions
    (session_token, student_id, school_id, parent_email, device_ua)
  VALUES
    (v_token, v_student.student_id, v_student.school_id,
     lower(trim(p_google_email)), left(p_device_ua, 512));

  RETURN jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'student', jsonb_strip_nulls(jsonb_build_object(
      'student_id', v_student.student_id,
      'name_en', v_student.name_en,
      'name_local', v_student.name_local,
      'class', v_student.class,
      'photo_url', v_student.photo_url,
      'school_name', v_student.school_name
    ))
  );
END
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_parent_google_login(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_parent_google_login(text, text, text)
  TO service_role;

-- 3) Atomic, hashed-key rate limiter required by the hardened Parent Login Edge Function.
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.parent_login_rate_limits (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parent_login_rate_limits_updated_at_idx
  ON private.parent_login_rate_limits (updated_at);

REVOKE ALL ON TABLE private.parent_login_rate_limits
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rpc_parent_login_rate_limit(
  p_key_hash text,
  p_window_seconds integer,
  p_max_attempts integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_attempts integer;
  v_window_started_at timestamptz;
  v_retry_after integer;
BEGIN
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$'
     OR p_window_seconds IS NULL OR p_window_seconds < 1 OR p_window_seconds > 86400
     OR p_max_attempts IS NULL OR p_max_attempts < 1 OR p_max_attempts > 1000 THEN
    RAISE EXCEPTION 'invalid rate-limit parameters' USING ERRCODE = '22023';
  END IF;

  WITH stale_keys AS (
    SELECT key_hash
      FROM private.parent_login_rate_limits
     WHERE updated_at < now() - interval '24 hours'
     ORDER BY updated_at
     LIMIT 1000
  )
  DELETE FROM private.parent_login_rate_limits AS limits
   USING stale_keys
   WHERE limits.key_hash = stale_keys.key_hash;

  INSERT INTO private.parent_login_rate_limits AS current_limit
    (key_hash, window_started_at, attempts, updated_at)
  VALUES (p_key_hash, now(), 1, now())
  ON CONFLICT (key_hash) DO UPDATE
    SET window_started_at = CASE
          WHEN current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN now()
          ELSE current_limit.window_started_at
        END,
        attempts = CASE
          WHEN current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds)
            THEN 1
          ELSE current_limit.attempts + 1
        END,
        updated_at = now()
  RETURNING current_limit.attempts, current_limit.window_started_at
    INTO v_attempts, v_window_started_at;

  v_retry_after := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (
      v_window_started_at + make_interval(secs => p_window_seconds) - now()
    )))::integer
  );

  RETURN jsonb_build_object(
    'allowed', v_attempts <= p_max_attempts,
    'attempts', v_attempts,
    'retry_after_seconds', v_retry_after
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_parent_login_rate_limit(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_parent_login_rate_limit(text, integer, integer)
  TO service_role;

-- 4) Student photos may be uploaded only through the trusted Edge Function.
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
  v_session_type text;
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

  IF v_sess IS NOT NULL THEN
    v_session_type := 'web';
  ELSE
    SELECT t.teacher_id, t.school_id, t.role
      INTO v_sess
      FROM public.app_sessions AS a
      JOIN public.teachers AS t
        ON t.teacher_id = a.teacher_id
       AND t.school_id = a.school_id
       AND t.telegram_id = a.telegram_id
       AND lower(t.status) = 'active'
      JOIN public.schools AS sc
        ON sc.school_id = t.school_id
       AND lower(sc.status) = 'active'
     WHERE a.token = p_session_token
       AND a.status = 'linked'
       AND length(a.token) >= 32
     LIMIT 1;

    IF v_sess IS NOT NULL THEN
      v_session_type := 'telegram';
    END IF;
  END IF;

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

  IF v_session_type = 'web' THEN
    IF private.web_has_student_permission(
      p_session_token, 'students.edit', p_student_id
    ) IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
    END IF;
  ELSIF v_sess.role NOT IN (
    'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'school_id', v_sess.school_id,
    'student_id', v_student.student_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_student_photo_upload(text, text)
  TO service_role;

DROP POLICY IF EXISTS "anon upload student photos" ON storage.objects;
DROP POLICY IF EXISTS "public read student photos" ON storage.objects;

COMMIT;
