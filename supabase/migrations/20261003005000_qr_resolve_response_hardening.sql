-- QR resolve response hardening
CREATE OR REPLACE FUNCTION public.rpc_qr_resolve(p_qr_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_row record;
BEGIN
  IF p_qr_token IS NULL OR trim(p_qr_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_token');
  END IF;

  SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,
         sc.school_name
    INTO v_row
    FROM public.students st
    JOIN public.schools sc ON sc.school_id = st.school_id
   WHERE st.qr_token = p_qr_token AND st.status = 'Active';

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_inactive');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student', jsonb_build_object(
      'student_id', v_row.student_id,
      'name_en', v_row.name_en,
      'name_local', v_row.name_local,
      'class', v_row.class,
      'photo_url', v_row.photo_url,
      'school_name', v_row.school_name
    )
  );
END
$function$;