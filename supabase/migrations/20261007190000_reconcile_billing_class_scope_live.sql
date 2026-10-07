-- SCMS v12: reconcile billing class-scope authorization with the canonical role/access model.
-- Safe/idempotent: restores permission catalog rows that are present in source
-- but missing from the live database, then aligns billing read RPCs with them.
--
-- This migration intentionally does not broaden billing.write. Financial writes
-- remain admin/super_admin only.

insert into public.permission_definitions
(permission_key, category, description, scope_type, is_sensitive, display_order, is_active)
values
('billing.class.view','billing','View billing for assigned or explicitly scoped classes','class',true,70,true),
('billing.class.write','billing','Manage billing for assigned or explicitly scoped classes','class',true,71,true),
('billing.fees.manage','billing','Manage the school-wide fee catalog','global',true,72,true)
on conflict (permission_key) do update set
  category=excluded.category,
  description=excluded.description,
  scope_type=excluded.scope_type,
  is_sensitive=excluded.is_sensitive,
  display_order=excluded.display_order,
  is_active=true;

-- Whole-school billing remains restricted to admin/super_admin.
update public.role_permissions
set allowed=false
where role not in ('admin','super_admin')
  and permission_key in ('billing.view','billing.write','billing.fees.manage');

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values
  ('admin'),('super_admin')
) r(role)
join public.permission_definitions p on p.permission_key='billing.fees.manage'
on conflict(role,permission_key) do update set allowed=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values
  ('teacher'),('assistant_teacher'),('senior_teacher'),
  ('school_coordinator'),('administrative_assistant')
) r(role)
join public.permission_definitions p
  on p.permission_key in ('billing.class.view','billing.class.write')
on conflict(role,permission_key) do update set allowed=true;

-- Billing reads: admins see the whole school; non-admin staff are restricted
-- to classes covered by billing.class.view. A global billing.view override
-- remains supported for future explicit school-wide read grants.
create or replace function public.rpc_get_billing_summary(
  p_session_token text,p_class text,p_term_id bigint
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_sess record;
begin
  select s.teacher_id,s.school_id,s.role
    into v_sess
    from public.app_web_sessions s
    join public.teachers t
      on t.teacher_id=s.teacher_id
     and t.school_id=s.school_id
     and t.role=s.role
   where s.session_token=p_session_token
     and s.expires_at>now()
     and t.status='active'
   limit 1;

  if v_sess is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if v_sess.role not in ('admin','super_admin')
     and not private.web_has_permission(p_session_token,'billing.view',null,null)
     and not exists (
       select 1
         from public.students s
        where s.school_id=v_sess.school_id
          and s.status='Active'
          and (p_class is null or s.class=p_class)
          and private.web_has_permission(
            p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null
          )
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  return jsonb_build_object(
    'ok',true,
    'total_billed',coalesce((
      select sum(i.total_amount)
        from public.invoices i
        join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
       where i.school_id=v_sess.school_id
         and i.status<>'Cancelled'
         and (p_class is null or s.class=p_class)
         and (p_term_id is null or i.term_id=p_term_id)
         and (
           v_sess.role in ('admin','super_admin')
           or private.web_has_permission(p_session_token,'billing.view',null,null)
           or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)
         )
    ),0),
    'total_collected',coalesce((
      select sum(i.paid_amount)
        from public.invoices i
        join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
       where i.school_id=v_sess.school_id
         and i.status<>'Cancelled'
         and (p_class is null or s.class=p_class)
         and (p_term_id is null or i.term_id=p_term_id)
         and (
           v_sess.role in ('admin','super_admin')
           or private.web_has_permission(p_session_token,'billing.view',null,null)
           or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)
         )
    ),0),
    'outstanding',coalesce((
      select sum(i.total_amount-i.paid_amount)
        from public.invoices i
        join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
       where i.school_id=v_sess.school_id
         and i.status<>'Cancelled'
         and (p_class is null or s.class=p_class)
         and (p_term_id is null or i.term_id=p_term_id)
         and (
           v_sess.role in ('admin','super_admin')
           or private.web_has_permission(p_session_token,'billing.view',null,null)
           or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)
         )
    ),0),
    'overdue_count',coalesce((
      select count(*)
        from public.invoices i
        join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
       where i.school_id=v_sess.school_id
         and i.status<>'Cancelled'
         and (p_class is null or s.class=p_class)
         and (p_term_id is null or i.term_id=p_term_id)
         and i.status in ('Unpaid','Partial')
         and i.due_date<current_date
         and (
           v_sess.role in ('admin','super_admin')
           or private.web_has_permission(p_session_token,'billing.view',null,null)
           or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)
         )
    ),0)
  );
end;
$function$;

revoke all on function public.rpc_get_billing_summary(text,text,bigint) from public;
grant execute on function public.rpc_get_billing_summary(text,text,bigint) to anon,authenticated;
