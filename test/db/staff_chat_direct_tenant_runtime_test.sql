-- Isolated Direct Chat tenant-isolation runtime harness.
-- Runs only against a disposable PostgreSQL CI service; no production credentials.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;

create table public.teachers (
  teacher_id text primary key,
  school_id text not null,
  teacher_name text not null,
  role text not null,
  status text not null,
  photo_url text,
  classes text[]
);
create table public.app_web_sessions (
  session_token text primary key,
  school_id text not null,
  teacher_id text not null,
  role text not null,
  expires_at timestamptz not null
);

\ir ../../supabase/migrations/20261008110000_staff_direct_messaging.sql
\ir ../../supabase/migrations/20261012100000_staff_direct_conversation_tenant_filters.sql

insert into public.teachers(teacher_id, school_id, teacher_name, role, status, classes) values
  ('a-1', 'school-a', 'A One', 'teacher', 'active', array['Grade 1']),
  ('a-2', 'school-a', 'A Two', 'teacher', 'active', array['Grade 2']),
  ('b-1', 'school-b', 'B One', 'teacher', 'active', array['Grade 1']);

insert into public.app_web_sessions(session_token, school_id, teacher_id, role, expires_at) values
  ('session-a-1', 'school-a', 'a-1', 'teacher', now() + interval '1 day'),
  ('session-b-1', 'school-b', 'b-1', 'teacher', now() + interval '1 day');

insert into public.staff_direct_conversations(id, school_id, pair_key, created_by_teacher_id) values
  (101, 'school-a', 'a-1:a-2-foreign-message', 'a-1'),
  (102, 'school-a', 'a-1:a-2-foreign-member', 'a-1'),
  (103, 'school-a', 'a-1:a-2-valid', 'a-1');

insert into public.staff_direct_members(conversation_id, school_id, teacher_id, teacher_name, last_read_at) values
  (101, 'school-a', 'a-1', 'A One', null),
  (101, 'school-a', 'a-2', 'A Two', null),
  (102, 'school-a', 'a-1', 'A One', null),
  -- Deliberately malformed cross-school membership row: it must not expose a peer.
  (102, 'school-b', 'a-2', 'A Two', null),
  (103, 'school-a', 'a-1', 'A One', null),
  (103, 'school-a', 'a-2', 'A Two', null);

insert into public.staff_direct_messages(conversation_id, school_id, sender_teacher_id, sender_teacher_name, text, created_at) values
  (101, 'school-b', 'b-1', 'B One', 'FOREIGN_SCHOOL_SECRET_PREVIEW', now() - interval '2 minutes'),
  (103, 'school-a', 'a-2', 'A Two', 'valid same-school message', now() - interval '1 minute');

do $test$
declare
  v jsonb;
  v_row jsonb;
begin
  v := public.rpc_chat_direct_conversations('session-a-1');
  if v->>'ok' is distinct from 'true' then
    raise exception 'valid Direct Chat session failed: %', v;
  end if;

  if jsonb_array_length(v->'rows') <> 2 then
    raise exception 'expected only the two conversations with same-school member rows, got: %', v->'rows';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v->'rows') as e(row_data)
     where (row_data->>'conversation_id')::bigint = 102
  ) then
    raise exception 'conversation with foreign-school peer membership leaked into list: %', v->'rows';
  end if;

  select row_data into v_row
    from jsonb_array_elements(v->'rows') as e(row_data)
   where (row_data->>'conversation_id')::bigint = 101;
  if v_row is null then
    raise exception 'expected same-school conversation 101 to remain visible';
  end if;
  if v_row->>'last_message' is not null then
    raise exception 'foreign-school message preview leaked: %', v_row->>'last_message';
  end if;
  if coalesce((v_row->>'unread_count')::int, -1) <> 0 then
    raise exception 'foreign-school message affected unread count: %', v_row->>'unread_count';
  end if;

  select row_data into v_row
    from jsonb_array_elements(v->'rows') as e(row_data)
   where (row_data->>'conversation_id')::bigint = 103;
  if v_row->>'last_message' is distinct from 'valid same-school message' then
    raise exception 'valid same-school preview was lost: %', v_row;
  end if;
  if coalesce((v_row->>'unread_count')::int, -1) <> 1 then
    raise exception 'valid same-school unread count was not preserved: %', v_row->>'unread_count';
  end if;

  v := public.rpc_chat_direct_conversations('invalid-session');
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_session' then
    raise exception 'invalid session was not rejected: %', v;
  end if;
end
$test$;

select 'Staff Chat Direct Chat tenant-isolation runtime tests passed' as result;
