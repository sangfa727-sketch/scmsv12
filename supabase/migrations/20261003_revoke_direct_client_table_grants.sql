-- SCMS v12 regression: remove direct Data API / GraphQL table exposure from client roles.
-- Frontend access is through session-bound RPCs; these base tables must not be directly
-- readable or writable by anon/authenticated. service_role remains available to backend jobs.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'assessments','attendance','communications','daily_reports','grades',
    'homework','homework_log','incidents','monthly_summary','parent_comms',
    'schools','students','subjects','teachers','terms','timetable'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END $;

-- Diagnostic/internal views must not become a side-channel around the base-table
-- boundary. Keep them backend-only as well.
REVOKE ALL ON TABLE public.pg_all_foreign_keys, public.tap_funky FROM PUBLIC, anon, authenticated;
