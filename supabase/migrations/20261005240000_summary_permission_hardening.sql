-- SCMS v12 — Summary authorization hardening
insert into public.permission_definitions(permission_key,scope_type,is_active)
values ('summary.view','class',true)
on conflict(permission_key) do update set scope_type=excluded.scope_type,is_active=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,'summary.view',true from (values ('teacher'),('assistant_teacher'),('senior_teacher'),('school_coordinator'),('administrative_assistant'),('admin'),('super_admin')) r(role)
on conflict(role,permission_key) do update set allowed=excluded.allowed;

create or replace function public.rpc_get_monthly_summary(p_session_token text,p_year_month text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare v_sess record; v_rows jsonb;
begin
 select s.school_id into v_sess from public.app_web_sessions s
 join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.class,x.name_en),'[]'::jsonb) into v_rows
 from (select * from public.monthly_summary
       where school_id=v_sess.school_id
         and year_month=coalesce(p_year_month,to_char(current_date,'YYYY-MM'))
         and private.web_has_permission(p_session_token,'summary.view',nullif(trim(class),''),null)) x;
 return jsonb_build_object('ok',true,'rows',v_rows);
end;$f$;

revoke execute on function public.rpc_get_monthly_summary(text,text) from public;
grant execute on function public.rpc_get_monthly_summary(text,text) to anon,authenticated;
