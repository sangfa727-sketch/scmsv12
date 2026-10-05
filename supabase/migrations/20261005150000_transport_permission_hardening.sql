-- Transport authorization hardening.
-- Dedicated transport permissions with class-scoped student access and
-- school-wide route management. Intentionally staged in GitHub; do not deploy
-- to production automatically.

insert into public.permission_definitions
(permission_key, category, description, scope_type, is_sensitive, display_order)
values
('transport.view','transport','View transport assignments and routes serving authorized classes','class',true,80),
('transport.edit','transport','Create or modify student transport assignments for authorized classes','class',true,81),
('transport.manage','transport','Create, update, and delete school-wide transport routes','global',true,82)
on conflict (permission_key) do update set
  category=excluded.category,
  description=excluded.description,
  scope_type=excluded.scope_type,
  is_sensitive=excluded.is_sensitive,
  display_order=excluded.display_order,
  is_active=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values
  ('teacher'),('assistant_teacher'),('senior_teacher'),
  ('school_coordinator'),('administrative_assistant')
) r(role)
join public.permission_definitions p
  on p.permission_key in ('transport.view','transport.edit')
on conflict (role,permission_key) do update set allowed=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values ('admin'),('super_admin')) r(role)
join public.permission_definitions p
  on p.permission_key in ('transport.view','transport.edit','transport.manage')
on conflict (role,permission_key) do update set allowed=true;

create or replace function public.rpc_get_routes(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.teacher_id,s.school_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
   limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  if v_sess.role in ('admin','super_admin') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'route_name',r.route_name,'driver_name',r.driver_name,
      'driver_phone',r.driver_phone,'vehicle_info',r.vehicle_info,'notes',r.notes,
      'student_count',coalesce(st.n,0)
    ) order by r.route_name),'[]'::jsonb)
      into v_rows
      from public.transport_routes r
      left join (select route_id,count(*) n from public.student_transport group by route_id) st on st.route_id=r.id
     where r.school_id=v_sess.school_id;
  else
    if not exists (
      select 1 from public.students s
       where s.school_id=v_sess.school_id and s.status='Active'
         and private.web_has_permission(p_session_token,'transport.view',nullif(trim(s.class),''),null)
    ) then
      return jsonb_build_object('ok',false,'error','permission_denied');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,'route_name',r.route_name,'driver_name',r.driver_name,
      'driver_phone',r.driver_phone,'vehicle_info',r.vehicle_info,'notes',r.notes,
      'student_count',coalesce(st.n,0)
    ) order by r.route_name),'[]'::jsonb)
      into v_rows
      from public.transport_routes r
      left join (
        select stt.route_id,count(*) n
          from public.student_transport stt
          join public.students s on s.student_id=stt.student_id and s.school_id=stt.school_id
         where stt.school_id=v_sess.school_id
           and s.status='Active'
           and private.web_has_permission(p_session_token,'transport.view',nullif(trim(s.class),''),null)
         group by stt.route_id
      ) st on st.route_id=r.id
     where r.school_id=v_sess.school_id and st.route_id is not null;
  end if;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

