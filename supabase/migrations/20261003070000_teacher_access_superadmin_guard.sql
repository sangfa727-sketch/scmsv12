-- Prevent lower-tier admins from changing a super_admin's teacher access assignments.
-- The existing RPC already enforces active session + same-school boundaries; this adds the missing role boundary.
CREATE OR REPLACE FUNCTION public.rpc_manage_teacher_access(p_session_token text, p_action text, p_teacher_id text, p_class_name text DEFAULT NULL::text, p_subject_id bigint DEFAULT NULL::bigint, p_assignment_type text DEFAULT 'class_teacher'::text, p_permission_key text DEFAULT NULL::text, p_allowed boolean DEFAULT NULL::boolean, p_scope_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_admin record;
  v_teacher record;
  v_assignment record;
  v_permission record;
  v_scope text;
begin
  select s.teacher_id,s.school_id,s.role into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
   limit 1;

  if v_admin is null or v_admin.role not in ('admin','super_admin') then
    return jsonb_build_object('ok',false,'error','admin_required');
  end if;

  if p_action='catalog' then
    return jsonb_build_object(
      'ok',true,
      'classes',coalesce((
        select jsonb_agg(x.class_name order by x.class_name)
        from (
          select distinct trim(s.class) as class_name
          from public.students s
          where s.school_id=v_admin.school_id
            and nullif(trim(s.class),'') is not null
        ) x
      ),'[]'::jsonb),
      'subjects',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',s.id,'subject_code',s.subject_code,'subject_name',s.subject_name,
          'subject_color',s.subject_color,'applies_to',s.applies_to
        ) order by s.display_order,s.subject_name)
        from public.subjects s
        where s.school_id=v_admin.school_id and s.is_active=true
      ),'[]'::jsonb),
      'permissions',coalesce((
        select jsonb_agg(to_jsonb(p) order by p.display_order,p.permission_key)
        from public.permission_definitions p
        where p.is_active=true
      ),'[]'::jsonb),
      'role_permissions',coalesce((
        select jsonb_agg(to_jsonb(r) order by r.role,r.permission_key)
        from public.role_permissions r
      ),'[]'::jsonb)
    );
  end if;

  select teacher_id,teacher_name,role,status,email,last_web_login_at,photo_url
    into v_teacher
    from public.teachers
   where teacher_id=p_teacher_id and school_id=v_admin.school_id;

  if v_teacher is null then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  if v_admin.role <> 'super_admin' and v_teacher.role='super_admin' then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  if p_action='list' then
    return jsonb_build_object(
      'ok',true,
      'teacher',to_jsonb(v_teacher),
      'classes',coalesce((
        select jsonb_agg(to_jsonb(a) order by a.class_name,a.assignment_type)
        from public.teacher_class_assignments a
        where a.school_id=v_admin.school_id and a.teacher_id=p_teacher_id
      ),'[]'::jsonb),
      'subjects',coalesce((
        select jsonb_agg(to_jsonb(a) order by a.class_name,a.subject_id)
        from public.teacher_subject_assignments a
        where a.school_id=v_admin.school_id and a.teacher_id=p_teacher_id
      ),'[]'::jsonb),
      'permissions',coalesce((
        select jsonb_agg(to_jsonb(a) order by a.permission_key,a.scope_type,coalesce(a.class_name,''),coalesce(a.subject_id,0))
        from public.teacher_permissions a
        where a.school_id=v_admin.school_id and a.teacher_id=p_teacher_id
      ),'[]'::jsonb)
    );
  elsif p_action='class_add' then
    if nullif(trim(p_class_name),'') is null then return jsonb_build_object('ok',false,'error','class_required'); end if;
    insert into public.teacher_class_assignments(school_id,teacher_id,class_name,assignment_type,is_active)
    values(v_admin.school_id,p_teacher_id,trim(p_class_name),coalesce(p_assignment_type,'class_teacher'),true)
    on conflict(school_id,teacher_id,class_name,assignment_type)
    do update set is_active=true,updated_at=now()
    returning * into v_assignment;
    insert into public.audit_log(source,actor,action,school_id,payload)
    values('web','teacher_access', 'teacher.class_add',v_admin.school_id,
      jsonb_build_object('target_teacher_id',p_teacher_id,'class_name',trim(p_class_name),'assignment_type',coalesce(p_assignment_type,'class_teacher')));
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='class_remove' then
    update public.teacher_class_assignments set is_active=false,updated_at=now()
     where school_id=v_admin.school_id and teacher_id=p_teacher_id and class_name=trim(p_class_name)
       and assignment_type=coalesce(p_assignment_type,'class_teacher')
     returning * into v_assignment;
    if v_assignment is null then return jsonb_build_object('ok',false,'error','assignment_not_found'); end if;
    insert into public.audit_log(source,actor,action,school_id,payload)
    values('web','teacher_access','teacher.class_remove',v_admin.school_id,
      jsonb_build_object('target_teacher_id',p_teacher_id,'class_name',trim(p_class_name),'assignment_type',coalesce(p_assignment_type,'class_teacher')));
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='subject_add' then
    if p_subject_id is null or nullif(trim(p_class_name),'') is null then return jsonb_build_object('ok',false,'error','class_and_subject_required'); end if;
    if not exists(select 1 from public.subjects where id=p_subject_id and school_id=v_admin.school_id and is_active=true) then
      return jsonb_build_object('ok',false,'error','subject_not_found');
    end if;
    insert into public.teacher_subject_assignments(school_id,teacher_id,subject_id,class_name,is_active)
    values(v_admin.school_id,p_teacher_id,p_subject_id,trim(p_class_name),true)
    on conflict(school_id,teacher_id,subject_id,class_name)
    do update set is_active=true,updated_at=now()
    returning * into v_assignment;
    insert into public.audit_log(source,actor,action,school_id,payload)
    values('web','teacher_access','teacher.subject_add',v_admin.school_id,
      jsonb_build_object('target_teacher_id',p_teacher_id,'class_name',trim(p_class_name),'subject_id',p_subject_id));
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='subject_remove' then
    update public.teacher_subject_assignments set is_active=false,updated_at=now()
     where school_id=v_admin.school_id and teacher_id=p_teacher_id and subject_id=p_subject_id and class_name=trim(p_class_name)
     returning * into v_assignment;
    if v_assignment is null then return jsonb_build_object('ok',false,'error','assignment_not_found'); end if;
    insert into public.audit_log(source,actor,action,school_id,payload)
    values('web','teacher_access','teacher.subject_remove',v_admin.school_id,
      jsonb_build_object('target_teacher_id',p_teacher_id,'class_name',trim(p_class_name),'subject_id',p_subject_id));
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='permission_set' then
    if p_permission_key is null or p_allowed is null then return jsonb_build_object('ok',false,'error','permission_and_allowed_required'); end if;
    select * into v_permission from public.permission_definitions
     where permission_key=p_permission_key and is_active=true;
    if v_permission is null then return jsonb_build_object('ok',false,'error','permission_not_found'); end if;
    v_scope:=coalesce(p_scope_type,v_permission.scope_type);
    if v_scope<>v_permission.scope_type then return jsonb_build_object('ok',false,'error','scope_mismatch'); end if;
    if (v_scope='global' and (p_class_name is not null or p_subject_id is not null))
       or (v_scope='class' and (nullif(trim(p_class_name),'') is null or p_subject_id is not null))
       or (v_scope='subject' and (p_subject_id is null or p_class_name is not null))
       or (v_scope='class_subject' and (nullif(trim(p_class_name),'') is null or p_subject_id is null)) then
      return jsonb_build_object('ok',false,'error','invalid_scope');
    end if;
    insert into public.teacher_permissions(school_id,teacher_id,permission_key,allowed,scope_type,class_name,subject_id)
    values(v_admin.school_id,p_teacher_id,p_permission_key,p_allowed,v_scope,nullif(trim(p_class_name),''),p_subject_id)
    on conflict(school_id,teacher_id,permission_key,scope_type,class_name,subject_id)
    do update set allowed=excluded.allowed,updated_at=now()
    returning * into v_permission;
    insert into public.audit_log(source,actor,action,school_id,payload)
    values('web','teacher_access','teacher.permission_set',v_admin.school_id,
      jsonb_build_object('target_teacher_id',p_teacher_id,'permission_key',p_permission_key,'allowed',p_allowed,
        'scope_type',v_scope,'class_name',nullif(trim(p_class_name),''),'subject_id',p_subject_id));
    return jsonb_build_object('ok',true,'permission',to_jsonb(v_permission));
  elsif p_action='permission_remove' then
    if p_permission_key is null then return jsonb_build_object('ok',false,'error','permission_required'); end if;
    select scope_type into v_scope from public.permission_definitions
     where permission_key=p_permission_key and is_active=true;
    if v_scope is null then return jsonb_build_object('ok',false,'error','permission_not_found'); end if;
    if coalesce(p_scope_type,v_scope)<>v_scope then return jsonb_build_object('ok',false,'error','scope_mismatch'); end if;
    if (v_scope='global' and (p_class_name is not null or p_subject_id is not null))
       or (v_scope='class' and (nullif(trim(p_class_name),'') is null or p_subject_id is not null))
       or (v_scope='subject' and (p_subject_id is null or p_class_name is not null))
       or (v_scope='class_subject' and (nullif(trim(p_class_name),'') is null or p_subject_id is null)) then
      return jsonb_build_object('ok',false,'error','invalid_scope');
    end if;
    delete from public.teacher_permissions
     where school_id=v_admin.school_id and teacher_id=p_teacher_id and permission_key=p_permission_key
       and scope_type=v_scope
       and (v_scope<>'class' or class_name=trim(p_class_name))
       and (v_scope<>'subject' or subject_id=p_subject_id)
       and (v_scope<>'class_subject' or (class_name=trim(p_class_name) and subject_id=p_subject_id))
       and (v_scope<>'global');
    if v_scope='global' then
      delete from public.teacher_permissions
       where school_id=v_admin.school_id and teacher_id=p_teacher_id and permission_key=p_permission_key and scope_type='global';
    end if;
    insert into public.audit_log(source,actor,action,school_id,payload)
    values('web','teacher_access','teacher.permission_remove',v_admin.school_id,
      jsonb_build_object('target_teacher_id',p_teacher_id,'permission_key',p_permission_key,
        'scope_type',v_scope,'class_name',nullif(trim(p_class_name),''),'subject_id',p_subject_id));
    return jsonb_build_object('ok',true);
  else
    return jsonb_build_object('ok',false,'error','invalid_action');
  end if;
end; $function$


revoke execute on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) from public;
grant execute on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) to anon, authenticated;
