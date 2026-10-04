-- SCMS v12 AI execution runtime fix
-- Aligns AI execution/authorization session identity with the existing app_web_sessions contract.
-- app_web_sessions has no session_id column; canonical session identity is sha256(session_token).

create or replace function public.rpc_ai_execution_authorize(
  p_session_token text,
  p_action text,
  p_rpc text,
  p_permission_key text,
  p_class_name text default null,
  p_subject_id bigint default null,
  p_confirmed boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_sess record;
  v_contract record;
  v_permission record;
  v_session_id text;
begin
  if nullif(trim(p_session_token),'') is null
     or nullif(trim(p_action),'') is null
     or nullif(trim(p_rpc),'') is null
     or nullif(trim(p_permission_key),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_execution_contract');
  end if;

  select s.teacher_id,s.school_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id
     and t.role=s.role
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  v_session_id := encode(digest(p_session_token,'sha256'),'hex');

  if p_action !~ '^[a-z0-9_]+$'
     or p_rpc !~ '^rpc_[a-z0-9_]+$'
     or p_rpc in (
       'rpc_ai_confirmation_create','rpc_ai_confirmation_consume','rpc_ai_confirmation_cancel',
       'rpc_web_session_verify','rpc_teacher_login','rpc_teacher_web_login',
       'rpc_app_login_bind','rpc_app_session_poll','rpc_teacher_card_login_start','rpc_qr_resolve'
     ) then
    return jsonb_build_object('ok',false,'error','internal_or_invalid_rpc');
  end if;

  select action,rpc,risk,confirmation_required,permission_key,scope_type,classification
    into v_contract
    from private.ai_action_execution_registry
   where action=p_action
     and rpc=p_rpc
     and active=true
   limit 1;

  if v_contract is null then
    return jsonb_build_object('ok',false,'error','action_not_allowed');
  end if;

  if v_contract.classification = 'multi_action_denied' then
    return jsonb_build_object('ok',false,'error','multi_action_denied',
      'message','This multi-action control cannot be exposed as a single AI business action.');
  end if;

  if v_contract.permission_key is null or v_contract.scope_type is null then
    return jsonb_build_object('ok',false,'error','action_permission_unmapped',
      'message','This AI action has no proven server-side permission mapping and is fail-closed.');
  end if;

  if p_permission_key <> v_contract.permission_key then
    return jsonb_build_object('ok',false,'error','permission_binding_mismatch');
  end if;

  select permission_key,scope_type,is_active
    into v_permission
    from public.permission_definitions
   where permission_key=v_contract.permission_key
     and is_active=true
   limit 1;

  if v_permission is null or v_permission.scope_type <> v_contract.scope_type then
    return jsonb_build_object('ok',false,'error','permission_contract_invalid');
  end if;

  if v_contract.scope_type='global'
     and (nullif(trim(p_class_name),'') is not null or p_subject_id is not null) then
    return jsonb_build_object('ok',false,'error','scope_input_invalid');
  end if;
  if v_contract.scope_type='class'
     and (nullif(trim(p_class_name),'') is null or p_subject_id is not null) then
    return jsonb_build_object('ok',false,'error','scope_input_invalid');
  end if;
  if v_contract.scope_type='class_subject'
     and (nullif(trim(p_class_name),'') is null or p_subject_id is null) then
    return jsonb_build_object('ok',false,'error','scope_input_invalid');
  end if;
  if v_contract.scope_type='subject' and p_subject_id is null then
    return jsonb_build_object('ok',false,'error','scope_input_invalid');
  end if;

  if v_contract.confirmation_required and p_confirmed is not true then
    return jsonb_build_object('ok',false,'error','confirmation_required','risk',v_contract.risk);
  end if;

  if not private.web_has_permission(
    p_session_token,v_contract.permission_key,
    nullif(trim(p_class_name),''),p_subject_id
  ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  return jsonb_build_object(
    'ok',true,'authorized',true,
    'action',v_contract.action,'rpc',v_contract.rpc,'risk',v_contract.risk,
    'permission_key',v_contract.permission_key,'scope_type',v_contract.scope_type,
    'classification',v_contract.classification,
    'confirmation_required',v_contract.confirmation_required,
    'session_id',v_session_id,'teacher_id',v_sess.teacher_id,'school_id',v_sess.school_id
  );
exception when others then
  return jsonb_build_object('ok',false,'error','execution_authorization_failed');
end;
$function$;

create or replace function public.rpc_ai_execution_reserve(
  p_session_token text,
  p_idempotency_key text,
  p_correlation_id uuid,
  p_action text,
  p_resolved_rpc text,
  p_action_digest text
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_sess record;
  v_existing record;
  v_session_id text;
begin
  if nullif(trim(p_session_token),'') is null
     or nullif(trim(p_idempotency_key),'') is null
     or p_correlation_id is null
     or nullif(trim(p_action),'') is null
     or nullif(trim(p_resolved_rpc),'') is null
     or nullif(trim(p_action_digest),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_contract');
  end if;

  select s.teacher_id,s.school_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token
     and s.expires_at>now() and t.status='active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  v_session_id := encode(digest(p_session_token,'sha256'),'hex');

  select * into v_existing
    from private.ai_execution_idempotency
   where idempotency_key=trim(p_idempotency_key)
   for update;

  if v_existing is not null then
    if v_existing.session_id<>v_session_id
       or v_existing.school_id<>v_sess.school_id
       or v_existing.teacher_id<>v_sess.teacher_id
       or v_existing.action<>p_action
       or v_existing.resolved_rpc<>p_resolved_rpc
       or v_existing.action_digest<>p_action_digest then
      return jsonb_build_object('ok',false,'error','idempotency_key_conflict');
    end if;
    return jsonb_build_object(
      'ok',true,'reserved',false,'replayed',true,
      'idempotency_key',v_existing.idempotency_key,
      'correlation_id',v_existing.correlation_id,
      'status',v_existing.status,'result',v_existing.result
    );
  end if;

  insert into private.ai_execution_idempotency(
    idempotency_key,correlation_id,session_id,school_id,teacher_id,
    action,resolved_rpc,action_digest,status
  ) values (
    trim(p_idempotency_key),p_correlation_id,v_session_id,v_sess.school_id,
    v_sess.teacher_id,p_action,p_resolved_rpc,p_action_digest,'reserved'
  );

  return jsonb_build_object(
    'ok',true,'reserved',true,'replayed',false,
    'idempotency_key',trim(p_idempotency_key),
    'correlation_id',p_correlation_id,'status','reserved'
  );
exception
  when unique_violation then
    return jsonb_build_object('ok',false,'error','idempotency_race');
  when others then
    return jsonb_build_object('ok',false,'error','idempotency_reserve_failed');
end;
$function$;

create or replace function public.rpc_ai_execution_complete(
  p_session_token text,
  p_idempotency_key text,
  p_result jsonb,
  p_success boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_sess record;
  v_row record;
  v_status text;
  v_session_id text;
begin
  if nullif(trim(p_session_token),'') is null
     or nullif(trim(p_idempotency_key),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_contract');
  end if;

  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now()
     and t.status='active' limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  v_session_id := encode(digest(p_session_token,'sha256'),'hex');

  select * into v_row
    from private.ai_execution_idempotency
   where idempotency_key=trim(p_idempotency_key)
     and session_id=v_session_id
     and school_id=v_sess.school_id
     and teacher_id=v_sess.teacher_id
   for update;

  if v_row is null then
    return jsonb_build_object('ok',false,'error','idempotency_not_found');
  end if;

  if v_row.status<>'reserved' then
    return jsonb_build_object(
      'ok',true,'replayed',true,'status',v_row.status,
      'correlation_id',v_row.correlation_id,
      'idempotency_key',v_row.idempotency_key,'result',v_row.result
    );
  end if;

  v_status:=case when p_success then 'completed' else 'failed' end;

  update private.ai_execution_idempotency
     set status=v_status,result=p_result,completed_at=now()
   where idempotency_key=v_row.idempotency_key;

  insert into public.audit_log(
    source,actor,action,school_id,payload,correlation_id,idempotency_key
  ) values(
    'ai',v_sess.teacher_id,'ai.execution.'||v_status,v_sess.school_id,
    jsonb_build_object(
      'session_id',v_session_id,
      'action',v_row.action,
      'resolved_rpc',v_row.resolved_rpc,
      'action_digest',v_row.action_digest,
      'status',v_status,
      'result',coalesce(p_result,'null'::jsonb)
    ),
    v_row.correlation_id,v_row.idempotency_key
  );

  return jsonb_build_object(
    'ok',true,'replayed',false,'status',v_status,
    'correlation_id',v_row.correlation_id,'idempotency_key',v_row.idempotency_key
  );
exception when others then
  return jsonb_build_object('ok',false,'error','idempotency_complete_failed');
end;
$function$;

revoke all on function public.rpc_ai_execution_authorize(text,text,text,text,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_authorize(text,text,text,text,text,bigint,boolean) to anon,authenticated;
revoke all on function public.rpc_ai_execution_reserve(text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_reserve(text,text,uuid,text,text,text) to anon,authenticated;
revoke all on function public.rpc_ai_execution_complete(text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_complete(text,text,jsonb,boolean) to anon,authenticated;
