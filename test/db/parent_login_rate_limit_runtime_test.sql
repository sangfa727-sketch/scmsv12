\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

\i supabase/migrations/20261016100000_parent_login_rate_limit.sql

BEGIN;
DO $$
DECLARE
  v jsonb;
  v_hash text := repeat('a', 64);
BEGIN
  v := public.rpc_parent_login_rate_limit(v_hash, 900, 2);
  IF v->>'allowed' IS DISTINCT FROM 'true' OR (v->>'attempts')::integer <> 1 THEN
    RAISE EXCEPTION 'first request should be allowed: %', v;
  END IF;

  v := public.rpc_parent_login_rate_limit(v_hash, 900, 2);
  IF v->>'allowed' IS DISTINCT FROM 'true' OR (v->>'attempts')::integer <> 2 THEN
    RAISE EXCEPTION 'second request should be allowed: %', v;
  END IF;

  v := public.rpc_parent_login_rate_limit(v_hash, 900, 2);
  IF v->>'allowed' IS DISTINCT FROM 'false' OR (v->>'attempts')::integer <> 3
     OR (v->>'retry_after_seconds')::integer <= 0 THEN
    RAISE EXCEPTION 'third request should be rate limited with retry time: %', v;
  END IF;

  UPDATE private.parent_login_rate_limits
     SET window_started_at = now() - interval '16 minutes',
         updated_at = now()
   WHERE key_hash = v_hash;

  v := public.rpc_parent_login_rate_limit(v_hash, 900, 2);
  IF v->>'allowed' IS DISTINCT FROM 'true' OR (v->>'attempts')::integer <> 1 THEN
    RAISE EXCEPTION 'expired window should reset: %', v;
  END IF;

  IF has_table_privilege('anon', 'private.parent_login_rate_limits', 'SELECT')
     OR has_table_privilege('authenticated', 'private.parent_login_rate_limits', 'INSERT') THEN
    RAISE EXCEPTION 'browser roles must not access the rate-limit table directly';
  END IF;

  IF has_function_privilege('anon', 'public.rpc_parent_login_rate_limit(text,integer,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.rpc_parent_login_rate_limit(text,integer,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.rpc_parent_login_rate_limit(text,integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rate-limit RPC grants are incorrect';
  END IF;

  BEGIN
    PERFORM public.rpc_parent_login_rate_limit('not-a-hash', 900, 5);
    RAISE EXCEPTION 'invalid key hash should be rejected';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END $$;

ROLLBACK;
