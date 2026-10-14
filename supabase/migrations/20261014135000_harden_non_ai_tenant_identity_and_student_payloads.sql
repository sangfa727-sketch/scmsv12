-- Non-AI tenant safety: bind Telegram sessions to the teacher's CURRENT identity
-- and avoid returning internal student fields from manual CRUD mutations.
-- This migration is code-only; it does not rewrite business data.

BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_app_login_bind(p_token text, p_telegram_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_teacher RECORD;
  v_session public.app_sessions%ROWTYPE;
BEGIN
  SELECT t.teacher_id, t.teacher_name, t.school_id, t.status,
         sc.status AS school_status
    INTO v_teacher
    FROM public.teachers AS t
    LEFT JOIN public.schools AS sc ON sc.school_id = t.school_id
   WHERE t.telegram_id = p_telegram_id
   LIMIT 1;

  IF v_teacher IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'no_teacher',
      'message', 'No teacher account found for this Telegram ID.'
    );
  END IF;

  IF v_teacher.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_active');
  END IF;

  IF v_teacher.school_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'school_not_active');
  END IF;

  INSERT INTO public.app_sessions
    (token, telegram_id, teacher_id, teacher_name, school_id, status, linked_at, last_seen_at)
  VALUES
    (p_token, p_telegram_id, v_teacher.teacher_id, v_teacher.teacher_name,
     v_teacher.school_id, 'linked', now(), now())
  ON CONFLICT (token) DO UPDATE
    SET telegram_id = EXCLUDED.telegram_id,
        teacher_id = EXCLUDED.teacher_id,
        teacher_name = EXCLUDED.teacher_name,
        school_id = EXCLUDED.school_id,
        status = 'linked',
        linked_at = now(),
        last_seen_at = now()
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'ok', true,
    'teacher_id', v_session.teacher_id,
    'teacher_name', v_session.teacher_name,
    'school_id', v_session.school_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_app_session_poll(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_row RECORD;
BEGIN
  IF p_token IS NULL OR length(p_token) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  SELECT a.token, a.telegram_id, a.teacher_id, a.teacher_name, a.school_id, a.status
    INTO v_row
    FROM public.app_sessions AS a
    JOIN public.teachers AS t
      ON t.teacher_id = a.teacher_id
     AND t.school_id = a.school_id
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND sc.status = 'active'
   WHERE a.token = p_token
     AND a.status = 'linked'
     AND t.status = 'active'
   LIMIT 1;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'linked', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'linked', true,
    'session', jsonb_build_object(
      'token', v_row.token,
      'telegram_id', v_row.telegram_id,
      'teacher_id', v_row.teacher_id,
      'teacher_name', v_row.teacher_name,
      'school_id', v_row.school_id,
      'status', v_row.status
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_telegram_connect_start(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_token text;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND t.status = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND sc.status = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO public.app_sessions (token, status, created_at)
  VALUES (v_token, 'pending_connect', now())
  ON CONFLICT (token) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'connect_token', v_token,
    'teacher_id', v_sess.teacher_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_telegram_connect_finish(
  p_session_token text,
  p_connect_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess RECORD;
  v_linked RECORD;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND t.status = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND sc.status = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  SELECT telegram_id, status
    INTO v_linked
    FROM public.app_sessions
   WHERE token = p_connect_token
     AND status = 'linked'
     AND telegram_id IS NOT NULL
   LIMIT 1;

  IF v_linked IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_linked_yet');
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.teachers
     WHERE telegram_id = v_linked.telegram_id
       AND teacher_id <> v_sess.teacher_id
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'telegram_already_linked',
      'message', 'ဒီ Telegram account က တခြား account တစ်ခုမှာ ချိတ်ဆက်ပြီးသားပါ'
    );
  END IF;

  BEGIN
    UPDATE public.teachers
       SET telegram_id = v_linked.telegram_id,
           updated_at = now()
     WHERE teacher_id = v_sess.teacher_id
       AND school_id = v_sess.school_id
       AND role = v_sess.role
       AND status = 'active';

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'telegram_already_linked');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'telegram_id', v_linked.telegram_id,
    'message', 'Telegram ချိတ်ဆက်ပြီးပါပြီ'
  );
END;
$function$;

-- Mutation RPCs must not return the complete students row: it includes QR bearer
-- tokens, Telegram identifiers, arbitrary metadata, notes, and other internal data.
-- Keep the fields needed by the manual student editor while allowlisting the response.
DO $harden_student_responses$
DECLARE
  r RECORD;
  d TEXT;
  newd TEXT;
  v_changed INTEGER := 0;
  v_expected CONSTANT INTEGER := 5;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS definition
      FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'rpc_register_student',
         'rpc_update_student',
         'rpc_activate_student',
         'rpc_deactivate_student',
         'rpc_reactivate_student'
       )
  LOOP
    d := r.definition;
    newd := regexp_replace(
      d,
      'RETURN jsonb_build_object\(\s*''ok''\s*,\s*true\s*,\s*''student''\s*,\s*to_jsonb\(v_row\)\s*\);',
      'RETURN jsonb_build_object(''ok'', true, ''student'', jsonb_build_object(''student_id'', v_row.student_id, ''name_mm'', v_row.name_mm, ''name_en'', v_row.name_en, ''name_local'', v_row.name_local, ''class'', v_row.class, ''grade'', v_row.grade, ''gender'', v_row.gender, ''date_of_birth'', v_row.date_of_birth, ''status'', v_row.status, ''photo_url'', v_row.photo_url, ''house'', v_row.house, ''home_color'', v_row.home_color, ''parent_name'', v_row.parent_name, ''parent_phone'', v_row.parent_phone, ''parent_phone2'', v_row.parent_phone2, ''parent_email'', v_row.parent_email, ''enrollment_date'', v_row.enrollment_date));',
      'gi'
    );

    IF newd <> d THEN
      EXECUTE newd;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  IF v_changed <> v_expected THEN
    RAISE EXCEPTION
      'student mutation response hardening coverage mismatch: changed %, expected %',
      v_changed, v_expected;
  END IF;
END;
$harden_student_responses$;

COMMIT;
