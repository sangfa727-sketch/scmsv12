-- Isolated Staff Chat Official Announcements runtime harness.
-- Runs in a disposable PostgreSQL service; no production credentials or writes.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create schema private;

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
create table public.teacher_class_assignments (
  teacher_id text not null,
  school_id text not null,
  class_name text not null,
  is_active boolean not null default true
);
create table public.audit_log (
  ts timestamptz not null,
  source text not null,
  actor text not null,
  action text not null,
  school_id text not null,
  payload jsonb not null
);
create function private.web_has_permission(text,text,text,text)
returns boolean language sql stable as $$ select false $$;

\ir ../../supabase/migrations/20261008130000_official_announcements.sql
\ir ../../supabase/migrations/20261010162000_staff_chat_announcement_read_session_binding.sql

insert into public.teachers(teacher_id,school_id,teacher_name,role,status) values
  ('admin-1','school-a','Admin One','admin','active'),
  ('staff-1','school-a','Staff One','teacher','active'),
  ('staff-2','school-a','Staff Two','teacher','active'),
  ('grade-1','school-a','Grade One Teacher','teacher','active'),
  ('grade-2','school-a','Grade Two Teacher','teacher','active'),
  ('inactive-1','school-a','Inactive Teacher','teacher','inactive'),
  ('foreign-1','school-b','Foreign Teacher','teacher','active');

insert into public.app_web_sessions(session_token,school_id,teacher_id,role,expires_at) values
  ('session-admin','school-a','admin-1','admin',now()+interval '1 day'),
  ('session-staff-1','school-a','staff-1','teacher',now()+interval '1 day'),
  ('session-staff-2','school-a','staff-2','teacher',now()+interval '1 day'),
  ('session-grade-1','school-a','grade-1','teacher',now()+interval '1 day'),
  ('session-grade-2','school-a','grade-2','teacher',now()+interval '1 day'),
  ('session-foreign','school-b','foreign-1','teacher',now()+interval '1 day'),
  ('session-stale-role','school-a','staff-1','admin',now()+interval '1 day');

insert into public.teacher_class_assignments(teacher_id,school_id,class_name,is_active) values
  ('grade-1','school-a','Grade 1',true),
  ('grade-2','school-a','Grade 2',true),
  ('inactive-1','school-a','Grade 1',true),
  ('foreign-1','school-b','Grade 1',true);

do $test$
declare
  v jsonb;
  v_list jsonb;
  v_id uuid;
  v_grade_id uuid;
  v_count integer;
  v_read_at timestamptz;
  v_read_at_after timestamptz;
  v_before_count integer;
