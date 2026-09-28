-- ============================================================
-- SESSION VALIDATION — pgTAP tests (v2, verified against live schema)
-- Verified 2026-09-26 directly against project rszgbryucqwmrdbsgwbb:
-- real PKs (school_id/teacher_id/student_id are TEXT, not uuid),
-- real column names (teacher_name, school_name), and the real
-- rpc_get_students() signature (session token only, no school_id
-- param — school scoping always comes from the session, never a
-- client-supplied argument, which this file confirms).
--
-- Run: supabase test db   (or: pg_prove -d <conn> this_file.sql)
-- ============================================================

begin;
select plan(6);

insert into schools (school_id, school_name, status) values
  ('sch-a', 'Test School A', 'active'),
  ('sch-b', 'Test School B', 'active');

insert into teachers (teacher_id, school_id, teacher_name, password_hash, status) values
  ('T-A1', 'sch-a', 'Teacher A', crypt('pw', gen_salt('bf')), 'active'),
  ('T-B1', 'sch-b', 'Teacher B', crypt('pw', gen_salt('bf')), 'active'),
  ('T-A2', 'sch-a', 'Teacher A2 (disabled)', crypt('pw', gen_salt('bf')), 'inactive');

insert into app_web_sessions (session_token, teacher_id, school_id, expires_at) values
  ('tok-valid-a1',    'T-A1', 'sch-a', now() + interval '1 day'),
  ('tok-expired-a1',  'T-A1', 'sch-a', now() - interval '1 hour'),
  ('tok-disabled-a2', 'T-A2', 'sch-a', now() + interval '1 day'),
  ('tok-valid-b1',    'T-B1', 'sch-b', now() + interval '1 day');

insert into students (student_id, school_id, name_en, status)
values ('STU-TEST-A1', 'sch-a', 'Student A1', 'Active');

-- 1) Garbage token -> invalid_session, never a Postgres error.
select is(
  (select r->>'ok' from rpc_get_students('not-a-real-token') as r),
  'false',
  'unknown token returns {ok:false}, not an exception'
);
select is(
  (select r->>'error' from rpc_get_students('not-a-real-token') as r),
  'invalid_session',
  'unknown token returns error=invalid_session'
);

-- 2) Expired token -> rejected even though the teacher row is active.
select is(
  (select r->>'ok' from rpc_get_students('tok-expired-a1') as r),
  'false',
  'expired session is rejected'
);

-- 3) Disabled teacher's still-unexpired token -> rejected.
select is(
  (select r->>'ok' from rpc_get_students('tok-disabled-a2') as r),
  'false',
  'inactive teacher status blocks an otherwise-valid session'
);

-- 4) Valid token -> succeeds and returns the school's own student.
select is(
  (select jsonb_array_length(r->'rows') from rpc_get_students('tok-valid-a1') as r),
  1,
  'valid session returns exactly its own school''s Active students'
);

-- 5) THE CROSS-TENANT CHECK — school B's valid session must never
--    see school A's student. rpc_get_students takes no school_id
--    argument at all, so this also confirms scoping can only come
--    from the session row, never something a client could pass.
select is(
  (select jsonb_array_length(r->'rows') from rpc_get_students('tok-valid-b1') as r),
  0,
  'school B session sees zero rows from school A — no cross-tenant leak'
);

select * from finish();
rollback;
