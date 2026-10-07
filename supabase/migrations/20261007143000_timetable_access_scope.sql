-- SCMS v12 — Timetable authorization hardening
-- Permission model:
--   timetable.view / timetable.edit are class-scoped.
--   create/update/delete use timetable.edit.
--   teacher-like roles are constrained by assigned class through web_has_permission.
--   admin/super_admin retain school-wide access through the existing permission engine.

insert into public.permission_definitions(permission_key,category,description,scope_type,is_active)
values
 ('timetable.view','academic','View timetable for assigned classes','class',true),
 ('timetable.edit','academic','Create, edit, or delete timetable entries for assigned classes','class',true)
on conflict(permission_key) do update
set category=excluded.category,
    description=excluded.description,
    scope_type=excluded.scope_type,
    is_active=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values
  ('teacher'),('assistant_teacher'),('senior_teacher'),
  ('school_coordinator'),('administrative_assistant'),
  ('admin'),('super_admin')
) r(role)
cross join (values ('timetable.view'),('timetable.edit')) p(permission_key)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_get_timetable(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_rows jsonb;
begin
  select s.school_id into v_sess
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
  limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.day,x.period),'[]'::jsonb)
  into v_rows
  from (
    select * from public.timetable
    where school_id=v_sess.school_id
      and private.web_has_permission(
        p_session_token,'timetable.view',nullif(trim(class),''),null
      )
  ) x;
  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

create or replace function public.rpc_save_timetable(
  p_session_token text,p_day text,p_period integer,p_start_time time,
  p_class text,p_subject text,p_room text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record; v_class text;
begin
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
  limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  v_class:=nullif(trim(p_class),'');
  if v_class is null then return jsonb_build_object('ok',false,'error','class_required'); end if;
  if not private.web_has_permission(p_session_token,'timetable.edit',v_class,null)
    then return jsonb_build_object('ok',false,'error','permission_denied'); end if;

  insert into public.timetable(day,period,start_time,class,subject,room,teacher_id,school_id)
  values(p_day,p_period,p_start_time,v_class,p_subject,p_room,v_sess.teacher_id,v_sess.school_id)
  returning * into v_row;
  return jsonb_build_object('ok',true,'entry',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_update_timetable(
  p_session_token text,p_id bigint,p_day text,p_period integer,p_start_time time,
  p_class text,p_subject text,p_room text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_old record; v_row record; v_new_class text;
begin
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
  limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select * into v_old from public.timetable where id=p_id and school_id=v_sess.school_id limit 1;
  if v_old is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not private.web_has_permission(p_session_token,'timetable.edit',nullif(trim(v_old.class),''),null)
    then return jsonb_build_object('ok',false,'error','permission_denied'); end if;

  v_new_class:=coalesce(nullif(trim(p_class),''),nullif(trim(v_old.class),''));
  if v_new_class is null then return jsonb_build_object('ok',false,'error','class_required'); end if;
  if v_new_class <> nullif(trim(v_old.class),'')
     and not private.web_has_permission(p_session_token,'timetable.edit',v_new_class,null)
    then return jsonb_build_object('ok',false,'error','permission_denied'); end if;

  update public.timetable
     set day=coalesce(p_day,day),period=coalesce(p_period,period),
         start_time=coalesce(p_start_time,start_time),class=v_new_class,
         subject=coalesce(p_subject,subject),room=p_room
   where id=p_id and school_id=v_sess.school_id
  returning * into v_row;
  return jsonb_build_object('ok',true,'entry',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_delete_timetable(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
  select s.teacher_id,s.school_id into v_sess
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
  limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select * into v_row from public.timetable where id=p_id and school_id=v_sess.school_id limit 1;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not private.web_has_permission(p_session_token,'timetable.edit',nullif(trim(v_row.class),''),null)
    then return jsonb_build_object('ok',false,'error','permission_denied'); end if;

  delete from public.timetable where id=p_id and school_id=v_sess.school_id;
  return jsonb_build_object('ok',true);
end;
$function$;

revoke execute on function public.rpc_get_timetable(text) from public,anon,authenticated;
revoke execute on function public.rpc_save_timetable(text,text,integer,time,text,text,text) from public,anon,authenticated;
revoke execute on function public.rpc_update_timetable(text,bigint,text,integer,time,text,text,text) from public,anon,authenticated;
revoke execute on function public.rpc_delete_timetable(text,bigint) from public,anon,authenticated;
grant execute on function public.rpc_get_timetable(text) to anon,authenticated;
grant execute on function public.rpc_save_timetable(text,text,integer,time,text,text,text) to anon,authenticated;
grant execute on function public.rpc_update_timetable(text,bigint,text,integer,time,text,text,text) to anon,authenticated;
grant execute on function public.rpc_delete_timetable(text,bigint) to anon,authenticated;
