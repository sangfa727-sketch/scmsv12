-- SCMS v12 — official announcement individual staff routing hardening
-- Add admin-authorized individual official messages without weakening existing school/grade routing.

alter table public.staff_announcements
  drop constraint if exists staff_announcements_recipient_type_chk;

alter table public.staff_announcements
  add constraint staff_announcements_recipient_type_chk
  check (recipient_type in ('all_staff','grade','teacher'));

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

  if p_recipient_type not in ('all_staff','grade','teacher') then
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
  elsif p_recipient_type = 'teacher' then
    if v_sess.role not in ('admin','super_admin') then
      return jsonb_build_object('ok',false,'error','admin_only');
    end if;
    if p_target is null or length(btrim(p_target)) = 0 or length(p_target) > 100 then
      return jsonb_build_object('ok',false,'error','bad_target');
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'teacher_id', t.teacher_id,
        'teacher_name', t.teacher_name,
        'role', t.role
      ) order by t.teacher_name
    ), '[]'::jsonb)
      into v_rows
      from public.teachers t
     where t.teacher_id = btrim(p_target)
       and t.school_id = v_sess.school_id
       and t.status = 'active';
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

create or replace function public.rpc_chat_announcement_create(
  p_session_token text,p_recipient_type text,p_target text,
  p_message_type text,p_reason text,p_body text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_sess record;
  v_id uuid;
  v_target text:=nullif(btrim(p_target),'');
  v_reason text:=btrim(coalesce(p_reason,''));
  v_body text:=btrim(coalesce(p_body,''));
  v_count int;
begin
  select t.teacher_id,t.school_id,t.role into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;

  if not found then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not (private.web_has_permission(p_session_token,'communication.send',null,null) or v_sess.role in ('admin','super_admin')) then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;
  if lower(coalesce(p_recipient_type,'')) not in ('all_staff','grade','teacher') then
    return jsonb_build_object('ok',false,'error','unsupported_recipient_type');
  end if;
  if lower(coalesce(p_message_type,'')) not in ('announcement','task','notice') then
    return jsonb_build_object('ok',false,'error','invalid_message_type');
  end if;
  if length(v_reason) not between 1 and 500 then return jsonb_build_object('ok',false,'error','invalid_reason'); end if;
  if length(v_body) not between 1 and 4000 then return jsonb_build_object('ok',false,'error','invalid_body'); end if;

  if lower(p_recipient_type) in ('grade','teacher')
     and (v_target is null or length(v_target)>100) then
    return jsonb_build_object('ok',false,'error','invalid_target');
  end if;

  if lower(p_recipient_type)='teacher' then
    if not exists (
      select 1 from public.teachers t
       where t.teacher_id=v_target
         and t.school_id=v_sess.school_id
         and t.status='active'
    ) then
      return jsonb_build_object('ok',false,'error','invalid_recipient');
    end if;
  end if;

  insert into public.staff_announcements(
    school_id,sender_teacher_id,message_type,recipient_type,target_value,reason,body
  ) values (
    v_sess.school_id,v_sess.teacher_id,lower(p_message_type),lower(p_recipient_type),
    v_target,v_reason,v_body
  ) returning id into v_id;

  if lower(p_recipient_type)='all_staff' then
    insert into public.staff_announcement_recipients(announcement_id,school_id,teacher_id)
    select v_id,v_sess.school_id,t.teacher_id
      from public.teachers t
     where t.school_id=v_sess.school_id and t.status='active'
     on conflict do nothing;
  elsif lower(p_recipient_type)='grade' then
    insert into public.staff_announcement_recipients(announcement_id,school_id,teacher_id)
    select distinct v_id,v_sess.school_id,t.teacher_id
      from public.teachers t
      join public.teacher_class_assignments a on a.teacher_id=t.teacher_id and a.school_id=t.school_id
     where t.school_id=v_sess.school_id and t.status='active'
       and a.is_active=true and lower(a.class_name)=lower(v_target)
     on conflict do nothing;
  else
    insert into public.staff_announcement_recipients(announcement_id,school_id,teacher_id)
    select v_id,v_sess.school_id,t.teacher_id
      from public.teachers t
     where t.teacher_id=v_target and t.school_id=v_sess.school_id and t.status='active'
     on conflict do nothing;
  end if;

  select count(*) into v_count from public.staff_announcement_recipients r where r.announcement_id=v_id;
  if v_count=0 then
    delete from public.staff_announcements where id=v_id;
    return jsonb_build_object('ok',false,'error','no_verified_recipients');
  end if;

  insert into public.audit_log(ts,source,actor,action,school_id,payload)
  values(
    now(),'staff_chat',v_sess.teacher_id,'official_announcement.create',v_sess.school_id,
    jsonb_build_object(
      'announcement_id',v_id,'recipient_type',lower(p_recipient_type),
      'target',v_target,'message_type',lower(p_message_type),'recipient_count',v_count
    )
  );
  return jsonb_build_object('ok',true,'announcement_id',v_id,'recipient_count',v_count);
end $$;

revoke execute on function public.rpc_chat_recipient_preview(text,text,text) from public;
grant execute on function public.rpc_chat_recipient_preview(text,text,text) to anon,authenticated;

revoke execute on function public.rpc_chat_announcement_create(text,text,text,text,text,text) from public;
grant execute on function public.rpc_chat_announcement_create(text,text,text,text,text,text) to anon,authenticated;