begin
  -- Admin can create a school-wide announcement; only active staff from that school are recipients.
  v := public.rpc_chat_announcement_create('session-admin','all_staff',null,'notice','Morning notice','Please read this update.');
  if v->>'ok' is distinct from 'true' then raise exception 'valid all-staff announcement failed: %',v; end if;
  if (v->>'recipient_count')::integer <> 5 then raise exception 'expected five active same-school recipients, got %',v; end if;
  v_id := (v->>'announcement_id')::uuid;
  select count(*) into v_count from public.staff_announcement_recipients where announcement_id=v_id;
  if v_count<>5 then raise exception 'recipient persistence count mismatch: %',v_count; end if;
  if exists(select 1 from public.staff_announcement_recipients where announcement_id=v_id and teacher_id in ('inactive-1','foreign-1')) then
    raise exception 'inactive or cross-school teacher was added as a recipient';
  end if;

  -- Recipients can list the persisted announcement; another school cannot see it.
  v_list := public.rpc_chat_announcement_list('session-staff-1',50);
  if v_list->>'ok' is distinct from 'true' or not exists(select 1 from jsonb_array_elements(v_list->'rows') row where row->>'id'=v_id::text and row->>'body'='Please read this update.') then
    raise exception 'same-school recipient could not list persisted announcement: %',v_list;
  end if;
  v_list := public.rpc_chat_announcement_list('session-foreign',50);
  if v_list->>'ok' is distinct from 'true' or jsonb_array_length(v_list->'rows')<>0 then
    raise exception 'cross-school session received an announcement: %',v_list;
  end if;

  -- Read receipts persist and are idempotent; non-recipients cannot mark the item read.
  v := public.rpc_chat_announcement_mark_read('session-staff-1',v_id);
  if v->>'ok' is distinct from 'true' then raise exception 'recipient read receipt failed: %',v; end if;
  select read_at into v_read_at from public.staff_announcement_recipients where announcement_id=v_id and teacher_id='staff-1';
  if v_read_at is null then raise exception 'read receipt did not persist'; end if;
  v := public.rpc_chat_announcement_mark_read('session-staff-1',v_id);
  select read_at into v_read_at_after from public.staff_announcement_recipients where announcement_id=v_id and teacher_id='staff-1';
  if v->>'ok' is distinct from 'true' or v_read_at_after is distinct from v_read_at then raise exception 'read receipt is not idempotent: %',v; end if;
  v := public.rpc_chat_announcement_mark_read('session-foreign',v_id);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'not_recipient' then raise exception 'non-recipient read was not rejected: %',v; end if;

  -- Grade announcements resolve recipients from active same-school class assignments only.
  v := public.rpc_chat_announcement_create('session-admin','grade','Grade 1','announcement','Grade notice','Grade 1 only.');
  if v->>'ok' is distinct from 'true' or (v->>'recipient_count')::integer<>1 then raise exception 'grade recipient resolution failed: %',v; end if;
  v_grade_id := (v->>'announcement_id')::uuid;
  if not exists(select 1 from public.staff_announcement_recipients where announcement_id=v_grade_id and teacher_id='grade-1') then raise exception 'assigned Grade 1 teacher was not included'; end if;
  if exists(select 1 from public.staff_announcement_recipients where announcement_id=v_grade_id and teacher_id in ('grade-2','inactive-1','foreign-1','staff-1')) then raise exception 'unassigned, inactive, or cross-school teacher was included in grade recipients'; end if;
  v_list := public.rpc_chat_announcement_list('session-staff-1',50);
  if exists(select 1 from jsonb_array_elements(v_list->'rows') row where row->>'id'=v_grade_id::text) then raise exception 'unassigned staff member could see grade announcement'; end if;
  v_list := public.rpc_chat_announcement_list('session-grade-1',50);
  if not exists(select 1 from jsonb_array_elements(v_list->'rows') row where row->>'id'=v_grade_id::text) then raise exception 'assigned Grade 1 teacher could not see grade announcement'; end if;

  -- Invalid recipients, invalid payloads, and invalid sessions fail closed without orphan rows.
  select count(*) into v_before_count from public.staff_announcements;
  v := public.rpc_chat_announcement_create('session-admin','grade','Grade 9','announcement','No recipient','No one is assigned.');
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'no_verified_recipients' then raise exception 'empty verified recipient set was not rejected: %',v; end if;
  v := public.rpc_chat_announcement_create('session-admin','all_staff',null,'notice','Reason','   ');
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_body' then raise exception 'empty body was not rejected: %',v; end if;
  v := public.rpc_chat_announcement_create('session-staff-1','all_staff',null,'notice','Staff attempt','Should be forbidden.');
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'forbidden' then raise exception 'non-admin send without permission was not rejected: %',v; end if;
  v := public.rpc_chat_announcement_create('session-stale-role','all_staff',null,'notice','Stale role','Must be rejected.');
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_session' then raise exception 'stale role session was not rejected: %',v; end if;
  v := public.rpc_chat_announcement_list('session-stale-role',50);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_session' then raise exception 'stale role list session was not rejected: %',v; end if;
  v := public.rpc_chat_announcement_mark_read('session-stale-role',v_id);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_session' then raise exception 'stale role read session was not rejected: %',v; end if;
  v := public.rpc_chat_announcement_list('invalid-session',50);
  if v->>'ok' is distinct from 'false' or v->>'error' is distinct from 'invalid_session' then raise exception 'invalid session was not rejected: %',v; end if;
  select count(*) into v_count from public.staff_announcements;
  if v_count<>v_before_count then raise exception 'failed create requests left orphan announcements: before %, after %',v_before_count,v_count; end if;

  if has_table_privilege('anon','public.staff_announcements','select') or has_table_privilege('authenticated','public.staff_announcements','select') then
    raise exception 'client role has direct table SELECT grant';
  end if;
end
$test$;

select 'Staff Chat Official Announcements runtime tests passed' as result;
