-- SCMS v12 — prevent teacher-manager role escalation.
-- Match teacher creation policy: only super_admin may assign admin/super_admin roles.
create or replace function public.rpc_admin_update_teacher_profile(
  p_session_token text,
  p_teacher_id text,
  p_teacher_name text,
  p_login_name text,
  p_email text default null,
  p_role text default 'teacher'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_admin record;
  v_target_role text;
  v_name text := trim(coalesce(p_teacher_name,''));
  v_login text := trim(coalesce(p_login_name,''));
  v_role text := lower(trim(coalesce(p_role,'teacher')));
  v_teacher record;
begin
  select s.school_id, t.teacher_id as admin_teacher_id, t.role as admin_role
    into v_admin
  from public.app_web_sessions s
  join public.teachers t on t.teacher_id=s.teacher_id
  where s.session_token=p_session_token
    and s.expires_at>now()
    and t.status='active'
    and s.school_id=t.school_id
    and s.role=t.role
    and t.role in ('admin','super_admin')
  limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;

  if char_length(v_name)<1 or char_length(v_name)>120 then
    return jsonb_build_object('ok',false,'error','invalid_teacher_name');
  end if;

  if char_length(v_login)<3 or char_length(v_login)>64
     or v_login !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    return jsonb_build_object('ok',false,'error','invalid_login_name');
  end if;

  if v_role not in ('teacher','admin','super_admin') then
    return jsonb_build_object('ok',false,'error','invalid_role');
  end if;

  select role into v_target_role
  from public.teachers
  where teacher_id=p_teacher_id
    and school_id=v_admin.school_id
  limit 1;

  if v_target_role is null then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if v_admin.admin_role <> 'super_admin'
     and (v_role in ('admin','super_admin') or v_target_role='super_admin') then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  if exists(select 1 from public.teachers where lower(login_name)=lower(v_login) and teacher_id<>p_teacher_id) then
    return jsonb_build_object('ok',false,'error','duplicate_login_name');
  end if;

  update public.teachers
     set teacher_name=v_name,
         login_name=v_login,
         email=nullif(trim(coalesce(p_email,'')),''),
         teacher_email=nullif(trim(coalesce(p_email,'')),''),
         role=v_role,
         updated_at=now()
   where teacher_id=p_teacher_id and school_id=v_admin.school_id
  returning teacher_id, login_name, teacher_name, role, email, teacher_email, photo_url, status into v_teacher;

  if not found then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  return jsonb_build_object('ok',true,'teacher',to_jsonb(v_teacher));
end;
$function$;

revoke all on function public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) from public;
grant execute on function public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) to anon, authenticated;
