-- Fix tenant-scoped teacher permission upserts.
-- Source-only migration: review and sandbox-test before any production deployment.
-- The previous expression index did not match rpc_manage_teacher_access's ON CONFLICT
-- target. Replace it with a tenant-scoped index whose expressions match the RPC.
drop index if exists public.teacher_permissions_scope_uq;

create unique index teacher_permissions_scope_uq
on public.teacher_permissions (
  school_id,
  teacher_id,
  permission_key,
  scope_type,
  (coalesce(class_name, '')),
  (coalesce(subject_id, 0))
);

create or replace function public.rpc_manage_teacher_access(
  p_session_token text,p_action text,p_teacher_id text,p_class_name text default null,
  p_subject_id bigint default null,p_assignment_type text default 'class_teacher',
  p_permission_key text default null,p_allowed boolean default null,p_scope_type text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_admin record;v_teacher record;v_assignment record;v_permission record;v_scope text;
begin
  select s.teacher_id,s.school_id,s.role into v_admin from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_admin is null or v_admin.role not in ('admin','super_admin') then return jsonb_build_object('ok',false,'error','admin_required'); end if;
  select * into v_teacher from public.teachers where teacher_id=p_teacher_id and school_id=v_admin.school_id;
  if v_teacher is null then return jsonb_build_object('ok',false,'error','teacher_not_found'); end if;

  if p_action='list' then
    return jsonb_build_object('ok',true,'teacher',to_jsonb(v_teacher),
      'classes',coalesce((select jsonb_agg(to_jsonb(a) order by a.class_name,a.assignment_type) from public.teacher_class_assignments a where a.school_id=v_admin.school_id and a.teacher_id=p_teacher_id),'[]'::jsonb),
      'subjects',coalesce((select jsonb_agg(to_jsonb(a) order by a.class_name,a.subject_id) from public.teacher_subject_assignments a where a.school_id=v_admin.school_id and a.teacher_id=p_teacher_id),'[]'::jsonb),
      'permissions',coalesce((select jsonb_agg(to_jsonb(a) order by a.permission_key,a.scope_type) from public.teacher_permissions a where a.school_id=v_admin.school_id and a.teacher_id=p_teacher_id),'[]'::jsonb));
  elsif p_action='class_add' then
    if nullif(trim(p_class_name),'') is null then return jsonb_build_object('ok',false,'error','class_required'); end if;
    insert into public.teacher_class_assignments(school_id,teacher_id,class_name,assignment_type,is_active)
    values(v_admin.school_id,p_teacher_id,trim(p_class_name),coalesce(p_assignment_type,'class_teacher'),true)
    on conflict(school_id,teacher_id,class_name,assignment_type) do update set is_active=true,updated_at=now() returning * into v_assignment;
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='class_remove' then
    update public.teacher_class_assignments set is_active=false,updated_at=now()
     where school_id=v_admin.school_id and teacher_id=p_teacher_id and class_name=trim(p_class_name) and assignment_type=coalesce(p_assignment_type,'class_teacher')
     returning * into v_assignment;
    if v_assignment is null then return jsonb_build_object('ok',false,'error','assignment_not_found'); end if;
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='subject_add' then
    if p_subject_id is null or nullif(trim(p_class_name),'') is null then return jsonb_build_object('ok',false,'error','class_and_subject_required'); end if;
    if not exists(select 1 from public.subjects where id=p_subject_id and school_id=v_admin.school_id and is_active=true) then return jsonb_build_object('ok',false,'error','subject_not_found'); end if;
    insert into public.teacher_subject_assignments(school_id,teacher_id,subject_id,class_name,is_active)
    values(v_admin.school_id,p_teacher_id,p_subject_id,trim(p_class_name),true)
    on conflict(school_id,teacher_id,subject_id,class_name) do update set is_active=true,updated_at=now() returning * into v_assignment;
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='subject_remove' then
    update public.teacher_subject_assignments set is_active=false,updated_at=now()
     where school_id=v_admin.school_id and teacher_id=p_teacher_id and subject_id=p_subject_id and class_name=trim(p_class_name)
     returning * into v_assignment;
    if v_assignment is null then return jsonb_build_object('ok',false,'error','assignment_not_found'); end if;
    return jsonb_build_object('ok',true,'assignment',to_jsonb(v_assignment));
  elsif p_action='permission_set' then
    if p_permission_key is null or p_allowed is null then return jsonb_build_object('ok',false,'error','permission_and_allowed_required'); end if;
    select * into v_permission from public.permission_definitions where permission_key=p_permission_key and is_active=true;
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
    on conflict (
      school_id, teacher_id, permission_key, scope_type,
      (coalesce(class_name, '')),
      (coalesce(subject_id, 0))
    ) do update set allowed=excluded.allowed,updated_at=now()
    returning * into v_permission;
    return jsonb_build_object('ok',true,'permission',to_jsonb(v_permission));
  elsif p_action='permission_remove' then
    delete from public.teacher_permissions where school_id=v_admin.school_id and teacher_id=p_teacher_id and permission_key=p_permission_key
      and scope_type=coalesce(p_scope_type,scope_type) and (p_class_name is null or class_name=trim(p_class_name)) and (p_subject_id is null or subject_id=p_subject_id);
    return jsonb_build_object('ok',true);
  else return jsonb_build_object('ok',false,'error','invalid_action');
  end if;
end; $$;

revoke execute on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text) to anon,authenticated;
