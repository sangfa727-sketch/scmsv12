-- SCMS v12 security hardening: close legacy SECURITY DEFINER mutation RPCs
-- that accept caller-controlled school/teacher identifiers without a web session.
-- Service-role/internal callers remain able to invoke these functions.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proname IN ('rpc_approve_school','rpc_reject_school','rpc_seed_default_config','rpc_update_school_config','rpc_chat_send','rpc_bootstrap')
        OR p.proname = 'rpc_generate_school_id'
        OR p.proname = 'rpc_save_attendance'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', r.proname, r.args);
  END LOOP;
END $$;
