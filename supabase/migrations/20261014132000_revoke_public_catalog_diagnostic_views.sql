-- Diagnostic catalog views are for trusted operators, not browser-facing roles.
-- This removes only direct SELECT access; service_role and owner privileges remain unchanged.
BEGIN;

REVOKE SELECT ON TABLE public.tap_funky, public.pg_all_foreign_keys
FROM anon, authenticated;

COMMIT;
