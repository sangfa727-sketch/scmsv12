-- Harden legacy generic data RPC with explicit table-to-permission allowlisting.
-- Tables without a dedicated permission are intentionally fail-closed.
do $migration$
declare
  v_def text;
  v_marker text := $marker$
  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;
$marker$;
  v_gate text := $gate$
  -- Only the global students permission can safely authorize this scope-less RPC.
  if p_table = 'students'
     and not private.web_has_permission(p_session_token, 'students.view') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  -- Scoped permissions cannot safely authorize this school-wide legacy RPC
  -- because it has no class/subject scope arguments. Fail closed.
  if p_table in (
    'attendance','homework_log','daily_reports','incidents',
    'parent_comms','timetable','subjects','terms'
  ) then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

$gate$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'rpc_get_my_data'
     and p.proargtypes = '25 25 23'::oidvector
   limit 1;

  if v_def is null then
    raise exception 'rpc_get_my_data signature not found';
  end if;

  if position(v_marker in v_def) = 0 then
    raise exception 'rpc_get_my_data authorization marker not found; refusing unsafe rewrite';
  end if;

  v_def := replace(
    v_def,
    v_marker,
    v_marker || E'\n' || v_gate
  );

  execute v_def;
end
$migration$;

revoke all on function public.rpc_get_my_data(text,text,integer) from public;
grant execute on function public.rpc_get_my_data(text,text,integer) to anon, authenticated;
