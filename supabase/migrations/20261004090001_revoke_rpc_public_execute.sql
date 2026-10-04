-- SCMS v12 security hardening: remove implicit PUBLIC EXECUTE from RPCs.
-- Existing explicit grants remain intact; this removes the default inherited
-- execute path so RPC authorization is controlled by explicit grants + server checks.
DO $$
DECLARE v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'rpc_%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', v_fn.proname, v_fn.args);
  END LOOP;
END $$;
