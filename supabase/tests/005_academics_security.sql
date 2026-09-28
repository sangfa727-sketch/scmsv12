-- ============================================================
-- ACADEMICS / GRADES SECURITY — pgTAP tests
-- ============================================================
begin;
select plan(7);

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='rpc_create_assessment' and pg_get_function_identity_arguments(p.oid)='p_session_token text, p_term_id bigint, p_subject_id bigint, p_class text, p_title text, p_type text, p_max_score numeric, p_weight numeric, p_date date'),0,'legacy 9-argument assessment overload is removed');

select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rpc_get_subjects','rpc_add_subject','rpc_get_terms','rpc_add_term','rpc_get_assessments','rpc_create_assessment','rpc_delete_assessment','rpc_get_grades','rpc_save_grades','rpc_get_report_card') and (p.proconfig is null or not ('search_path=public, extensions'=any(p.proconfig)))),0,'academics SECURITY DEFINER RPCs use fixed search_path');

select is((select r->>'error' from rpc_get_subjects('not-a-real-token') r),'invalid_session','subjects rejects invalid session');
select is((select r->>'error' from rpc_get_terms('not-a-real-token') r),'invalid_session','terms rejects invalid session');
select is((select r->>'error' from rpc_get_assessments('not-a-real-token',null,null,null) r),'invalid_session','assessments rejects invalid session');
select is((select r->>'error' from rpc_get_grades('not-a-real-token',0) r),'invalid_session','grades rejects invalid session');
select is((select r->>'error' from rpc_save_grades('not-a-real-token',0,'[]'::jsonb) r),'invalid_session','grade save rejects invalid session before processing records');

select * from finish();
rollback;
