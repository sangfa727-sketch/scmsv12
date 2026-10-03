-- SCMS v12 Daily Report secure session/permission boundary
-- Feature branch only. Do not apply directly to production.

insert into public.permission_definitions
  (permission_key, category, description, scope_type, is_sensitive, is_active)
values
  ('daily_report.edit','daily','Create or update daily reports for assigned classes','class',true,true),
  ('daily_report.delete','daily','Delete daily reports for assigned classes','class',true,true)
on conflict (permission_key) do update
set category=excluded.category, description=excluded.description, scope_type=excluded.scope_type,
    is_sensitive=excluded.is_sensitive, is_active=excluded.is_active;

insert into public.role_permissions (role, permission_key, allowed)
values
  ('super_admin','daily_report.edit',true), ('super_admin','daily_report.delete',true),
  ('admin','daily_report.edit',true), ('admin','daily_report.delete',true),
  ('teacher','daily_report.edit',true), ('teacher','daily_report.delete',true)
on conflict (role, permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_save_daily_report(
  p_session_token text, p_student_id text, p_name_en text, p_class text, p_date date,
  p_meal text, p_nap_min integer, p_mood text, p_behaviour_note text, p_toilet_ok boolean
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_report_id bigint;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if nullif(trim(p_student_id),'') is null then return jsonb_build_object('ok',false,'error','student_id_required'); end if;
  if p_date is null then return jsonb_build_object('ok',false,'error','date_required'); end if;

  select s.student_id,s.class into v_student from public.students s
   where s.student_id=p_student_id and s.school_id=v_sess.school_id limit 1;
  if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;

  if not private.web_has_permission(p_session_token,'daily_report.edit',v_student.class,null)
    then return jsonb_build_object('ok',false,'error','forbidden'); end if;

  delete from public.daily_reports
   where school_id=v_sess.school_id and student_id=v_student.student_id and date=p_date;

  insert into public.daily_reports
    (date,student_id,name_en,class,meal,nap_min,toilet_ok,mood,behaviour_note,teacher_id,school_id,"timestamp")
  values
    (p_date,v_student.student_id,p_name_en,v_student.class,p_meal,coalesce(p_nap_min,0),
     p_toilet_ok,p_mood,nullif(trim(coalesce(p_behaviour_note,'')),''),v_sess.teacher_id,v_sess.school_id,now())
  returning id into v_report_id;

  insert into public.audit_log(source,actor,action,school_id,payload)
  values ('web',v_sess.teacher_id,'daily_report.save',v_sess.school_id,
          jsonb_build_object('daily_report_id',v_report_id,'student_id',v_student.student_id,'date',p_date));
  return jsonb_build_object('ok',true,'daily_report_id',v_report_id);
exception when others then return jsonb_build_object('ok',false,'error','daily_report_save_failed');
end; $function$;

create or replace function public.rpc_update_daily_report(
  p_session_token text,p_id bigint,p_meal text,p_nap_min integer,p_mood text,
  p_behaviour_note text,p_toilet_ok boolean
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_report record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select d.id,d.student_id,d.class into v_report from public.daily_reports d
   where d.id=p_id and d.school_id=v_sess.school_id limit 1;
  if v_report is null then return jsonb_build_object('ok',false,'error','daily_report_not_found'); end if;

  if not private.web_has_permission(p_session_token,'daily_report.edit',v_report.class,null)
    then return jsonb_build_object('ok',false,'error','forbidden'); end if;

  update public.daily_reports
     set meal=p_meal, nap_min=coalesce(p_nap_min,0), mood=p_mood,
         behaviour_note=nullif(trim(coalesce(p_behaviour_note,'')),''), toilet_ok=p_toilet_ok,
         teacher_id=v_sess.teacher_id
   where id=v_report.id and school_id=v_sess.school_id;

  insert into public.audit_log(source,actor,action,school_id,payload)
  values ('web',v_sess.teacher_id,'daily_report.update',v_sess.school_id,
          jsonb_build_object('daily_report_id',v_report.id,'student_id',v_report.student_id));
  return jsonb_build_object('ok',true,'daily_report_id',v_report.id);
exception when others then return jsonb_build_object('ok',false,'error','daily_report_update_failed');
end; $function$;

create or replace function public.rpc_delete_daily_report(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_report record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select d.id,d.student_id,d.class into v_report from public.daily_reports d
   where d.id=p_id and d.school_id=v_sess.school_id limit 1;
  if v_report is null then return jsonb_build_object('ok',false,'error','daily_report_not_found'); end if;

  if not private.web_has_permission(p_session_token,'daily_report.delete',v_report.class,null)
    then return jsonb_build_object('ok',false,'error','forbidden'); end if;

  delete from public.daily_reports where id=v_report.id and school_id=v_sess.school_id;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values ('web',v_sess.teacher_id,'daily_report.delete',v_sess.school_id,
          jsonb_build_object('daily_report_id',v_report.id,'student_id',v_report.student_id));
  return jsonb_build_object('ok',true);
exception when others then return jsonb_build_object('ok',false,'error','daily_report_delete_failed');
end; $function$;

revoke all on function public.rpc_save_daily_report(text,text,text,text,date,text,integer,text,text,boolean) from public;
revoke all on function public.rpc_update_daily_report(text,bigint,text,integer,text,text,boolean) from public;
revoke all on function public.rpc_delete_daily_report(text,bigint) from public;
grant execute on function public.rpc_save_daily_report(text,text,text,text,date,text,integer,text,text,boolean) to anon,authenticated;
grant execute on function public.rpc_update_daily_report(text,bigint,text,integer,text,text,boolean) to anon,authenticated;
grant execute on function public.rpc_delete_daily_report(text,bigint) to anon,authenticated;
