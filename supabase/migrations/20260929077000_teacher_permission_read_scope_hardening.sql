-- Harden teacher-scoped read RPCs: leave and attendance must respect class assignments/permissions.
create or replace function public.rpc_get_leave_requests(p_session_token text,p_status text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_rows jsonb;
begin
 select s.teacher_id,s.school_id,s.role into v_sess
 from public.app_web_sessions s join public.teachers t
   on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by case x.status when 'Pending' then 0 else 1 end,x.created_at desc),'[]'::jsonb) into v_rows
 from (
   select lr.*,s.name_en from public.leave_requests lr
   join public.students s on s.student_id=lr.student_id and s.school_id=lr.school_id
   where lr.school_id=v_sess.school_id
     and (p_status is null or lr.status=p_status)
     and (v_sess.role in ('admin','super_admin')
       or private.web_has_permission(p_session_token,'leave.view',nullif(trim(lr.class),''),null))
 ) x;
 return jsonb_build_object('ok',true,'rows',v_rows);
end $$;

create or replace function public.rpc_get_attendance(p_session_token text,p_days_back integer default 30) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sess record; v_rows jsonb; v_days integer;
begin
 select s.teacher_id,s.school_id,s.role into v_sess
 from public.app_web_sessions s join public.teachers t
   on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
 where s.session_token=p_session_token and s.expires_at>now() and t.status='active' limit 1;
 if v_sess is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
 v_days:=least(greatest(coalesce(p_days_back,30),0),365);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.date desc,x.class),'[]'::jsonb) into v_rows
 from (
   select a.* from public.attendance a
   where a.school_id=v_sess.school_id
     and a.date >= current_date-(v_days||' days')::interval
     and (v_sess.role in ('admin','super_admin')
       or private.web_has_permission(p_session_token,'attendance.view',nullif(trim(a.class),''),null))
 ) x;
 return jsonb_build_object('ok',true,'rows',v_rows);
end $$;

revoke execute on function public.rpc_get_leave_requests(text,text) from public,anon,authenticated;
grant execute on function public.rpc_get_leave_requests(text,text) to anon,authenticated;
revoke execute on function public.rpc_get_attendance(text,integer) from public,anon,authenticated;
grant execute on function public.rpc_get_attendance(text,integer) to anon,authenticated;
