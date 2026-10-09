-- SCMS v12 — narrowly scoped School Website manager delegation.
-- Release artifact only: do not apply to production without explicit approval.
-- This RPC changes only website.manage for a same-school teacher account.
create or replace function public.rpc_school_website_set_manager(
  p_session_token text,
  p_target_teacher_id text,
  p_allowed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor record;
  v_target record;
begin
  if nullif(trim(p_session_token), '') is null
     or nullif(trim(p_target_teacher_id), '') is null
     or p_allowed is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  select s.teacher_id, s.school_id, s.role
    into v_actor
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_actor is null
     or v_actor.role not in ('owner', 'school_owner', 'admin', 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'admin_required');
  end if;

  select teacher_id, school_id, role, status
    into v_target
    from public.teachers
   where teacher_id = p_target_teacher_id
     and school_id = v_actor.school_id
   limit 1;

  if v_target is null or v_target.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'active_same_school_staff_required');
  end if;

  -- Never use this delegation endpoint to override privileged owner/admin roles.
  if v_target.role in ('owner', 'school_owner', 'admin', 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'privileged_target_not_allowed');
  end if;

  if p_allowed then
    insert into public.teacher_permissions
      (school_id, teacher_id, permission_key, allowed, scope_type, class_name, subject_id)
    values
      (v_actor.school_id, v_target.teacher_id, 'website.manage', true, 'global', null, null)
    on conflict (
      teacher_id, permission_key, scope_type,
      (coalesce(class_name, ''::text)),
      (coalesce(subject_id, 0::bigint))
    ) do update set allowed = true, updated_at = now();
  else
    delete from public.teacher_permissions
     where school_id = v_actor.school_id
       and teacher_id = v_target.teacher_id
       and permission_key = 'website.manage'
       and scope_type = 'global'
       and class_name is null
       and subject_id is null;
  end if;

  return jsonb_build_object('ok', true, 'teacher_id', v_target.teacher_id, 'allowed', p_allowed);
end;
$function$;

revoke all on function public.rpc_school_website_set_manager(text, text, boolean) from public;
grant execute on function public.rpc_school_website_set_manager(text, text, boolean) to anon, authenticated;
