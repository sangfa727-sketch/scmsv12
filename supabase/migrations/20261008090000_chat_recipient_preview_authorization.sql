-- SCMS v12: server-authorized staff recipient preview for Smart Staff Chat.
-- No message is sent by this migration.
create or replace function public.rpc_chat_recipient_preview(
  p_session_token text,
  p_recipient_type text default 'all_staff',
  p_target text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id, s.teacher_id, s.role
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
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if p_recipient_type not in ('all_staff','grade') then
    return jsonb_build_object('ok',false,'error','unsupported_recipient_type');
  end if;

  if p_recipient_type = 'grade' then
    if v_sess.role not in ('admin','super_admin') then
      return jsonb_build_object('ok',false,'error','admin_only');
    end if;
    if p_target is null or length(btrim(p_target)) = 0 or length(p_target) > 100 then
      return jsonb_build_object('ok',false,'error','bad_target');
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'teacher_id', x.teacher_id,
        'teacher_name', x.teacher_name,
        'role', x.role,
        'class_name', x.class_name,
        'assignment_type', x.assignment_type
      ) order by x.teacher_name
    ), '[]'::jsonb)
      into v_rows
      from (
        select distinct on (t.teacher_id)
          t.teacher_id, t.teacher_name, t.role,
          a.class_name, a.assignment_type
        from public.teacher_class_assignments a
        join public.teachers t on t.teacher_id = a.teacher_id
       where a.school_id = v_sess.school_id
         and a.class_name = btrim(p_target)
         and a.is_active = true
         and t.school_id = v_sess.school_id
         and t.status = 'active'
       order by t.teacher_id, a.updated_at desc nulls last, a.id desc
      ) x;
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'teacher_id', t.teacher_id,
        'teacher_name', t.teacher_name,
        'role', t.role
      ) order by t.teacher_name
    ), '[]'::jsonb)
      into v_rows
      from public.teachers t
     where t.school_id = v_sess.school_id
       and t.status = 'active';
  end if;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

revoke execute on function public.rpc_chat_recipient_preview(text,text,text) from public;
grant execute on function public.rpc_chat_recipient_preview(text,text,text) to anon, authenticated;
