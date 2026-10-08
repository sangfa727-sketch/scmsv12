-- SCMS v12 — Staff Chat department admin access + official grade targets
-- Keeps tenant isolation server-side while allowing school admins to manage/use
-- all active departments and target all grades represented by school data.

create or replace function public.rpc_chat_admin_grade_targets(
  p_session_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id, s.teacher_id, s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id = s.teacher_id
     and t.school_id = s.school_id
     and t.role = s.role
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if lower(coalesce(v_sess.role,'')) not in ('admin','super_admin') then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(x.grade_name order by lower(x.grade_name)), '[]'::jsonb)
    into v_rows
    from (
      select distinct nullif(btrim(s.grade),'') as grade_name
        from public.students s
       where s.school_id = v_sess.school_id
         and s.status = 'Active'
         and nullif(btrim(s.grade),'') is not null
    ) x;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$function$;

revoke all on function public.rpc_chat_admin_grade_targets(text) from public, anon, authenticated;
grant execute on function public.rpc_chat_admin_grade_targets(text) to anon, authenticated;


create or replace function public.rpc_chat_department_list(
  p_session_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if lower(coalesce(v_sess.role,'')) in ('admin','super_admin') then
    select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.department_name)),'[]'::jsonb)
      into v_rows
      from (
        select d.id,d.department_code,d.department_name,'admin'::text as member_role
          from public.staff_departments d
         where d.school_id=v_sess.school_id
           and d.is_active=true
      ) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by lower(x.department_name)),'[]'::jsonb)
      into v_rows
      from (
        select d.id,d.department_code,d.department_name,m.member_role
          from public.staff_departments d
          join public.staff_department_members m
            on m.department_id=d.id
           and m.school_id=v_sess.school_id
           and m.teacher_id=v_sess.teacher_id
           and m.is_active=true
         where d.school_id=v_sess.school_id
           and d.is_active=true
      ) x;
  end if;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;


create or replace function public.rpc_chat_department_open(
  p_session_token text,
  p_department_id bigint,
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_department record;
  v_rows jsonb;
  v_unread integer;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if lower(coalesce(v_sess.role,'')) in ('admin','super_admin') then
    select d.id,d.school_id,d.department_code,d.department_name,
           coalesce(m.last_read_at,'epoch'::timestamptz) as last_read_at
      into v_department
      from public.staff_departments d
      left join public.staff_department_members m
        on m.department_id=d.id
       and m.school_id=v_sess.school_id
       and m.teacher_id=v_sess.teacher_id
       and m.is_active=true
     where d.id=p_department_id
       and d.school_id=v_sess.school_id
       and d.is_active=true
     limit 1;
  else
    select d.id,d.school_id,d.department_code,d.department_name,m.last_read_at
      into v_department
      from public.staff_departments d
      join public.staff_department_members m
        on m.department_id=d.id
       and m.school_id=v_sess.school_id
       and m.teacher_id=v_sess.teacher_id
       and m.is_active=true
     where d.id=p_department_id
       and d.school_id=v_sess.school_id
       and d.is_active=true
     limit 1;
  end if;

  if v_department is null then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;

  select count(*)::integer
    into v_unread
    from public.staff_department_messages x
   where x.department_id=v_department.id
     and x.school_id=v_sess.school_id
     and x.created_at>coalesce(v_department.last_read_at,'epoch'::timestamptz)
     and x.sender_teacher_id<>v_sess.teacher_id;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]'::jsonb)
    into v_rows
    from (
      select m.id,m.department_id,m.sender_teacher_id,
             coalesce(t.teacher_name,'Staff') sender_teacher_name,
             m.body,m.created_at
        from public.staff_department_messages m
        left join public.teachers t
          on t.teacher_id=m.sender_teacher_id
         and t.school_id=v_sess.school_id
       where m.department_id=v_department.id
         and m.school_id=v_sess.school_id
       order by m.created_at desc,m.id desc
       limit greatest(1,least(coalesce(p_limit,50),100))
    ) x;

  return jsonb_build_object(
    'ok',true,
    'department',jsonb_build_object(
      'id',v_department.id,
      'department_code',v_department.department_code,
      'department_name',v_department.department_name
    ),
    'rows',v_rows,
    'unread_count',v_unread
  );
end;
$function$;


