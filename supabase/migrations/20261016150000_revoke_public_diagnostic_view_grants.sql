-- Forward-only repair for diagnostic views confirmed exposed in Production.
-- Revoke client discovery/access without changing application data or extension schemas.
-- These objects may be absent on some installs, so guard each revoke for portability.
BEGIN;

DO $revoke_diagnostic_views$
BEGIN
  IF to_regclass('public.pg_all_foreign_keys') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.pg_all_foreign_keys FROM PUBLIC, anon, authenticated';
  END IF;

  IF to_regclass('public.tap_funky') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.tap_funky FROM PUBLIC, anon, authenticated';
  END IF;
END
$revoke_diagnostic_views$;

COMMIT;
