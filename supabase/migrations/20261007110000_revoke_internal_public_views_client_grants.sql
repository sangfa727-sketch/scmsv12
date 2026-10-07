-- Security hardening: remove browser-role access to internal/non-RPC views.
-- SCMS browser clients must use session-bound RPC contracts for business data.
DO $$
DECLARE v_object text;
BEGIN
  FOREACH v_object IN ARRAY ARRAY[
    'v_students_full',
    'v_today_attendance',
    'pg_all_foreign_keys',
    'tap_funky'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_object);
  END LOOP;
END $$;
