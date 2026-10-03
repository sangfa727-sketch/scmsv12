-- QR RESOLVE RESPONSE SECURITY — pgTAP tests
begin;
select plan(8);

select is(
 (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rpc_qr_resolve'
    and pg_get_function_identity_arguments(p.oid)='p_qr_token text'),
 1,'QR resolve RPC exists');

select is(
 (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='rpc_qr_resolve' and p.prosecdef
    and 'search_path=public, pg_temp'=any(p.proconfig)),
 1,'QR resolve keeps SECURITY DEFINER and fixed search_path');

select ok(position('jsonb_build_object' in pg_get_functiondef('public.rpc_qr_resolve(text)'::regprocedure))>0,
 'QR resolve response is explicitly constructed');

select ok(position('to_jsonb(v_row)' in pg_get_functiondef('public.rpc_qr_resolve(text)'::regprocedure))=0,
 'QR resolve does not serialize the whole row');

select ok(position('school_id' in substring(pg_get_functiondef('public.rpc_qr_resolve(text)'::regprocedure) from position('RETURN jsonb_build_object' in pg_get_functiondef('public.rpc_qr_resolve(text)'::regprocedure))))=0,
 'QR resolve response does not expose school_id');

select is((public.rpc_qr_resolve('')->>'error'),'missing_token',
 'blank QR token is rejected');

select is((public.rpc_qr_resolve('invalid-test-qr-token')->>'error'),'invalid_or_inactive',
 'invalid QR token is rejected');

select ok(position('st.status = ''Active''' in pg_get_functiondef('public.rpc_qr_resolve(text)'::regprocedure))>0,
 'QR resolve only returns active students');

select * from finish();
rollback;