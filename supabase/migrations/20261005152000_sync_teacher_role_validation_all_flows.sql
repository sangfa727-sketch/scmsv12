-- SCMS v12 — synchronize admin teacher-role validation across create, update and invite flows.
-- Forward migration only. Production deployment requires explicit approval.

CREATE OR REPLACE FUNCTION public.rpc_admin_create_teacher_v2(
  p_session_token text,p_teacher_id text,p_login_name text,p_teacher_name text,
  p_initial_pin text,p_role text default 'teacher',p_email text default null
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_admin record; v_role text:=lower(trim(coalesce(p_role,'teacher')));
 v_login_name text:=trim(coalesce(p_login_name,'')); v_email text:=lower(trim(coalesce(p_email,'')));
BEGIN
 SELECT s.teacher_id,s.school_id,s.role as session_role,t.role as teacher_role INTO v_admin
 FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' AND t.role in ('admin','super_admin') LIMIT 1;
 IF v_admin IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_admin','message','Admin login လိုအပ်ပါတယ်'); END IF;
 IF v_role NOT IN ('teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin') THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_role'); END IF;
 IF v_admin.teacher_role<>'super_admin' AND v_role IN ('admin','super_admin') THEN
   RETURN jsonb_build_object('ok',false,'error','insufficient_role'); END IF;
 IF char_length(v_login_name)<3 OR char_length(v_login_name)>64 OR v_login_name !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_login_name','message','Login name must be 3-64 characters using letters, numbers, dot, underscore, or hyphen.'); END IF;
 IF char_length(coalesce(p_initial_pin,''))<6 THEN
   RETURN jsonb_build_object('ok',false,'error','pin_too_short','message','PIN must be at least 6 characters'); END IF;
 IF v_email='' OR position('@' in v_email)<2 THEN
   RETURN jsonb_build_object('ok',false,'error','email_required','message','Teacher email လိုအပ်ပါတယ်'); END IF;
 IF exists(select 1 from public.teachers where lower(teacher_id)=lower(p_teacher_id)) THEN
   RETURN jsonb_build_object('ok',false,'error','duplicate_id','message','ဒီ Teacher ID နဲ့ account ရှိနေပါပြီ'); END IF;
 IF exists(select 1 from public.teachers where lower(login_name)=lower(v_login_name)) THEN
   RETURN jsonb_build_object('ok',false,'error','duplicate_login_name','message','ဒီ Login name ကို အသုံးပြုထားပြီးပါပြီ'); END IF;
 IF exists(select 1 from public.teachers where lower(trim(email))=v_email) THEN
   RETURN jsonb_build_object('ok',false,'error','duplicate_email','message','ဒီ email ကို အသုံးပြုထားပြီးပါပြီ'); END IF;
 INSERT INTO public.teachers(teacher_id,login_name,teacher_name,school_id,status,role,email,password_hash,must_change_password,password_changed_at)
 VALUES(p_teacher_id,v_login_name,p_teacher_name,v_admin.school_id,'active',v_role,v_email,public._scms_hash_password(p_initial_pin),true,now());
 RETURN jsonb_build_object('ok',true,'teacher_id',p_teacher_id,'login_name',v_login_name,'teacher_name',p_teacher_name,'school_id',v_admin.school_id,'role',v_role);
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_teacher_profile(
 p_session_token text,p_teacher_id text,p_teacher_name text,p_login_name text,
 p_email text default null,p_role text default 'teacher'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_admin record; v_target_role text; v_role text:=lower(trim(coalesce(p_role,'teacher')));
 v_name text:=trim(coalesce(p_teacher_name,'')); v_login text:=trim(coalesce(p_login_name,''));
 v_email text:=lower(trim(coalesce(p_email,''))); v_teacher record;
BEGIN
 SELECT s.school_id,t.role as admin_role INTO v_admin FROM public.app_web_sessions s
 JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
 IF v_admin IS NULL OR v_admin.admin_role NOT IN ('admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','not_admin'); END IF;
 IF v_role NOT IN ('teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','invalid_role'); END IF;
 IF v_admin.admin_role<>'super_admin' AND v_role IN ('admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','insufficient_role'); END IF;
 SELECT role INTO v_target_role FROM public.teachers WHERE teacher_id=p_teacher_id AND school_id=v_admin.school_id LIMIT 1;
 IF v_target_role IS NULL THEN RETURN jsonb_build_object('ok',false,'error','teacher_not_found'); END IF;
 IF v_admin.admin_role<>'super_admin' AND v_target_role='super_admin' THEN RETURN jsonb_build_object('ok',false,'error','insufficient_role'); END IF;
 IF char_length(v_name)<1 OR char_length(v_name)>120 THEN RETURN jsonb_build_object('ok',false,'error','invalid_teacher_name'); END IF;
 IF char_length(v_login)<3 OR char_length(v_login)>64 OR v_login !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_login_name'); END IF;
 IF v_email='' OR position('@' in v_email)<2 THEN RETURN jsonb_build_object('ok',false,'error','email_required','message','Teacher email လိုအပ်ပါတယ်'); END IF;
 IF exists(select 1 from public.teachers where lower(login_name)=lower(v_login) and teacher_id<>p_teacher_id) THEN RETURN jsonb_build_object('ok',false,'error','duplicate_login_name'); END IF;
 IF exists(select 1 from public.teachers where lower(trim(email))=v_email and teacher_id<>p_teacher_id) THEN RETURN jsonb_build_object('ok',false,'error','duplicate_email'); END IF;
 UPDATE public.teachers SET teacher_name=v_name,login_name=v_login,email=v_email,teacher_email=v_email,role=v_role,updated_at=now()
 WHERE teacher_id=p_teacher_id AND school_id=v_admin.school_id
 RETURNING teacher_id,login_name,teacher_name,role,email,teacher_email,photo_url,status INTO v_teacher;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','teacher_not_found'); END IF;
 RETURN jsonb_build_object('ok',true,'teacher',to_jsonb(v_teacher));
END; $function$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_invite(
 p_session_token text,p_role text default 'teacher',p_teacher_name text default null
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_admin record; v_code text; v_role text:=lower(trim(coalesce(p_role,'teacher')));
BEGIN
 SELECT s.teacher_id,s.school_id,s.role as session_role,t.role as teacher_role INTO v_admin
 FROM public.app_web_sessions s JOIN public.teachers t ON t.teacher_id=s.teacher_id
 WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active'
 AND s.school_id=t.school_id AND s.role=t.role AND t.role in ('admin','super_admin') LIMIT 1;
 IF v_admin IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_admin','message','Admin login လိုအပ်ပါတယ်'); END IF;
 IF v_role NOT IN ('teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin') THEN
   RETURN jsonb_build_object('ok',false,'error','invalid_role'); END IF;
 IF v_admin.teacher_role<>'super_admin' AND v_role IN ('admin','super_admin') THEN
   RETURN jsonb_build_object('ok',false,'error','insufficient_role'); END IF;
 LOOP
   v_code := (SELECT string_agg(substr('ACDEFGHJKLMNPQRSTUVWXY3479',(random()*25)::int+1,1),'') FROM generate_series(1,6));
   EXIT WHEN NOT EXISTS (SELECT 1 FROM public.teacher_invites WHERE invite_code=v_code);
 END LOOP;
 INSERT INTO public.teacher_invites(invite_code,school_id,role,teacher_name,created_by)
 VALUES(v_code,v_admin.school_id,v_role,p_teacher_name,v_admin.teacher_id);
 RETURN jsonb_build_object('ok',true,'invite_code',v_code,'role',v_role,'expires_in_days',14);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) TO anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_admin_create_invite(text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_create_invite(text,text,text) TO anon,authenticated;
