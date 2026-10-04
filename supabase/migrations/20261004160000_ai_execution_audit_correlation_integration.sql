-- SCMS v12 AI execution audit correlation integration (SANDBOX)
-- Completes the PR #89 idempotency foundation by emitting one immutable
-- execution-lifecycle audit event per idempotency key.
-- Does not modify Production Core or activate AI execution.

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
begin
  if nullif(trim(p_session_token),'') is null
     or nullif(trim(p_idempotency_key),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_contract');
  end if;

  select s.session_id,s.teacher_id,s.school_id
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  -- Lock the execution row so completion/audit is exactly-once per key.
  select *
    into v_row
    from private.ai_execution_idempotency
   where idempotency_key=trim(p_idempotency_key)
     and session_id=v_sess.session_id
     and school_id=v_sess.school_id
     and teacher_id=v_sess.teacher_id
   for update;

  if v_row is null then
    return jsonb_build_object('ok',false,'error','idempotency_not_found');
  end if;

  if v_row.status <> 'reserved' then
    return jsonb_build_object(
      'ok',true,
      'replayed',true,
      'status',v_row.status,
      'correlation_id',v_row.correlation_id,
      'idempotency_key',v_row.idempotency_key,
      'result',v_row.result
    );
  end if;

  v_status := case when p_success then 'completed' else 'failed' end;

  update private.ai_execution_idempotency
     set status=v_status,
         result=p_result,
         completed_at=now()
   where idempotency_key=v_row.idempotency_key;

  -- One audit row represents the complete AI execution lifecycle.
  -- If this insert fails, the transaction rolls back and the execution
  -- cannot be reported as completed/failed without its audit record.
  insert into public.audit_log(
    source, actor, action, school_id, payload, correlation_id, idempotency_key
  )
  values(
    'ai',
    v_sess.teacher_id,
    'ai.execution.' || v_status,
    v_sess.school_id,
    jsonb_build_object(
      'session_id',v_sess.session_id,
      'action',v_row.action,
      'resolved_rpc',v_row.resolved_rpc,
      'action_digest',v_row.action_digest,
      'status',v_status,
      'result',coalesce(p_result,'null'::jsonb)
    ),
    v_row.correlation_id,
    v_row.idempotency_key
  );

  return jsonb_build_object(
    'ok',true,
    'replayed',false,
    'status',v_status,
    'correlation_id',v_row.correlation_id,
    'idempotency_key',v_row.idempotency_key
  );
exception when others then
  return jsonb_build_object('ok',false,'error','idempotency_complete_failed');
end;
$function$;

revoke all on function public.rpc_ai_execution_complete(text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_complete(text,text,jsonb,boolean) to anon,authenticated;
