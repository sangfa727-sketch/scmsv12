-- SCMS v12 regression: remove implicit PUBLIC EXECUTE from RPCs.
-- Keep existing anon/authenticated/service_role grants unchanged; only remove
-- the implicit PUBLIC path. This preserves current application callers while
-- preventing every database role from inheriting EXECUTE automatically.
DO $$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'rpc_%'
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC',
      v_fn.proname,
      v_fn.args
    );
  END LOOP;
END $$;
