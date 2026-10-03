-- STUDENT QR RESPONSE SECURITY — pgTAP tests
begin;
select plan(12);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='rpc_get_or_create_student_qr'
     and pg_get_function_identity_arguments(p.oid)='p_session_token text, p_student_id text'),
  1, 'student QR get/create RPC exists'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='rpc_regenerate_student_qr'
     and pg_get_function_identity_arguments(p.oid)='p_session_token text, p_student_id text'),
  1, 'student QR regenerate RPC exists'
);

select ok(position('SECURITY DEFINER' in pg_get_functiondef('public.rpc_get_or_create_student_qr(text,text)'::regprocedure))>0,
 'get/create keeps SECURITY DEFINER');

select ok(position('search_path=public, extensions, pg_temp' in array_to_string((select proconfig from pg_proc where oid='public.rpc_get_or_create_student_qr(text,text)'::regprocedure),','))>0,
 'get/create keeps fixed search_path');

select ok(position('jsonb_build_object' in pg_get_functiondef('public.rpc_get_or_create_student_qr(text,text)'::regprocedure))>0,
 'get/create explicitly constructs response');

select ok(position('to_jsonb(v_row)' in pg_get_functiondef('public.rpc_get_or_create_student_qr(text,text)'::regprocedure))=0,
 'get/create does not serialize whole student row');

select ok(position('qr_token' in pg_get_functiondef('public.rpc_get_or_create_student_qr(text,text)'::regprocedure))=0,
 'get/create response does not expose qr_token');

select ok(position('to_jsonb(v_row)' in pg_get_functiondef('public.rpc_regenerate_student_qr(text,text)'::regprocedure))=0,
 'regenerate does not serialize whole student row');

select ok(position('qr_token' in pg_get_functiondef('public.rpc_regenerate_student_qr(text,text)'::regprocedure))=0,
 'regenerate response does not expose qr_token');

select ok(position('school_id = v_sess.school_id' in pg_get_functiondef('public.rpc_get_or_create_student_qr(text,text)'::regprocedure))>0,
 'get/create keeps school isolation');

select is((public.rpc_get_or_create_student_qr('','nonexistent')->>'error'),'invalid_session',
 'get/create rejects blank session');

select is((public.rpc_regenerate_student_qr('','nonexistent')->>'error'),'invalid_session',
 'regenerate rejects blank session');

select * from finish();
rollback;
