-- SCMS v12: bind AI actions to canonical server-side permissions.
-- SANDBOX ONLY. Production Core remains locked until CI Green + verification + explicit merge approval.
--
-- Only mappings proven by existing RPC permission enforcement are populated here.
-- Unmapped 117-catalog actions remain fail-closed until their RPC authority is audited.

alter table private.ai_action_execution_registry
  add column if not exists permission_key text;

alter table private.ai_action_execution_registry
  add column if not exists scope_type text;

alter table private.ai_action_execution_registry
  add column if not exists classification text;

alter table private.ai_action_execution_registry
  add constraint ai_action_execution_registry_classification_ck
  check (classification is null or classification in ('sensitive_read','sensitive_financial_read','health_mutation','qr_regeneration','multi_action_denied'));

alter table private.ai_action_execution_registry
  add constraint ai_action_execution_registry_scope_ck
  check (scope_type is null or scope_type in ('global','class','subject','class_subject'));

update private.ai_action_execution_registry
set permission_key = v.permission_key,
    scope_type = pd.scope_type
from (
  values
    ('get_students','students.view'),
    ('update_student','students.edit'),
    ('activate_student','students.edit'),
    ('add_health_visit','students.edit'),
    ('add_vaccination','students.edit'),
    ('assign_student_transport','students.edit'),
    ('deactivate_student','students.edit'),
    ('delete_student','students.edit'),
    ('get_health_profile','students.view'),
    ('get_student_by_id','students.view'),
    ('get_student_checkouts','students.view'),
    ('get_student_history','students.view'),
    ('get_student_transport','students.view'),
    ('reactivate_student','students.edit'),
    ('remove_student_transport','students.edit'),
    ('update_student_parent','students.edit'),
    ('upsert_health_profile','students.edit'),
    ('get_or_create_student_qr','students.view'),
    ('regenerate_student_qr','students.edit'),
    ('set_student_photo','students.edit'),
    ('delete_health_visit','students.edit'),
    ('delete_vaccination','students.edit'),
    ('create_assessment','assessment.create'),
    ('delete_assessment','assessment.delete'),
    ('get_assessments','assessment.view'),
    ('save_grades','assessment.edit'),
    ('get_grades','assessment.view'),
    ('save_homework','homework.create'),
    ('update_homework','homework.edit'),
    ('delete_homework','homework.delete'),
    ('get_homework','homework.view'),
    ('decide_leave_request','leave.approve'),
    ('save_attendance','attendance.edit'),
    ('get_leave_requests','leave.view'),
    ('get_attendance','attendance.view'),
    ('convert_admission_to_student','admissions.manage'),
    ('create_admission','admissions.manage'),
    ('delete_admission','admissions.manage'),
    ('get_admission_detail','admissions.view'),
    ('get_admissions','admissions.view'),
    ('link_admission_invoice','admissions.manage'),
    ('set_admission_photo','admissions.manage'),
    ('update_admission_status','admissions.manage'),
    ('update_admission','admissions.manage'),
    ('save_daily_report','daily_report.edit'),
    ('update_daily_report','daily_report.edit'),
    ('delete_daily_report','daily_report.delete')
) as v(action,permission_key)
join public.permission_definitions pd
  on pd.permission_key = v.permission_key
 and pd.is_active = true
where private.ai_action_execution_registry.action = v.action;

update private.ai_action_execution_registry
set risk = case action
  when 'add_health_visit' then 'high'
  when 'add_vaccination' then 'high'
  when 'upsert_health_profile' then 'high'
  when 'regenerate_student_qr' then 'high'
  when 'get_health_profile' then 'high'
  when 'get_grades' then 'high'
  when 'get_invoice_detail' then 'high'
  when 'get_invoices' then 'high'
  when 'get_report_card' then 'high'
  when 'manage_teacher_access' then 'high'
  else risk
end,
    confirmation_required = case action
  when 'add_health_visit' then true
  when 'add_vaccination' then true
  when 'upsert_health_profile' then true
  when 'regenerate_student_qr' then true
  when 'get_health_profile' then true
  when 'get_grades' then true
  when 'get_invoice_detail' then true
  when 'get_invoices' then true
  when 'get_report_card' then true
  when 'manage_teacher_access' then true
  else confirmation_required
end
where action in (
  'add_health_visit','add_vaccination','upsert_health_profile','regenerate_student_qr',
  'get_health_profile','get_grades','get_invoice_detail','get_invoices','get_report_card',
  'manage_teacher_access'
);

update private.ai_action_execution_registry
set classification = case action
  when 'add_health_visit' then 'health_mutation'
  when 'add_vaccination' then 'health_mutation'
  when 'upsert_health_profile' then 'health_mutation'
  when 'regenerate_student_qr' then 'qr_regeneration'
  when 'get_health_profile' then 'sensitive_read'
  when 'get_grades' then 'sensitive_read'
  when 'get_invoice_detail' then 'sensitive_financial_read'
  when 'get_invoices' then 'sensitive_financial_read'
  when 'get_report_card' then 'sensitive_read'
  when 'manage_teacher_access' then 'multi_action_denied'
  else classification
end
where action in (
  'add_health_visit','add_vaccination','upsert_health_profile','regenerate_student_qr',
  'get_health_profile','get_grades','get_invoice_detail','get_invoices','get_report_card',
  'manage_teacher_access'
);

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
begin
  if nullif(trim(p_session_token),'') is null
     or nullif(trim(p_action),'') is null
     or nullif(trim(p_rpc),'') is null
     or nullif(trim(p_permission_key),'') is null then
    return jsonb_build_object('ok',false,'error','invalid_execution_contract');
  end if;

  select s.session_id,s.teacher_id,s.school_id,s.role
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
    return jsonb_build_object(
      'ok',false,
      'error','multi_action_denied',
      'message','This multi-action control cannot be exposed as a single AI business action.'
    );
  end if;

  if v_contract.permission_key is null
     or v_contract.scope_type is null then
    return jsonb_build_object(
      'ok',false,
      'error','action_permission_unmapped',
      'message','This AI action has no proven server-side permission mapping and is fail-closed.'
    );
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

  if v_permission is null
     or v_permission.scope_type <> v_contract.scope_type then
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

  if v_contract.confirmation_required
     and p_confirmed is not true then
    return jsonb_build_object('ok',false,'error','confirmation_required','risk',v_contract.risk);
  end if;

  if not private.web_has_permission(
    p_session_token,
    v_contract.permission_key,
    nullif(trim(p_class_name),''),
    p_subject_id
  ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  return jsonb_build_object(
    'ok',true,'authorized',true,
    'action',v_contract.action,'rpc',v_contract.rpc,'risk',v_contract.risk,
    'permission_key',v_contract.permission_key,'scope_type',v_contract.scope_type,
    'classification',v_contract.classification,
    'confirmation_required',v_contract.confirmation_required,
    'session_id',v_sess.session_id,'teacher_id',v_sess.teacher_id,'school_id',v_sess.school_id
  );
exception
  when others then
    return jsonb_build_object('ok',false,'error','execution_authorization_failed');
end;
$function$;

revoke all on table private.ai_action_execution_registry from public,anon,authenticated;
revoke all on function public.rpc_ai_execution_authorize(text,text,text,text,text,bigint,boolean) from public,anon,authenticated;
grant execute on function public.rpc_ai_execution_authorize(text,text,text,text,text,bigint,boolean) to anon,authenticated;
