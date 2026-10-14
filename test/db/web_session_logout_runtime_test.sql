-- Disposable PostgreSQL runtime test for exact-token web session revocation.
\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE 'CREATE ROLE anon'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE 'CREATE ROLE authenticated'; END IF;
END
$roles$;

CREATE TABLE public.app_web_sessions (
  session_token text PRIMARY KEY,
  teacher_id text NOT NULL,
  school_id text NOT NULL,
  role text NOT NULL,
  expires_at timestamptz NOT NULL
);

INSERT INTO public.app_web_sessions(session_token, teacher_id, school_id, role, expires_at)
VALUES
  ('session-school-a-secret-token', 'teacher-a', 'school-a', 'admin', now() + interval '1 day'),
  ('session-school-b-secret-token', 'teacher-b', 'school-b', 'admin', now() + interval '1 day');

\ir ../../supabase/migrations/20261014100000_web_session_logout_rpc.sql

DO $test$
DECLARE
  result jsonb;
BEGIN
  result := public.rpc_web_logout('session-school-a-secret-token');
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true
     OR COALESCE((result->>'revoked')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'logout did not confirm revocation: %', result;
  END IF;

  IF EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token = 'session-school-a-secret-token') THEN
    RAISE EXCEPTION 'target session token remains after logout';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_web_sessions WHERE session_token = 'session-school-b-secret-token') THEN
    RAISE EXCEPTION 'logout modified another school session';
  END IF;

  result := public.rpc_web_logout('session-school-a-secret-token');
  IF COALESCE((result->>'ok')::boolean, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'repeated logout must be idempotent: %', result;
  END IF;

  result := public.rpc_web_logout(NULL);
  IF result->>'error' IS DISTINCT FROM 'invalid_session' THEN
    RAISE EXCEPTION 'null session token must fail closed: %', result;
  END IF;

  IF NOT has_function_privilege('anon', 'public.rpc_web_logout(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.rpc_web_logout(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'browser roles must be able to call the token-scoped logout RPC';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
     WHERE p.oid = 'public.rpc_web_logout(text)'::regprocedure
       AND a.grantee = 0
       AND a.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PUBLIC must not retain execute privilege';
  END IF;
END
$test$;

SELECT 'PASS: web logout revokes only the supplied session token and is idempotent' AS result;
