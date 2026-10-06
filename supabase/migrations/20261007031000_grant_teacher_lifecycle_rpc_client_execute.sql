-- Keep teacher lifecycle RPCs callable by the browser client roles.
-- Authorization remains enforced inside the SECURITY DEFINER functions.
GRANT EXECUTE ON FUNCTION public.rpc_admin_deactivate_teacher(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_reactivate_teacher(text, text) TO anon, authenticated;
