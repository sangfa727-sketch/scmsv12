-- Disposable runtime regression for exposed diagnostic-view grants.
\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END
$roles$;

CREATE TABLE public.diagnostic_view_test_source(id integer PRIMARY KEY);
CREATE OR REPLACE VIEW public.pg_all_foreign_keys AS SELECT id FROM public.diagnostic_view_test_source;
CREATE OR REPLACE VIEW public.tap_funky AS SELECT id FROM public.diagnostic_view_test_source;

GRANT ALL PRIVILEGES ON TABLE public.pg_all_foreign_keys, public.tap_funky
  TO PUBLIC, anon, authenticated, service_role;

DO $assert_precondition$
BEGIN
  IF NOT has_table_privilege('anon', 'public.pg_all_foreign_keys', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.pg_all_foreign_keys', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.tap_funky', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.tap_funky', 'SELECT') THEN
    RAISE EXCEPTION 'test precondition failed: diagnostic views must be exposed before repair';
  END IF;
END
$assert_precondition$;

\ir ../../supabase/migrations/20261016150000_revoke_public_diagnostic_view_grants.sql

DO $assert_revoked$
BEGIN
  IF has_table_privilege('anon', 'public.pg_all_foreign_keys', 'SELECT')
     OR has_table_privilege('authenticated', 'public.pg_all_foreign_keys', 'SELECT')
     OR has_table_privilege('anon', 'public.tap_funky', 'SELECT')
     OR has_table_privilege('authenticated', 'public.tap_funky', 'SELECT') THEN
    RAISE EXCEPTION 'diagnostic views remain accessible to browser roles';
  END IF;

  IF has_table_privilege('service_role', 'public.pg_all_foreign_keys', 'SELECT')
     OR has_table_privilege('service_role', 'public.tap_funky', 'SELECT') THEN
    RAISE EXCEPTION 'explicit trusted service_role access was unexpectedly removed';
  END IF;
END
$assert_revoked$;

-- Re-run to prove idempotence.
\ir ../../supabase/migrations/20261016150000_revoke_public_diagnostic_view_grants.sql
