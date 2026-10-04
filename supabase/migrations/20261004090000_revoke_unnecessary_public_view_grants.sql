-- #86: Remove unnecessary Data API access from internal/public views.
-- Production-safe intent: revoke only anon/authenticated privileges.
-- Owners/service_role are intentionally untouched.

REVOKE ALL PRIVILEGES ON TABLE public.v_students_full FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.v_today_attendance FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.pg_all_foreign_keys FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.tap_funky FROM anon, authenticated;
