\set ON_ERROR_STOP on

-- Isolated runtime regression for the shared billing session helpers.
-- This runs only in the disposable PostgreSQL service used by GitHub Actions.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

DROP TABLE IF EXISTS public.app_web_sessions;
DROP TABLE IF EXISTS public.teachers;

CREATE TABLE public.teachers (
  teacher_id text PRIMARY KEY,
  school_id text NOT NULL,
  role text NOT NULL,
  status text NOT NULL
);

CREATE TABLE public.app_web_sessions (
  session_token text PRIMARY KEY,
  teacher_id text NOT NULL,
  school_id text NOT NULL,
  role text NOT NULL,
  expires_at timestamptz NOT NULL
);

INSERT INTO public.teachers (teacher_id, school_id, role, status) VALUES
  ('teacher_ok', 'school_a', 'teacher', 'active'),
  ('teacher_admin', 'school_a', 'admin', 'active'),
  ('teacher_inactive', 'school_a', 'teacher', 'inactive'),
  ('teacher_moved', 'school_b', 'teacher', 'active'),
  ('teacher_promoted', 'school_a', 'admin', 'active');

INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at) VALUES
  ('token_ok', 'teacher_ok', 'school_a', 'teacher', now() + interval '1 hour'),
  ('token_admin', 'teacher_admin', 'school_a', 'admin', now() + interval '1 hour'),
  ('token_inactive', 'teacher_inactive', 'school_a', 'teacher', now() + interval '1 hour'),
  ('token_moved', 'teacher_moved', 'school_a', 'teacher', now() + interval '1 hour'),
  ('token_role_changed', 'teacher_promoted', 'school_a', 'teacher', now() + interval '1 hour'),
  ('token_expired', 'teacher_ok', 'school_a', 'teacher', now() - interval '1 hour');

\i supabase/migrations/20261014120000_harden_billing_session_identity_binding.sql

DO $assert$
DECLARE
  v_school text;
  v_teacher text;
BEGIN
  SELECT v_school_id, v_teacher_id INTO v_school, v_teacher
    FROM public._billing_session('token_ok');
  IF v_school IS DISTINCT FROM 'school_a' OR v_teacher IS DISTINCT FROM 'teacher_ok' THEN
    RAISE EXCEPTION 'valid active session was not accepted';
  END IF;

  IF EXISTS (SELECT 1 FROM public._billing_session('token_moved')) THEN
    RAISE EXCEPTION 'stale school assignment was accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public._billing_session('token_role_changed')) THEN
    RAISE EXCEPTION 'stale role assignment was accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public._billing_session('token_inactive')) THEN
    RAISE EXCEPTION 'inactive teacher session was accepted';
  END IF;
  IF EXISTS (SELECT 1 FROM public._billing_session('token_expired')) THEN
    RAISE EXCEPTION 'expired session was accepted';
  END IF;

  IF EXISTS (SELECT 1 FROM public._billing_admin_session('token_ok')) THEN
    RAISE EXCEPTION 'non-admin session was accepted by admin helper';
  END IF;
  SELECT v_school_id, v_teacher_id INTO v_school, v_teacher
    FROM public._billing_admin_session('token_admin');
  IF v_school IS DISTINCT FROM 'school_a' OR v_teacher IS DISTINCT FROM 'teacher_admin' THEN
    RAISE EXCEPTION 'valid active admin session was not accepted';
  END IF;

  IF has_function_privilege('anon', 'public._billing_session(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._billing_session(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._billing_admin_session(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public._billing_admin_session(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles retain direct execute on internal billing helpers';
  END IF;
END
$assert$;

\echo 'PASS: billing helper identity binding, admin restriction, expiry, active status, and execute grants'
