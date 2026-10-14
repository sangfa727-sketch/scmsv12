-- Isolated runtime test for web session invalidation on teacher identity changes.
-- This script runs only in a disposable CI database, never Production.
\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE public.teachers (
  teacher_id text PRIMARY KEY,
  school_id text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  teacher_name text
);
CREATE TABLE public.app_web_sessions (
  session_token text PRIMARY KEY,
  teacher_id text NOT NULL,
  school_id text NOT NULL,
  role text NOT NULL,
  expires_at timestamptz NOT NULL
);

\ir ../../supabase/migrations/20261014142000_invalidate_stale_web_sessions.sql

INSERT INTO public.teachers (teacher_id, school_id, role, status, teacher_name)
VALUES ('T-1', 'SCH-1', 'teacher', 'active', 'Teacher One');
INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('session-a', 'T-1', 'SCH-1', 'teacher', now() + interval '1 hour'),
  ('session-b', 'T-1', 'SCH-1', 'teacher', now() + interval '2 hours');

-- Non-identity profile edits must not invalidate sessions.
UPDATE public.teachers SET teacher_name = 'Teacher One Updated' WHERE teacher_id = 'T-1';
DO $assert_profile_edit$
BEGIN
  IF (SELECT count(*) FROM public.app_web_sessions WHERE teacher_id = 'T-1' AND expires_at > now()) <> 2 THEN
    RAISE EXCEPTION 'profile-only update unexpectedly invalidated web sessions';
  END IF;
END
$assert_profile_edit$;

-- A role change must expire every existing web session for this teacher.
UPDATE public.teachers SET role = 'admin' WHERE teacher_id = 'T-1';
DO $assert_role_change$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE teacher_id = 'T-1' AND expires_at > now()) THEN
    RAISE EXCEPTION 'role change did not invalidate every web session';
  END IF;
END
$assert_role_change$;

-- A new session after the role change is also invalidated when the account is disabled.
INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES ('session-c', 'T-1', 'SCH-1', 'admin', now() + interval '1 hour');
UPDATE public.teachers SET status = 'inactive' WHERE teacher_id = 'T-1';
DO $assert_status_change$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token = 'session-c' AND expires_at > now()) THEN
    RAISE EXCEPTION 'status change did not invalidate web session';
  END IF;
END
$assert_status_change$;

-- A school move must also invalidate any active session.
UPDATE public.teachers SET status = 'active', school_id = 'SCH-2' WHERE teacher_id = 'T-1';
INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES ('session-d', 'T-1', 'SCH-2', 'admin', now() + interval '1 hour');
UPDATE public.teachers SET school_id = 'SCH-3' WHERE teacher_id = 'T-1';
DO $assert_school_change$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token = 'session-d' AND expires_at > now()) THEN
    RAISE EXCEPTION 'school change did not invalidate web session';
  END IF;
END
$assert_school_change$;

SELECT 'web session invalidation runtime test passed' AS result;