create or replace function public.rpc_chat_department_send(
  p_session_token text,
  p_department_id bigint,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_department record;
  v_id bigint;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if p_body is null or length(btrim(p_body))=0 or length(p_body)>4000 then
    return jsonb_build_object('ok',false,'error','invalid_message');
  end if;

  if lower(coalesce(v_sess.role,'')) in ('admin','super_admin') then
    select d.id,d.school_id
      into v_department
      from public.staff_departments d
     where d.id=p_department_id
       and d.school_id=v_sess.school_id
       and d.is_active=true
     limit 1;
  else
    select d.id,d.school_id
      into v_department
      from public.staff_departments d
      join public.staff_department_members m
        on m.department_id=d.id
       and m.school_id=v_sess.school_id
       and m.teacher_id=v_sess.teacher_id
       and m.is_active=true
     where d.id=p_department_id
       and d.school_id=v_sess.school_id
       and d.is_active=true
     limit 1;
  end if;

  if v_department is null then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;

  insert into public.staff_department_messages(
    department_id,school_id,sender_teacher_id,body
  ) values (
    v_department.id,v_sess.school_id,v_sess.teacher_id,btrim(p_body)
  ) returning id into v_id;

  return jsonb_build_object('ok',true,'message_id',v_id);
end;
$function$;


create or replace function public.rpc_chat_department_mark_read(
  p_session_token text,
  p_department_id bigint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_ok boolean;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if lower(coalesce(v_sess.role,'')) in ('admin','super_admin') then
    select exists(
      select 1
        from public.staff_departments d
       where d.id=p_department_id
         and d.school_id=v_sess.school_id
         and d.is_active=true
    ) into v_ok;
    if not v_ok then
      return jsonb_build_object('ok',false,'error','forbidden');
    end if;
    return jsonb_build_object('ok',true,'read_at',now());
  end if;

  select exists(
    select 1
      from public.staff_departments d
      join public.staff_department_members m
        on m.department_id=d.id
       and m.school_id=v_sess.school_id
       and m.teacher_id=v_sess.teacher_id
       and m.is_active=true
     where d.id=p_department_id
       and d.school_id=v_sess.school_id
       and d.is_active=true
  ) into v_ok;

  if not v_ok then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;

  update public.staff_department_members m
     set last_read_at=now()
   where m.department_id=p_department_id
     and m.school_id=v_sess.school_id
     and m.teacher_id=v_sess.teacher_id
     and m.is_active=true;

  return jsonb_build_object('ok',true,'read_at',now());
end;
$function$;


-- Grade targets are school grades, not teacher assignment class labels.
-- Recipient resolution maps each selected school grade to active teachers
-- assigned to classes containing students in that grade.
create or replace function public.rpc_chat_recipient_preview(
  p_session_token text,
  p_recipient_type text default 'all_staff',
  p_target text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id, s.teacher_id, s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and s.school_id=t.school_id
     and s.role=t.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if p_recipient_type not in ('all_staff','grade','teacher') then
    return jsonb_build_object('ok',false,'error','unsupported_recipient_type');
  end if;

  if p_recipient_type='grade' then
    if lower(coalesce(v_sess.role,'')) not in ('admin','super_admin') then
      return jsonb_build_object('ok',false,'error','admin_only');
    end if;
    if p_target is null or length(btrim(p_target))=0 or length(p_target)>100 then
      return jsonb_build_object('ok',false,'error','bad_target');
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'teacher_id',x.teacher_id,
        'teacher_name',x.teacher_name,
        'role',x.role,
        'class_name',x.class_name,
        'assignment_type',x.assignment_type
      ) order by x.teacher_name
    ),'[]'::jsonb)
      into v_rows
      from (
        select distinct on (t.teacher_id)
          t.teacher_id,t.teacher_name,t.role,
          a.class_name,a.assignment_type
        from public.teacher_class_assignments a
        join public.teachers t
          on t.teacher_id=a.teacher_id
         and t.school_id=a.school_id
        join public.students s
          on s.school_id=a.school_id
         and lower(trim(s.class))=lower(trim(a.class_name))
       where a.school_id=v_sess.school_id
         and a.is_active=true
         and lower(trim(s.grade))=lower(btrim(p_target))
         and t.school_id=v_sess.school_id
         and t.status='active'
       order by t.teacher_id,a.updated_at desc nulls last,a.id desc
      ) x;

  elsif p_recipient_type='teacher' then
    if lower(coalesce(v_sess.role,'')) not in ('admin','super_admin') then
      return jsonb_build_object('ok',false,'error','admin_only');
    end if;
    if p_target is not null and (length(btrim(p_target))=0 or length(btrim(p_target))>100) then
      return jsonb_build_object('ok',false,'error','bad_target');
    end if;

    select coalesce(jsonb_agg(
      jsonb_build_object('teacher_id',t.teacher_id,'teacher_name',t.teacher_name,'role',t.role)
      order by t.teacher_name
    ),'[]'::jsonb)
      into v_rows
      from public.teachers t
     where t.school_id=v_sess.school_id
       and t.status='active'
       and (p_target is null or t.teacher_id=btrim(p_target));
  else
    select coalesce(jsonb_agg(
      jsonb_build_object('teacher_id',t.teacher_id,'teacher_name',t.teacher_name,'role',t.role)
      order by t.teacher_name
    ),'[]'::jsonb)
      into v_rows
      from public.teachers t
     where t.school_id=v_sess.school_id
       and t.status='active';
  end if;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;


