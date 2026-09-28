-- ============================================================
-- ADMISSIONS -> BILLING-GATED ENROLLMENT — pgTAP tests (v2)
-- Verified 2026-09-26 against live schema. Real chain is:
--   rpc_create_admission -> rpc_convert_admission_to_student
--   -> rpc_create_invoice -> rpc_link_admission_invoice
--   -> (mark Paid) -> rpc_activate_student
-- rpc_link_admission_invoice does NOT create an invoice itself —
-- it only links an *existing* invoice id to the admission. The
-- invoice is created separately via rpc_create_invoice.
-- ============================================================

begin;
select plan(7);

insert into schools (school_id, school_name, status) values ('sch-a', 'Test School A', 'active');
insert into teachers (teacher_id, school_id, teacher_name, password_hash, status)
values ('T-A1', 'sch-a', 'Teacher A', crypt('pw', gen_salt('bf')), 'active');
insert into app_web_sessions (session_token, teacher_id, school_id, expires_at)
values ('tok-valid-a1', 'T-A1', 'sch-a', now() + interval '1 day');
insert into terms (school_id, term_name, is_current) values ('sch-a', 'Term 1', true);

-- ---- KNOWN LIVE BUG, tested and documented, not worked around here ----
-- public.rpc_convert_admission_to_student exists as TWO overloads
-- (4-arg and 5-arg-with-p_status) with identical leading params.
-- Confirmed live on rszgbryucqwmrdbsgwbb 2026-09-26: calling it the
-- way the frontend naturally would (session_token, id, class,
-- home_color — no p_status) raises Postgres error 42725 "function
-- is not unique" / PostgREST 300 Multiple Choices. This test proves
-- the ambiguity exists so it's caught in CI until the duplicate is
-- dropped — do not "fix" this test by only using named p_status;
-- that hides the bug instead of catching it.
select throws_ok(
  $$ select rpc_convert_admission_to_student('x', 1::bigint, 'Grade 1', 'Red') $$,
  '42725',
  null,
  'rpc_convert_admission_to_student(4 args) is ambiguous — DUPLICATE OVERLOAD BUG, see README'
);

-- Work around the bug just to exercise the rest of the flow, using
-- named notation with p_status to force the 5-arg overload:
select rpc_create_admission('tok-valid-a1', 'Kid A') \gset admission_
select rpc_convert_admission_to_student(
         p_session_token => 'tok-valid-a1',
         p_id            => (admission_r->'admission'->>'id')::bigint,
         p_class         => 'Grade 1',
         p_status        => 'Pending'
       ) \gset convert_

select is(
  (convert_r->>'ok'), 'true',
  'converting an admission creates a student row (Pending)'
);

-- Pending students must NOT appear in the normal (Active-only) students list.
select is(
  (select jsonb_array_length(r->'rows') from rpc_get_students('tok-valid-a1') as r),
  0,
  'a Pending student is hidden from rpc_get_students (which filters status=Active)'
);

-- Step 2: create the registration invoice, then link it to the admission.
select rpc_create_invoice(
         'tok-valid-a1',
         (convert_r->'student'->>'student_id'),
         (select id from terms where school_id = 'sch-a' and is_current),
         current_date + 14,
         'Registration fee',
         '[{"description":"Registration fee","amount":100}]'::jsonb
       ) \gset invoice_

select rpc_link_admission_invoice(
         'tok-valid-a1',
         (admission_r->'admission'->>'id')::bigint,
         (invoice_r->'invoice'->>'id')::bigint
       ) \gset link_

select is(
  (link_r->>'ok'), 'true',
  'rpc_link_admission_invoice succeeds against a real, existing invoice id'
);
select is(
  (link_r->'admission'->>'registration_invoice_id'),
  (invoice_r->'invoice'->>'id'),
  'the admission''s registration_invoice_id now points at the created invoice'
);

-- Step 3: activate BEFORE paying — must be blocked (this is the
-- actual gate rpc_activate_student enforces in production).
select is(
  (select r->>'error' from rpc_activate_student('tok-valid-a1',
     (convert_r->'student'->>'student_id')) as r),
  'registration_fee_not_paid',
  'activation is blocked while the registration invoice is unpaid'
);

-- Now mark it Paid and activate for real.
update invoices set status = 'Paid'
  where id = (invoice_r->'invoice'->>'id')::bigint;

select is(
  (select r->'student'->>'status' from rpc_activate_student('tok-valid-a1',
     (convert_r->'student'->>'student_id')) as r),
  'Active',
  'rpc_activate_student succeeds once the invoice is Paid, status -> Active'
);

select * from finish();
rollback;
