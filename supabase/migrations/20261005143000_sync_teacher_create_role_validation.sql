-- SCMS v12 — synchronize teacher creation role validation with the canonical role model.
-- Forward migration only. Production deployment requires explicit approval.

create or replace function public.rpc_admin_create_teacher_v2(
  p_session_token text,
  p_teacher_id text,
  p_login_name text,
  p_teacher_name text,
  p_initial_pin text,
  p_role text default 'teacher',
  p_email text default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_admin record;
  v_role text:=lower(trim(coalesce(p_role,'teacher')));
  v_login_name text:=trim(coalesce(p_login_name,''));
  v_email text:=lower(trim(coalesce(p_email,'')));
begin
  select s.teacher_id,s.school_id,s.role as session_role,t.role as teacher_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
     and t.role in ('admin','super_admin')
   limit 1;

  if v_admin is null then
    return jsonb_build_object('ok',false,'error','not_admin','message','Admin login လိုအပ်ပါတယ်');
  end if;

  if v_role not in (
    'teacher','assistant_teacher','senior_teacher',
    'school_coordinator','administrative_assistant','admin','super_admin'
  ) then
    return jsonb_build_object('ok',false,'error','invalid_role');
  end if;

  if v_admin.teacher_role<>'super_admin' and v_role in ('admin','super_admin') then
    return jsonb_build_object('ok',false,'error','insufficient_role');
  end if;

  if char_length(v_login_name)<3
     or char_length(v_login_name)>64
     or v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'
  then
    return jsonb_build_object('ok',false,'error','invalid_login_name',
      'message','Login name must be 3-64 characters using letters, numbers, dot, underscore, or hyphen.');
  end if;

  if char_length(coalesce(p_initial_pin,''))<6 then
    return jsonb_build_object('ok',false,'error','pin_too_short',
      'message','PIN must be at least 6 characters');
  end if;

  if v_email='' or position('@' in v_email)<2 then
    return jsonb_build_object('ok',false,'error','email_required',
      'message','Teacher email လိုအပ်ပါတယ်');
  end if;

  if exists(select 1 from public.teachers where lower(teacher_id)=lower(p_teacher_id)) then
    return jsonb_build_object('ok',false,'error','duplicate_id',
      'message','ဒီ Teacher ID နဲ့ account ရှိနေပါပြီ');
  end if;

  if exists(select 1 from public.teachers where lower(login_name)=lower(v_login_name)) then
    return jsonb_build_object('ok',false,'error','duplicate_login_name',
      'message','ဒီ Login name ကို အသုံးပြုထားပြီးပါပြီ');
  end if;

  if exists(select 1 from public.teachers where lower(trim(email))=v_email) then
    return jsonb_build_object('ok',false,'error','duplicate_email',
      'message','ဒီ email ကို အသုံးပြုထားပြီးပါပြီ');
  end if;

  insert into public.teachers
    (teacher_id,login_name,teacher_name,school_id,status,role,email,
     password_hash,must_change_password,password_changed_at)
  values
    (p_teacher_id,v_login_name,p_teacher_name,v_admin.school_id,'active',v_role,v_email,
     public._scms_hash_password(p_initial_pin),true,now());

  return jsonb_build_object(
    'ok',true,
    'teacher_id',p_teacher_id,
    'login_name',v_login_name,
    'teacher_name',p_teacher_name,
    'school_id',v_admin.school_id,
    'role',v_role,
    'message','Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် password ပြောင်းရပါမယ်။'
  );
end;
$function$;

revoke execute on function public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) to anon,authenticated;
