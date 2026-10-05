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
  -- Explicit authorization contract. Do not infer permissions from table names.
  if p_table = 'students'
     and not private.web_has_permission(p_session_token, 'students.view') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_table = 'attendance'
     and not private.web_has_permission(p_session_token, 'attendance.view') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_table = 'homework_log'
     and not private.web_has_permission(p_session_token, 'homework.view') then
    return jsonb_build_object('ok', false, 'error', 'permission_denied');
  end if;

  if p_table in (
    'daily_reports','incidents','parent_comms','timetable','subjects','terms'
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
    v_marker || E'\\n' || v_gate
  );

  execute v_def;
end
$migration$;

revoke all on function public.rpc_get_my_data(text,text,integer) from public;
grant execute on function public.rpc_get_my_data(text,text,integer) to anon, authenticated;
