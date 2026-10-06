-- Enforce assignment-scoped student access for teacher-like roles.
create or replace function private.web_has_student_class_permission(p_session_token text,p_permission_key text,p_class_name text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record;
begin
  if p_session_token is null or p_permission_key is null or nullif(trim(p_class_name),'') is null then return false; end if;
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return false; end if;
  if not private.web_has_permission(p_session_token,p_permission_key,null,null) then return false; end if;
  if v_sess.role in ('admin','super_admin','school_coordinator','administrative_assistant') then return true; end if;
  if v_sess.role in ('teacher','senior_teacher','assistant_teacher') then
    return exists(select 1 from public.teacher_class_assignments a
      where a.school_id=v_sess.school_id and a.teacher_id=v_sess.teacher_id
        and a.class_name=trim(p_class_name) and a.is_active=true);
  end if;
  return false;
end; $$;

create or replace function private.web_has_student_permission(p_session_token text,p_permission_key text,p_student_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class text;
begin
  select s.class into v_class
    from public.students s join public.app_web_sessions ws on ws.school_id=s.school_id
   where s.student_id=p_student_id and ws.session_token=p_session_token and ws.expires_at>now() limit 1;
  if v_class is null then return false; end if;
  return private.web_has_student_class_permission(p_session_token,p_permission_key,v_class);
end; $$;

create or replace function private.web_has_student_record_permission(p_session_token text,p_permission_key text,p_record_type text,p_record_id bigint)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_student_id text;
begin
  if p_record_type='health_visit' then
    select student_id into v_student_id from public.health_visits where id=p_record_id;
  elsif p_record_type='vaccination' then
    select student_id into v_student_id from public.immunizations where id=p_record_id;
  else return false;
  end if;
  if v_student_id is null then return false; end if;
  return private.web_has_student_permission(p_session_token,p_permission_key,v_student_id);
end; $$;

create or replace function public.rpc_get_students(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_rows jsonb;
begin
  select s.school_id,s.teacher_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not private.web_has_permission(p_session_token,'students.view',null,null) then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'student_id',x.student_id,'name_mm',x.name_mm,'name_en',x.name_en,'name_local',x.name_local,'class',x.class,'grade',x.grade,
    'gender',x.gender,'date_of_birth',x.date_of_birth,'status',x.status,'parent_name',x.parent_name,'parent_tg_id',x.parent_tg_id,
    'parent_phone',x.parent_phone,'parent_phone2',x.parent_phone2,'parent_email',x.parent_email,'photo_url',x.photo_url,'home_color',x.home_color
  ) order by x.class,x.name_en),'[]'::jsonb) into v_rows
  from public.students x
  where x.school_id=v_sess.school_id and x.status='Active'
    and private.web_has_student_class_permission(p_session_token,'students.view',x.class);
  return jsonb_build_object('ok',true,'rows',v_rows);
end; $$;

do $$
declare r record; d text; newd text; v_changed integer := 0; v_expected integer := 19;
begin
  for r in
    select p.oid,p.proname,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in (
       'rpc_get_student_by_id','rpc_get_or_create_student_qr','rpc_get_student_checkouts','rpc_get_student_history',
       'rpc_get_student_transport','rpc_get_health_profile','rpc_update_student','rpc_delete_student',
       'rpc_update_student_parent','rpc_activate_student','rpc_deactivate_student','rpc_reactivate_student',
       'rpc_assign_student_transport','rpc_remove_student_transport','rpc_set_student_photo','rpc_regenerate_student_qr',
       'rpc_upsert_health_profile','rpc_add_health_visit','rpc_add_vaccination'
     )
  loop
    d:=r.definition;
    newd:=regexp_replace(d,
      'private\\.web_has_permission\\(\\s*p_session_token\\s*,\\s*''(students\\.(?:view|edit))''\\s*,\\s*null\\s*,\\s*null\\s*\\)',
      'private.web_has_student_permission(p_session_token, ''\\1'', p_student_id)','gi');
    if newd<>d then execute newd; v_changed:=v_changed+1; end if;
  end loop;
  if v_changed<>v_expected then
    raise exception 'student permission migration coverage mismatch: changed %, expected %', v_changed, v_expected;
  end if;
end $;

do $$
declare r record; d text; newd text; v_changed integer := 0; v_expected integer := 2;
begin
  for r in
    select p.oid,p.proname,pg_get_functiondef(p.oid) as definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname in ('rpc_delete_health_visit','rpc_delete_vaccination')
  loop
    d:=r.definition;
    newd:=regexp_replace(d,
      'private\\.web_has_permission\\(\\s*p_session_token\\s*,\\s*''students\\.edit''\\s*,\\s*null\\s*,\\s*null\\s*\\)',
      'private.web_has_student_record_permission(p_session_token, ''students.edit'', ' ||
       case when r.proname='rpc_delete_health_visit' then '''health_visit''' else '''vaccination''' end || ', p_id)','gi');
    if newd<>d then execute newd; v_changed:=v_changed+1; end if;
  end loop;
  if v_changed<>v_expected then
    raise exception 'health/vaccination delete migration coverage mismatch: changed %, expected %', v_changed, v_expected;
  end if;
end $;

do $$
declare r record; d text; newd text; v_changed integer := 0; v_expected integer := 1;
begin
  select p.oid,pg_get_functiondef(p.oid) as definition into r
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='rpc_register_student' limit 1;
  d:=r.definition;
  newd:=regexp_replace(d,
    'private\\.web_has_permission\\(\\s*p_session_token\\s*,\\s*''students\\.edit''\\s*,\\s*null\\s*,\\s*null\\s*\\)',
    'private.web_has_student_class_permission(p_session_token, ''students.edit'', p_class)','gi');
  if newd<>d then execute newd; v_changed:=v_changed+1; end if;
  if v_changed<>v_expected then
    raise exception 'student registration migration coverage mismatch: changed %, expected %', v_changed, v_expected;
  end if;
end $;

revoke all on function private.web_has_student_class_permission(text,text,text) from public,anon,authenticated;
revoke all on function private.web_has_student_permission(text,text,text) from public,anon,authenticated;
revoke all on function private.web_has_student_record_permission(text,text,text,bigint) from public,anon,authenticated;