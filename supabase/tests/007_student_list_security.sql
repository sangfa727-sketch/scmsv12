-- ============================================================
-- STUDENT LIST RESPONSE SECURITY — pgTAP tests
-- ============================================================
begin;
select plan(8);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_get_students'
      and pg_get_function_identity_arguments(p.oid) = 'p_session_token text'),
  1,
  'student list RPC exists with expected signature'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rpc_get_students'
      and p.prosecdef
      and 'search_path=public, pg_temp' = any(p.proconfig)),
  1,
  'student list RPC keeps SECURITY DEFINER and fixed search_path'
);

select ok(
  position('jsonb_build_object' in pg_get_functiondef(
    'public.rpc_get_students(text)'::regprocedure
  )) > 0,
  'student list response is explicitly constructed'
);

select ok(
  position('to_jsonb(x)' in pg_get_functiondef(
    'public.rpc_get_students(text)'::regprocedure
  )) = 0,
  'student list does not serialize the entire student row'
);

select ok(
  position('qr_token' in pg_get_functiondef(
    'public.rpc_get_students(text)'::regprocedure
  )) = 0,
  'student list does not expose qr_token'
);

select ok(
  position('metadata' in pg_get_functiondef(
    'public.rpc_get_students(text)'::regprocedure
  )) = 0,
  'student list does not expose metadata'
);

select is(
  (public.rpc_get_students('')->>'error'),
  'invalid_session',
  'blank session token is rejected'
);

select is(
  (public.rpc_get_students('invalid-test-token-for-audit')->>'error'),
  'invalid_session',
  'invalid session token is rejected'
);

select * from finish();
rollback;
