\set ON_ERROR_STOP on

-- Isolated PostgreSQL runtime test for the student-photo authorization migration.
-- This database is disposable CI infrastructure; it is never the production project.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.schools (school_id text PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.teachers (
  teacher_id text PRIMARY KEY, school_id text NOT NULL REFERENCES public.schools(school_id),
  telegram_id text, role text, status text NOT NULL
);
CREATE TABLE public.students (
  student_id text PRIMARY KEY, school_id text NOT NULL REFERENCES public.schools(school_id),
  status text NOT NULL, photo_url text, class text,
  name_en text, name_local text, updated_at timestamptz
);
CREATE TABLE public.parent_sessions (
  session_token text PRIMARY KEY, student_id text NOT NULL, school_id text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE public.app_web_sessions (
  session_token text PRIMARY KEY, teacher_id text NOT NULL, school_id text NOT NULL,
  role text, expires_at timestamptz NOT NULL
);
CREATE TABLE public.app_sessions (
  token text PRIMARY KEY, status text NOT NULL, teacher_id text NOT NULL,
  school_id text NOT NULL, telegram_id text
);
CREATE TABLE public.audit_log (
  source text, actor text, action text, school_id text, payload jsonb
);

CREATE OR REPLACE FUNCTION public.rpc_app_session_poll(p_token text)
RETURNS jsonb LANGUAGE sql AS $function$ SELECT '{}'::jsonb $function$;
CREATE OR REPLACE FUNCTION public.rpc_telegram_connect_start(p_session_token text)
RETURNS jsonb LANGUAGE sql AS $function$ SELECT '{}'::jsonb $function$;
CREATE OR REPLACE FUNCTION public.rpc_telegram_connect_finish(p_session_token text, p_connect_token text)
RETURNS jsonb LANGUAGE sql AS $function$ SELECT '{}'::jsonb $function$;
CREATE OR REPLACE FUNCTION public.rpc_telegram_disconnect(p_session_token text)
RETURNS jsonb LANGUAGE sql AS $function$ SELECT '{}'::jsonb $function$;

CREATE OR REPLACE FUNCTION private.app_session_identity(p_token text)
RETURNS TABLE(teacher_id text, school_id text, role text)
LANGUAGE sql STABLE AS $function$
  SELECT 'admin-a'::text, 'school-a'::text, 'admin'::text
  WHERE p_token = 'native-admin-session-token-123456789012';
$function$;

CREATE OR REPLACE FUNCTION public.rpc_authorize_student_photo_upload(p_session_token text, p_student_id text)
RETURNS jsonb LANGUAGE sql AS $function$ SELECT '{}'::jsonb $function$;

CREATE TABLE public.teacher_class_assignments (
  school_id text NOT NULL, teacher_id text NOT NULL, class_name text NOT NULL, is_active boolean NOT NULL
);

CREATE OR REPLACE FUNCTION private.web_has_student_permission(
  p_session_token text, p_permission text, p_student_id text
) RETURNS boolean LANGUAGE sql STABLE AS $function$
  SELECT p_session_token = 'web-session-valid'
     AND p_permission IN ('students.view', 'students.edit')
     AND p_student_id = 'student-a';
$function$;

INSERT INTO public.schools (school_id, status) VALUES ('school-a', 'active'), ('school-b', 'active');
INSERT INTO public.teachers (teacher_id, school_id, telegram_id, role, status) VALUES
  ('teacher-a', 'school-a', 'tg-a', 'teacher', 'active'),
  ('teacher-b', 'school-b', 'tg-b', 'teacher', 'active'),
  ('teacher-null-role', 'school-a', 'tg-null', NULL, 'active'),
  ('admin-a', 'school-a', 'tg-admin', 'admin', 'active');
INSERT INTO public.students (student_id, school_id, status, photo_url, class) VALUES
  ('student-a', 'school-a', 'Active', 'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/a.jpg', 'K1'),
  ('student-b', 'school-a', 'Active', 'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/b.jpg', 'K2'),
  ('student-other-school', 'school-b', 'Active', 'https://example.supabase.co/storage/v1/object/public/student-photos/school-b/c.jpg', 'K1');
INSERT INTO public.parent_sessions (session_token, student_id, school_id, expires_at)
VALUES ('parent-session-valid', 'student-a', 'school-a', now() + interval '1 hour');
INSERT INTO public.app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
VALUES ('web-session-valid', 'teacher-a', 'school-a', 'teacher', now() + interval '1 hour');
INSERT INTO public.app_sessions (token, status, teacher_id, school_id, telegram_id) VALUES
  ('native-teacher-session-token-123456789012', 'linked', 'teacher-a', 'school-a', 'tg-a'),
  ('native-null-role-session-token-123456789', 'linked', 'teacher-null-role', 'school-a', 'tg-null'),
  ('native-admin-session-token-123456789012', 'linked', 'admin-a', 'school-a', 'tg-admin');
INSERT INTO public.teacher_class_assignments (school_id, teacher_id, class_name, is_active)
VALUES ('school-a', 'teacher-a', 'K1', true);

\ir ../../supabase/migrations/20261017110000_authorize_student_photo_reads.sql
\ir ../../supabase/migrations/20261017120000_bind_student_photo_paths.sql
\ir ../../supabase/migrations/20261017182335_disable_native_twa_and_telegram_entrypoints.sql

DO $assertions$
DECLARE result jsonb;
BEGIN
  UPDATE public.students
     SET photo_url = 'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/student-b/other.jpg'
   WHERE student_id = 'student-a';
  result := public.rpc_authorize_student_photo_read('parent-session-valid', 'student-a');
  IF result->>'ok' <> 'false' THEN
    RAISE EXCEPTION 'authorization must reject a nested object path owned by another student: %', result;
  END IF;

  UPDATE public.students
     SET photo_url = 'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/student-a/new.jpg'
   WHERE student_id = 'student-a';
  result := public.rpc_authorize_student_photo_read('parent-session-valid', 'student-a');
  IF result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'authorization should accept a nested path scoped to the linked student: %', result;
  END IF;

  UPDATE public.students
     SET photo_url = 'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/a.jpg'
   WHERE student_id = 'student-a';
  result := public.rpc_authorize_student_photo_read('parent-session-valid', 'student-a');
  IF result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'legacy school-scoped photo paths must remain readable: %', result;
  END IF;
  result := public.rpc_authorize_student_photo_read('parent-session-valid', 'student-b');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'parent must not read another student photo: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('web-session-valid', 'student-a');
  IF result->>'ok' <> 'true' THEN RAISE EXCEPTION 'web teacher with students.view should read permitted photo: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('web-session-valid', 'student-b');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'web teacher without students.view must be denied: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('native-teacher-session-token-123456789012', 'student-a');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'native/TWA photo reads must be disabled: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('native-teacher-session-token-123456789012', 'student-b');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'native/TWA photo reads must remain disabled for all students: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('native-teacher-session-token-123456789012', 'student-other-school');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'native/TWA cross-school reads must be denied: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('native-null-role-session-token-123456789', 'student-a');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'native session with NULL role must fail closed: %', result; END IF;
  result := public.rpc_authorize_student_photo_read('native-admin-session-token-123456789012', 'student-b');
  IF result->>'ok' <> 'false' THEN RAISE EXCEPTION 'native/TWA admin photo reads must also be disabled: %', result; END IF;
  result := public.rpc_authorize_student_photo_upload('native-admin-session-token-123456789012', 'student-a');
  IF result->>'error' <> 'invalid_session' THEN RAISE EXCEPTION 'native/TWA photo uploads must be disabled: %', result; END IF;

  IF has_function_privilege('anon', 'public.rpc_app_session_poll(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_app_session_poll(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'native session polling must not be callable by browser roles';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_app_set_student_photo(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_app_set_student_photo(text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'native student photo setter must not be callable by browser roles';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_telegram_connect_start(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_telegram_connect_start(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_telegram_connect_finish(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_telegram_connect_finish(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.rpc_telegram_disconnect(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_telegram_disconnect(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Telegram connect/disconnect entry points must be disabled for browser roles';
  END IF;
  IF has_function_privilege('anon', 'public.rpc_authorize_student_photo_read(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute the authorization RPC directly';
  END IF;
  IF has_function_privilege('authenticated', 'public.rpc_authorize_student_photo_read(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute the authorization RPC directly';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rpc_authorize_student_photo_read(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must be able to execute the authorization RPC';
  END IF;
  result := public.rpc_set_student_photo(
    'web-session-valid', 'student-a',
    'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/student-b/other.jpg'
  );
  IF result->>'error' <> 'invalid_photo_url' THEN
    RAISE EXCEPTION 'student photo setter must reject another student object path: %', result;
  END IF;

  result := public.rpc_set_student_photo(
    'web-session-valid', 'student-a',
    'https://example.supabase.co/storage/v1/object/public/student-photos/school-a/student-a/new.jpg'
  );
  IF result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'student photo setter should accept a path scoped to the same student: %', result;
  END IF;

  result := public.rpc_set_student_photo(
    'web-session-valid', 'student-a',
    'https://example.supabase.co/storage/v1/object/public/student-photos/school-b/student-a/foreign.jpg'
  );
  IF result->>'error' <> 'invalid_photo_url' THEN
    RAISE EXCEPTION 'student photo setter must reject a cross-school object path: %', result;
  END IF;


  RAISE NOTICE 'student-photo authorization runtime assertions passed';
END;
$assertions$;
