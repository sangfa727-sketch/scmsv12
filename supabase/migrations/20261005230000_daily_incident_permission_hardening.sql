-- SCMS v12 — Daily Reports / Incidents authorization hardening
insert into public.permission_definitions(permission_key,category,scope_type,is_active)
values
 ('daily_report.view','daily','class',true),
 ('incident.view','incident','class',true),
 ('incident.create','incident','class',true),
 ('incident.edit','incident','class',true),
 ('incident.delete','incident','class',true)
on conflict(permission_key) do update set scope_type=excluded.scope_type,is_active=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values ('teacher'),('assistant_teacher'),('senior_teacher'),('school_coordinator'),('administrative_assistant'),('admin'),('super_admin')) r(role)
cross join (values ('daily_report.view'),('incident.view'),('incident.create'),('incident.edit')) p(permission_key)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,'incident.delete',true from (values ('admin'),('super_admin')) r(role)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_get_daily_reports(p_session_token text,p_days_back integer default 7)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_sess record; v_rows jsonb; v_days integer;
begin
 select s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 v_days:=least(greatest(coalesce(p_days_back,7),0),365);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc,x.name_en),'[]'::jsonb) into v_rows
 from (select * from public.daily_reports where school_id=v_sess.school_id and date>=current_date-(v_days||' days')::interval
       and private.web_has_permission(p_session_token,'daily_report.view',nullif(trim(class),''),null)) x;
 return jsonb_build_object('ok',true,'rows',v_rows);
end;$f$;

create or replace function public.rpc_get_incidents(p_session_token text,p_days_back integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_sess record; v_rows jsonb; v_days integer;
begin
 select s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 v_days:=least(greatest(coalesce(p_days_back,30),0),365);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows
 from (select * from public.incidents where school_id=v_sess.school_id and date>=current_date-(v_days||' days')::interval
       and private.web_has_permission(p_session_token,'incident.view',nullif(trim(class),''),null)) x;
 return jsonb_build_object('ok',true,'rows',v_rows);
end;$f$;

create or replace function public.rpc_save_incident(p_session_token text,p_student_id text,p_name_en text,p_class text,p_type text,p_severity text,p_description text,p_action_taken text,p_parent_notified boolean,p_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_sess record; v_student record; v_row record; v_class text;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select student_id,class into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
 if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;
 v_class:=coalesce(nullif(trim(v_student.class),''),nullif(trim(p_class),''));
 if not private.web_has_permission(p_session_token,'incident.create',v_class,null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 insert into public.incidents(date,student_id,name_en,class,type,severity,description,action_taken,parent_notified,teacher_id,school_id,"timestamp")
 values(coalesce(p_date,current_date),p_student_id,p_name_en,v_student.class,coalesce(p_type,'Other'),coalesce(p_severity,'Info'),p_description,p_action_taken,coalesce(p_parent_notified,false),v_sess.teacher_id,v_sess.school_id,now())
 returning * into v_row;
 return jsonb_build_object('ok',true,'incident',to_jsonb(v_row));
end;$f$;

create or replace function public.rpc_update_incident(p_session_token text,p_id bigint,p_type text,p_severity text,p_description text,p_action_taken text,p_parent_notified boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_sess record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_row from public.incidents where id=p_id and school_id=v_sess.school_id limit 1;
 if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'incident.edit',nullif(trim(v_row.class),''),null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 update public.incidents set type=coalesce(p_type,type),severity=coalesce(p_severity,severity),description=p_description,action_taken=p_action_taken,parent_notified=coalesce(p_parent_notified,parent_notified)
 where id=p_id and school_id=v_sess.school_id returning * into v_row;
 return jsonb_build_object('ok',true,'incident',to_jsonb(v_row));
end;$f$;

create or replace function public.rpc_delete_incident(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_sess record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_row from public.incidents where id=p_id and school_id=v_sess.school_id limit 1;
 if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'incident.delete',nullif(trim(v_row.class),''),null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 delete from public.incidents where id=p_id and school_id=v_sess.school_id;
 return jsonb_build_object('ok',true);
end;$f$;

-- Explicit RPC execution boundary. Keep these privileged functions callable only
-- through the session-token contract exposed to the web client.
revoke execute on function public.rpc_get_daily_reports(text,integer) from public,anon,authenticated;
revoke execute on function public.rpc_get_incidents(text,integer) from public,anon,authenticated;
revoke execute on function public.rpc_save_incident(text,text,text,text,text,text,text,text,boolean,date) from public,anon,authenticated;
revoke execute on function public.rpc_update_incident(text,bigint,text,text,text,text,boolean) from public,anon,authenticated;
revoke execute on function public.rpc_delete_incident(text,bigint) from public,anon,authenticated;

grant execute on function public.rpc_get_daily_reports(text,integer) to anon,authenticated;
grant execute on function public.rpc_get_incidents(text,integer) to anon,authenticated;
grant execute on function public.rpc_save_incident(text,text,text,text,text,text,text,text,boolean,date) to anon,authenticated;
grant execute on function public.rpc_update_incident(text,bigint,text,text,text,text,boolean) to anon,authenticated;
grant execute on function public.rpc_delete_incident(text,bigint) to anon,authenticated;