create or replace function public.rpc_add_route(
  p_session_token text,p_route_name text,p_driver_name text default null,
  p_driver_phone text default null,p_vehicle_info text default null,p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not private.web_has_permission(p_session_token,'transport.manage',null,null)
     then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if p_route_name is null or trim(p_route_name)='' then return jsonb_build_object('ok',false,'error','route_name_required'); end if;
  insert into public.transport_routes(school_id,route_name,driver_name,driver_phone,vehicle_info,notes)
  values(v_sess.school_id,trim(p_route_name),nullif(trim(p_driver_name),''),nullif(trim(p_driver_phone),''),
         nullif(trim(p_vehicle_info),''),nullif(trim(p_notes),'')) returning * into v_row;
  return jsonb_build_object('ok',true,'route',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_update_route(
  p_session_token text,p_id bigint,p_route_name text default null,p_driver_name text default null,
  p_driver_phone text default null,p_vehicle_info text default null,p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not private.web_has_permission(p_session_token,'transport.manage',null,null)
     then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  update public.transport_routes set
    route_name=coalesce(nullif(trim(p_route_name),''),route_name),
    driver_name=case when p_driver_name is null then driver_name else nullif(trim(p_driver_name),'') end,
    driver_phone=case when p_driver_phone is null then driver_phone else nullif(trim(p_driver_phone),'') end,
    vehicle_info=case when p_vehicle_info is null then vehicle_info else nullif(trim(p_vehicle_info),'') end,
    notes=case when p_notes is null then notes else nullif(trim(p_notes),'') end
   where id=p_id and school_id=v_sess.school_id returning * into v_row;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  return jsonb_build_object('ok',true,'route',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_delete_route(p_session_token text,p_id bigint)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_n int;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not private.web_has_permission(p_session_token,'transport.manage',null,null)
     then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  delete from public.transport_routes where id=p_id and school_id=v_sess.school_id;
  get diagnostics v_n=row_count;
  if v_n=0 then return jsonb_build_object('ok',false,'error','not_found'); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

create or replace function public.rpc_get_route_detail(p_session_token text,p_route_id bigint)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_route record; v_students jsonb;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select * into v_route from public.transport_routes where id=p_route_id and school_id=v_sess.school_id;
  if v_route is null then return jsonb_build_object('ok',false,'error','not_found'); end if;

  if v_sess.role not in ('admin','super_admin') and not exists (
    select 1
      from public.student_transport stt
      join public.students s on s.student_id=stt.student_id and s.school_id=stt.school_id
     where stt.route_id=p_route_id and stt.school_id=v_sess.school_id and s.status='Active'
       and private.web_has_permission(p_session_token,'transport.view',nullif(trim(s.class),''),null)
  ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if v_sess.role in ('admin','super_admin') then
    select coalesce(jsonb_agg(jsonb_build_object(
      'student_id',st.student_id,'name_en',st.name_en,'class',st.class,'photo_url',st.photo_url,
      'pickup_stop',stt.pickup_stop,'pickup_time',stt.pickup_time,'dropoff_time',stt.dropoff_time
    ) order by st.name_en),'[]'::jsonb) into v_students
      from public.student_transport stt join public.students st on st.student_id=stt.student_id and st.school_id=stt.school_id
     where stt.route_id=p_route_id and stt.school_id=v_sess.school_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'student_id',st.student_id,'name_en',st.name_en,'class',st.class,'photo_url',st.photo_url,
      'pickup_stop',stt.pickup_stop,'pickup_time',stt.pickup_time,'dropoff_time',stt.dropoff_time
    ) order by st.name_en),'[]'::jsonb) into v_students
      from public.student_transport stt join public.students st on st.student_id=stt.student_id and st.school_id=stt.school_id
     where stt.route_id=p_route_id and stt.school_id=v_sess.school_id
       and st.status='Active'
       and private.web_has_permission(p_session_token,'transport.view',nullif(trim(st.class),''),null);
  end if;

  return jsonb_build_object('ok',true,'route',to_jsonb(v_route),'students',v_students);
end;
$function$;

create or replace function public.rpc_assign_student_transport(
  p_session_token text,p_student_id text,p_route_id bigint,p_pickup_stop text default null,
  p_pickup_time time default null,p_dropoff_time time default null,p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_row record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id and status='Active';
  if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;
  if v_sess.role not in ('admin','super_admin')
     and not private.web_has_permission(p_session_token,'transport.edit',nullif(trim(v_student.class),''),null)
     then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if not exists(select 1 from public.transport_routes where id=p_route_id and school_id=v_sess.school_id)
     then return jsonb_build_object('ok',false,'error','route_not_found'); end if;

  insert into public.student_transport(student_id,school_id,route_id,pickup_stop,pickup_time,dropoff_time,notes)
  values(p_student_id,v_sess.school_id,p_route_id,nullif(trim(p_pickup_stop),''),p_pickup_time,p_dropoff_time,nullif(trim(p_notes),''))
  on conflict(student_id) do update set route_id=excluded.route_id,pickup_stop=excluded.pickup_stop,
    pickup_time=excluded.pickup_time,dropoff_time=excluded.dropoff_time,notes=excluded.notes
  returning * into v_row;
  return jsonb_build_object('ok',true,'assignment',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_get_student_transport(p_session_token text,p_student_id text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_row record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id and status='Active';
  if v_student is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_sess.role not in ('admin','super_admin')
     and not private.web_has_permission(p_session_token,'transport.view',nullif(trim(v_student.class),''),null)
     then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  select stt.*,r.route_name,r.driver_name,r.driver_phone,r.vehicle_info into v_row
    from public.student_transport stt left join public.transport_routes r on r.id=stt.route_id
   where stt.student_id=p_student_id and stt.school_id=v_sess.school_id;
  return jsonb_build_object('ok',true,'assignment',to_jsonb(v_row));
end;
$function$;

create or replace function public.rpc_remove_student_transport(p_session_token text,p_student_id text)
returns jsonb
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_n int;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select * into v_student from public.students where student_id=p_student_id and school_id=v_sess.school_id and status='Active';
  if v_student is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_sess.role not in ('admin','super_admin')
     and not private.web_has_permission(p_session_token,'transport.edit',nullif(trim(v_student.class),''),null)
     then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  delete from public.student_transport where student_id=p_student_id and school_id=v_sess.school_id;
  get diagnostics v_n=row_count;
  if v_n=0 then return jsonb_build_object('ok',false,'error','not_found'); end if;
  return jsonb_build_object('ok',true);
end;
$function$;

revoke execute on function public.rpc_get_routes(text) from public,anon,authenticated;
grant execute on function public.rpc_get_routes(text) to anon,authenticated;
revoke execute on function public.rpc_add_route(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_add_route(text,text,text,text,text,text) to anon,authenticated;
revoke execute on function public.rpc_update_route(text,bigint,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_update_route(text,bigint,text,text,text,text,text) to anon,authenticated;
revoke execute on function public.rpc_delete_route(text,bigint) from public,anon,authenticated;
grant execute on function public.rpc_delete_route(text,bigint) to anon,authenticated;
revoke execute on function public.rpc_get_route_detail(text,bigint) from public,anon,authenticated;
grant execute on function public.rpc_get_route_detail(text,bigint) to anon,authenticated;
revoke execute on function public.rpc_assign_student_transport(text,text,bigint,text,time without time zone,time without time zone,text) from public,anon,authenticated;
grant execute on function public.rpc_assign_student_transport(text,text,bigint,text,time without time zone,time without time zone,text) to anon,authenticated;
revoke execute on function public.rpc_get_student_transport(text,text) from public,anon,authenticated;
grant execute on function public.rpc_get_student_transport(text,text) to anon,authenticated;
revoke execute on function public.rpc_remove_student_transport(text,text) from public,anon,authenticated;
grant execute on function public.rpc_remove_student_transport(text,text) to anon,authenticated;
