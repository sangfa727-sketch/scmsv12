-- These two RPCs are intentionally callable by the browser because they
-- authenticate the supplied server-issued web session token themselves.
grant execute on function public.rpc_web_session_verify(text) to anon, authenticated;
grant execute on function public.rpc_change_password(text,text,text) to anon, authenticated;
