-- SCMS v12 — Communications authorization hardening
insert into public.permission_definitions(permission_key,scope_type,is_active)
values ('communication.view','class',true),('communication.send','class',true),('communication.manage','class',true)
on conflict(permission_key) do update set scope_type=excluded.scope_type,is_active=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values ('teacher'),('assistant_teacher'),('senior_teacher'),('school_coordinator'),('administrative_assistant')) r(role)
cross join (values ('communication.view'),('communication.send')) p(permission_key)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values ('admin'),('super_admin')) r(role)
cross join (values ('communication.view'),('communication.send'),('communication.manage')) p(permission_key)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_send_parent_comm(p_session_token text,p_student_id text,p_name_en text,p_class text,p_type text,p_message_preview text,p_date date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $f$
declare v_sess record; v_student record; v_tg text; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 if p_student_id is not null then
   select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
   if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;
   if not private.web_has_permission(p_session_token,'communication.send',nullif(trim(v_student.class),''),null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
   v_tg:=v_student.parent_tg_id;
 else
   if not private.web_has_permission(p_session_token,'communication.send',nullif(trim(p_class),''),null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 end if;
 if p_message_preview is null or trim(p_message_preview)='' then return jsonb_build_object('ok',false,'error','message_required'); end if;
 insert into public.parent_comms(date,student_id,name_en,class,parent_tg_id,type,message_preview,status,teacher_id,school_id,created_at)
 values(coalesce(p_date,current_date),p_student_id,p_name_en,p_class,v_tg,coalesce(p_type,'General'),trim(p_message_preview),'Queued',v_sess.teacher_id,v_sess.school_id,now()) returning * into v_row;
 return jsonb_build_object('ok',true,'comm',to_jsonb(v_row));
end;$f$;

create or replace function public.rpc_get_parent_comms(p_session_token text,p_days_back integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $f$
declare v_sess record; v_rows jsonb;
begin
 select s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 if not private.web_has_permission(p_session_token,'communication.view',null,null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows from (
   select * from public.parent_comms where school_id=v_sess.school_id and date>=current_date-(least(greatest(coalesce(p_days_back,30),0),365)||' days')::interval
 ) x;
 return jsonb_build_object('ok',true,'rows',v_rows);
end;$f$;

create or replace function public.rpc_delete_parent_comm(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $f$
declare v_sess record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_row from public.parent_comms where id=p_id and school_id=v_sess.school_id limit 1;
 if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'communication.manage',nullif(trim(v_row.class),''),null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 delete from public.parent_comms where id=p_id and school_id=v_sess.school_id;
 return jsonb_build_object('ok',true);
end;$f$;

create or replace function public.rpc_parent_portal_event_create(p_session_token text,p_class text,p_student_id text,p_event_type text,p_title text,p_description text,p_starts_at timestamptz,p_ends_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $f$
declare v_sess record; v_student record; v_row record; v_class text;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 v_class:=nullif(trim(p_class),'');
 if p_student_id is not null then
   select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id limit 1;
   if v_student is null then return jsonb_build_object('ok',false,'error','student_scope'); end if;
   v_class:=coalesce(v_class,nullif(trim(v_student.class),''));
 end if;
 if not private.web_has_permission(p_session_token,'communication.send',v_class,null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 if p_title is null or trim(p_title)='' or p_starts_at is null then return jsonb_build_object('ok',false,'error','title_and_start_required'); end if;
 insert into public.parent_portal_events(school_id,class,student_id,event_type,title,description,starts_at,ends_at,is_published,created_by)
 values(v_sess.school_id,v_class,nullif(trim(p_student_id),''),coalesce(nullif(trim(p_event_type),''),'announcement'),trim(p_title),nullif(trim(p_description),''),p_starts_at,p_ends_at,true,v_sess.teacher_id) returning * into v_row;
 return jsonb_build_object('ok',true,'event',to_jsonb(v_row));
end;$f$;

create or replace function public.rpc_parent_portal_event_delete(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $f$
declare v_sess record; v_row record;
begin
 select s.teacher_id,s.school_id into v_sess from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select * into v_row from public.parent_portal_events where id=p_id and school_id=v_sess.school_id limit 1;
 if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
 if not private.web_has_permission(p_session_token,'communication.manage',nullif(trim(v_row.class),''),null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
 delete from public.parent_portal_events where id=p_id and school_id=v_sess.school_id;
 return jsonb_build_object('ok',true,'deleted_id',p_id);
end;$f$;

revoke execute on function public.rpc_send_parent_comm(text,text,text,text,text,text,date) from public;
grant execute on function public.rpc_send_parent_comm(text,text,text,text,text,text,date) to anon,authenticated;
revoke execute on function public.rpc_get_parent_comms(text,integer) from public;
grant execute on function public.rpc_get_parent_comms(text,integer) to anon,authenticated;
revoke execute on function public.rpc_delete_parent_comm(text,bigint) from public;
grant execute on function public.rpc_delete_parent_comm(text,bigint) to anon,authenticated;
revoke execute on function public.rpc_parent_portal_event_create(text,text,text,text,text,text,timestamptz,timestamptz) from public;
grant execute on function public.rpc_parent_portal_event_create(text,text,text,text,text,text,timestamptz,timestamptz) to anon,authenticated;
revoke execute on function public.rpc_parent_portal_event_delete(text,bigint) from public;
grant execute on function public.rpc_parent_portal_event_delete(text,bigint) to anon,authenticated;
