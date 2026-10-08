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
         and nullif(btrim(s.grade),'') is not null
      union
      select distinct nullif(btrim(a.class_name),'') as grade_name
        from public.teacher_class_assignments a
       where a.school_id = v_sess.school_id
         and a.is_active = true
         and nullif(btrim(a.class_name),'') is not null
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
