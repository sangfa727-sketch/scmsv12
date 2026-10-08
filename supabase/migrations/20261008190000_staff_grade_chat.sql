-- SCMS v12 — Grade staff chat channels
-- Authorization is derived from active teacher_class_assignments.
create table if not exists public.staff_grade_messages (
  id bigint generated always as identity primary key,
  school_id text not null,
  grade_name text not null,
  sender_teacher_id text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint staff_grade_messages_body_len check (char_length(trim(body)) between 1 and 4000)
);

create table if not exists public.staff_grade_read_state (
  school_id text not null,
  teacher_id text not null,
  grade_name text not null,
  last_read_at timestamptz not null default now(),
  primary key (school_id, teacher_id, grade_name)
);

create index if not exists idx_staff_grade_messages_lookup on public.staff_grade_messages (school_id, grade_name, created_at desc);
create index if not exists idx_staff_grade_read_state_teacher on public.staff_grade_read_state (school_id, teacher_id, grade_name);

alter table public.staff_grade_messages enable row level security;
alter table public.staff_grade_messages force row level security;
alter table public.staff_grade_read_state enable row level security;
alter table public.staff_grade_read_state force row level security;
revoke all on public.staff_grade_messages from anon, authenticated;
revoke all on public.staff_grade_read_state from anon, authenticated;

create or replace function public.rpc_chat_grade_list(p_session_token text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_teacher_id text; v_school_id text;
begin
  select s.teacher_id,s.school_id into v_teacher_id,v_school_id
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_teacher_id is null then raise exception 'invalid_session'; end if;
  return jsonb_build_object('ok',true,'rows',coalesce((
    select jsonb_agg(jsonb_build_object('grade_name',x.grade_name,'unread_count',x.unread_count) order by x.grade_name)
    from (
      select q.grade_name,coalesce((select count(*) from public.staff_grade_messages m
        where m.school_id=v_school_id and lower(trim(m.grade_name))=lower(trim(q.grade_name))
          and m.sender_teacher_id<>v_teacher_id and m.created_at>coalesce(rs.last_read_at,'epoch')),0) unread_count
      from (
        select distinct trim(tca.class_name) grade_name
        from public.teacher_class_assignments tca
        join public.teachers t on t.teacher_id=tca.teacher_id and t.school_id=tca.school_id
        where tca.school_id=v_school_id and tca.teacher_id=v_teacher_id and tca.is_active is true
          and t.status='active' and nullif(trim(tca.class_name),'') is not null
      ) q
      left join public.staff_grade_read_state rs on rs.school_id=v_school_id and rs.teacher_id=v_teacher_id
        and lower(trim(rs.grade_name))=lower(trim(q.grade_name))
    ) x
  ),'[]'::jsonb));
end; $$;

create or replace function public.rpc_chat_grade_open(p_session_token text,p_grade_name text,p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_teacher_id text; v_school_id text; v_grade text;
begin
  select s.teacher_id,s.school_id into v_teacher_id,v_school_id
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_teacher_id is null then raise exception 'invalid_session'; end if;
  select min(trim(tca.class_name)) into v_grade from public.teacher_class_assignments tca
  where tca.school_id=v_school_id and tca.teacher_id=v_teacher_id and tca.is_active is true
    and lower(trim(tca.class_name))=lower(trim(p_grade_name));
  if v_grade is null then raise exception 'unauthorized_grade'; end if;
  return jsonb_build_object('ok',true,'grade_name',v_grade,'rows',coalesce((
    select jsonb_agg(z.obj order by z.created_at asc) from (
      select m.created_at,jsonb_build_object('id',m.id,'sender_teacher_id',m.sender_teacher_id,
        'sender_teacher_name',coalesce(t.teacher_name,m.sender_teacher_id),'body',m.body,'created_at',m.created_at) obj
      from public.staff_grade_messages m
      left join public.teachers t on t.teacher_id=m.sender_teacher_id and t.school_id=m.school_id
      where m.school_id=v_school_id and lower(trim(m.grade_name))=lower(trim(v_grade))
      order by m.created_at desc limit greatest(1,least(coalesce(p_limit,50),100))
    ) z
  ),'[]'::jsonb));
end; $$;

create or replace function public.rpc_chat_grade_send(p_session_token text,p_grade_name text,p_body text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_teacher_id text; v_school_id text; v_grade text; v_id bigint;
begin
  select s.teacher_id,s.school_id into v_teacher_id,v_school_id
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_teacher_id is null then raise exception 'invalid_session'; end if;
  if nullif(trim(p_body),'') is null or char_length(trim(p_body))>4000 then raise exception 'invalid_message'; end if;
  select min(trim(tca.class_name)) into v_grade from public.teacher_class_assignments tca
  where tca.school_id=v_school_id and tca.teacher_id=v_teacher_id and tca.is_active is true
    and lower(trim(tca.class_name))=lower(trim(p_grade_name));
  if v_grade is null then raise exception 'unauthorized_grade'; end if;
  insert into public.staff_grade_messages(school_id,grade_name,sender_teacher_id,body)
  values(v_school_id,v_grade,v_teacher_id,trim(p_body)) returning id into v_id;
  return jsonb_build_object('ok',true,'message_id',v_id,'grade_name',v_grade);
end; $$;

create or replace function public.rpc_chat_grade_mark_read(p_session_token text,p_grade_name text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_teacher_id text; v_school_id text; v_grade text;
begin
  select s.teacher_id,s.school_id into v_teacher_id,v_school_id
  from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
  where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_teacher_id is null then raise exception 'invalid_session'; end if;
  select min(trim(tca.class_name)) into v_grade from public.teacher_class_assignments tca
  where tca.school_id=v_school_id and tca.teacher_id=v_teacher_id and tca.is_active is true
    and lower(trim(tca.class_name))=lower(trim(p_grade_name));
  if v_grade is null then raise exception 'unauthorized_grade'; end if;
  insert into public.staff_grade_read_state(school_id,teacher_id,grade_name,last_read_at) values(v_school_id,v_teacher_id,v_grade,now())
  on conflict (school_id,teacher_id,grade_name) do update set last_read_at=now();
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.rpc_chat_grade_list(text) from public;
revoke all on function public.rpc_chat_grade_open(text,text,integer) from public;
revoke all on function public.rpc_chat_grade_send(text,text,text) from public;
revoke all on function public.rpc_chat_grade_mark_read(text,text) from public;
grant execute on function public.rpc_chat_grade_list(text) to anon, authenticated;
grant execute on function public.rpc_chat_grade_open(text,text,integer) to anon, authenticated;
grant execute on function public.rpc_chat_grade_send(text,text,text) to anon, authenticated;
grant execute on function public.rpc_chat_grade_mark_read(text,text) to anon, authenticated;
