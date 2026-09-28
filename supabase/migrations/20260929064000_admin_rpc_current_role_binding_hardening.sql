-- Bind privileged admin RPCs to the current teacher record, not stale session role.
-- Also enforce tenant binding and super_admin-only creation of admin accounts/invites.

create or replace function public.rpc_admin_create_invite(
  p_session_token text,
  p_role text default 'teacher',
  p_teacher_name text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_admin record; v_code text;
begin
  select s.teacher_id,s.school_id,s.role as session_role,t.role as teacher_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now()
     and t.status='active' and s.school_id=t.school_id
     and s.role=t.role and t.role in ('admin','super_admin')
   limit 1;
  if v_admin is null then return jsonb_build_object('ok',false,'error','not_admin','message','Admin login လိုအပ်ပါတယ်'); end if;
  if p_role not in ('admin','teacher') then return jsonb_build_object('ok',false,'error','invalid_role'); end if;
  if p_role='admin' and v_admin.teacher_role <> 'super_admin' then return jsonb_build_object('ok',false,'error','insufficient_role'); end if;
  loop
    v_code := (select string_agg(substr('ACDEFGHJKLMNPQRSTUVWXY3479',(random()*25)::int+1,1),'') from generate_series(1,6));
    exit when not exists (select 1 from public.teacher_invites where invite_code=v_code);
  end loop;
  insert into public.teacher_invites(invite_code,school_id,role,teacher_name,created_by)
  values(v_code,v_admin.school_id,p_role,p_teacher_name,v_admin.teacher_id);
  return jsonb_build_object('ok',true,'invite_code',v_code,'role',p_role,'expires_in_days',14);
end;
$function$;

create or replace function public.rpc_admin_create_teacher(
  p_session_token text,p_teacher_id text,p_teacher_name text,p_initial_password text,
  p_role text default 'teacher',p_email text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare v_admin record;
begin
  select s.teacher_id,s.school_id,s.role as session_role,t.role as teacher_role
    into v_admin
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now()
     and t.status='active' and s.school_id=t.school_id
     and s.role=t.role and t.role in ('admin','super_admin')
   limit 1;
  if v_admin is null then return jsonb_build_object('ok',false,'error','not_admin','message','Admin login လိုအပ်ပါတယ်'); end if;
  if p_role not in ('admin','teacher') then return jsonb_build_object('ok',false,'error','invalid_role'); end if;
  if p_role='admin' and v_admin.teacher_role <> 'super_admin' then return jsonb_build_object('ok',false,'error','insufficient_role'); end if;
  if exists(select 1 from public.teachers where lower(teacher_id)=lower(p_teacher_id))
    then return jsonb_build_object('ok',false,'error','duplicate_id','message','ဒီ Teacher ID နဲ့ account ရှိနေပါပြီ'); end if;
  insert into public.teachers(teacher_id,teacher_name,school_id,status,role,email,password_hash,must_change_password,password_changed_at)
  values(p_teacher_id,p_teacher_name,v_admin.school_id,'active',p_role,p_email,public._scms_hash_password(p_initial_password),true,now());
  return jsonb_build_object('ok',true,'teacher_id',p_teacher_id,'teacher_name',p_teacher_name,'school_id',v_admin.school_id,'role',p_role,
    'message','Teacher account ဖန်တီးပြီးပါပြီ။ ပထမဆုံး login တွင် password ပြောင်းရပါမယ်။');
end;
$function$;

create or replace function public.rpc_admin_list_invites(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_admin record; v_rows jsonb;
begin
  select s.school_id into v_admin
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now()
     and t.status='active' and s.school_id=t.school_id and s.role=t.role
     and t.role in ('admin','super_admin') limit 1;
  if v_admin is null then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('invite_code',invite_code,'role',role,'teacher_name',teacher_name,'created_at',created_at,'expires_at',expires_at,'redeemed_at',redeemed_at,'redeemed_by_teacher_id',redeemed_by_teacher_id) order by created_at desc),'[]'::jsonb)
    into v_rows from public.teacher_invites where school_id=v_admin.school_id;
  return jsonb_build_object('ok',true,'invites',v_rows);
end;
$function$;

create or replace function public.rpc_admin_list_teachers(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_rows jsonb;
begin
  select s.school_id,t.role into v_sess
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
     and s.school_id=t.school_id and s.role=t.role and t.role in ('admin','super_admin') limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','admin_only'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('teacher_id',teacher_id,'teacher_name',teacher_name,'role',role,'status',status,'email',email,'last_web_login_at',last_web_login_at,'photo_url',photo_url) order by created_at),'[]'::jsonb)
    into v_rows from public.teachers where school_id=v_sess.school_id;
  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$function$;

create or replace function public.rpc_admin_reset_teacher_password(p_session_token text,p_teacher_id text,p_new_password text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_admin record;
begin
  select s.teacher_id,s.school_id into v_admin
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
     and s.school_id=t.school_id and s.role=t.role and t.role in ('admin','super_admin') limit 1;
  if v_admin is null then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  update public.teachers set password_hash=public._scms_hash_password(p_new_password),must_change_password=true,password_changed_at=now()
   where teacher_id=p_teacher_id and school_id=v_admin.school_id;
  if not found then return jsonb_build_object('ok',false,'error','teacher_not_found'); end if;
  delete from public.app_web_sessions where teacher_id=p_teacher_id;
  return jsonb_build_object('ok',true);
end;
$function$;
