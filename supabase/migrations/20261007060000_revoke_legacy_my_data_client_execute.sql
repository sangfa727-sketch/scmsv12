-- Security hardening: the legacy 3-argument rpc_get_my_data overload is no longer a browser API.
-- The 2-argument replacement is already the scoped contract. Keep the legacy
-- overload unavailable to anon/authenticated so it cannot bypass class scope.
REVOKE EXECUTE ON FUNCTION public.rpc_get_my_data(text, text, integer) FROM PUBLIC, anon, authenticated;