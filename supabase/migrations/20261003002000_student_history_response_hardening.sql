CREATE OR REPLACE FUNCTION public.rpc_get_student_history(p_session_token text, p_student_id text, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_sess record; v_exists boolean; v_limit integer;
BEGIN
  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess
  FROM public.app_web_sessions s
  JOIN public.teachers t ON t.teacher_id=s.teacher_id
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active'
  LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_student_id IS NULL OR trim(p_student_id)='' THEN RETURN jsonb_build_object('ok',false,'error','student_id_required'); END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.students
    WHERE student_id=p_student_id AND school_id=v_sess.school_id
  ) INTO v_exists;
  IF NOT v_exists THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit,50),1),100);
  RETURN jsonb_build_object(
    'ok',true,
    'history',COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',x.id,
          'ts',x.ts,
          'source',x.source,
          'actor',x.actor,
          'action',x.action
        ) ORDER BY x.ts DESC
      )
      FROM (
        SELECT id,ts,source,actor,action
        FROM public.audit_log
        WHERE school_id=v_sess.school_id
          AND payload->>'student_id'=p_student_id
        ORDER BY ts DESC
        LIMIT v_limit
      ) x
    ),'[]'::jsonb)
  );
END;
$function$;
