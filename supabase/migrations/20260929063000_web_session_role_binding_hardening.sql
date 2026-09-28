-- Web session role binding hardening
-- Reject stale sessions when the teacher's current role or tenant changes.

create or replace function public.rpc_web_session_verify(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
begin
  select s.session_token, s.teacher_id, s.school_id as session_school_id,
         s.role as session_role, s.expires_at,
         t.teacher_name, t.school_id as teacher_school_id,
         t.role as teacher_role, t.status, t.must_change_password
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
   limit 1;

  if v_sess is null
     or v_sess.session_school_id is distinct from v_sess.teacher_school_id
     or v_sess.session_role is distinct from v_sess.teacher_role then
    update public.app_web_sessions
       set expires_at = now(), last_seen_at = now()
     where session_token = p_session_token;
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  update public.app_web_sessions
     set last_seen_at = now(),
         expires_at = now() + interval '30 days'
   where session_token = p_session_token;

  return jsonb_build_object(
    'ok', true,
    'teacher_id', v_sess.teacher_id,
    'teacher_name', v_sess.teacher_name,
    'school_id', v_sess.teacher_school_id,
    'role', v_sess.teacher_role,
    'must_change_password', v_sess.must_change_password
  );
end;
$function$;

create or replace function public.rpc_change_password(
  p_session_token text,
  p_old_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sess record;
  v_teacher record;
begin
  select s.teacher_id, s.school_id, s.role as session_role,
         t.school_id as teacher_school_id, t.status, t.role as teacher_role
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
   where teacher_id = v_sess.teacher_id;

  if v_teacher.password_hash is not null
     and not (v_teacher.password_hash = crypt(p_old_password, v_teacher.password_hash)) then
    return jsonb_build_object('ok', false, 'error', 'wrong_old_password',
      'message', 'အရင် password မှားနေပါတယ်');
  end if;

  update public.teachers
     set password_hash = public._scms_hash_password(p_new_password),
         must_change_password = false,
         password_changed_at = now()
   where teacher_id = v_sess.teacher_id;

  return jsonb_build_object('ok', true,
    'message', 'Password ပြောင်းပြီးပါပြီ');
end;
$function$;

revoke execute on function public.rpc_web_session_verify(text) from public;
revoke execute on function public.rpc_change_password(text,text,text) from public;
