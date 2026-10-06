-- Security hardening: remove unnecessary Data API access from internal views.
-- Main-branch rebuild of the previously audited change.
-- Only anon/authenticated privileges are revoked; owner/service_role remain untouched.

REVOKE ALL PRIVILEGES ON TABLE public.v_students_full FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.v_today_attendance FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.pg_all_foreign_keys FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.tap_funky FROM anon, authenticated;
