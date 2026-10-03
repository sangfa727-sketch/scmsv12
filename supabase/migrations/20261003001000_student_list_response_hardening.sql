-- Student list response hardening
-- Preserve the existing session, permission, school and Active-status filters.
-- Return only fields consumed by the staff student roster/detail UI.

CREATE OR REPLACE FUNCTION public.rpc_get_students(
  p_session_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sess record;
  v_rows jsonb;
BEGIN
  SELECT s.school_id
    INTO v_sess
    FROM public.app_web_sessions s
    JOIN public.teachers t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND t.status = 'active'
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF NOT private.web_has_permission(p_session_token, 'students.view', NULL, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'student_id', x.student_id,
        'name_mm', x.name_mm,
        'name_en', x.name_en,
        'name_local', x.name_local,
        'class', x.class,
        'grade', x.grade,
        'gender', x.gender,
        'date_of_birth', x.date_of_birth,
        'status', x.status,
        'parent_name', x.parent_name,
        'parent_tg_id', x.parent_tg_id,
        'parent_phone', x.parent_phone,
        'parent_phone2', x.parent_phone2,
        'parent_email', x.parent_email,
        'photo_url', x.photo_url,
        'home_color', x.home_color
      )
      ORDER BY x.class, x.name_en
    ),
    '[]'::jsonb
  )
    INTO v_rows
  FROM public.students x
  WHERE x.school_id = v_sess.school_id
    AND x.status = 'Active';

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END;
$function$;
