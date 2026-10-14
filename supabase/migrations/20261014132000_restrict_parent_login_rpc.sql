-- The parent login RPC must only be called by the trusted Edge Function.
-- Direct browser-role execution would bypass Google ID-token verification in that function.
BEGIN;

REVOKE EXECUTE ON FUNCTION public.rpc_parent_google_login(text, text, text)
FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_parent_google_login(text, text, text)
TO service_role;

COMMIT;
