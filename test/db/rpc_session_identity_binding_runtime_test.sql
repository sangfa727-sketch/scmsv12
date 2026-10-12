-- Disposable PostgreSQL runtime tests for tenant/role binding in school-scoped RPCs.
-- No production data or credentials are used.

CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE public.teachers (
  teacher_id text PRIMARY KEY,
  school_id text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.app_web_sessions (
  session_token text PRIMARY KEY,
  teacher_id text NOT NULL,
  school_id text NOT NULL,
  role text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE public.monthly_summary (
  school_id text NOT NULL,
  year_month text NOT NULL,
  class text NOT NULL,
  name_en text NOT NULL
);
CREATE TABLE public.subjects (
  school_id text NOT NULL,
  is_active boolean NOT NULL,
  display_order integer NOT NULL,
  subject_name text NOT NULL
);
CREATE TABLE public.terms (
  school_id text NOT NULL,
  term_order integer NOT NULL,
  term_name text NOT NULL
);
CREATE TABLE public.schools (
  school_id text PRIMARY KEY,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.teachers (teacher_id, school_id, role, status) VALUES
  ('admin-a', 'school-a', 'admin', 'active'),
  ('teacher-a', 'school-a', 'teacher', 'active'),
  ('moved-teacher', 'school-b', 'teacher', 'active'),
  ('inactive-admin', 'school-a', 'admin', 'inactive');

INSERT INTO public.app_web_sessions
  (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('valid-admin-a', 'admin-a', 'school-a', 'admin', now() + interval '1 day'),
  ('valid-teacher-a', 'teacher-a', 'school-a', 'teacher', now() + interval '1 day'),
  ('stale-role', 'admin-a', 'school-a', 'super_admin', now() + interval '1 day'),
  ('stale-school', 'moved-teacher', 'school-a', 'teacher', now() + interval '1 day'),
  ('inactive-account', 'inactive-admin', 'school-a', 'admin', now() + interval '1 day');

INSERT INTO public.monthly_summary (school_id, year_month, class, name_en)
VALUES ('school-a', to_char(current_date, 'YYYY-MM'), 'G1', 'A summary');
INSERT INTO public.subjects (school_id, is_active, display_order, subject_name)
VALUES ('school-a', true, 1, 'Math');
INSERT INTO public.terms (school_id, term_order, term_name)
VALUES ('school-a', 1, 'Term 1');
INSERT INTO public.schools (school_id, config_json)
VALUES ('school-a', '{"keep":"a"}'), ('school-b', '{"keep":"b"}');

\ir ../../supabase/migrations/20261013103000_harden_school_session_rpc_identity_binding.sql

DO $test_read_rpcs$
DECLARE
  result jsonb;
BEGIN
  result := public.rpc_get_monthly_summary('valid-admin-a', NULL);
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid monthly summary session was denied: %', result;
  END IF;

  result := public.rpc_get_subjects('valid-admin-a');
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid subjects session was denied: %', result;
  END IF;

  result := public.rpc_get_terms('valid-admin-a');
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid terms session was denied: %', result;
  END IF;

  IF COALESCE((public.rpc_get_monthly_summary('stale-role', NULL)->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-role session accessed monthly summary';
  END IF;
  IF COALESCE((public.rpc_get_subjects('stale-role')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-role session accessed subjects';
  END IF;
  IF COALESCE((public.rpc_get_terms('stale-role')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-role session accessed terms';
  END IF;

  IF COALESCE((public.rpc_get_monthly_summary('stale-school', NULL)->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-school session accessed monthly summary';
  END IF;
  IF COALESCE((public.rpc_get_subjects('stale-school')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-school session accessed subjects';
  END IF;
  IF COALESCE((public.rpc_get_terms('stale-school')->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-school session accessed terms';
  END IF;

  IF COALESCE((public.rpc_get_monthly_summary('inactive-account', NULL)->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'inactive account accessed monthly summary';
  END IF;
END
$test_read_rpcs$;

DO $test_write_rpcs$
DECLARE
  result jsonb;
BEGIN
  result := public.rpc_set_school_logo('stale-role', 'https://invalid.example/logo.png');
  IF COALESCE((result->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-role session changed school logo';
  END IF;

  result := public.rpc_set_school_cover('stale-school', 'https://invalid.example/cover.png');
  IF COALESCE((result->>'ok')::boolean, true) THEN
    RAISE EXCEPTION 'stale-school session changed school cover';
  END IF;

  result := public.rpc_set_school_logo('valid-teacher-a', 'https://invalid.example/logo.png');
  IF result->>'error' IS DISTINCT FROM 'admin_only' THEN
    RAISE EXCEPTION 'non-admin session did not fail closed: %', result;
  END IF;

  result := public.rpc_set_school_logo('valid-admin-a', 'https://example.invalid/school-a.png');
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid admin could not update own school: %', result;
  END IF;

  IF (SELECT config_json->>'school_logo' FROM public.schools WHERE school_id='school-b') IS NOT NULL THEN
    RAISE EXCEPTION 'school B config was changed by school A admin';
  END IF;
  IF (SELECT config_json->>'school_logo' FROM public.schools WHERE school_id='school-a')
       IS DISTINCT FROM 'https://example.invalid/school-a.png' THEN
    RAISE EXCEPTION 'school A logo update was not persisted';
  END IF;
END
$test_write_rpcs$;

SELECT 'PASS: school-scoped read/write RPCs reject stale school, stale role, and inactive sessions' AS result;
