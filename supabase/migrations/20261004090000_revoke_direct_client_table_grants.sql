-- SCMS v12 security hardening: remove direct Data API / GraphQL table exposure.
-- Client reads/writes must use the server-side RPC/session contracts.
DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'assessments','attendance','communications','daily_reports','grades',
    'homework','homework_log','incidents','monthly_summary','parent_comms',
    'schools','students','subjects','teachers','terms','timetable'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END $$;
