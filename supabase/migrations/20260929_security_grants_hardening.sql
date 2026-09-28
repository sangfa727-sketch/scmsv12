-- SCMS security hardening: remove public Data API exposure from internal-only objects
-- Applied to production on 2026-09-29. REVOKE/ALTER statements are idempotent.

revoke select on table public.app_sessions, public.audit_log, public.n8n_state from anon, authenticated;
revoke select on public.pg_all_foreign_keys, public.tap_funky, public.v_students_full, public.v_today_attendance from anon, authenticated;

revoke execute on function public._billing_session(text) from public, anon, authenticated;

alter function public.rpc_app_session_poll(text) set search_path = public, pg_temp;
alter function public.rpc_get_chat_messages(text,text,integer) set search_path = public, pg_temp;
alter function public.rpc_parent_get_dashboard(text) set search_path = public, pg_temp;
alter function public.rpc_parent_portal_event_create(text,text,text,text,text,text,timestamptz,timestamptz) set search_path = public, pg_temp;
alter function public.rpc_parent_portal_event_delete(text,bigint) set search_path = public, pg_temp;
alter function public.rpc_set_my_ui_prefs(text,jsonb) set search_path = public, pg_temp;
alter function public.rpc_set_school_branding(text,jsonb) set search_path = public, pg_temp;
alter function public.rpc_set_school_cover(text,text) set search_path = public, pg_temp;
alter function public.rpc_set_school_logo(text,text) set search_path = public, pg_temp;
alter function public.rpc_reactivate_student(text,text) set search_path = public, pg_temp;
