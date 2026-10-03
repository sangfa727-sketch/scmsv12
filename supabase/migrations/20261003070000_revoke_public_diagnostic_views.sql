-- Remove public exposure from diagnostic/test-only views that are not part of the SCMS application surface.
REVOKE ALL ON TABLE public.pg_all_foreign_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tap_funky FROM PUBLIC, anon, authenticated;
