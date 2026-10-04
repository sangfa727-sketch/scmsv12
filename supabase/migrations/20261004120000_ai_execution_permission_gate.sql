-- SCMS v12 AI execution permission gate
-- SANDBOX ONLY. Production Core remains locked until CI Green + verification + explicit merge approval.

create schema if not exists private;

create table if not exists private.ai_action_execution_registry (
  action text primary key,
  rpc text not null unique,
  risk text not null check (risk in ('read','medium','high','very_high','critical')),
  confirmation_required boolean not null,
  active boolean not null default true,
  check (action <> ''),
  check (rpc ~ '^rpc_[a-z0-9_]+$')
);

insert into private.ai_action_execution_registry(action,rpc,risk,confirmation_required) values
('activate_student','rpc_activate_student','medium',true),
('add_book','rpc_add_book','medium',true),
('add_fee_item','rpc_add_fee_item','medium',true),
('add_health_visit','rpc_add_health_visit','high',true),
('add_route','rpc_add_route','medium',true),
('add_subject','rpc_add_subject','medium',true),
('add_term','rpc_add_term','medium',true),
('add_vaccination','rpc_add_vaccination','high',true),
('admin_create_invite','rpc_admin_create_invite','high',true),
('admin_create_teacher','rpc_admin_create_teacher','high',true),
('admin_create_teacher_card','rpc_admin_create_teacher_card','high',true),
('admin_create_teacher_v2','rpc_admin_create_teacher_v2','high',true),
('admin_list_invites','rpc_admin_list_invites','high',true),
('admin_list_teachers','rpc_admin_list_teachers','high',true),
('admin_reset_teacher_password','rpc_admin_reset_teacher_password','high',true),
('admin_revoke_teacher_card','rpc_admin_revoke_teacher_card','high',true),
('admin_set_teacher_login_name','rpc_admin_set_teacher_login_name','high',true),
('admin_update_teacher_profile','rpc_admin_update_teacher_profile','high',true),
('assign_student_transport','rpc_assign_student_transport','medium',true),
('checkout_book','rpc_checkout_book','medium',true),
('convert_admission_to_student','rpc_convert_admission_to_student','medium',true),
('create_admission','rpc_create_admission','medium',true),
('create_assessment','rpc_create_assessment','medium',true),
('create_invoice','rpc_create_invoice','high',true),
('deactivate_student','rpc_deactivate_student','high',true),
('decide_leave_request','rpc_decide_leave_request','high',true),
('delete_admission','rpc_delete_admission','high',true),
('delete_assessment','rpc_delete_assessment','high',true),
('delete_book','rpc_delete_book','high',true),
('delete_fee_item','rpc_delete_fee_item','high',true),
('delete_health_visit','rpc_delete_health_visit','high',true),
('delete_homework','rpc_delete_homework','high',true),
('delete_incident','rpc_delete_incident','high',true),
('delete_invoice','rpc_delete_invoice','high',true),
('delete_parent_comm','rpc_delete_parent_comm','high',true),
('delete_payment','rpc_delete_payment','high',true),
('delete_route','rpc_delete_route','high',true),
('delete_student','rpc_delete_student','high',true),
('delete_timetable','rpc_delete_timetable','high',true),
('delete_vaccination','rpc_delete_vaccination','high',true),
('get_admission_detail','rpc_get_admission_detail','read',false),
('get_admissions','rpc_get_admissions','read',false),
('get_assessments','rpc_get_assessments','read',false),
('get_attendance','rpc_get_attendance','read',false),
('get_attendance_audit','rpc_get_attendance_audit','read',false),
('get_billing_summary','rpc_get_billing_summary','read',false),
('get_book_checkouts','rpc_get_book_checkouts','medium',true),
('get_books','rpc_get_books','read',false),
('get_daily_reports','rpc_get_daily_reports','read',false),
('get_fee_items','rpc_get_fee_items','read',false),
('get_grades','rpc_get_grades','high',true),
('get_health_profile','rpc_get_health_profile','high',true),
('get_homework','rpc_get_homework','read',false),
('get_incidents','rpc_get_incidents','read',false),
('get_invoice_detail','rpc_get_invoice_detail','high',true),
('get_invoices','rpc_get_invoices','high',true),
('get_leave_requests','rpc_get_leave_requests','read',false),
('get_monthly_summary','rpc_get_monthly_summary','read',false),
('get_my_data','rpc_get_my_data','read',false),
('get_or_create_student_qr','rpc_get_or_create_student_qr','high',true),
('get_parent_comms','rpc_get_parent_comms','read',false),
('get_report_card','rpc_get_report_card','high',true),
('get_route_detail','rpc_get_route_detail','read',false),
('get_routes','rpc_get_routes','read',false),
('get_student_by_id','rpc_get_student_by_id','read',false),
('get_student_checkouts','rpc_get_student_checkouts','medium',true),
('get_student_history','rpc_get_student_history','read',false),
('get_student_transport','rpc_get_student_transport','read',false),
('get_students','rpc_get_students','read',false),
('get_subjects','rpc_get_subjects','read',false),
('get_terms','rpc_get_terms','read',false),
('get_timetable','rpc_get_timetable','read',false),
('link_admission_invoice','rpc_link_admission_invoice','high',true),
('manage_teacher_access','rpc_manage_teacher_access','high',true),
('parent_get_dashboard','rpc_parent_get_dashboard','read',false),
('parent_portal_event_create','rpc_parent_portal_event_create','medium',true),
('parent_portal_event_delete','rpc_parent_portal_event_delete','high',true),
('parent_submit_leave_request','rpc_parent_submit_leave_request','read',false),
('reactivate_student','rpc_reactivate_student','high',true),
('record_payment','rpc_record_payment','high',true),
('regenerate_student_qr','rpc_regenerate_student_qr','high',true),
('register_student','rpc_register_student','medium',true),
('remove_student_transport','rpc_remove_student_transport','medium',true),
('return_book','rpc_return_book','medium',true),
('save_attendance','rpc_save_attendance','medium',true),
('save_daily_report','rpc_save_daily_report','medium',true),
('update_daily_report','rpc_update_daily_report','medium',true),
('delete_daily_report','rpc_delete_daily_report','high',true),
('save_grades','rpc_save_grades','high',true),
('save_homework','rpc_save_homework','medium',true),
('save_incident','rpc_save_incident','medium',true),
('save_timetable','rpc_save_timetable','medium',true),
('send_parent_comm','rpc_send_parent_comm','high',true),
('set_admission_photo','rpc_set_admission_photo','medium',true),
('set_my_ui_prefs','rpc_set_my_ui_prefs','medium',true),
('set_school_branding','rpc_set_school_branding','high',true),
('set_school_cover','rpc_set_school_cover','high',true),
('set_school_logo','rpc_set_school_logo','high',true),
('set_student_photo','rpc_set_student_photo','medium',true),
('set_teacher_photo','rpc_set_teacher_photo','medium',true),
('telegram_connect_finish','rpc_telegram_connect_finish','read',false),
('telegram_connect_start','rpc_telegram_connect_start','read',false),
('telegram_disconnect','rpc_telegram_disconnect','read',false),
('update_admission','rpc_update_admission','medium',true),
('update_admission_status','rpc_update_admission_status','medium',true),
('update_book','rpc_update_book','medium',true),
('update_fee_item','rpc_update_fee_item','medium',true),
('update_homework','rpc_update_homework','medium',true),
('update_incident','rpc_update_incident','medium',true),
('update_route','rpc_update_route','medium',true),
('update_school_config_web','rpc_update_school_config_web','high',true),
('update_student','rpc_update_student','medium',true),
('update_student_parent','rpc_update_student_parent','medium',true),
('update_timetable','rpc_update_timetable','medium',true),
('upsert_health_profile','rpc_upsert_health_profile','high',true),
('web_bootstrap','rpc_web_bootstrap','read',false),
('web_logout','rpc_web_logout','read',false)
on conflict (action) do update
set rpc=excluded.rpc,risk=excluded.risk,confirmation_required=excluded.confirmation_required,active=true;

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

  select action,rpc,risk,confirmation_required
    into v_contract
    from private.ai_action_execution_registry
   where action=p_action
     and rpc=p_rpc
     and active=true
   limit 1;

  if v_contract is null then
    return jsonb_build_object('ok',false,'error','action_not_allowed');
  end if;

  if v_contract.risk in ('high','very_high','critical')
     and p_confirmed is not true then
    return jsonb_build_object('ok',false,'error','confirmation_required','risk',v_contract.risk);
  end if;

  if not private.web_has_permission(
    p_session_token,
    p_permission_key,
    nullif(trim(p_class_name),''),
    p_subject_id
  ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  return jsonb_build_object(
    'ok',true,'authorized',true,
    'action',v_contract.action,'rpc',v_contract.rpc,'risk',v_contract.risk,
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
