-- ============================================================
-- RLS POLICIES — pgTAP tests
-- Verified 2026-09-26 against live pg_policies on rszgbryucqwmrdbsgwbb.
-- The real model: every tenant table (students, teachers, invoices,
-- admissions, schools, attendance, grades, etc.) has ONLY
-- service_role-scoped "ALL" policies — anon/authenticated have no
-- policy at all, so RLS default-denies them completely. All real
-- access goes through SECURITY DEFINER RPCs, which run as the
-- function owner and bypass RLS, doing their own session check
-- instead. This file exists to catch the day someone adds a
-- convenience "anon read" policy back (exactly what the 2026-09-19
-- lockdown removed) without noticing what it exposes.
--
-- NOTE: also found 2-3 duplicate identically-scoped policies per
-- table (svc_all / srv_all / service_role_all_x, all service_role,
-- all qual=true) — harmless but worth a cleanup pass someday; not
-- tested here since they're redundant, not wrong.
-- ============================================================

begin;
select plan(6);

insert into schools (school_id, school_name, status) values ('sch-a', 'Test School A', 'active');
insert into students (student_id, school_id, name_en, status)
values ('STU-TEST-A1', 'sch-a', 'Student A1', 'Active');
insert into teachers (teacher_id, school_id, teacher_name, password_hash, status)
values ('T-A1', 'sch-a', 'Teacher A', crypt('pw', gen_salt('bf')), 'active');

-- As anon (no session, no service_role) — direct table access must
-- be fully blocked, for every tenant table checked here.
set local role anon;

select is(
  (select count(*) from public.students)::int, 0,
  'anon cannot read students directly (no anon policy = default deny)'
);
select is(
  (select count(*) from public.teachers)::int, 0,
  'anon cannot read teachers directly'
);
select is(
  (select count(*) from public.schools)::int, 0,
  'anon cannot read schools directly'
);

select throws_ok(
  $$ insert into public.students (student_id, school_id, name_en, status)
     values ('STU-HACK', 'sch-a', 'Hacker', 'Active') $$,
  null, null,
  'anon cannot insert into students directly'
);

select throws_ok(
  $$ update public.students set status = 'Active' where student_id = 'STU-TEST-A1' $$,
  null, null,
  'anon cannot update students directly'
);

select throws_ok(
  $$ delete from public.students where student_id = 'STU-TEST-A1' $$,
  null, null,
  'anon cannot delete from students directly'
);

reset role;
select * from finish();
rollback;
