-- Audit teacher ID-card issuance without persisting the bearer token or token hash.
CREATE OR REPLACE FUNCTION public.rpc_admin_create_teacher_card(
  p_session_token text,
  p_teacher_id text,
  p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  a record;
  teacher_row public.teachers%rowtype;
  raw text;
  h text;
  c public.teacher_id_cards%rowtype;
BEGIN
  SELECT s.school_id, s.teacher_id AS admin_id, admin_teacher.role AS admin_role
    INTO a
    FROM public.app_web_sessions s
    JOIN public.teachers admin_teacher
      ON admin_teacher.teacher_id = s.teacher_id
   WHERE s.session_token = p_session_token
     AND s.expires_at > now()
     AND admin_teacher.status = 'active'
     AND s.school_id = admin_teacher.school_id
     AND s.role = admin_teacher.role
     AND admin_teacher.role IN ('admin', 'super_admin')
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT *
    INTO teacher_row
    FROM public.teachers
   WHERE teacher_id = p_teacher_id
     AND school_id = a.school_id
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'teacher_not_found');
  END IF;

  IF a.admin_role <> 'super_admin' AND teacher_row.role = 'super_admin' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_role');
  END IF;

  IF teacher_row.status <> 'active'
     OR nullif(trim(teacher_row.email), '') IS NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'email_required',
      'message', 'Teacher email သတ်မှတ်ပြီးမှ ID Card ထုတ်နိုင်ပါတယ်'
    );
  END IF;

  raw := encode(extensions.gen_random_bytes(24), 'hex');
  h := encode(extensions.digest(raw, 'sha256'), 'hex');

  UPDATE public.teacher_id_cards
     SET revoked_at = now()
   WHERE teacher_id = p_teacher_id
     AND school_id = a.school_id
     AND revoked_at IS NULL;

  INSERT INTO public.teacher_id_cards
    (teacher_id, school_id, token_hash, token_prefix, expires_at, created_by_teacher_id)
  VALUES
    (teacher_row.teacher_id, a.school_id, h, left(raw, 10), p_expires_at, a.admin_id)
  RETURNING * INTO c;

  INSERT INTO public.audit_log(source, actor, action, school_id, payload)
  VALUES (
    'web', a.admin_id, 'teacher.id_card_create', a.school_id,
    jsonb_build_object(
      'teacher_id', teacher_row.teacher_id,
      'card_id', c.card_id,
      'expires_at', c.expires_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', c.card_id,
    'teacher_id', teacher_row.teacher_id,
    'login_name', teacher_row.login_name,
    'teacher_name', teacher_row.teacher_name,
    'role', teacher_row.role,
    'photo_url', teacher_row.photo_url,
    'token', raw,
    'token_prefix', c.token_prefix,
    'expires_at', c.expires_at
  );
END;
$function$;
