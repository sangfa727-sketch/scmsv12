-- Disposable PostgreSQL runtime test for session tenant/role binding.
-- The real migration is applied below; no production data or secrets are used.

CREATE SCHEMA IF NOT EXISTS private;

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
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.teachers (teacher_id, school_id, role, status) VALUES
  ('teacher-a', 'school-a', 'admin', 'active'),
  ('teacher-b', 'school-b', 'teacher', 'active'),
  ('teacher-c', 'school-c', 'teacher', 'inactive'),
  ('teacher-d', 'school-d', 'teacher', 'active');

INSERT INTO public.app_web_sessions
  (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('valid-a', 'teacher-a', 'school-a', 'admin', now() + interval '1 day'),
  ('wrong-school', 'teacher-b', 'school-a', 'teacher', now() + interval '1 day'),
  ('wrong-role', 'teacher-a', 'school-a', 'teacher', now() + interval '1 day'),
  ('inactive-teacher', 'teacher-c', 'school-c', 'teacher', now() + interval '1 day'),
  ('orphan-teacher', 'deleted-teacher', 'school-z', 'teacher', now() + interval '1 day');

\ir ../../supabase/migrations/20261013100000_revoke_stale_web_sessions_on_identity_change.sql

DO $test_backfill$
BEGIN
  IF (SELECT expires_at <= now() FROM public.app_web_sessions WHERE session_token='valid-a') THEN
    RAISE EXCEPTION 'valid session was unexpectedly revoked by migration backfill';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.app_web_sessions
    WHERE session_token IN ('wrong-school','wrong-role','inactive-teacher','orphan-teacher')
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'migration did not expire all stale/mismatched sessions';
  END IF;
END
$test_backfill$;

-- A role change must revoke every active session for that teacher, even if the
-- session's old school_id remains the same.
UPDATE public.teachers SET role='teacher' WHERE teacher_id='teacher-a';

DO $test_role_change$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.app_web_sessions
    WHERE teacher_id='teacher-a' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'role change left an active session behind';
  END IF;
END
$test_role_change$;

-- A school reassignment and an account deactivation must also revoke sessions.
INSERT INTO public.app_web_sessions
  (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('valid-b', 'teacher-b', 'school-b', 'teacher', now() + interval '1 day');

UPDATE public.teachers SET school_id='school-b2' WHERE teacher_id='teacher-b';

DO $test_school_change$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.app_web_sessions
    WHERE teacher_id='teacher-b' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'school reassignment left an active session behind';
  END IF;
END
$test_school_change$;

INSERT INTO public.app_web_sessions
  (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('valid-b2', 'teacher-b', 'school-b2', 'teacher', now() + interval '1 day');

UPDATE public.teachers SET status='inactive' WHERE teacher_id='teacher-b';

DO $test_deactivation$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.app_web_sessions
    WHERE teacher_id='teacher-b' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'deactivation left an active session behind';
  END IF;
END
$test_deactivation$;

-- Teacher deletion must revoke active sessions too, rather than leaving an orphan.
INSERT INTO public.app_web_sessions
  (session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('valid-d', 'teacher-d', 'school-d', 'teacher', now() + interval '1 day');

DELETE FROM public.teachers WHERE teacher_id='teacher-d';

DO $test_teacher_delete$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.app_web_sessions
    WHERE teacher_id='teacher-d' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'teacher deletion left an active session behind';
  END IF;
END
$test_teacher_delete$;

SELECT 'PASS: stale identity, role/school changes, deactivation, and teacher deletion revoke sessions' AS result;