create or replace function public.rpc_chat_announcement_create(
  p_session_token text,
  p_recipient_type text,
  p_target text,
  p_message_type text,
  p_reason text,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_id uuid;
  v_target text:=nullif(btrim(p_target),'');
  v_reason text:=btrim(coalesce(p_reason,''));
  v_body text:=btrim(coalesce(p_body,''));
  v_count int;
begin
  select t.teacher_id,t.school_id,t.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id
     and t.role=s.role
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
   limit 1;

  if not found then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if not (private.web_has_permission(p_session_token,'communication.send',null,null)
          or lower(coalesce(v_sess.role,'')) in ('admin','super_admin')) then
    return jsonb_build_object('ok',false,'error','forbidden');
  end if;

  if lower(coalesce(p_recipient_type,'')) not in ('all_staff','grade','teacher') then
    return jsonb_build_object('ok',false,'error','unsupported_recipient_type');
  end if;
  if lower(coalesce(p_message_type,'')) not in ('announcement','task','notice') then
    return jsonb_build_object('ok',false,'error','invalid_message_type');
  end if;
  if length(v_reason) not between 1 and 500 then
    return jsonb_build_object('ok',false,'error','invalid_reason');
  end if;
  if length(v_body) not between 1 and 4000 then
    return jsonb_build_object('ok',false,'error','invalid_body');
  end if;

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
      join public.teacher_class_assignments a
        on a.teacher_id=t.teacher_id and a.school_id=t.school_id
      join public.students s
        on s.school_id=a.school_id
       and lower(trim(s.class))=lower(trim(a.class_name))
     where t.school_id=v_sess.school_id
       and t.status='active'
       and a.is_active=true
       and s.status='Active'
       and lower(trim(s.grade))=lower(btrim(v_target))
     on conflict do nothing;
  else
    insert into public.staff_announcement_recipients(announcement_id,school_id,teacher_id)
    select v_id,v_sess.school_id,t.teacher_id
      from public.teachers t
     where t.teacher_id=v_target
       and t.school_id=v_sess.school_id
       and t.status='active'
     on conflict do nothing;
  end if;

  select count(*) into v_count
    from public.staff_announcement_recipients r
   where r.announcement_id=v_id;

  if v_count=0 then
    delete from public.staff_announcements where id=v_id;
    return jsonb_build_object('ok',false,'error','no_verified_recipients');
  end if;

  insert into public.audit_log(ts,source,actor,action,school_id,payload)
  values (
    now(),'staff_chat',v_sess.teacher_id,'official_announcement.create',v_sess.school_id,
    jsonb_build_object(
      'announcement_id',v_id,
      'recipient_type',lower(p_recipient_type),
      'target',v_target,
      'message_type',lower(p_message_type),
      'recipient_count',v_count
    )
  );

  return jsonb_build_object('ok',true,'announcement_id',v_id,'recipient_count',v_count);
end;
$function$;

-- Keep Grade Chat on the same canonical student.grade source.
-- Class assignments determine which grades a teacher is entitled to enter;
-- the target value itself is always the student's grade, never class_name.

create or replace function public.rpc_chat_grade_targets(
  p_session_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id, s.teacher_id, s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and s.school_id=t.school_id
     and s.role=t.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select coalesce(jsonb_agg(x.grade_name order by lower(x.grade_name)),'[]'::jsonb)
    into v_rows
    from (
      select distinct nullif(btrim(s.grade),'') as grade_name
        from public.students s
       where s.school_id=v_sess.school_id
         and s.status='Active'
         and nullif(btrim(s.grade),'') is not null
         and (
           lower(coalesce(v_sess.role,'')) in ('admin','super_admin')
           or exists (
             select 1
               from public.teacher_class_assignments a
              where a.school_id=v_sess.school_id
                and a.teacher_id=v_sess.teacher_id
                and a.is_active=true
                and lower(btrim(a.class_name))=lower(btrim(s.class))
           )
         )
    ) x;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

revoke all on function public.rpc_chat_grade_targets(text) from public, anon, authenticated;
grant execute on function public.rpc_chat_grade_targets(text) to anon, authenticated;


create or replace function public.rpc_chat_grade_open(
  p_session_token text,
  p_grade_name text,
  p_limit integer default 50
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_grade text;
  v_rows jsonb;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select min(nullif(btrim(s.grade),''))
    into v_grade
    from public.students s
   where s.school_id=v_sess.school_id
     and s.status='Active'
     and lower(btrim(s.grade))=lower(btrim(p_grade_name))
     and (
       lower(coalesce(v_sess.role,'')) in ('admin','super_admin')
       or exists (
         select 1
           from public.teacher_class_assignments a
          where a.school_id=v_sess.school_id
            and a.teacher_id=v_sess.teacher_id
            and a.is_active=true
            and lower(btrim(a.class_name))=lower(btrim(s.class))
       )
     );

  if v_grade is null then
    return jsonb_build_object('ok',false,'error','unauthorized_grade');
  end if;

  select coalesce(jsonb_agg(z.obj order by z.created_at asc),'[]'::jsonb)
    into v_rows
    from (
      select m.created_at,
             jsonb_build_object(
               'id',m.id,
               'sender_teacher_id',m.sender_teacher_id,
               'sender_teacher_name',coalesce(t.teacher_name,m.sender_teacher_id),
               'body',m.body,
               'created_at',m.created_at
             ) as obj
        from public.staff_grade_messages m
        left join public.teachers t
          on t.teacher_id=m.sender_teacher_id
         and t.school_id=m.school_id
       where m.school_id=v_sess.school_id
         and lower(btrim(m.grade_name))=lower(btrim(v_grade))
       order by m.created_at desc
       limit greatest(1,least(coalesce(p_limit,50),100))
    ) z;

  return jsonb_build_object('ok',true,'grade_name',v_grade,'rows',v_rows);
end;
$function$;

revoke all on function public.rpc_chat_grade_open(text,text,integer) from public, anon, authenticated;
grant execute on function public.rpc_chat_grade_open(text,text,integer) to anon, authenticated;


create or replace function public.rpc_chat_grade_send(
  p_session_token text,
  p_grade_name text,
  p_body text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_grade text;
  v_id bigint;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;
  if nullif(btrim(p_body),'') is null or char_length(btrim(p_body))>4000 then
    return jsonb_build_object('ok',false,'error','invalid_message');
  end if;

  select min(nullif(btrim(s.grade),''))
    into v_grade
    from public.students s
   where s.school_id=v_sess.school_id
     and s.status='Active'
     and lower(btrim(s.grade))=lower(btrim(p_grade_name))
     and (
       lower(coalesce(v_sess.role,'')) in ('admin','super_admin')
       or exists (
         select 1
           from public.teacher_class_assignments a
          where a.school_id=v_sess.school_id
            and a.teacher_id=v_sess.teacher_id
            and a.is_active=true
            and lower(btrim(a.class_name))=lower(btrim(s.class))
       )
     );

  if v_grade is null then
    return jsonb_build_object('ok',false,'error','unauthorized_grade');
  end if;

  insert into public.staff_grade_messages(school_id,grade_name,sender_teacher_id,body)
  values(v_sess.school_id,v_grade,v_sess.teacher_id,btrim(p_body))
  returning id into v_id;

  return jsonb_build_object('ok',true,'message_id',v_id,'grade_name',v_grade);
end;
$function$;

revoke all on function public.rpc_chat_grade_send(text,text,text) from public, anon, authenticated;
grant execute on function public.rpc_chat_grade_send(text,text,text) to anon, authenticated;


create or replace function public.rpc_chat_grade_mark_read(
  p_session_token text,
  p_grade_name text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_grade text;
begin
  select s.school_id,s.teacher_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.school_id=s.school_id
     and t.role=s.role
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select min(nullif(btrim(s.grade),''))
    into v_grade
    from public.students s
   where s.school_id=v_sess.school_id
     and s.status='Active'
     and lower(btrim(s.grade))=lower(btrim(p_grade_name))
     and (
       lower(coalesce(v_sess.role,'')) in ('admin','super_admin')
       or exists (
         select 1
           from public.teacher_class_assignments a
          where a.school_id=v_sess.school_id
            and a.teacher_id=v_sess.teacher_id
            and a.is_active=true
            and lower(btrim(a.class_name))=lower(btrim(s.class))
       )
     );

  if v_grade is null then
    return jsonb_build_object('ok',false,'error','unauthorized_grade');
  end if;

  insert into public.staff_grade_read_state(school_id,teacher_id,grade_name,last_read_at)
  values(v_sess.school_id,v_sess.teacher_id,v_grade,now())
  on conflict (school_id,teacher_id,grade_name) do update set last_read_at=now();

  return jsonb_build_object('ok',true);
end;
$function$;

revoke all on function public.rpc_chat_grade_mark_read(text,text) from public, anon, authenticated;
grant execute on function public.rpc_chat_grade_mark_read(text,text) to anon, authenticated;

