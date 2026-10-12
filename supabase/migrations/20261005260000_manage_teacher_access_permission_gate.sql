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
  v_has_catalog_gate boolean;
  v_has_list_gate boolean;
  v_has_assignment_gate boolean;
  v_has_permission_gate boolean;
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

  -- Live deployments can contain these gates even when the migration ledger
  -- is missing the corresponding version. Do not duplicate the gates on replay.
  -- Match each action family to its own permission check in the same
  -- conditional. Independent substring checks can falsely accept a partial
  -- gate set when the same permission key appears in another action's gate.
  v_has_catalog_gate :=
    v_def ~* 'p_action\s*=\s*''catalog''\s+and\s+not\s+private\.web_has_permission\s*\(\s*p_session_token\s*,\s*''permissions\.manage''\s*\)';
  v_has_list_gate :=
    v_def ~* 'p_action\s*=\s*''list''\s+and\s+not\s+private\.web_has_permission\s*\(\s*p_session_token\s*,\s*''teachers\.view''\s*\)';
  v_has_assignment_gate :=
    v_def ~* 'p_action\s+in\s*\(\s*''class_add''\s*,\s*''class_remove''\s*,\s*''subject_add''\s*,\s*''subject_remove''\s*\)\s+and\s+not\s+private\.web_has_permission\s*\(\s*p_session_token\s*,\s*''teachers\.manage''\s*\)';
  v_has_permission_gate :=
    v_def ~* 'p_action\s+in\s*\(\s*''permission_set''\s*,\s*''permission_remove''\s*\)\s+and\s+not\s+private\.web_has_permission\s*\(\s*p_session_token\s*,\s*''permissions\.manage''\s*\)';

  if v_has_catalog_gate and v_has_list_gate and v_has_assignment_gate and v_has_permission_gate then
    -- Already fully hardened: preserve the live definition byte-for-byte.
    null;
  elsif v_has_catalog_gate or v_has_list_gate or v_has_assignment_gate or v_has_permission_gate then
    raise exception 'rpc_manage_teacher_access has partial permission gates; refusing unsafe automatic rewrite';
  else
    if position(v_marker in v_def) = 0 then
      raise exception 'rpc_manage_teacher_access authorization marker not found; refusing unsafe rewrite';
    end if;

    v_def := replace(
      v_def,
      v_marker,
      v_marker || E'\n' || v_gate
    );

    execute v_def;
  end if;
end
$migration$;

revoke all on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) from public;
grant execute on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) to anon, authenticated;
