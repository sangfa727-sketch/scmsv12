-- Harden rpc_manage_teacher_access with action-specific granular permission gates.
-- Preserve the existing RPC contract and implementation; only add authorization
-- checks before any catalog/list/mutation branch executes.
do $migration$
declare
  v_def text;
  v_marker text := $marker$
  if v_admin is null or v_admin.role not in ('admin','super_admin') then
    return jsonb_build_object('ok',false,'error','admin_required');
  end if;
$marker$;
  v_gate text := $gate$
  if p_action = 'catalog'
     and not private.web_has_permission(p_session_token, 'permissions.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if p_action = 'list'
     and not private.web_has_permission(p_session_token, 'teachers.view') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if p_action in ('class_add','class_remove','subject_add','subject_remove')
     and not private.web_has_permission(p_session_token, 'teachers.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if p_action in ('permission_set','permission_remove')
     and not private.web_has_permission(p_session_token, 'permissions.manage') then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

$gate$;
begin
  select pg_get_functiondef(p.oid)
    into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'rpc_manage_teacher_access'
     and p.proargtypes = '25 25 25 25 20 25 25 16 25'::oidvector
   limit 1;

  if v_def is null then
    raise exception 'rpc_manage_teacher_access signature not found';
  end if;

  if position(v_marker in v_def) = 0 then
    raise exception 'rpc_manage_teacher_access authorization marker not found; refusing unsafe rewrite';
  end if;

  v_def := replace(
    v_def,
    v_marker,
    v_marker || E'\\n' || v_gate
  );

  execute v_def;
end
$migration$;

revoke all on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) from public;
grant execute on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) to anon, authenticated;
