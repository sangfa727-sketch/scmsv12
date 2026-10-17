-- Forward-only privilege repair for internal session, audit, and automation tables.
-- Remove browser-role mutation privileges that were granted directly to anon/authenticated.
-- Keep the constrained pending-session INSERT path on app_sessions because its RLS
-- policy is used by the existing bootstrap flow; no browser SELECT/UPDATE/DELETE is granted.
-- Trusted service_role grants are intentionally preserved.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.app_sessions,
  public.audit_log,
  public.n8n_state
FROM PUBLIC, anon, authenticated;

-- app_sessions has a deliberately narrow INSERT RLS policy for pending bootstrap sessions.
-- Keep only that operation available to browser roles; RLS remains responsible for row checks.
GRANT INSERT ON TABLE public.app_sessions TO anon, authenticated;

COMMIT;
