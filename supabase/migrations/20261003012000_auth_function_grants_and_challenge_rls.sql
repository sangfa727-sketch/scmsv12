-- Restore explicit client EXECUTE grants after auth function recreation and lock down the QR challenge table.
-- The challenge table is internal to SECURITY DEFINER auth RPCs and must not be directly exposed.

alter table public.teacher_card_login_challenges enable row level security;

revoke all on table public.teacher_card_login_challenges from public, anon, authenticated;
grant all on table public.teacher_card_login_challenges to service_role;

revoke execute on function public.rpc_teacher_login(text, text, text) from public;
revoke execute on function public.rpc_teacher_login(text, text, text) from anon, authenticated, service_role;
grant execute on function public.rpc_teacher_login(text, text, text) to anon, authenticated, service_role;

revoke execute on function public.rpc_teacher_web_login(text, text, text) from public;
revoke execute on function public.rpc_teacher_web_login(text, text, text) from anon, authenticated, service_role;
grant execute on function public.rpc_teacher_web_login(text, text, text) to anon, authenticated, service_role;

revoke execute on function public.rpc_teacher_card_login_start(text) from public;
revoke execute on function public.rpc_teacher_card_login_start(text) from anon, authenticated, service_role;
grant execute on function public.rpc_teacher_card_login_start(text) to anon, authenticated, service_role;
