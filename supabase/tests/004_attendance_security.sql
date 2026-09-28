-- ============================================================
-- ATTENDANCE SECURITY — pgTAP tests
-- ============================================================
-- Covers the canonical web attendance path:
-- session validation, tenant/class roster validation, status validation,
-- persistence, audit logging, and removal of the ambiguous admission RPC.
begin;
select plan(10);

insert into schools (school_id, school_name, status)
values ('att-sec-a', 'Attendance Security A', 'active'),
       ('att-sec-b', 'Attendance Security B', 'active');

insert into teachers (teacher_id, school_id, teacher_name, password_hash, status)
values ('ATT-T1', 'att-sec-a', 'Attendance Tester', crypt('pw', gen_salt('bf')), 'active'),
       ('ATT-T2', 'att-sec-b', 'Other School', crypt('pw', gen_salt('bf')), 'active');

insert into app_web_sessions (session_token, teacher_id, school_id, role, expires_at)
values ('att-token-a', 'ATT-T1', 'att-sec-a', 'teacher', now() + interval '1 day'),
       ('att-token-b', 'ATT-T2', 'att-sec-b', 'teacher', now() + interval '1 day');

insert into students (student_id, school_id, name_en, class, status)
values ('ATT-STU-A', 'att-sec-a', 'Attendance A', 'Grade 1', 'Active'),
       ('ATT-STU-B', 'att-sec-b', 'Attendance B', 'Grade 1', 'Active');

select is(
  (select r->>'error'
     from rpc_save_attendance(
       'not-a-real-token', 'Grade 1', current_date,
       '[{"student_id":"ATT-STU-A","status":"P"}]'::jsonb
     ) r),
  'invalid_session',
  'invalid attendance session is rejected'
);

select is(
  (select r->>'error'
     from rpc_save_attendance(
       'att-token-a', 'Grade 1', current_date,
       '[{"student_id":"ATT-STU-B","status":"P"}]'::jsonb
     ) r),
  'student_not_in_class',
  'cross-school/student-scope injection is rejected'
);

select is(
  (select r->>'error'
     from rpc_save_attendance(
       'att-token-a', 'Grade 1', current_date,
       '[{"student_id":"ATT-STU-A","status":"X"}]'::jsonb
     ) r),
  'invalid_attendance_status',
  'unknown attendance status is rejected'
);

select is(
  (select r->>'ok'
     from rpc_save_attendance(
       'att-token-a', 'Grade 1', current_date,
       '[{"student_id":"ATT-STU-A","status":"A","note":"Late"}]'::jsonb
     ) r),
  'true',
  'valid attendance save succeeds'
);

select is(
  (select count(*)::int
     from attendance
    where school_id='att-sec-a'
      and student_id='ATT-STU-A'
      and date=current_date),
  1,
  'valid attendance row is persisted'
);

select is(
  (select count(*)::int
     from audit_log
    where school_id='att-sec-a'
      and actor='ATT-T1'
      and action='attendance.save'),
  1,
  'attendance save writes an audit event'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='rpc_convert_admission_to_student'
      and pg_get_function_identity_arguments(p.oid) =
          'p_session_token text, p_id bigint, p_class text, p_home_color text'),
  0,
  'ambiguous 4-argument admission conversion overload is removed'
);


select is((select r->>'error' from rpc_get_attendance_audit('att-token-a', NULL, NULL, NULL, 50) r),'admin_only','teacher session cannot read attendance audit');
update app_web_sessions set role='admin' where session_token='att-token-a';
select is((select count(*)::int from jsonb_array_elements((select rpc_get_attendance_audit('att-token-a','Grade 1',current_date,current_date,50)->'rows'))),1,'admin attendance audit returns current school attendance save');
insert into audit_log(source,actor,action,school_id,payload) values('web','ATT-T2','attendance.save','att-sec-b',jsonb_build_object('class','Grade 1','date',current_date,'records_count',1));
select is((select count(*)::int from jsonb_array_elements((select rpc_get_attendance_audit('att-token-a',NULL,NULL,NULL,50)->'rows'))),1,'admin audit reader cannot see another school audit rows');
select * from finish();
rollback;
