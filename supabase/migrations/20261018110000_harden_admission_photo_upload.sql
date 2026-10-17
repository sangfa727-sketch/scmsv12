CREATE OR REPLACE FUNCTION public.rpc_authorize_admission_photo_upload(
  p_session_token text,
  p_admission_id bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  v_school_id text;
BEGIN
  IF nullif(trim(p_session_token), '') IS NULL OR p_admission_id IS NULL OR p_admission_id <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_parameters');
  END IF;

  IF private.web_has_permission(p_session_token, 'admissions.manage', NULL, NULL) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT ws.school_id INTO v_school_id
    FROM public.app_web_sessions ws
    JOIN public.teachers t
      ON t.teacher_id = ws.teacher_id
     AND t.school_id = ws.school_id
     AND t.role = ws.role
     AND lower(t.status) = 'active'
    JOIN public.schools sc
      ON sc.school_id = ws.school_id
     AND lower(sc.status) = 'active'
   WHERE ws.session_token = p_session_token
     AND ws.expires_at > now()
   LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admissions a
     WHERE a.id = p_admission_id AND a.school_id = v_school_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admission_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'school_id', v_school_id, 'admission_id', p_admission_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_authorize_admission_photo_upload(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_authorize_admission_photo_upload(text, bigint) TO service_role;