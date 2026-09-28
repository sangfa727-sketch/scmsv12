create or replace function public.rpc_email_signup(
p_email text,p_password text,p_teacher_name text,p_device_ua text default null::text,
p_invite_code text default null::text,p_new_school_name text default null::text
) returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_invite record; v_school_id text; v_teacher_id text; v_token text;
begin
if p_email is null or trim(p_email)='' or position('@' in p_email)=0 then return jsonb_build_object('ok',false,'error','invalid_email','message','Email မှားနေပါတယ်'); end if;
if p_password is null or length(p_password)<6 then return jsonb_build_object('ok',false,'error','weak_password','message','Password အနည်းဆုံး ၆ လုံး ရှိရပါမယ်'); end if;
if p_teacher_name is null or trim(p_teacher_name)='' then return jsonb_build_object('ok',false,'error','missing_name','message','နာမည် ထည့်ပါ'); end if;
if exists(select 1 from public.teachers where lower(email)=lower(p_email) or lower(google_email)=lower(p_email)) then return jsonb_build_object('ok',false,'error','email_in_use','message','ဒီ email နဲ့ account ရှိပြီးသားပါ — Sign in လုပ်ပါ'); end if;
if p_invite_code is not null then
 select * into v_invite from public.teacher_invites where invite_code=p_invite_code and redeemed_at is null and expires_at>now() limit 1 for update;
 if v_invite is null then return jsonb_build_object('ok',false,'error','invalid_invite','message','Invite code မှားနေတယ် (သို့) သက်တမ်းကုန်သွားပါပြီ'); end if;
 v_teacher_id:=_scms_new_teacher_id_for_invite(v_invite.school_id);
 insert into public.teachers(teacher_id,teacher_name,school_id,status,role,email,password_hash,must_change_password,password_changed_at) values(v_teacher_id,p_teacher_name,v_invite.school_id,'active',v_invite.role,p_email,public._scms_hash_password(p_password),false,now());
 update public.teacher_invites set redeemed_at=now(),redeemed_by_teacher_id=v_teacher_id where invite_code=p_invite_code;
 v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.app_web_sessions(session_token,teacher_id,school_id,role,device_ua) values(v_token,v_teacher_id,v_invite.school_id,v_invite.role,p_device_ua);
 return jsonb_build_object('ok',true,'auth_mode','email','session_token',v_token,'teacher_id',v_teacher_id,'teacher_name',p_teacher_name,'school_id',v_invite.school_id,'role',v_invite.role,'must_change_password',false,'message','Account ချိတ်ဆက်ပြီးပါပြီ');
end if;
if p_new_school_name is not null and length(trim(p_new_school_name))>0 then
 select rpc_generate_school_id() into v_school_id;
 insert into public.schools(school_id,school_name,status,school_email,created_at) values(v_school_id,p_new_school_name,'active',p_email,now());
 v_teacher_id:=_scms_new_teacher_id_for_invite(v_school_id);
 insert into public.teachers(teacher_id,teacher_name,school_id,status,role,email,password_hash,must_change_password,password_changed_at) values(v_teacher_id,p_teacher_name,v_school_id,'active','admin',p_email,public._scms_hash_password(p_password),false,now());
 v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.app_web_sessions(session_token,teacher_id,school_id,role,device_ua) values(v_token,v_teacher_id,v_school_id,'admin',p_device_ua);
 return jsonb_build_object('ok',true,'auth_mode','email','session_token',v_token,'teacher_id',v_teacher_id,'teacher_name',p_teacher_name,'school_id',v_school_id,'role','admin','must_change_password',false,'message','School အသစ် ဖန်တီးပြီး admin အဖြစ် စတင်ပါပြီ');
end if;
return jsonb_build_object('ok',false,'error','no_choice','message','School အသစ် (သို့) invite code လိုအပ်ပါတယ်');
end;
$function$;