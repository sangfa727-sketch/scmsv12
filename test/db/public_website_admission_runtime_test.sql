-- Runtime test for isolated public admission intake. Disposable PostgreSQL only.
-- This test never connects to SCMS production and never creates Student Core rows.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

\ir ../../supabase/migrations/20261011160000_public_school_website_admission_intake.sql

create schema private;
create table public.teachers (
  teacher_id text primary key,
  school_id text not null,
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
create table public.permission_definitions (
  permission_key text primary key,
  category text not null,
  description text not null,
  scope_type text not null,
  is_sensitive boolean not null,
  is_active boolean not null,
  display_order integer not null
);
create table public.role_permissions (
  role text not null,
  permission_key text not null references public.permission_definitions(permission_key),
  allowed boolean not null,
  primary key (role, permission_key)
);
create table public.teacher_permissions (
  school_id text not null,
  teacher_id text not null,
  permission_key text not null,
  allowed boolean not null,
  scope_type text not null,
  class_name text,
  subject_id bigint
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  source text not null,
  actor text not null,
  action text not null,
  school_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create or replace function private.web_has_permission(
  p_session_token text,
  p_permission_key text,
  p_class_name text default null,
  p_subject_id bigint default null
) returns boolean
language sql
security definer
set search_path = public, pg_temp
as $function$
  select coalesce((
    select tp.allowed
      from public.app_web_sessions s
      join public.teachers t
        on t.teacher_id = s.teacher_id
       and t.school_id = s.school_id
       and t.role = s.role
       and t.status = 'active'
      join public.teacher_permissions tp
        on tp.school_id = s.school_id
       and tp.teacher_id = s.teacher_id
       and tp.permission_key = p_permission_key
       and tp.scope_type = 'global'
       and tp.class_name is null
       and tp.subject_id is null
     where s.session_token = p_session_token
       and s.expires_at > now()
     limit 1
  ), false);
$function$;

\ir ../../supabase/migrations/20261011170000_school_website_admission_review.sql
\ir ../../supabase/migrations/20261011180000_school_website_persistent_drafts.sql
\ir ../../supabase/migrations/20261011190000_school_website_publish_and_public_read.sql
\ir ../../supabase/migrations/20261011200000_school_website_subdomain_provisioning.sql

insert into public.teachers(teacher_id,school_id,role,status) values
  ('owner-a','school-a','owner','active'),
  ('staff-a','school-a','teacher','active'),
  ('owner-b','school-b','owner','active');
insert into public.app_web_sessions(session_token,school_id,teacher_id,role,expires_at) values
  ('owner-a-session','school-a','owner-a','owner',now()+interval '1 day'),
  ('staff-a-session','school-a','staff-a','teacher',now()+interval '1 day'),
  ('owner-b-session','school-b','owner-b','owner',now()+interval '1 day');
insert into public.teacher_permissions(school_id,teacher_id,permission_key,allowed,scope_type,class_name,subject_id) values
  ('school-a','owner-a','website.manage',true,'global',null,null),
  ('school-a','staff-a','website.manage',true,'global',null,null),
  ('school-b','owner-b','website.manage',true,'global',null,null),
  ('school-a','owner-a','website.admissions.review',true,'global',null,null),
  ('school-a','staff-a','website.admissions.review',false,'global',null,null),
  ('school-b','owner-b','website.admissions.review',true,'global',null,null),
  ('school-a','owner-a','website.publish',true,'global',null,null),
  ('school-a','staff-a','website.publish',false,'global',null,null),
  ('school-b','owner-b','website.publish',true,'global',null,null);


insert into public.website_sites(school_id, hostname, active) values
  ('school-a', 'school-a.example.test', true),
  ('school-b', 'school-b.example.test', true),
  ('school-disabled', 'closed.example.test', false);

do $test$
declare
  v jsonb;
  v_count bigint;
  i integer;
  v_key text;
begin
  if public.rpc_website_site_origin_allowed('school-a.example.test') is not true then
    raise exception 'active registered site should be allowed for CORS';
  end if;
  if public.rpc_website_site_origin_allowed('closed.example.test') is not false
     or public.rpc_website_site_origin_allowed('unknown.example.test') is not false then
    raise exception 'inactive/unknown site must not receive CORS permission';
  end if;
  if has_function_privilege('anon', 'public.rpc_website_site_origin_allowed(text)', 'execute')
     or has_function_privilege('authenticated', 'public.rpc_website_site_origin_allowed(text)', 'execute')
     or not has_function_privilege('service_role', 'public.rpc_website_site_origin_allowed(text)', 'execute') then
    raise exception 'site-origin RPC execute grants are not service-role-only';
  end if;

  v := public.rpc_website_admission_submit(
    'unknown.example.test', repeat('a',64), 'admission-key-unknown-0001',
    'Student', '', 'Grade 1', 'Guardian', '09123456789', '', '', 'phone', ''
  );
  if v->>'error' is distinct from 'unknown_school' then
    raise exception 'unknown hostname should fail closed: %', v;
  end if;

  v := public.rpc_website_admission_submit(
    'closed.example.test', repeat('a',64), 'admission-key-disabled-001',
    'Student', '', 'Grade 1', 'Guardian', '09123456789', '', '', 'phone', ''
  );
  if v->>'error' is distinct from 'unknown_school' then
    raise exception 'inactive website should fail closed: %', v;
  end if;

  v := public.rpc_website_admission_submit(
    'school-a.example.test', repeat('a',64), 'admission-key-00000001',
    'Student A', '2016-05-10', 'Grade 5', 'Guardian A', '09123456789',
    'guardian@example.test', 'Previous School', 'email', 'Please contact by email.'
  );
  if v->>'ok' is distinct from 'true' or v->>'status' is distinct from 'pending' then
    raise exception 'valid admission submit failed: %', v;
  end if;

  v := public.rpc_website_admission_submit(
    'school-a.example.test', repeat('a',64), 'admission-key-00000001',
    'Student A', '2016-05-10', 'Grade 5', 'Guardian A', '09123456789',
    'guardian@example.test', 'Previous School', 'email', 'Please contact by email.'
  );
  if v->>'error' is distinct from 'duplicate_request' then
    raise exception 'duplicate submission should be rejected: %', v;
  end if;

  -- The same idempotency key is permitted for another school, but never crosses tenants.
  v := public.rpc_website_admission_submit(
    'school-b.example.test', repeat('b',64), 'admission-key-00000001',
    'Student B', '', 'Grade 2', 'Guardian B', '09987654321', '', '', 'phone', ''
  );
  if v->>'ok' is distinct from 'true' then
    raise exception 'other school should have independent idempotency scope: %', v;
  end if;

  v := public.rpc_website_admission_submit(
    'school-a.example.test', repeat('c',64), 'admission-key-future-date-01',
    'Student', '2999-01-01', 'Grade 1', 'Guardian', '09123456789', '', '', 'phone', ''
  );
  if v->>'error' is distinct from 'invalid_input' then
    raise exception 'future date of birth should be rejected: %', v;
  end if;

  v := public.rpc_website_admission_submit(
    'school-a.example.test', repeat('c',64), 'admission-key-contact-mode-01',
    'Student', '', 'Grade 1', 'Guardian', '09123456789', '', '', 'sms', ''
  );
  if v->>'error' is distinct from 'invalid_input' then
    raise exception 'unsupported contact mode should be rejected: %', v;
  end if;

  for i in 1..5 loop
    v_key := 'admission-key-rate-' || lpad(i::text, 8, '0');
    v := public.rpc_website_admission_submit(
      'school-a.example.test', repeat('d',64), v_key,
      'Rate Student ' || i, '', 'Grade 1', 'Rate Guardian', '09123456789', '', '', 'phone', ''
    );
    if v->>'ok' is distinct from 'true' then
      raise exception 'rate limit request % should be allowed: %', i, v;
    end if;
  end loop;

  v := public.rpc_website_admission_submit(
    'school-a.example.test', repeat('d',64), 'admission-key-rate-00000006',
    'Rate Student 6', '', 'Grade 1', 'Rate Guardian', '09123456789', '', '', 'phone', ''
  );
  if v->>'error' is distinct from 'rate_limited' then
    raise exception 'sixth request should be rate limited: %', v;
  end if;

  select count(*) into v_count from public.website_admission_applications;
  if v_count <> 7 then
    raise exception 'expected 7 isolated applications, got %', v_count;
  end if;
  if exists (
    select 1 from public.website_admission_applications
    where school_id = 'school-a' and source_host = 'school-b.example.test'
  ) then
    raise exception 'cross-school hostname was persisted';
  end if;
  if exists (
    select 1 from public.website_admission_applications
    where status <> 'pending'
  ) then
    raise exception 'new public submissions must remain pending';
  end if;

  if has_table_privilege('anon', 'public.website_admission_applications', 'select')
     or has_table_privilege('authenticated', 'public.website_admission_applications', 'select')
     or has_table_privilege('anon', 'public.website_sites', 'select')
     or has_table_privilege('authenticated', 'public.website_admission_rate_limits', 'select') then
    raise exception 'client roles must not have direct table access';
  end if;

  if has_function_privilege('anon', 'public.rpc_website_admission_submit(text,text,text,text,text,text,text,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.rpc_website_admission_submit(text,text,text,text,text,text,text,text,text,text,text,text)', 'execute')
     or not has_function_privilege('service_role', 'public.rpc_website_admission_submit(text,text,text,text,text,text,text,text,text,text,text,text)', 'execute') then
    raise exception 'RPC execute grants are not service-role-only';
  end if;
end
$test$;

delete from public.website_admission_applications;
delete from public.website_admission_rate_limits;

insert into public.website_admission_applications
  (application_id,school_id,source_host,idempotency_key,student_name,applying_grade,guardian_name,guardian_phone,status,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000001','school-a','school-a.example.test','review-key-school-a-0001','Student A1','Grade 3','Guardian A1','09123450001','pending',now()-interval '2 minutes',now()-interval '2 minutes'),
  ('00000000-0000-0000-0000-000000000002','school-a','school-a.example.test','review-key-school-a-0002','Student A2','Grade 4','Guardian A2','09123450002','reviewing',now()-interval '1 minute',now()-interval '1 minute'),
  ('00000000-0000-0000-0000-000000000003','school-b','school-b.example.test','review-key-school-b-0001','Student B1','Grade 2','Guardian B1','09123450003','pending',now(),now());

do $review$
declare
  v jsonb;
  second jsonb;
  v_id uuid;
  v_updated_at timestamptz;
  v_count bigint;
  v_first_id uuid;
  v_second_id uuid;
begin
  v := public.rpc_school_website_get_site('owner-a-session');
  if v->>'ok' is distinct from 'true' or v->>'platform_domain_configured' is distinct from 'false' then
    raise exception 'platform domain should be unconfigured by default: %', v;
  end if;
  v := public.rpc_school_website_provision_subdomain('owner-a-session','bright-future');
  if v->>'error' is distinct from 'platform_domain_not_configured' then
    raise exception 'site reservation must fail closed before platform domain setup: %', v;
  end if;

  insert into public.website_platform_domains(base_domain,active,is_default,verified_at)
  values ('schools.example.test',true,true,now());

  v := public.rpc_school_website_get_site('owner-a-session');
  if v->>'platform_domain_configured' is distinct from 'true' or v->>'found' is distinct from 'false' then
    raise exception 'verified default domain should be available with no reserved school site: %', v;
  end if;
  v := public.rpc_school_website_provision_subdomain('owner-a-session','www');
  if v->>'error' is distinct from 'invalid_slug' then
    raise exception 'reserved subdomain should be rejected: %', v;
  end if;

  v := public.rpc_school_website_provision_subdomain('owner-a-session','bright-future');
  if v->>'ok' is distinct from 'true'
     or v->>'hostname' is distinct from 'bright-future.schools.example.test'
     or v->>'active' is distinct from 'false'
     or v->>'status' is distinct from 'pending_activation' then
    raise exception 'subdomain reservation should remain inactive: %', v;
  end if;
  v := public.rpc_school_website_provision_subdomain('owner-a-session','bright-future');
  if v->>'ok' is distinct from 'true' or v->>'unchanged' is distinct from 'true' then
    raise exception 'repeated reservation should be idempotent: %', v;
  end if;
  v := public.rpc_school_website_provision_subdomain('owner-a-session','another-school-name');
  if v->>'error' is distinct from 'site_already_provisioned' then
    raise exception 'second platform subdomain should not silently replace the first: %', v;
  end if;
  v := public.rpc_school_website_provision_subdomain('owner-b-session','bright-future');
  if v->>'error' is distinct from 'hostname_unavailable' then
    raise exception 'hostname collision must not cross school tenants: %', v;
  end if;
  v := public.rpc_school_website_activate_site('owner-a-session');
  if v->>'error' is distinct from 'publication_required' then
    raise exception 'site must not activate before a publication exists: %', v;
  end if;
  v := public.rpc_school_website_activate_site('staff-a-session');
  if v->>'error' is distinct from 'access_denied' then
    raise exception 'content manager without publish permission must not activate a site: %', v;
  end if;

  -- Persistent draft save/load is tenant-scoped, versioned, and sanitized.
  v := public.rpc_school_website_load_draft('owner-a-session');
  if v->>'ok' is distinct from 'true' or v->>'found' is distinct from 'false' or v->>'version' is distinct from '0' then
    raise exception 'new school should start without a saved draft: %', v;
  end if;

  v := public.rpc_school_website_save_draft(
    'owner-a-session',
    jsonb_build_object(
      'template','modern',
      'schoolName','  Bright Future School  ',
      'tagline','Learning with care',
      'aboutText',repeat('x',4500),
      'programs',jsonb_build_array(' Math ',jsonb_build_object('unsafe','not text'),'Science'),
      'sections',jsonb_build_array(
        jsonb_build_object('id','hero','type','hero','label','Hero','visible',true,'locked',false),
        jsonb_build_object('id','hero','type','hero','label','Duplicate','visible',false)
      ),
      'logo','data:image/svg+xml;base64,PRIVATE'
    ),
    0
  );
  if v->>'ok' is distinct from 'true' or v->>'version' is distinct from '1' then
    raise exception 'first draft save failed: %', v;
  end if;
  if v->'content'->>'schoolName' is distinct from 'Bright Future School'
     or char_length(v->'content'->>'aboutText') <> 4000
     or v->'content' ? 'logo'
     or jsonb_array_length(v->'content'->'programs') <> 2
     or jsonb_array_length(v->'content'->'sections') <> 1
     or v->'content'->'sections'->0->>'locked' is distinct from 'true' then
    raise exception 'draft content was not safely normalized: %', v->'content';
  end if;

  v := public.rpc_school_website_load_draft('staff-a-session');
  if v->>'ok' is distinct from 'true' or v->>'version' is distinct from '1' then
    raise exception 'same-school content manager could not load the draft: %', v;
  end if;

  v := public.rpc_school_website_save_draft(
    'owner-a-session',
    jsonb_build_object('template','premium','schoolName','Updated School'),
    1
  );
  if v->>'ok' is distinct from 'true' or v->>'version' is distinct from '2'
     or v->'content'->>'template' is distinct from 'premium' then
    raise exception 'versioned draft update failed: %', v;
  end if;

  v := public.rpc_school_website_save_draft(
    'owner-a-session',
    jsonb_build_object('template','modern','schoolName','Stale overwrite'),
    1
  );
  if v->>'error' is distinct from 'stale_draft' or v->>'current_version' is distinct from '2' then
    raise exception 'stale draft overwrite should be rejected: %', v;
  end if;

  -- Review and publication require separate permissions; public reads resolve only active hostnames.
  v := public.rpc_school_website_submit_draft_for_review('staff-a-session',2);
  if v->>'ok' is distinct from 'true' or v->>'status' is distinct from 'review' or v->>'version' is distinct from '3' then
    raise exception 'authorized editor could not submit draft for review: %', v;
  end if;

  v := public.rpc_school_website_publish_draft('owner-a-session',2);
  if v->>'error' is distinct from 'stale_draft' then
    raise exception 'publish should reject a stale draft version: %', v;
  end if;
  v := public.rpc_school_website_publish_draft('staff-a-session',3);
  if v->>'error' is distinct from 'access_denied' then
    raise exception 'content manager must not publish without website.publish: %', v;
  end if;

  v := public.rpc_school_website_publish_draft('owner-a-session',3);
  if v->>'ok' is distinct from 'true' or v->>'status' is distinct from 'published'
     or v->>'draft_version' is distinct from '4' or v->>'public_site_active' is distinct from 'true' then
    raise exception 'authorized publication failed: %', v;
  end if;

  v := public.rpc_school_website_get_published('school-a.example.test');
  if v->>'ok' is distinct from 'true' or v->>'found' is distinct from 'true'
     or v->'content'->>'schoolName' is distinct from 'Updated School'
     or v ? 'school_id' then
    raise exception 'public read did not return only the published school content: %', v;
  end if;

  v := public.rpc_school_website_activate_site('owner-a-session');
  if v->>'ok' is distinct from 'true' or v->>'active' is distinct from 'true'
     or v->>'hostname' is distinct from 'bright-future.schools.example.test' then
    raise exception 'authorized site activation failed: %', v;
  end if;
  v := public.rpc_school_website_get_published('bright-future.schools.example.test');
  if v->>'found' is distinct from 'true' or v->'content'->>'schoolName' is distinct from 'Updated School' then
    raise exception 'newly activated subdomain must resolve the published snapshot: %', v;
  end if;
  v := public.rpc_school_website_get_site('owner-a-session');
  if v->'site'->>'active' is distinct from 'true' or v->'site'->>'hostname' is distinct from 'bright-future.schools.example.test' then
    raise exception 'site status endpoint did not reflect activation: %', v;
  end if;
  v := public.rpc_school_website_get_published('school-b.example.test');
  if v->>'ok' is distinct from 'true' or v->>'found' is distinct from 'false' then
    raise exception 'school B must not see school A publication: %', v;
  end if;
  v := public.rpc_school_website_get_published('unknown.example.test');
  if v->>'found' is distinct from 'false' then
    raise exception 'unknown hostname must not resolve to a publication: %', v;
  end if;

  v := public.rpc_school_website_save_draft(
    'owner-a-session',
    jsonb_build_object('template','modern','schoolName','Unpublished edit'),
    4
  );
  if v->>'ok' is distinct from 'true' or v->>'status' is distinct from 'draft' or v->>'version' is distinct from '5' then
    raise exception 'editing a published site should create a new unpublished draft version: %', v;
  end if;
  v := public.rpc_school_website_get_published('school-a.example.test');
  if v->'content'->>'schoolName' is distinct from 'Updated School' then
    raise exception 'editing a draft must not mutate the published snapshot: %', v;
  end if;

  v := public.rpc_school_website_load_draft('owner-b-session');
  if v->>'ok' is distinct from 'true' or v->>'found' is distinct from 'false' then
    raise exception 'other school must not read or discover school A draft: %', v;
  end if;

  v := public.rpc_school_website_save_draft(
    'owner-b-session',
    jsonb_build_object('template','modern','schoolName',''),
    0
  );
  if v->>'ok' is distinct from 'true' then
    raise exception 'an incomplete profile may be saved as a draft: %', v;
  end if;
  v := public.rpc_school_website_submit_draft_for_review('owner-b-session',1);
  if v->>'error' is distinct from 'incomplete_draft' then
    raise exception 'incomplete profile must not be submitted for review: %', v;
  end if;

  v := public.rpc_school_website_save_draft(
    'owner-a-session',
    jsonb_build_object('template','unknown','schoolName','Invalid template'),
    2
  );
  if v->>'error' is distinct from 'invalid_content' then
    raise exception 'invalid draft template should be rejected: %', v;
  end if;

  if has_table_privilege('anon','public.website_drafts','select')
     or has_table_privilege('authenticated','public.website_drafts','select')
     or has_table_privilege('anon','public.website_publications','select')
     or has_table_privilege('authenticated','public.website_publications','select')
     or has_table_privilege('anon','public.website_platform_domains','select')
     or has_table_privilege('authenticated','public.website_platform_domains','select') then
    raise exception 'client roles must not read draft, publication, or platform-domain tables directly';
  end if;
  if not has_function_privilege('anon','public.rpc_school_website_get_published(text)','execute') then
    raise exception 'public published-content RPC should be executable by anon';
  end if;

  v := public.rpc_school_website_authorize('owner-a-session');
  if v->>'authorized' is distinct from 'true' or v->>'admissions_authorized' is distinct from 'true' or v->>'publish_authorized' is distinct from 'true' then
    raise exception 'school owner should receive the separate admission-review capability: %', v;
  end if;
  v := public.rpc_school_website_authorize('staff-a-session');
  if v->>'authorized' is distinct from 'true' or v->>'admissions_authorized' is distinct from 'false' or v->>'publish_authorized' is distinct from 'false' then
    raise exception 'content-only manager must not receive admission-review capability: %', v;
  end if;

  v := public.rpc_school_website_list_admissions('staff-a-session',null,null,25);
  if v->>'error' is distinct from 'access_denied' then
    raise exception 'content managers without website.admissions.review should not read applications: %', v;
  end if;

  v := public.rpc_school_website_list_admissions('owner-a-session',null,null,25);
  if v->>'ok' is distinct from 'true' or jsonb_array_length(v->'items') <> 2 then
    raise exception 'school A owner should see exactly its two applications: %', v;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v->'items') as item(value)
    where value->>'source_host' = 'school-b.example.test'
  ) then
    raise exception 'school A owner received another school application';
  end if;

  v := public.rpc_school_website_list_admissions('owner-b-session',null,null,25);
  if v->>'ok' is distinct from 'true' or jsonb_array_length(v->'items') <> 1
     or v->'items'->0->>'student_name' is distinct from 'Student B1' then
    raise exception 'school B owner did not receive only school B application: %', v;
  end if;

  v := public.rpc_school_website_list_admissions('owner-a-session',null,null,1);
  if v->>'ok' is distinct from 'true' or v->>'has_more' is distinct from 'true'
     or jsonb_array_length(v->'items') <> 1 then
    raise exception 'first admission page/cursor failed: %', v;
  end if;
  v_first_id := (v->'items'->0->>'application_id')::uuid;
  second := public.rpc_school_website_list_admissions(
    'owner-a-session',
    (v->>'next_cursor_created_at')::timestamptz,
    (v->>'next_cursor_application_id')::uuid,
    1
  );
  if second->>'ok' is distinct from 'true' or jsonb_array_length(second->'items') <> 1 then
    raise exception 'second admission page failed: %', second;
  end if;
  v_second_id := (second->'items'->0->>'application_id')::uuid;
  if v_first_id = v_second_id or second->>'has_more' is distinct from 'false' then
    raise exception 'admission pagination duplicated or lost a row: first %, second %', v_first_id, v_second_id;
  end if;

  select updated_at into v_updated_at from public.website_admission_applications
   where application_id='00000000-0000-0000-0000-000000000001';
  v := public.rpc_school_website_update_admission_status(
    'owner-a-session','00000000-0000-0000-0000-000000000001','reviewing',v_updated_at
  );
  if v->>'ok' is distinct from 'true' or v->>'status' is distinct from 'reviewing' then
    raise exception 'pending -> reviewing transition failed: %', v;
  end if;

  v := public.rpc_school_website_update_admission_status(
    'owner-a-session','00000000-0000-0000-0000-000000000003','accepted',now()
  );
  if v->>'error' is distinct from 'application_not_found' then
    raise exception 'cross-school application update should be hidden: %', v;
  end if;

  v := public.rpc_school_website_update_admission_status(
    'staff-a-session','00000000-0000-0000-0000-000000000002','accepted',now()-interval '1 minute'
  );
  if v->>'error' is distinct from 'access_denied' then
    raise exception 'unauthorized status update should be denied: %', v;
  end if;

  v := public.rpc_school_website_update_admission_status(
    'owner-a-session','00000000-0000-0000-0000-000000000001','accepted',v_updated_at
  );
  if v->>'error' is distinct from 'stale_application' then
    raise exception 'stale status update should be rejected: %', v;
  end if;

  select updated_at into v_updated_at from public.website_admission_applications
   where application_id='00000000-0000-0000-0000-000000000001';
  v := public.rpc_school_website_update_admission_status(
    'owner-a-session','00000000-0000-0000-0000-000000000001','accepted',v_updated_at
  );
  if v->>'ok' is distinct from 'true' or v->>'status' is distinct from 'accepted' then
    raise exception 'reviewing -> accepted transition failed: %', v;
  end if;
  select updated_at into v_updated_at from public.website_admission_applications
   where application_id='00000000-0000-0000-0000-000000000001';
  v := public.rpc_school_website_update_admission_status(
    'owner-a-session','00000000-0000-0000-0000-000000000001','reviewing',v_updated_at
  );
  if v->>'error' is distinct from 'application_closed' then
    raise exception 'terminal application status must not reopen: %', v;
  end if;

  select count(*) into v_count from public.audit_log
   where action='website.admission_status_changed' and school_id='school-a';
  if v_count <> 2 then
    raise exception 'expected two audit events for status changes, got %', v_count;
  end if;

  if has_table_privilege('anon','public.website_admission_applications','select')
     or has_table_privilege('authenticated','public.website_admission_applications','select') then
    raise exception 'client roles must not read admission table directly';
  end if;
  -- Revoking platform-domain verification suspends its sites and disables both public reads and intake origin checks.
  update public.website_platform_domains
     set active = false, is_default = false, updated_at = now()
   where base_domain = 'schools.example.test';

  if exists(select 1 from public.website_sites
    where hostname = 'bright-future.schools.example.test' and active = true) then
    raise exception 'root-domain deactivation must suspend its public sites';
  end if;
  if public.rpc_website_site_origin_allowed('bright-future.schools.example.test') is distinct from false then
    raise exception 'admission intake origin must be denied after root-domain deactivation';
  end if;
  v := public.rpc_school_website_get_published('bright-future.schools.example.test');
  if v->>'found' is distinct from 'false' then
    raise exception 'public content must be hidden after root-domain deactivation: %', v;
  end if;
  select count(*) into v_count from public.audit_log
   where action='website.site_suspended_by_domain'
     and school_id='school-a'
     and payload->>'hostname'='bright-future.schools.example.test';
  if v_count <> 1 then
    raise exception 'root-domain deactivation should create a site suspension audit event, got %', v_count;
  end if;

end
$review$;

select 'School Website admission, draft, publication, and subdomain runtime tests passed' as result;
