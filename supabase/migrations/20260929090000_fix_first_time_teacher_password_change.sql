-- First-time teacher password changes are allowed after authenticated login.
-- Normal password changes still require the current password.
CREATE OR REPLACE FUNCTION public.rpc_change_password(p_session_token text, p_old_password text, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_sess record;
  v_teacher record;
begin
  select s.teacher_id, s.school_id, s.role as session_role,
         t.school_id as teacher_school_id, t.status, t.role as teacher_role,
         t.must_change_password
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
   limit 1;

  if v_sess is null
     or v_sess.status <> 'active'
     or v_sess.school_id is distinct from v_sess.teacher_school_id
     or v_sess.session_role is distinct from v_sess.teacher_role then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  select teacher_id, password_hash, must_change_password
    into v_teacher
    from public.teachers
   where teacher_id = v_sess.teacher_id
     and school_id = v_sess.school_id;

  if v_teacher is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if not coalesce(v_teacher.must_change_password, false) then
    if v_teacher.password_hash is null
       or not (v_teacher.password_hash = crypt(coalesce(p_old_password, ''), v_teacher.password_hash)) then
      return jsonb_build_object('ok', false, 'error', 'wrong_old_password',
        'message', 'အရင် password မှားနေပါတယ်');
    end if;
  end if;

  update public.teachers
     set password_hash = public._scms_hash_password(p_new_password),
         must_change_password = false,
         password_changed_at = now()
   where teacher_id = v_sess.teacher_id
     and school_id = v_sess.school_id;

  return jsonb_build_object('ok', true,
    'message', 'Password ပြောင်းပြီးပါပြီ');
end;
$function$;
