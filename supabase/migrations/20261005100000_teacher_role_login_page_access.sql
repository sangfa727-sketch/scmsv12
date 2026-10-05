-- Teacher web access completion: accept Teacher ID/login name + PIN and expose effective UI permissions.
-- Backend remains the authorization boundary; frontend permissions only improve navigation/UX.

CREATE OR REPLACE FUNCTION public.rpc_teacher_login(
  p_login_name text,
  p_pin text,
  p_device_ua text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_teacher record;
  v_token text;
  v_identity text := nullif(trim(p_login_name), '');
begin
  if v_identity is null or nullif(p_pin, '') is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials',
      'message', 'Teacher ID / Login name သို့မဟုတ် PIN မှားနေပါတယ်');
  end if;

  select teacher_id, login_name, teacher_name, school_id, status, role,
         password_hash, must_change_password
    into v_teacher
    from public.teachers
   where lower(login_name) = lower(v_identity)
      or lower(teacher_id) = lower(v_identity)
   order by case when lower(login_name) = lower(v_identity) then 0 else 1 end
   limit 1;

  if v_teacher is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials',
      'message', 'Teacher ID / Login name သို့မဟုတ် PIN မှားနေပါတယ်');
  end if;

  if v_teacher.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'inactive',
      'message', 'ဒီ account က active မဖြစ်သေးပါ။ Admin ဆီ ဆက်သွယ်ပါ။');
  end if;

  if v_teacher.password_hash is null then
    return jsonb_build_object('ok', false, 'error', 'no_pin_set',
      'message', 'ဒီ account အတွက် PIN မသတ်မှတ်ရသေးပါ။ Admin ဆီ ဆက်သွယ်ပါ။');
  end if;

  if not (v_teacher.password_hash = extensions.crypt(p_pin, v_teacher.password_hash)) then
    return jsonb_build_object('ok', false, 'error', 'invalid_credentials',
      'message', 'Teacher ID / Login name သို့မဟုတ် PIN မှားနေပါတယ်');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.app_web_sessions
    (session_token, teacher_id, school_id, role, device_ua)
  values
    (v_token, v_teacher.teacher_id, v_teacher.school_id, v_teacher.role, p_device_ua);

  update public.teachers
     set last_web_login_at = now()
   where teacher_id = v_teacher.teacher_id;

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'teacher_id', v_teacher.teacher_id,
    'teacher_name', v_teacher.teacher_name,
    'school_id', v_teacher.school_id,
    'role', v_teacher.role,
    'must_change_password', v_teacher.must_change_password
  );
end;
$function$;

-- Return only permission keys suitable for client-side navigation.
-- This is NOT the authorization boundary; protected RPCs must continue
-- enforcing private.web_has_permission server-side.
CREATE OR REPLACE FUNCTION public.rpc_web_bootstrap(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sess    RECORD;
  v_school  RECORD;
  v_classes jsonb;
  v_permissions jsonb;
BEGIN
  SELECT s.teacher_id, s.school_id, s.role,
         t.teacher_name, t.email, t.telegram_id, t.photo_url, t.ui_prefs
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

  SELECT school_id, school_name, config_json
    INTO v_school
    FROM public.schools
   WHERE school_id = v_sess.school_id
   LIMIT 1;

  SELECT COALESCE(
    jsonb_agg(DISTINCT class ORDER BY class) FILTER (WHERE class IS NOT NULL),
    '[]'::jsonb
  )
    INTO v_classes
    FROM public.students
   WHERE school_id = v_sess.school_id
     AND status = 'Active';

  SELECT COALESCE(jsonb_agg(p.permission_key ORDER BY p.display_order, p.permission_key), '[]'::jsonb)
    INTO v_permissions
    FROM public.permission_definitions p
   WHERE p.is_active = true
     AND (
       EXISTS (
         SELECT 1
           FROM public.role_permissions rp
          WHERE rp.role = v_sess.role
            AND rp.permission_key = p.permission_key
            AND rp.allowed = true
       )
       OR EXISTS (
         SELECT 1
           FROM public.teacher_permissions tp
          WHERE tp.school_id = v_sess.school_id
            AND tp.teacher_id = v_sess.teacher_id
            AND tp.permission_key = p.permission_key
            AND tp.scope_type = 'global'
            AND tp.allowed = true
            AND tp.class_name IS NULL
            AND tp.subject_id IS NULL
       )
     )
     AND NOT EXISTS (
       SELECT 1
         FROM public.teacher_permissions tp
        WHERE tp.school_id = v_sess.school_id
          AND tp.teacher_id = v_sess.teacher_id
          AND tp.permission_key = p.permission_key
          AND tp.scope_type = 'global'
          AND tp.allowed = false
          AND tp.class_name IS NULL
          AND tp.subject_id IS NULL
     );

  UPDATE public.app_web_sessions
     SET last_seen_at = now(),
         expires_at   = now() + interval '30 days'
   WHERE session_token = p_session_token;

  RETURN jsonb_build_object(
    'ok',            true,
    'auth_mode',     'web',
    'teacher_id',    v_sess.teacher_id,
    'teacher_name',  v_sess.teacher_name,
    'teacher_role',  v_sess.role,
    'teacher_email', v_sess.email,
    'teacher_photo_url', v_sess.photo_url,
    'telegram_id',   v_sess.telegram_id,
    'school_id',     v_school.school_id,
    'school_name',   v_school.school_name,
    'school_config', v_school.config_json,
    'classes',       v_classes,
    'permissions',   v_permissions,
    'is_admin',      v_sess.role IN ('admin','super_admin'),
    'ui_prefs',      COALESCE(v_sess.ui_prefs, '{}'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_teacher_login(text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_teacher_login(text,text,text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_web_bootstrap(text) FROM public;
GRANT EXECUTE ON FUNCTION public.rpc_web_bootstrap(text) TO anon, authenticated;
