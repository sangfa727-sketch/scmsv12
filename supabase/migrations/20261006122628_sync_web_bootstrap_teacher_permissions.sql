-- Restore the web bootstrap permission contract from the canonical teacher permission engine.
create or replace function public.rpc_web_bootstrap(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sess record;
  v_school record;
  v_classes jsonb;
  v_assigned_classes jsonb;
  v_assigned_subjects jsonb;
  v_permissions jsonb;
begin
  select s.teacher_id, s.school_id, s.role,
         t.teacher_name, t.email, t.telegram_id, t.photo_url, t.ui_prefs
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and s.school_id = t.school_id
     and s.role = t.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  select school_id, school_name, config_json
    into v_school
    from public.schools
   where school_id = v_sess.school_id
   limit 1;

  select coalesce(
    jsonb_agg(distinct s.class order by s.class)
      filter (where nullif(trim(s.class), '') is not null),
    '[]'::jsonb
  )
    into v_classes
    from public.students s
   where s.school_id = v_sess.school_id
     and s.status = 'Active';

  select coalesce(
    jsonb_agg(distinct a.class_name order by a.class_name)
      filter (where a.is_active and nullif(trim(a.class_name), '') is not null),
    '[]'::jsonb
  )
    into v_assigned_classes
    from public.teacher_class_assignments a
   where a.school_id = v_sess.school_id
     and a.teacher_id = v_sess.teacher_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'class_name', a.class_name,
        'subject_id', a.subject_id,
        'subject_name', s.subject_name,
        'subject_code', s.subject_code
      )
      order by a.class_name, a.subject_id
    ),
    '[]'::jsonb
  )
    into v_assigned_subjects
    from public.teacher_subject_assignments a
    join public.subjects s
      on s.id = a.subject_id and s.school_id = a.school_id
   where a.school_id = v_sess.school_id
     and a.teacher_id = v_sess.teacher_id
     and a.is_active = true;

  select coalesce(
    jsonb_agg(e.permission_key order by e.permission_key)
      filter (where e.effective_allowed),
    '[]'::jsonb
  )
    into v_permissions
    from (
      select p.permission_key,
             case
               when go.allowed is not null then go.allowed
               else coalesce(rp.allowed, false)
                 or exists (
                   select 1
                     from public.teacher_permissions sp
                    where sp.school_id = v_sess.school_id
                      and sp.teacher_id = v_sess.teacher_id
                      and sp.permission_key = p.permission_key
                      and sp.scope_type <> 'global'
                      and sp.allowed = true
                 )
             end as effective_allowed
        from public.permission_definitions p
        left join public.role_permissions rp
          on rp.role = v_sess.role
         and rp.permission_key = p.permission_key
        left join lateral (
          select tp.allowed
            from public.teacher_permissions tp
           where tp.school_id = v_sess.school_id
             and tp.teacher_id = v_sess.teacher_id
             and tp.permission_key = p.permission_key
             and tp.scope_type = 'global'
           order by tp.updated_at desc, tp.id desc
           limit 1
        ) go on true
       where p.is_active = true
    ) e;

  update public.app_web_sessions
     set last_seen_at = now(),
         expires_at = now() + interval '30 days'
   where session_token = p_session_token;

  return jsonb_build_object(
    'ok', true,
    'auth_mode', 'web',
    'teacher_id', v_sess.teacher_id,
    'teacher_name', v_sess.teacher_name,
    'teacher_role', v_sess.role,
    'teacher_email', v_sess.email,
    'teacher_photo_url', v_sess.photo_url,
    'telegram_id', v_sess.telegram_id,
    'school_id', v_school.school_id,
    'school_name', v_school.school_name,
    'school_config', v_school.config_json,
    'classes', v_classes,
    'assigned_classes', v_assigned_classes,
    'assigned_subjects', v_assigned_subjects,
    'permissions', v_permissions,
    'is_admin', v_sess.role in ('admin', 'super_admin'),
    'ui_prefs', coalesce(v_sess.ui_prefs, '{}'::jsonb)
  );
end;
$function$;