-- Disposable PostgreSQL runtime tests for non-AI tenant identity and student response minimization.
-- No Production database, data, or credentials are used.

\set ON_ERROR_STOP on
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.schools (
  school_id text PRIMARY KEY,
  school_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);

CREATE TABLE public.teachers (
  teacher_id text PRIMARY KEY,
  teacher_name text NOT NULL,
  school_id text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  telegram_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teachers_telegram_id_unique
  ON public.teachers (telegram_id) WHERE telegram_id IS NOT NULL;

CREATE TABLE public.app_web_sessions (
  session_token text PRIMARY KEY,
  teacher_id text NOT NULL,
  school_id text NOT NULL,
  role text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE public.app_sessions (
  token text PRIMARY KEY,
  telegram_id text,
  teacher_id text,
  teacher_name text,
  school_id text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  linked_at timestamptz,
  last_seen_at timestamptz
);

CREATE TABLE public.students (
  student_id text PRIMARY KEY,
  school_id text NOT NULL,
  name_mm text,
  name_en text,
  name_local text,
  class text,
  grade text,
  gender text,
  date_of_birth date,
  status text NOT NULL DEFAULT 'Active',
  photo_url text,
  house text,
  home_color text,
  parent_name text,
  parent_phone text,
  parent_phone2 text,
  parent_email text,
  enrollment_date date,
  qr_token text,
  parent_tg_id text,
  metadata jsonb,
  notes text
);

INSERT INTO public.schools (school_id, school_name, status) VALUES
  ('school-a', 'School A', 'active'),
  ('school-b', 'School B', 'active');

INSERT INTO public.teachers
  (teacher_id, teacher_name, school_id, role, status, telegram_id)
VALUES
  ('teacher-a', 'Teacher A', 'school-a', 'admin', 'active', 'tg-a'),
  ('teacher-b', 'Teacher B', 'school-b', 'teacher', 'active', 'tg-b'),
  ('teacher-inactive', 'Inactive Teacher', 'school-a', 'teacher', 'inactive', 'tg-inactive');

INSERT INTO public.app_web_sessions
  (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('valid-session-a', 'teacher-a', 'school-a', 'admin', now() + interval '1 day'),
  ('stale-school-session', 'teacher-b', 'school-a', 'teacher', now() + interval '1 day'),
  ('stale-role-session', 'teacher-a', 'school-a', 'super_admin', now() + interval '1 day'),
  ('inactive-teacher-session', 'teacher-inactive', 'school-a', 'teacher', now() + interval '1 day');

INSERT INTO public.students
  (student_id, school_id, name_mm, name_en, name_local, class, grade, gender,
   date_of_birth, status, photo_url, house, home_color, parent_name, parent_phone,
   parent_phone2, parent_email, enrollment_date, qr_token, parent_tg_id, metadata, notes)
VALUES
  ('student-test', 'school-a', 'ကျောင်းသား', 'Student Test', 'Local Name', 'G1', '1',
   'other', DATE '2015-01-01', 'Active', NULL, 'Blue', 'Blue', 'Parent Test',
   '0900000000', '0911111111', 'parent@example.invalid', current_date,
   'SECRET_QR_BEARER_TOKEN', 'SECRET_TELEGRAM_ID', '{"private":"metadata"}', 'private note');

-- The migration replaces only the final full-row response expression in these
-- five manual CRUD functions. Minimal stand-ins make the migration deterministic
-- and verify the transformation without importing or mutating Production data.
CREATE OR REPLACE FUNCTION public.rpc_register_student(
  p_session_token text, p_name_local text DEFAULT NULL, p_name_en text DEFAULT NULL,
  p_class text DEFAULT NULL, p_grade text DEFAULT NULL, p_gender text DEFAULT NULL,
  p_date_of_birth date DEFAULT NULL, p_home_color text DEFAULT NULL,
  p_parent_name text DEFAULT NULL, p_parent_phone text DEFAULT NULL,
  p_parent_email text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.students WHERE student_id = 'student-test';
  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_student(
  p_session_token text, p_student_id text, p_name_local text, p_name_en text,
  p_class text, p_grade text, p_gender text, p_date_of_birth date,
  p_home_color text, p_parent_name text, p_parent_phone text, p_parent_email text
) RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.students WHERE student_id = 'student-test';
  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_activate_student(p_session_token text, p_student_id text)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.students WHERE student_id = 'student-test';
  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_deactivate_student(p_session_token text, p_student_id text)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.students WHERE student_id = 'student-test';
  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_reactivate_student(p_session_token text, p_student_id text)
RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.students WHERE student_id = 'student-test';
  RETURN jsonb_build_object('ok', true, 'student', to_jsonb(v_row));
END;
$function$;

\ir ../../supabase/migrations/20261014135000_harden_non_ai_tenant_identity_and_student_payloads.sql

DO $assert_identity$
DECLARE
  result jsonb;
  poll_token text := 'app-poll-token-school-a';
  connect_token text := 'connect-token-school-a';
BEGIN
  -- Active teacher + active school may bind to Telegram.
  result := public.rpc_app_login_bind(poll_token, 'tg-a');
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'active teacher in active school could not bind: %', result;
  END IF;
  result := public.rpc_app_session_poll(poll_token);
  IF COALESCE((result->>'linked')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid active teacher app session did not poll as linked: %', result;
  END IF;

  -- Stale school/role sessions must not start or finish Telegram linking.
  IF COALESCE((public.rpc_telegram_connect_start('stale-school-session')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale school-bound session started Telegram connect';
  END IF;
  IF COALESCE((public.rpc_telegram_connect_start('stale-role-session')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale role-bound session started Telegram connect';
  END IF;
  IF COALESCE((public.rpc_telegram_connect_start('inactive-teacher-session')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'inactive teacher started Telegram connect';
  END IF;

  INSERT INTO public.app_sessions (token, telegram_id, status, created_at)
  VALUES (connect_token, 'tg-new', 'linked', now());
  result := public.rpc_telegram_connect_finish('valid-session-a', connect_token);
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid Telegram connect failed: %', result;
  END IF;
  IF (SELECT telegram_id FROM public.teachers WHERE teacher_id='teacher-a') IS DISTINCT FROM 'tg-new' THEN
    RAISE EXCEPTION 'valid Telegram connect was not saved';
  END IF;

  INSERT INTO public.app_sessions (token, telegram_id, status, created_at)
  VALUES ('connect-token-duplicate', 'tg-b', 'linked', now());
  result := public.rpc_telegram_connect_finish('valid-session-a', 'connect-token-duplicate');
  IF result->>'error' IS DISTINCT FROM 'telegram_already_linked' THEN
    RAISE EXCEPTION 'already-linked Telegram ID was not rejected: %', result;
  END IF;

  UPDATE public.teachers SET status='inactive' WHERE teacher_id='teacher-a';
  result := public.rpc_app_session_poll(poll_token);
  IF COALESCE((result->>'linked')::boolean, true) THEN
    RAISE EXCEPTION 'poll still exposed an inactive teacher session: %', result;
  END IF;
  UPDATE public.teachers SET status='active' WHERE teacher_id='teacher-a';

  UPDATE public.schools SET status='inactive' WHERE school_id='school-a';
  result := public.rpc_app_login_bind('blocked-school-token', 'tg-a');
  IF result->>'error' IS DISTINCT FROM 'school_not_active' THEN
    RAISE EXCEPTION 'Telegram bind ignored inactive school status: %', result;
  END IF;
  result := public.rpc_app_session_poll(poll_token);
  IF COALESCE((result->>'linked')::boolean, true) THEN
    RAISE EXCEPTION 'poll still exposed an inactive school session: %', result;
  END IF;
END
$assert_identity$;

DO $assert_student_payloads$
DECLARE
  result jsonb;
  fn_name text;
BEGIN
  FOREACH fn_name IN ARRAY ARRAY[
    'rpc_register_student',
    'rpc_update_student',
    'rpc_activate_student',
    'rpc_deactivate_student',
    'rpc_reactivate_student'
  ]
  LOOP
    CASE fn_name
      WHEN 'rpc_register_student' THEN
        result := public.rpc_register_student('test-session');
      WHEN 'rpc_update_student' THEN
        result := public.rpc_update_student('test-session', 'student-test', 'Local Name',
          'Student Test', 'G1', '1', 'other', DATE '2015-01-01', 'Blue',
          'Parent Test', '0900000000', 'parent@example.invalid');
      WHEN 'rpc_activate_student' THEN
        result := public.rpc_activate_student('test-session', 'student-test');
      WHEN 'rpc_deactivate_student' THEN
        result := public.rpc_deactivate_student('test-session', 'student-test');
      WHEN 'rpc_reactivate_student' THEN
        result := public.rpc_reactivate_student('test-session', 'student-test');
    END CASE;

    IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
      RAISE EXCEPTION '% test function did not return a student payload: %', fn_name, result;
    END IF;
    IF (result->'student') ?| ARRAY['qr_token','parent_tg_id','metadata','notes'] THEN
      RAISE EXCEPTION '% exposed internal student fields: %', fn_name, result->'student';
    END IF;
    IF result->'student'->>'student_id' IS DISTINCT FROM 'student-test'
       OR result->'student'->>'name_en' IS DISTINCT FROM 'Student Test' THEN
      RAISE EXCEPTION '% omitted required editor fields: %', fn_name, result->'student';
    END IF;
  END LOOP;
END
$assert_student_payloads$;

SELECT 'PASS: Telegram login/connect fails closed for stale identities; student CRUD responses omit internal fields' AS result;
