-- ============================================================
-- STUDENT LOOKUP RESPONSE SECURITY — pgTAP tests
-- ============================================================
begin;
select plan(8);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_get_student_by_id'
      and pg_get_function_identity_arguments(p.oid) = 'p_session_token text, p_student_id text'),
  1,
  'student lookup RPC exists with expected signature'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_get_student_by_id'
      and p.prosecdef
      and 'search_path=public, pg_temp' = any(p.proconfig)),
  1,
  'student lookup RPC keeps SECURITY DEFINER and fixed search_path'
);

select ok(
  position('jsonb_build_object' in pg_get_functiondef(
    'public.rpc_get_student_by_id(text,text)'::regprocedure
  )) > 0,
  'student lookup response is explicitly constructed'
);

select ok(
  position('to_jsonb(v_row)' in pg_get_functiondef(
    'public.rpc_get_student_by_id(text,text)'::regprocedure
  )) = 0,
  'student lookup does not serialize the entire student row'
);

select ok(
  position('qr_token' in pg_get_functiondef(
    'public.rpc_get_student_by_id(text,text)'::regprocedure
  )) = 0,
  'student lookup does not expose qr_token'
);

select ok(
  position('parent_phone' in pg_get_functiondef(
    'public.rpc_get_student_by_id(text,text)'::regprocedure
  )) = 0,
  'student lookup does not expose parent_phone'
);

select is(
  (public.rpc_get_student_by_id('', 'audit-nonexistent-student')->>'error'),
  'permission_denied',
  'blank session token is rejected before lookup'
);

select is(
  (public.rpc_get_student_by_id('invalid-test-token-for-audit', 'audit-nonexistent-student')->>'error'),
  'permission_denied',
  'invalid session token is rejected before lookup'
);

select * from finish();
rollback;
