-- Defense in depth for internal session, audit, and automation state tables.
-- Access is intended through trusted server-side functions/services, not browser roles.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.app_sessions,
  public.audit_log,
  public.n8n_state
FROM anon, authenticated;

COMMIT;
