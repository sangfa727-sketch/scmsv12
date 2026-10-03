-- Student history response security regression tests

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'rpc_get_student_history'
    AND pg_get_function_identity_arguments(p.oid) = 'p_session_token text, p_student_id text, p_limit integer';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'rpc_get_student_history function not found';
  END IF;

  IF position('SECURITY DEFINER' in upper(v_def)) = 0 THEN
    RAISE EXCEPTION 'rpc_get_student_history must remain SECURITY DEFINER';
  END IF;

  IF position('SET search_path TO ''public'', ''extensions''' in v_def) = 0 THEN
    RAISE EXCEPTION 'rpc_get_student_history search_path changed unexpectedly';
  END IF;

  IF position('jsonb_build_object(' in v_def) = 0 THEN
    RAISE EXCEPTION 'history response must use explicit JSON construction';
  END IF;

  IF position('to_jsonb(x)' in lower(v_def)) > 0 THEN
    RAISE EXCEPTION 'whole-row serialization must not be used';
  END IF;

  IF position('payload' in lower(v_def)) = 0 THEN
    RAISE EXCEPTION 'payload lookup is expected for student_id filtering';
  END IF;
END $$;

DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.rpc_get_student_history('', 'x', 50);
  IF v_result->>'error' <> 'permission_denied' THEN
    RAISE EXCEPTION 'blank token must be rejected';
  END IF;

  v_result := public.rpc_get_student_history('invalid-token', 'x', 50);
  IF v_result->>'error' <> 'permission_denied' THEN
    RAISE EXCEPTION 'invalid token must be rejected';
  END IF;
END $$;
