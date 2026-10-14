-- Harden the shared billing session helpers against stale tenant/role bindings.
-- Keep these helpers internal: public RPCs execute them as their function owner.
-- This migration does not touch live data or revoke access to the public billing RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public._billing_session(p_session_token text)
RETURNS TABLE(v_school_id text, v_teacher_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
    SELECT s.school_id, s.teacher_id
      FROM public.app_web_sessions AS s
      JOIN public.teachers AS t
        ON t.teacher_id = s.teacher_id
       AND t.school_id = s.school_id
       AND t.role = s.role
     WHERE s.session_token = p_session_token
       AND s.expires_at > now()
       AND t.status = 'active';
END;
$function$;

CREATE OR REPLACE FUNCTION public._billing_admin_session(p_session_token text)
RETURNS TABLE(v_school_id text, v_teacher_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
    SELECT s.school_id, s.teacher_id
      FROM public.app_web_sessions AS s
      JOIN public.teachers AS t
        ON t.teacher_id = s.teacher_id
       AND t.school_id = s.school_id
       AND t.role = s.role
     WHERE s.session_token = p_session_token
       AND s.expires_at > now()
       AND t.status = 'active'
       AND t.role IN ('admin', 'super_admin');
END;
$function$;

-- These helpers return internal tenant and teacher identifiers and are only
-- intended to be called by SECURITY DEFINER billing RPCs, not browser clients.
REVOKE ALL ON FUNCTION public._billing_session(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._billing_admin_session(text) FROM PUBLIC, anon, authenticated;

COMMIT;
