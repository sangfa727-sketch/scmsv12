-- Minimize sensitive parent contact data copied into the append-only audit log.
-- Preserve the existing RPC response contract, but record only changed field names.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_update_student_parent(
  p_session_token text,
  p_student_id text,
  p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL,
  p_parent_phone2 text DEFAULT NULL,
  p_parent_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_sess record;
  v_before public.students%ROWTYPE;
  v_row public.students%ROWTYPE;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF p_student_id IS NULL OR nullif(trim(p_student_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'student_id_required');
  END IF;

  SELECT s.teacher_id, s.school_id, s.role
    INTO v_sess
    FROM public.app_web_sessions AS s
    JOIN public.teachers AS t
      ON t.teacher_id = s.teacher_id
     AND t.school_id = s.school_id
     AND t.role = s.role
     AND t.status = 'active'
    JOIN public.schools AS sc
      ON sc.school_id = t.school_id
     AND sc.status = 'active'
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
   LIMIT 1;

  IF v_sess IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_session');
  END IF;

  IF COALESCE(private.web_has_student_permission(
    p_session_token, 'students.edit', p_student_id
  ), false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'permission_denied');
  END IF;

  SELECT st.* INTO v_before
    FROM public.students AS st
   WHERE st.student_id = p_student_id
     AND st.school_id = v_sess.school_id
   FOR UPDATE;

  IF v_before IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  UPDATE public.students AS st
     SET parent_name = nullif(trim(coalesce(p_parent_name, '')), ''),
         parent_phone = nullif(trim(coalesce(p_parent_phone, '')), ''),
         parent_phone2 = nullif(trim(coalesce(p_parent_phone2, '')), ''),
         parent_email = nullif(lower(trim(coalesce(p_parent_email, ''))), ''),
         updated_at = now()
   WHERE st.student_id = p_student_id
     AND st.school_id = v_sess.school_id
  RETURNING st.* INTO v_row;

  IF v_row.parent_name IS DISTINCT FROM v_before.parent_name THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_name');
  END IF;
  IF v_row.parent_phone IS DISTINCT FROM v_before.parent_phone THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_phone');
  END IF;
  IF v_row.parent_phone2 IS DISTINCT FROM v_before.parent_phone2 THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_phone2');
  END IF;
  IF v_row.parent_email IS DISTINCT FROM v_before.parent_email THEN
    v_changed_fields := array_append(v_changed_fields, 'parent_email');
  END IF;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', v_sess.teacher_id, 'student.parent.update', v_sess.school_id,
    jsonb_build_object(
      'student_id', v_row.student_id,
      'changed_fields', to_jsonb(v_changed_fields)
    )
  );

  -- Keep the current RPC response fields for UI compatibility. The audit log
  -- intentionally does not duplicate the contact values.
  RETURN jsonb_build_object(
    'ok', true,
    'student_id', v_row.student_id,
    'parent_name', v_row.parent_name,
    'parent_phone', v_row.parent_phone,
    'parent_phone2', v_row.parent_phone2,
    'parent_email', v_row.parent_email,
    'parent_tg_id', v_row.parent_tg_id
  );
END;
$function$;

COMMIT;
