-- Allow a browser holding a server-issued session token to revoke that exact session.
-- This function exposes no session data and never accepts a teacher or school ID.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_web_logout(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  IF p_session_token IS NULL OR p_session_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  DELETE FROM public.app_web_sessions
   WHERE session_token = p_session_token;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Idempotent by design: a repeated logout must not restore or expose a session.
  RETURN jsonb_build_object('ok', true, 'revoked', v_deleted = 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_web_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_web_logout(text) TO anon, authenticated;

COMMIT;
