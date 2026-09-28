-- Fix pgcrypto schema resolution for SECURITY DEFINER auth functions.
-- Supabase installs pgcrypto helpers in the extensions schema; explicit
-- qualification keeps auth working regardless of function search_path.
create or replace function public._scms_hash_password(p_password text)
returns text
language plpgsql
immutable
set search_path = public, extensions, pg_temp
as $function$
begin
  if p_password is null or length(p_password) < 6 then
    raise exception 'Password must be at least 6 characters';
  end if;
  return extensions.crypt(p_password, extensions.gen_salt('bf', 10));
end;
$function$;

create or replace function public.rpc_change_password(p_session_token text, p_old_password text, p_new_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
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
   where s.session_token = p_session_token and s.expires_at > now()
   limit 1;

  if v_sess is null or v_sess.status <> 'active'
     or v_sess.school_id is distinct from v_sess.teacher_school_id
     or v_sess.session_role is distinct from v_sess.teacher_role then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  select teacher_id, password_hash, must_change_password
    into v_teacher
    from public.teachers
   where teacher_id = v_sess.teacher_id and school_id = v_sess.school_id;

  if v_teacher is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_session');
  end if;

  if not coalesce(v_teacher.must_change_password, false) then
    if v_teacher.password_hash is null
       or not (v_teacher.password_hash = extensions.crypt(coalesce(p_old_password, ''), v_teacher.password_hash)) then
      return jsonb_build_object('ok', false, 'error', 'wrong_old_password',
        'message', 'အရင် password မှားနေပါတယ်');
    end if;
  end if;

  update public.teachers
     set password_hash = public._scms_hash_password(p_new_password),
         must_change_password = false,
         password_changed_at = now()
   where teacher_id = v_sess.teacher_id and school_id = v_sess.school_id;

  return jsonb_build_object('ok', true, 'message', 'Password ပြောင်းပြီးပါပြီ');
end;
$function$;

create or replace function public.rpc_email_login(p_email text, p_password text, p_device_ua text default null)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $function$
declare v_teacher record; v_token text;
begin
  select teacher_id, teacher_name, school_id, status, role, password_hash, must_change_password
    into v_teacher from public.teachers where lower(email)=lower(p_email) limit 1;
  if v_teacher is null or v_teacher.password_hash is null then
    return jsonb_build_object('ok',false,'error','invalid_credentials','message','Email သို့မဟုတ် password မှားနေပါတယ်');
  end if;
  if v_teacher.status <> 'active' then
    return jsonb_build_object('ok',false,'error','inactive','message','သင့် account က '||v_teacher.status||' ဖြစ်နေပါတယ်။ Admin ဆီ ဆက်သွယ်ပါ။');
  end if;
  if not (v_teacher.password_hash = extensions.crypt(p_password,v_teacher.password_hash)) then
    return jsonb_build_object('ok',false,'error','invalid_credentials','message','Email သို့မဟုတ် password မှားနေပါတယ်');
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.app_web_sessions(session_token,teacher_id,school_id,role,device_ua)
  values(v_token,v_teacher.teacher_id,v_teacher.school_id,v_teacher.role,p_device_ua);
  update public.teachers set last_web_login_at=now() where teacher_id=v_teacher.teacher_id;
  return jsonb_build_object('ok',true,'auth_mode','email','session_token',v_token,
    'teacher_id',v_teacher.teacher_id,'teacher_name',v_teacher.teacher_name,
    'school_id',v_teacher.school_id,'role',v_teacher.role,'must_change_password',v_teacher.must_change_password);
end;
$function$;

create or replace function public.rpc_teacher_web_login(p_teacher_id text, p_password text, p_device_ua text default null)
returns jsonb
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $function$
declare v_teacher record; v_token text;
begin
  select teacher_id,teacher_name,school_id,status,role,password_hash,must_change_password
    into v_teacher from public.teachers where lower(teacher_id)=lower(p_teacher_id) limit 1;
  if v_teacher is null then return jsonb_build_object('ok',false,'error','invalid_credentials','message','Teacher ID သို့မဟုတ် password မှားနေပါတယ်'); end if;
  if v_teacher.status <> 'active' then return jsonb_build_object('ok',false,'error','inactive','message','သင့် account က '||v_teacher.status||' ဖြစ်နေပါတယ်။ Admin ဆီ ဆက်သွယ်ပါ။'); end if;
  if v_teacher.password_hash is null then return jsonb_build_object('ok',false,'error','no_password_set','message','ဒီ account အတွက် password မသတ်မှတ်ရသေးပါ။ Admin ဆီ password တောင်းပါ။'); end if;
  if not (v_teacher.password_hash = extensions.crypt(p_password,v_teacher.password_hash)) then
    return jsonb_build_object('ok',false,'error','invalid_credentials','message','Teacher ID သို့မဟုတ် password မှားနေပါတယ်');
  end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.app_web_sessions(session_token,teacher_id,school_id,role,device_ua)
  values(v_token,v_teacher.teacher_id,v_teacher.school_id,v_teacher.role,p_device_ua);
  update public.teachers set last_web_login_at=now() where teacher_id=v_teacher.teacher_id;
  return jsonb_build_object('ok',true,'session_token',v_token,'teacher_id',v_teacher.teacher_id,
    'teacher_name',v_teacher.teacher_name,'school_id',v_teacher.school_id,'role',v_teacher.role,
    'must_change_password',v_teacher.must_change_password);
end;
$function$;