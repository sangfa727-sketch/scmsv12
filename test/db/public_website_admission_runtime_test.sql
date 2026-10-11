-- Runtime test for isolated public admission intake. Disposable PostgreSQL only.
-- This test never connects to SCMS production and never creates Student Core rows.
\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

\ir ../../supabase/migrations/20261011160000_public_school_website_admission_intake.sql

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

select 'Public School Website admission intake runtime tests passed' as result;
