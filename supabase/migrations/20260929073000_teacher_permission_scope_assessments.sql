-- Step 5: Enforce class+subject assignment scope on assessment access.

create or replace function public.rpc_create_assessment(
  p_session_token text,
  p_term_id bigint,
  p_subject_id bigint,
  p_class text,
  p_title text,
  p_type text,
  p_max_score numeric,
  p_weight numeric,
  p_date date,
  p_start_time time default null,
  p_end_time time default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_sess record; v_row record; v_school text;
begin
  select s.teacher_id,s.school_id,s.role into v_sess
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_title is null or trim(p_title)='' then return jsonb_build_object('ok',false,'error','title_required'); end if;
  if p_class is null or trim(p_class)='' then return jsonb_build_object('ok',false,'error','class_required'); end if;
  if p_subject_id is null then return jsonb_build_object('ok',false,'error','subject_required'); end if;
  if not private.web_has_permission(p_session_token,'assessment.create',trim(p_class),p_subject_id) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  if p_max_score is not null and p_max_score<=0 then return jsonb_build_object('ok',false,'error','invalid_max_score'); end if;
  if p_weight is not null and (p_weight<0 or p_weight>100) then return jsonb_build_object('ok',false,'error','invalid_weight'); end if;
  if p_start_time is not null and p_end_time is not null and p_start_time>=p_end_time then return jsonb_build_object('ok',false,'error','invalid_time_range'); end if;
  if p_term_id is not null then
    select school_id into v_school from public.terms where id=p_term_id;
    if v_school is distinct from v_sess.school_id then return jsonb_build_object('ok',false,'error','term_not_found'); end if;
  end if;
  select school_id into v_school from public.subjects where id=p_subject_id and is_active=true;
  if v_school is distinct from v_sess.school_id then return jsonb_build_object('ok',false,'error','subject_not_found'); end if;
  if not exists(select 1 from public.students where school_id=v_sess.school_id and class=trim(p_class) and status='Active') then
    return jsonb_build_object('ok',false,'error','class_not_found');
  end if;
  insert into public.assessments(school_id,term_id,subject_id,class,title,type,max_score,weight,date,teacher_id,start_time,end_time)
  values(v_sess.school_id,p_term_id,p_subject_id,trim(p_class),trim(p_title),coalesce(p_type,'Assignment'),
         coalesce(p_max_score,100),coalesce(p_weight,0),coalesce(p_date,current_date),v_sess.teacher_id,p_start_time,p_end_time)
  returning * into v_row;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.teacher_id,'assessment.create',v_sess.school_id,
         jsonb_build_object('assessment_id',v_row.id,'class',v_row.class,'subject_id',v_row.subject_id,'term_id',v_row.term_id,'title',v_row.title));
  return jsonb_build_object('ok',true,'assessment',to_jsonb(v_row));
end;
$$;

create or replace function public.rpc_delete_assessment(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_sess record; v_row record;
begin
  select s.teacher_id,s.school_id,s.role into v_sess from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select * into v_row from public.assessments where id=p_id and school_id=v_sess.school_id;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not private.web_has_permission(p_session_token,'assessment.delete',v_row.class,v_row.subject_id) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  delete from public.assessments where id=p_id and school_id=v_sess.school_id;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.teacher_id,'assessment.delete',v_sess.school_id,
         jsonb_build_object('assessment_id',p_id,'class',v_row.class,'subject_id',v_row.subject_id));
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.rpc_get_assessments(p_session_token text,p_class text,p_subject_id bigint,p_term_id bigint)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_sess record; v_rows jsonb;
begin
  select s.school_id,s.role into v_sess from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if not private.web_has_permission(p_session_token,'assessment.view',nullif(trim(p_class),''),p_subject_id) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows
    from (select * from public.assessments where school_id=v_sess.school_id
      and (p_class is null or class=p_class) and (p_subject_id is null or subject_id=p_subject_id)
      and (p_term_id is null or term_id=p_term_id)) x;
  return jsonb_build_object('ok',true,'rows',v_rows);
end;
$$;
