-- SCMS v12 AI execution audit/idempotency contract (SANDBOX)
-- Extends the existing audit_log without changing Production Core.

alter table public.audit_log
  add column if not exists correlation_id uuid,
  add column if not exists idempotency_key text;

create index if not exists audit_log_correlation_id_idx
  on public.audit_log (correlation_id)
  where correlation_id is not null;

create unique index if not exists audit_log_idempotency_key_uq
  on public.audit_log (idempotency_key)
  where idempotency_key is not null;

create table if not exists private.ai_execution_idempotency (
  idempotency_key text primary key,
  correlation_id uuid not null,
  session_id text not null,
  school_id text not null,
  teacher_id text not null,
  action text not null,
  resolved_rpc text not null,
  action_digest text not null,
  status text not null check (status in ('reserved','completed','failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table private.ai_execution_idempotency enable row level security;
revoke all on private.ai_execution_idempotency from public,anon,authenticated;

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
begin
  if nullif(trim(p_session_token),'') is null
     or nullif(trim(p_idempotency_key),'') is null
     or p_correlation_id is null
     or nullif(trim(p_action),'') is null
     or nullif(trim(p_resolved_rpc),'') is null
     or nullif(trim(p_action_digest),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_idempotency_contract');
  end if;

  select s.session_id,s.teacher_id,s.school_id
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

  select * into v_existing
    from private.ai_execution_idempotency
   where idempotency_key=p_idempotency_key
   for update;

  if v_existing is not null then
    if v_existing.session_id <> v_sess.session_id
       or v_existing.school_id <> v_sess.school_id
       or v_existing.teacher_id <> v_sess.teacher_id
       or v_existing.action <> p_action
       or v_existing.resolved_rpc <> p_resolved_rpc
       or v_existing.action_digest <> p_action_digest then
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
    trim(p_idempotency_key),p_correlation_id,v_sess.session_id,v_sess.school_id,
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

revoke all on function public.rpc_ai_execution_reserve(text,text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_reserve(text,text,uuid,text,text,text) to anon,authenticated;

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
begin
  select s.session_id,s.teacher_id,s.school_id into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now()
     and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  update private.ai_execution_idempotency
     set status=case when p_success then 'completed' else 'failed' end,
         result=p_result, completed_at=now()
   where idempotency_key=p_idempotency_key
     and session_id=v_sess.session_id
     and school_id=v_sess.school_id
     and teacher_id=v_sess.teacher_id
   returning * into v_row;

  if v_row is null then return jsonb_build_object('ok',false,'error','idempotency_not_found'); end if;

  return jsonb_build_object('ok',true,'status',v_row.status,
    'correlation_id',v_row.correlation_id,'idempotency_key',v_row.idempotency_key);
exception when others then
  return jsonb_build_object('ok',false,'error','idempotency_complete_failed');
end;
$function$;

revoke all on function public.rpc_ai_execution_complete(text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_complete(text,text,jsonb,boolean) to anon,authenticated;
