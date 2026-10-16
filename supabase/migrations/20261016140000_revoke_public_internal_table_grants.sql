-- Defense-in-depth follow-up: browser roles inherit privileges granted to PUBLIC.
-- Keep internal session, audit, and automation state inaccessible through PUBLIC.
-- Explicit grants to trusted service roles, if any, are not revoked by this migration.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.app_sessions,
  public.audit_log,
  public.n8n_state
FROM PUBLIC;

COMMIT;
