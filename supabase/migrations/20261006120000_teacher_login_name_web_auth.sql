-- SCMS v12: web teacher login by managed login_name + PIN/password.
-- Keep the legacy email-based rpc_teacher_login contract intact.
create or replace function public.rpc_teacher_login_by_login_name(
  p_login_name text,
  p_password text,
  p_device_ua text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_teacher record;
  v_login_name text := lower(trim(coalesce(p_login_name, '')));
  v_token text;
begin
  if v_login_name = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials',
      'message', 'Login name သို့မဟုတ် password မှားနေပါတယ်'
    );
  end if;

  select teacher_id, teacher_name, school_id, status, role, password_hash,
         must_change_password, login_name
    into v_teacher
    from public.teachers
   where lower(trim(login_name)) = v_login_name
   limit 1;

  if v_teacher is null
     or v_teacher.status <> 'active'
     or nullif(trim(v_teacher.login_name), '') is null
     or v_teacher.password_hash is null
     or not (v_teacher.password_hash = extensions.crypt(p_password, v_teacher.password_hash))
  then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials',
      'message', 'Login name သို့မဟုတ် password မှားနေပါတယ်'
    );
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

grant execute on function public.rpc_teacher_login_by_login_name(text, text, text)
  to anon, authenticated;