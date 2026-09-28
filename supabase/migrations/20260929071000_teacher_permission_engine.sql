-- Step 3: Internal teacher permission evaluation engine
-- Keeps authorization logic server-side and unavailable to anon/authenticated.

create schema if not exists private;

create or replace function private.web_has_permission(
  p_session_token text,
  p_permission_key text,
  p_class_name text default null,
  p_subject_id bigint default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_teacher_id text;
  v_school_id text;
  v_role text;
  v_scope text;
  v_role_allowed boolean;
  v_override boolean;
  v_assignment boolean;
begin
  if nullif(trim(p_session_token), '') is null
     or nullif(trim(p_permission_key), '') is null then
    return false;
  end if;

  select s.teacher_id, s.school_id, s.role
    into v_teacher_id, v_school_id, v_role
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_teacher_id is null then
    return false;
  end if;

  select pd.scope_type
    into v_scope
    from public.permission_definitions pd
   where pd.permission_key = p_permission_key
     and pd.is_active = true;

  if v_scope is null then
    return false;
  end if;

  select rp.allowed
    into v_role_allowed
    from public.role_permissions rp
   where rp.role = v_role
     and rp.permission_key = p_permission_key;

  select tp.allowed
    into v_override
    from public.teacher_permissions tp
   where tp.school_id = v_school_id
     and tp.teacher_id = v_teacher_id
     and tp.permission_key = p_permission_key
     and tp.scope_type = v_scope
     and (
       (v_scope = 'global' and tp.class_name is null and tp.subject_id is null)
       or
       (v_scope = 'class'
        and tp.class_name = nullif(trim(p_class_name), '')
        and tp.subject_id is null)
       or
       (v_scope = 'subject'
        and tp.subject_id = p_subject_id
        and tp.class_name is null)
       or
       (v_scope = 'class_subject'
        and tp.class_name = nullif(trim(p_class_name), '')
        and tp.subject_id = p_subject_id)
     )
   order by tp.updated_at desc, tp.id desc
   limit 1;

  if v_override is false then
    return false;
  end if;

  if coalesce(v_override, v_role_allowed, false) = false then
    return false;
  end if;

  if v_role in ('admin', 'super_admin') then
    return true;
  end if;

  if v_scope = 'global' then
    return true;
  elsif v_scope = 'class' then
    if nullif(trim(p_class_name), '') is null then
      return false;
    end if;

    select exists (
      select 1
        from public.teacher_class_assignments a
       where a.school_id = v_school_id
         and a.teacher_id = v_teacher_id
         and a.class_name = trim(p_class_name)
         and a.is_active = true
    ) into v_assignment;

  elsif v_scope = 'subject' then
    if p_subject_id is null then
      return false;
    end if;

    select exists (
      select 1
        from public.teacher_subject_assignments a
       where a.school_id = v_school_id
         and a.teacher_id = v_teacher_id
         and a.subject_id = p_subject_id
         and a.is_active = true
         and (
           nullif(trim(p_class_name), '') is null
           or a.class_name = trim(p_class_name)
         )
    ) into v_assignment;

  elsif v_scope = 'class_subject' then
    if nullif(trim(p_class_name), '') is null or p_subject_id is null then
      return false;
    end if;

    select exists (
      select 1
        from public.teacher_subject_assignments a
       where a.school_id = v_school_id
         and a.teacher_id = v_teacher_id
         and a.subject_id = p_subject_id
         and a.class_name = trim(p_class_name)
         and a.is_active = true
    ) into v_assignment;
  else
    return false;
  end if;

  return coalesce(v_assignment, false);
end;
$$;

revoke all on schema private from public, anon, authenticated;
revoke execute on function private.web_has_permission(text,text,text,bigint) from public, anon, authenticated;
grant usage on schema private to postgres;
grant execute on function private.web_has_permission(text,text,text,bigint) to postgres;
