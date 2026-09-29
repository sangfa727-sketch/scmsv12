-- Teacher login identity foundation: separate human-facing login name from Teacher ID.
-- Existing teachers keep their current Teacher ID as the initial login name.

alter table public.teachers
  add column if not exists login_name text;

update public.teachers
   set login_name = teacher_id
 where login_name is null;

create unique index if not exists teachers_login_name_lower_uq
  on public.teachers (lower(login_name));

alter table public.teachers
  alter column login_name set not null;

alter table public.teachers
  drop constraint if exists teachers_login_name_format_chk;

alter table public.teachers
  add constraint teachers_login_name_format_chk
  check (
    char_length(login_name) between 3 and 64
    and login_name ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  );

create or replace function public.rpc_teacher_login(
  p_login_name text,
  p_pin text,
  p_device_ua text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_teacher record;
  v_token text;
begin
  select teacher_id, teacher_name, school_id, status, role,
         password_hash, must_change_password
    into v_teacher
    from public.teachers
   where lower(login_name) = lower(trim(p_login_name))
   limit 1;

  if v_teacher is null then
    return jsonb_build_object(
      'ok', false, 'error', 'invalid_credentials',
      'message', 'Login name သို့မဟုတ် PIN မှားနေပါတယ်'
    );
  end if;

  if v_teacher.status <> 'active' then
    return jsonb_build_object(
      'ok', false, 'error', 'inactive',
      'message', 'ဒီ account က active မဖြစ်သေးပါ။ Admin ဆီ ဆက်သွယ်ပါ။'
    );
  end if;

  if v_teacher.password_hash is null then
    return jsonb_build_object(
      'ok', false, 'error', 'no_pin_set',
      'message', 'ဒီ account အတွက် PIN မသတ်မှတ်ရသေးပါ။ Admin ဆီ ဆက်သွယ်ပါ။'
    );
  end if;

  if not (v_teacher.password_hash = extensions.crypt(p_pin, v_teacher.password_hash)) then
    return jsonb_build_object(
      'ok', false, 'error', 'invalid_credentials',
      'message', 'Login name သို့မဟုတ် PIN မှားနေပါတယ်'
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

create or replace function public.rpc_admin_create_teacher_v2(
  p_session_token text,
  p_teacher_id text,
  p_login_name text,
  p_teacher_name text,
  p_initial_pin text,
  p_role text default 'teacher',
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin record;
  v_login_name text := trim(p_login_name);
begin
  select s.teacher_id, s.school_id, s.role as session_role, t.role as teacher_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and s.school_id = t.school_id
     and s.role = t.role
     and t.role in ('admin','super_admin')
   limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'error','not_admin','message','Admin login လိုအပ်ပါတယ်');
  end if;

  if p_role not in ('admin','teacher') then
    return jsonb_build_object('ok',false,'error','invalid_role');
  end if;

  if p_role = 'admin' and v_admin.teacher_role <> 'super_admin' then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  if char_length(v_login_name) < 3 or char_length(v_login_name) > 64
     or v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    return jsonb_build_object('ok',false,'error','invalid_login_name',
      'message','Login name must be 3-64 characters using letters, numbers, dot, underscore, or hyphen.');
  end if;

  if char_length(p_initial_pin) < 6 then
    return jsonb_build_object('ok',false,'error','pin_too_short','message','PIN must be at least 6 characters');
  end if;

  if exists (select 1 from public.teachers where lower(teacher_id) = lower(p_teacher_id)) then
    return jsonb_build_object('ok',false,'error','duplicate_id','message','ဒီ Teacher ID နဲ့ account ရှိနေပါပြီ');
  end if;

  if exists (select 1 from public.teachers where lower(login_name) = lower(v_login_name)) then
    return jsonb_build_object('ok',false,'error','duplicate_login_name','message','ဒီ Login name ကို အသုံးပြုထားပြီးပါပြီ');
  end if;

  insert into public.teachers
    (teacher_id, login_name, teacher_name, school_id, status, role, email,
     password_hash, must_change_password, password_changed_at)
  values
    (p_teacher_id, v_login_name, p_teacher_name, v_admin.school_id, 'active',
     p_role, p_email, public._scms_hash_password(p_initial_pin), true, now());

  return jsonb_build_object(
    'ok',true,
    'teacher_id',p_teacher_id,
    'login_name',v_login_name,
    'teacher_name',p_teacher_name,
    'school_id',v_admin.school_id,
    'role',p_role,
    'message','Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် PIN ပြောင်းရပါမယ်။'
  );
end;
$function$;

create or replace function public.rpc_admin_set_teacher_login_name(
  p_session_token text,
  p_teacher_id text,
  p_login_name text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_admin record;
  v_login_name text := trim(p_login_name);
begin
  select s.school_id, t.role as teacher_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and s.school_id = t.school_id
     and s.role = t.role
     and t.role in ('admin','super_admin')
   limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'error','not_admin');
  end if;

  if char_length(v_login_name) < 3 or char_length(v_login_name) > 64
     or v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    return jsonb_build_object('ok',false,'error','invalid_login_name');
  end if;

  if exists (
    select 1 from public.teachers
     where lower(login_name) = lower(v_login_name)
       and teacher_id <> p_teacher_id
  ) then
    return jsonb_build_object('ok',false,'error','duplicate_login_name');
  end if;

  update public.teachers
     set login_name = v_login_name
   where teacher_id = p_teacher_id
     and school_id = v_admin.school_id;

  if not found then
    return jsonb_build_object('ok',false,'error','teacher_not_found');
  end if;

  return jsonb_build_object('ok',true,'login_name',v_login_name);
end;
$function$;

create or replace function public.rpc_admin_list_teachers(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sess record;
  v_rows jsonb;
begin
  select s.school_id, t.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and s.school_id = t.school_id
     and s.role = t.role
     and t.role in ('admin','super_admin')
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','admin_only');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'teacher_id',teacher_id,
        'login_name',login_name,
        'teacher_name',teacher_name,
        'role',role,
        'status',status,
        'email',email,
        'last_web_login_at',last_web_login_at,
        'photo_url',photo_url
      ) order by created_at
    ),
    '[]'::jsonb
  )
    into v_rows
    from public.teachers
   where school_id = v_sess.school_id;

  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

revoke execute on function public.rpc_teacher_login(text,text,text) from public;
grant execute on function public.rpc_teacher_login(text,text,text) to anon, authenticated;

revoke execute on function public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) from public;
grant execute on function public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) to anon, authenticated;

revoke execute on function public.rpc_admin_set_teacher_login_name(text,text,text) from public;
grant execute on function public.rpc_admin_set_teacher_login_name(text,text,text) to anon, authenticated;

revoke execute on function public.rpc_admin_list_teachers(text) from public;
grant execute on function public.rpc_admin_list_teachers(text) to anon, authenticated;
