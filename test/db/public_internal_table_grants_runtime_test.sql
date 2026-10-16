-- Isolated regression test for PUBLIC-inherited privileges on internal tables.
\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END
$roles$;

CREATE TABLE public.app_sessions (id bigint PRIMARY KEY);
CREATE TABLE public.audit_log (id bigint PRIMARY KEY);
CREATE TABLE public.n8n_state (id bigint PRIMARY KEY);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.app_sessions, public.audit_log, public.n8n_state TO PUBLIC;

DO $precondition$
BEGIN
  IF NOT has_table_privilege('anon', 'public.app_sessions', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.audit_log', 'INSERT') THEN
    RAISE EXCEPTION 'test setup failed: PUBLIC grants are not inherited by browser roles';
  END IF;
END
$precondition$;

\ir ../../supabase/migrations/20261016140000_revoke_public_internal_table_grants.sql

DO $assert$
DECLARE
  internal_table text;
  browser_role text;
  privilege_name text;
BEGIN
  FOREACH internal_table IN ARRAY ARRAY['app_sessions', 'audit_log', 'n8n_state'] LOOP
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(browser_role, format('public.%I', internal_table), privilege_name) THEN
          RAISE EXCEPTION 'PUBLIC grant still gives % privilege % on public.%', browser_role, privilege_name, internal_table;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$assert$;

-- Idempotency: applying the forward-only revocation again is a no-op.
\ir ../../supabase/migrations/20261016140000_revoke_public_internal_table_grants.sql

SELECT 'PASS: PUBLIC-inherited grants are revoked from internal tables and the migration is repeatable' AS result;
