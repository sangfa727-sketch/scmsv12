-- Isolated Staff Chat Group Chat runtime harness.
-- Runs in a dedicated, disposable PostgreSQL service. No production credentials.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;

create table public.teachers (
  teacher_id text primary key,
  school_id text not null,
  teacher_name text not null,
  role text not null,
  status text not null
);
create table public.app_web_sessions (
  session_token text primary key,
  school_id text not null,
  teacher_id text not null,
  role text not null,
  expires_at timestamptz not null
);

\ir ../../supabase/migrations/20261008050206_staff_project_event_groups.sql
\ir ../../supabase/migrations/20261011120000_staff_project_event_group_member_validation.sql

insert into public.teachers(teacher_id,school_id,teacher_name,role,status) values
  ('owner-1','school-a','Owner One','teacher','active'),
  ('member-1','school-a','Member One','teacher','active'),
  ('member-2','school-a','Member Two','teacher','active'),
  ('inactive-1','school-a','Inactive One','teacher','inactive'),
  ('foreign-1','school-b','Foreign One','teacher','active');

insert into public.app_web_sessions(session_token,school_id,teacher_id,role,expires_at) values
  ('session-owner','school-a','owner-1','teacher',now()+interval '1 day'),
  ('session-member','school-a','member-1','teacher',now()+interval '1 day'),
  ('session-foreign','school-b','foreign-1','teacher',now()+interval '1 day');

do $test$
declare
  v jsonb;
  v_many jsonb;
  g_id bigint;
  group_count bigint;
  member_count bigint;
begin
  -- Valid request inserts the owner and every selected same-school active member.
  v := public.rpc_chat_group_create('session-owner','Valid group',null,'PROJECT',null,null,'["member-1","member-2"]'::jsonb);
  if v->>'ok' is distinct from 'true' then raise exception 'valid group creation failed: %',v; end if;
  g_id := (v->>'group_id')::bigint;
  select count(*) into member_count from public.staff_project_event_group_members where group_id=g_id;
  if member_count<>3 then raise exception 'expected owner + 2 selected members, got %',member_count; end if;

  -- Verify persistent send/open/list/read behavior in the isolated DB.
  v := public.rpc_chat_group_send('session-owner',g_id,'persisted runtime message');
  if v->>'ok' is distinct from 'true' then raise exception 'group send failed: %',v; end if;
  v := public.rpc_chat_group_open('session-member',g_id);
  if v->>'ok' is distinct from 'true'
     or not exists(select 1 from jsonb_array_elements(v->'messages') m where m->>'body'='persisted runtime message') then
    raise exception 'group member could not read persisted message: %',v;
  end if;
  v := public.rpc_chat_group_list('session-member',null,50);
  if v->>'ok' is distinct from 'true' or jsonb_array_length(v->'rows')<>1 then
    raise exception 'group member list did not include the created group: %',v;
  end if;
  v := public.rpc_chat_group_mark_read('session-member',g_id);
  if v->>'ok' is distinct from 'true' then raise exception 'group mark-read failed: %',v; end if;
  v := public.rpc_chat_group_open('session-foreign',g_id);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'group_forbidden' then
    raise exception 'cross-school non-member unexpectedly opened group: %',v;
  end if;

  -- Every invalid member list must fail before creating any group row.
  v := public.rpc_chat_group_create('session-owner','Foreign member',null,'PROJECT',null,null,'["member-1","foreign-1"]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_group_member' then
    raise exception 'cross-school selected member was not rejected: %',v;
  end if;
  v := public.rpc_chat_group_create('session-owner','Inactive member',null,'PROJECT',null,null,'["inactive-1"]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_group_member' then
    raise exception 'inactive selected member was not rejected: %',v;
  end if;
  v := public.rpc_chat_group_create('session-owner','Unknown member',null,'PROJECT',null,null,'["unknown-1"]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_group_member' then
    raise exception 'unknown selected member was not rejected: %',v;
  end if;
  v := public.rpc_chat_group_create('session-owner','Self member',null,'PROJECT',null,null,'["owner-1"]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_group_member' then
    raise exception 'creator selected as member was not rejected: %',v;
  end if;
  v := public.rpc_chat_group_create('session-owner','Duplicate member',null,'PROJECT',null,null,'["member-1","member-1"]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'duplicate_member_id' then
    raise exception 'duplicate member IDs were not rejected: %',v;
  end if;
  v := public.rpc_chat_group_create('session-owner','Malformed object',null,'PROJECT',null,null,'{"id":"member-1"}'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_member_list' then
    raise exception 'non-array member list was not rejected: %',v;
  end if;
  v := public.rpc_chat_group_create('session-owner','Malformed item',null,'PROJECT',null,null,'[42]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_member_list' then
    raise exception 'non-string member ID was not rejected: %',v;
  end if;

  select jsonb_agg(to_jsonb('ghost-' || gs.n::text)) into v_many from generate_series(1,101) as gs(n);
  v := public.rpc_chat_group_create('session-owner','Too many members',null,'PROJECT',null,null,v_many);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'too_many_members' then
    raise exception 'member limit was not enforced: %',v;
  end if;

  v := public.rpc_chat_group_create('invalid-session','Invalid session',null,'PROJECT',null,null,'[]'::jsonb);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_session' then
    raise exception 'invalid session was not rejected: %',v;
  end if;

  select count(*) into group_count from public.staff_project_event_groups;
  if group_count<>1 then raise exception 'failed requests left unexpected group rows: %',group_count; end if;
end
$test$;

select 'Staff Chat Group Chat runtime tests passed' as result;
