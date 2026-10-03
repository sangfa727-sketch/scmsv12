-- Remove redundant PUBLIC execution from admin management RPCs.
-- The application already grants anon/authenticated explicitly; PUBLIC adds no needed capability.
-- Keeping the explicit role grants preserves existing client callers while reducing broad exposure.
revoke execute on function public.rpc_admin_create_invite(text,text,text) from public;
revoke execute on function public.rpc_admin_create_teacher(text,text,text,text,text,text) from public;
revoke execute on function public.rpc_admin_list_invites(text) from public;
