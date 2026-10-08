-- SCMS v12: close authorization gap in legacy academic catalog mutation RPCs.
-- This filename MUST match the migration version recorded by the live database.
CREATE OR REPLACE FUNCTION public.rpc_add_subject(
  p_session_token text, p_subject_name text, p_subject_code text, p_subject_color text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess record; v_row record; v_next_order int;
BEGIN
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess
  FROM public.app_web_sessions s
  JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF v_sess.role NOT IN ('admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','permission_denied'); END IF;
  IF p_subject_name IS NULL OR trim(p_subject_name)='' THEN RETURN jsonb_build_object('ok',false,'error','name_required'); END IF;
  IF EXISTS (SELECT 1 FROM public.subjects WHERE school_id=v_sess.school_id AND is_active IS NOT FALSE AND lower(trim(subject_name))=lower(trim(p_subject_name))) THEN
    RETURN jsonb_build_object('ok',false,'error','duplicate','message','That subject already exists');
  END IF;
  SELECT coalesce(max(display_order),0)+1 INTO v_next_order FROM public.subjects WHERE school_id=v_sess.school_id;
  INSERT INTO public.subjects(school_id,subject_name,subject_code,subject_color,is_active,display_order)
  VALUES(v_sess.school_id,trim(p_subject_name),nullif(trim(coalesce(p_subject_code,'')),''),nullif(trim(coalesce(p_subject_color,'')),''),true,v_next_order)
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok',true,'subject',to_jsonb(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_add_term(
  p_session_token text, p_academic_year text, p_term_name text, p_term_order integer,
  p_start_date date, p_end_date date, p_is_current boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess record; v_row record;
BEGIN
  SELECT s.teacher_id,s.school_id,s.role INTO v_sess
  FROM public.app_web_sessions s
  JOIN public.teachers t ON t.teacher_id=s.teacher_id AND t.school_id=s.school_id AND t.role=s.role
  WHERE s.session_token=p_session_token AND s.expires_at>now() AND t.status='active' LIMIT 1;
  IF v_sess IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF v_sess.role NOT IN ('admin','super_admin') THEN RETURN jsonb_build_object('ok',false,'error','permission_denied'); END IF;
  IF p_term_name IS NULL OR trim(p_term_name)='' THEN RETURN jsonb_build_object('ok',false,'error','name_required'); END IF;
  IF coalesce(p_is_current,false) THEN UPDATE public.terms SET is_current=false WHERE school_id=v_sess.school_id; END IF;
  INSERT INTO public.terms(school_id,academic_year,term_name,term_order,start_date,end_date,is_current)
  VALUES(v_sess.school_id,p_academic_year,trim(p_term_name),p_term_order,p_start_date,p_end_date,coalesce(p_is_current,false))
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok',true,'term',to_jsonb(v_row));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rpc_add_subject(text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rpc_add_term(text,text,text,integer,date,date,boolean) FROM anon;
