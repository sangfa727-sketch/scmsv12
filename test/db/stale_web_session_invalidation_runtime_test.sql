\set ON_ERROR_STOP on

-- Isolated runtime test for the existing stale-web-session migration.
-- This harness runs only in disposable CI PostgreSQL, never Production.

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
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.teachers (teacher_id, school_id, role, status, teacher_name) VALUES
  ('T-1', 'SCH-1', 'teacher', 'active', 'Teacher One'),
  ('T-2', 'SCH-1', 'teacher', 'active', 'Teacher Two'),
  ('T-3', 'SCH-1', 'teacher', 'inactive', 'Teacher Three'),
  ('T-4', 'SCH-4', 'teacher', 'active', 'Teacher Four');

INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at) VALUES
  ('valid-session', 'T-1', 'SCH-1', 'teacher', now() + interval '1 hour'),
  ('stale-role', 'T-1', 'SCH-1', 'admin', now() + interval '1 hour'),
  ('stale-school', 'T-1', 'SCH-OLD', 'teacher', now() + interval '1 hour'),
  ('inactive-account', 'T-3', 'SCH-1', 'teacher', now() + interval '1 hour'),
  ('deleted-account', 'missing-teacher', 'SCH-1', 'teacher', now() + interval '1 hour');

\ir ../../supabase/migrations/20261013100000_revoke_stale_web_sessions_on_identity_change.sql

DO $assert_migration_cleanup$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token='valid-session' AND expires_at > now()) THEN
    RAISE EXCEPTION 'valid matching session was unexpectedly expired during migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token IN ('stale-role','stale-school','inactive-account','deleted-account') AND expires_at > now()) THEN
    RAISE EXCEPTION 'migration failed to expire a stale role/school/inactive/deleted-teacher session';
  END IF;
END
$assert_migration_cleanup$;

-- Profile-only edits must not revoke a session.
UPDATE public.teachers SET teacher_name='Teacher One Updated' WHERE teacher_id='T-1';
DO $assert_profile_update$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token='valid-session' AND expires_at > now()) THEN
    RAISE EXCEPTION 'profile-only edit unexpectedly revoked the session';
  END IF;
END
$assert_profile_update$;

-- Role changes revoke all existing sessions for that teacher.
UPDATE public.teachers SET role='admin' WHERE teacher_id='T-1';
DO $assert_role_change$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE teacher_id='T-1' AND expires_at > now()) THEN
    RAISE EXCEPTION 'role change did not revoke all active sessions';
  END IF;
END
$assert_role_change$;

-- Status changes revoke newly issued sessions too.
INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES ('status-change-session','T-1','SCH-1','admin',now() + interval '1 hour');
UPDATE public.teachers SET status='inactive' WHERE teacher_id='T-1';
DO $assert_status_change$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token='status-change-session' AND expires_at > now()) THEN
    RAISE EXCEPTION 'status change did not revoke active session';
  END IF;
END
$assert_status_change$;

-- School changes and teacher deletion must also revoke sessions.
INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES ('school-change-session','T-4','SCH-4','teacher',now() + interval '1 hour');
UPDATE public.teachers SET school_id='SCH-5' WHERE teacher_id='T-4';

INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES ('delete-session','T-2','SCH-1','teacher',now() + interval '1 hour');
DELETE FROM public.teachers WHERE teacher_id='T-2';

DO $assert_school_delete$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token IN ('school-change-session','delete-session') AND expires_at > now()) THEN
    RAISE EXCEPTION 'school change or teacher deletion did not revoke active session';
  END IF;
END
$assert_school_delete$;

SELECT 'PASS: stale web sessions are expired on migration, identity changes, and teacher deletion' AS result;
