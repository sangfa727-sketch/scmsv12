-- SCMS v12 — synchronize Edit Teacher role validation with the canonical role model.
-- Forward migration only. Production deployment requires explicit approval.

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

REVOKE EXECUTE ON FUNCTION public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) TO anon,authenticated;
