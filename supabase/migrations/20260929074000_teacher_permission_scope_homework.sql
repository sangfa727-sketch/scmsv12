-- Step 6: Enforce class+subject assignment scope on homework access and writes.

create or replace function public.rpc_save_homework(
  p_session_token text,p_class text,p_subject text,p_type text,p_description text,
  p_lb_page text,p_wb_page text,p_due_date date,p_date date
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_row record; v_subject_id bigint;
begin
  select s.teacher_id,s.school_id,s.role into v_sess from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_class is null or trim(p_class)='' then return jsonb_build_object('ok',false,'error','class_required'); end if;
  if p_subject is null or trim(p_subject)='' then return jsonb_build_object('ok',false,'error','subject_required'); end if;
  select id into v_subject_id from public.subjects where school_id=v_sess.school_id and is_active=true
    and (lower(subject_name)=lower(trim(p_subject)) or lower(coalesce(subject_code,''))=lower(trim(p_subject))) order by id limit 1;
  if not private.web_has_permission(p_session_token,'homework.create',trim(p_class),v_subject_id) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  insert into public.homework_log(date,class,subject,type,lb_page,wb_page,description,due_date,teacher_id,school_id)
  values(coalesce(p_date,current_date),trim(p_class),trim(p_subject),p_type,p_lb_page,p_wb_page,p_description,p_due_date,v_sess.teacher_id,v_sess.school_id)
  returning * into v_row;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.teacher_id,'homework.create',v_sess.school_id,jsonb_build_object('homework_id',v_row.id,'class',v_row.class,'subject',v_row.subject));
  return jsonb_build_object('ok',true,'homework',to_jsonb(v_row));
end; $$;

create or replace function public.rpc_update_homework(
  p_session_token text,p_id bigint,p_subject text,p_class text,p_type text,
  p_description text,p_lb_page text,p_wb_page text,p_due_date date
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_row record; v_subject_id bigint; v_new_class text; v_new_subject text;
begin
  select s.teacher_id,s.school_id,s.role into v_sess from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_id is null then return jsonb_build_object('ok',false,'error','id_required'); end if;
  select * into v_row from public.homework_log where id=p_id and school_id=v_sess.school_id;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not private.web_has_permission(p_session_token,'homework.edit',v_row.class,
      (select id from public.subjects where school_id=v_sess.school_id and is_active=true
       and (lower(subject_name)=lower(trim(v_row.subject)) or lower(coalesce(subject_code,''))=lower(trim(v_row.subject))) order by id limit 1)) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  v_new_class:=coalesce(nullif(trim(p_class),''),v_row.class);
  v_new_subject:=coalesce(nullif(trim(p_subject),''),v_row.subject);
  select id into v_subject_id from public.subjects where school_id=v_sess.school_id and is_active=true
    and (lower(subject_name)=lower(v_new_subject) or lower(coalesce(subject_code,''))=lower(v_new_subject)) order by id limit 1;
  if not private.web_has_permission(p_session_token,'homework.edit',v_new_class,v_subject_id) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  update public.homework_log set subject=v_new_subject,class=v_new_class,type=coalesce(p_type,type),
    description=p_description,lb_page=p_lb_page,wb_page=p_wb_page,due_date=p_due_date
   where id=p_id and school_id=v_sess.school_id returning * into v_row;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.teacher_id,'homework.update',v_sess.school_id,jsonb_build_object('homework_id',v_row.id,'class',v_row.class,'subject',v_row.subject));
  return jsonb_build_object('ok',true,'homework',to_jsonb(v_row));
end; $$;

create or replace function public.rpc_delete_homework(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_row record; v_subject_id bigint; v_count int;
begin
  select s.teacher_id,s.school_id,s.role into v_sess from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if p_id is null then return jsonb_build_object('ok',false,'error','id_required'); end if;
  select * into v_row from public.homework_log where id=p_id and school_id=v_sess.school_id;
  if v_row is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  select id into v_subject_id from public.subjects where school_id=v_sess.school_id and is_active=true
    and (lower(subject_name)=lower(trim(v_row.subject)) or lower(coalesce(subject_code,''))=lower(trim(v_row.subject))) order by id limit 1;
  if not private.web_has_permission(p_session_token,'homework.delete',v_row.class,v_subject_id) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  delete from public.homework_log where id=p_id and school_id=v_sess.school_id;
  get diagnostics v_count=row_count;
  if v_count=0 then return jsonb_build_object('ok',false,'error','not_found'); end if;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.teacher_id,'homework.delete',v_sess.school_id,jsonb_build_object('homework_id',p_id,'class',v_row.class,'subject',v_row.subject));
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.rpc_get_homework(p_session_token text,p_days_back integer default 30)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_rows jsonb;
begin
  select s.school_id,s.role into v_sess from public.app_web_sessions s join public.teachers t
    on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
  if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc),'[]'::jsonb) into v_rows
    from (select h.* from public.homework_log h where h.school_id=v_sess.school_id
      and h.date >= current_date - (greatest(coalesce(p_days_back,30),0) || ' days')::interval
      and private.web_has_permission(p_session_token,'homework.view',h.class,
        (select s.id from public.subjects s where s.school_id=h.school_id and s.is_active=true
          and (lower(s.subject_name)=lower(trim(h.subject)) or lower(coalesce(s.subject_code,''))=lower(trim(h.subject)))
          order by s.id limit 1))) x;
  return jsonb_build_object('ok',true,'rows',v_rows);
end; $$;
