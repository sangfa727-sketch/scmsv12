-- Isolated runtime test for the Manage Teacher/Access permission-gate migration.
-- This creates only disposable test objects in the CI PostgreSQL service.
CREATE SCHEMA IF NOT EXISTS private;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$roles$;

CREATE OR REPLACE FUNCTION private.web_has_permission(p_session_token text, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE
    WHEN p_session_token = 'deny-permissions' AND p_permission = 'permissions.manage' THEN false
    WHEN p_session_token = 'deny-teachers-view' AND p_permission = 'teachers.view' THEN false
    WHEN p_session_token = 'deny-teachers-manage' AND p_permission = 'teachers.manage' THEN false
    ELSE true
  END;
$fn$;

DROP FUNCTION IF EXISTS public.rpc_manage_teacher_access(text,text,text,text,bigint,text,text,boolean,text);
CREATE FUNCTION public.rpc_manage_teacher_access(
  p_session_token text,
  p_action text,
  p_teacher_id text,
  p_class_name text,
  p_subject_id bigint,
  p_assignment_type text,
  p_permission_key text,
  p_allowed boolean,
  p_scope_type text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_admin record;
BEGIN
  SELECT CASE WHEN p_session_token = 'not-admin' THEN 'teacher' ELSE 'admin' END AS role
    INTO v_admin;
  if v_admin is null or v_admin.role not in ('admin','super_admin') then
    return jsonb_build_object('ok',false,'error','admin_required');
  end if;
  if p_action = 'catalog' then
    return jsonb_build_object('ok',true,'branch','catalog');
  end if;
  if p_action = 'list' then
    return jsonb_build_object('ok',true,'branch','list');
  end if;
  if p_action in ('class_add','class_remove','subject_add','subject_remove','permission_set','permission_remove') then
    return jsonb_build_object('ok',true,'branch',p_action);
  end if;
  return jsonb_build_object('ok',false,'error','unsupported_action');
END;
$function$;

\ir ../../supabase/migrations/20261005260000_manage_teacher_access_permission_gate.sql

DO $assertions$
DECLARE
  v jsonb;
  action_name text;
BEGIN
  v := public.rpc_manage_teacher_access('not-admin','catalog','t1',NULL,NULL,NULL,NULL,NULL,NULL);
  IF v->>'error' <> 'admin_required' THEN
    RAISE EXCEPTION 'Expected admin_required, got %', v;
  END IF;

  v := public.rpc_manage_teacher_access('deny-permissions','catalog','t1',NULL,NULL,NULL,NULL,NULL,NULL);
  IF v->>'error' <> 'permission_denied' THEN
    RAISE EXCEPTION 'catalog must require permissions.manage; got %', v;
  END IF;

  v := public.rpc_manage_teacher_access('deny-teachers-view','list','t1',NULL,NULL,NULL,NULL,NULL,NULL);
  IF v->>'error' <> 'permission_denied' THEN
    RAISE EXCEPTION 'list must require teachers.view; got %', v;
  END IF;

  FOREACH action_name IN ARRAY ARRAY['class_add','class_remove','subject_add','subject_remove'] LOOP
    v := public.rpc_manage_teacher_access('deny-teachers-manage',action_name,'t1',NULL,NULL,NULL,NULL,NULL,NULL);
    IF v->>'error' <> 'permission_denied' THEN
      RAISE EXCEPTION 'Action % must require teachers.manage; got %', action_name, v;
    END IF;
  END LOOP;

  FOREACH action_name IN ARRAY ARRAY['permission_set','permission_remove'] LOOP
    v := public.rpc_manage_teacher_access('deny-permissions',action_name,'t1',NULL,NULL,NULL,NULL,NULL,NULL);
    IF v->>'error' <> 'permission_denied' THEN
      RAISE EXCEPTION 'Action % must require permissions.manage; got %', action_name, v;
    END IF;
  END LOOP;

  v := public.rpc_manage_teacher_access('allow','catalog','t1',NULL,NULL,NULL,NULL,NULL,NULL);
  IF v->>'branch' <> 'catalog' THEN
    RAISE EXCEPTION 'Authorized catalog action should reach original function; got %', v;
  END IF;

  v := public.rpc_manage_teacher_access('allow','list','t1',NULL,NULL,NULL,NULL,NULL,NULL);
  IF v->>'branch' <> 'list' THEN
    RAISE EXCEPTION 'Authorized list action should reach original function; got %', v;
  END IF;

  v := public.rpc_manage_teacher_access('allow','unsupported_action','t1',NULL,NULL,NULL,NULL,NULL,NULL);
  IF v->>'error' <> 'unsupported_action' THEN
    RAISE EXCEPTION 'Unsupported action should retain fail-closed original behavior; got %', v;
  END IF;

  RAISE NOTICE 'Manage Teacher/Access permission-gate runtime tests passed.';
END
$assertions$;
