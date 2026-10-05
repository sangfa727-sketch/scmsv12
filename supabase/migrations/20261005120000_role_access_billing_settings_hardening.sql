-- Role/access completion: operational roles, class-scoped billing, and settings-safe permission catalog.
-- This migration is intentionally staged in GitHub first; do not deploy to production automatically.

-- 1) Operational role catalog. Roles remain data-driven; permission rows define behavior.
insert into public.role_permissions(role, permission_key, allowed)
select r.role, p.permission_key, false
from (values
  ('assistant_teacher'),
  ('senior_teacher'),
  ('school_coordinator'),
  ('administrative_assistant')
) r(role)
cross join public.permission_definitions p
on conflict (role, permission_key) do nothing;

-- Teacher-family defaults.
update public.role_permissions
set allowed = false
where role in ('assistant_teacher','senior_teacher','school_coordinator','administrative_assistant');

update public.role_permissions
set allowed = true
where role = 'assistant_teacher'
  and permission_key in (
    'dashboard.view','students.view','leave.view',
    'attendance.view','attendance.edit',
    'homework.view','homework.create',
    'assessment.view'
  );

update public.role_permissions
set allowed = true
where role = 'senior_teacher'
  and permission_key in (
    'dashboard.view','students.view','students.edit',
    'leave.view','leave.approve',
    'attendance.view','attendance.edit',
    'homework.view','homework.create','homework.edit',
    'assessment.view','assessment.create','assessment.edit'
  );

update public.role_permissions
set allowed = true
where role = 'school_coordinator'
  and permission_key in (
    'dashboard.view','students.view','students.edit',
    'leave.view','leave.approve',
    'attendance.view','attendance.edit',
    'homework.view','homework.create','homework.edit',
    'assessment.view','assessment.create','assessment.edit',
    'billing.class.view','billing.class.write'
  );

update public.role_permissions
set allowed = true
where role = 'administrative_assistant'
  and permission_key in (
    'dashboard.view','students.view','students.edit',
    'leave.view','leave.approve',
    'attendance.view','attendance.edit',
    'billing.class.view','billing.class.write'
  );

-- 2) Billing is class-scoped for non-admin staff.
insert into public.permission_definitions
(permission_key, category, description, scope_type, is_sensitive, display_order)
values
('billing.class.view','billing','View billing for assigned or explicitly scoped classes','class',true,70),
('billing.class.write','billing','Create and modify billing for assigned or explicitly scoped classes','class',true,71),
('billing.fees.manage','billing','Manage the school-wide fee catalog','global',true,72)
on conflict (permission_key) do update set
  category=excluded.category,
  description=excluded.description,
  scope_type=excluded.scope_type,
  is_sensitive=excluded.is_sensitive,
  display_order=excluded.display_order,
  is_active=true;

update public.permission_definitions
set scope_type='global', description='View billing information for the whole school', is_sensitive=true, display_order=68, is_active=true where permission_key='billing.view';
update public.permission_definitions set scope_type='global', description='Create and modify billing records for the whole school', is_sensitive=true, display_order=69, is_active=true where permission_key='billing.write';
update public.permission_definitions set scope_type='class', description='View billing for assigned or explicitly scoped classes', is_sensitive=true, display_order=70, is_active=true where permission_key='billing.class.view';
update public.permission_definitions set scope_type='class', description='Create and modify billing for assigned or explicitly scoped classes', is_sensitive=true, display_order=71, is_active=true where permission_key='billing.class.write';

insert into public.role_permissions(role, permission_key, allowed)
select r.role, p.permission_key, true
from (values ('admin'),('super_admin')) r(role)
join public.permission_definitions p on p.permission_key='billing.fees.manage'
on conflict (role, permission_key) do update set allowed=true;

insert into public.role_permissions(role,permission_key,allowed)
select r.role,p.permission_key,true
from (values ('teacher'),('assistant_teacher'),('senior_teacher'),('school_coordinator'),('administrative_assistant')) r(role)
join public.permission_definitions p on p.permission_key in ('billing.class.view','billing.class.write')
on conflict (role,permission_key) do update set allowed=true;

-- Class-assigned teacher roles automatically receive billing view/manage,
-- but the server-side class scope still applies.
update public.role_permissions
set allowed=true
where role in ('teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant')
  and permission_key in ('billing.class.view','billing.class.write');

-- 3) Rebuild web bootstrap effective permission calculation so scoped permissions
-- only appear in frontend navigation when the user actually has at least one
-- matching assignment or explicit scoped override.
create or replace function public.rpc_web_bootstrap(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record;
  v_school record;
  v_classes jsonb;
  v_assigned_classes jsonb;
  v_assigned_subjects jsonb;
  v_billing_classes jsonb;
  v_permissions jsonb;
begin
  select s.teacher_id,s.school_id,s.role,
         t.teacher_name,t.email,t.telegram_id,t.photo_url,t.ui_prefs
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

  select school_id,school_name,config_json
    into v_school
    from public.schools
   where school_id=v_sess.school_id
   limit 1;

  select coalesce(jsonb_agg(distinct s.class order by s.class) filter (where s.class is not null),'[]'::jsonb)
    into v_classes
    from public.students s
   where s.school_id=v_sess.school_id and s.status='Active';

  select coalesce(jsonb_agg(distinct a.class_name order by a.class_name),'[]'::jsonb)
    into v_assigned_classes
    from public.teacher_class_assignments a
   where a.school_id=v_sess.school_id
     and a.teacher_id=v_sess.teacher_id
     and a.is_active=true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'class_name',a.class_name,
           'subject_id',a.subject_id,
           'subject_name',coalesce(s.subject_name,'')
         ) order by a.class_name,a.subject_id),'[]'::jsonb)
    into v_assigned_subjects
    from public.teacher_subject_assignments a
    left join public.subjects s on s.id=a.subject_id and s.school_id=a.school_id
   where a.school_id=v_sess.school_id
     and a.teacher_id=v_sess.teacher_id
     and a.is_active=true;

  select coalesce(jsonb_agg(x.class_name order by x.class_name),'[]'::jsonb)
    into v_billing_classes
    from (
      select distinct trim(s.class) as class_name
        from public.students s
       where s.school_id=v_sess.school_id
         and s.status='Active'
         and nullif(trim(s.class),'') is not null
         and (
           v_sess.role in ('admin','super_admin')
           or private.web_has_permission(p_session_token,'billing.class.view',trim(s.class),null)
         )
    ) x;

  select coalesce(jsonb_agg(p.permission_key order by p.display_order,p.permission_key),'[]'::jsonb)
    into v_permissions
    from public.permission_definitions p
   where p.is_active=true
     and (
       v_sess.role in ('admin','super_admin')
       or exists (
         select 1
           from public.role_permissions rp
          where rp.role=v_sess.role
            and rp.permission_key=p.permission_key
            and rp.allowed=true
       )
       or exists (
         select 1
           from public.teacher_permissions tp
          where tp.school_id=v_sess.school_id
            and tp.teacher_id=v_sess.teacher_id
            and tp.permission_key=p.permission_key
            and tp.allowed=true
            and tp.scope_type=p.scope_type
            and (
              p.scope_type='global'
              or (p.scope_type='class' and tp.class_name is not null)
              or (p.scope_type='subject' and tp.subject_id is not null)
              or (p.scope_type='class_subject' and tp.class_name is not null and tp.subject_id is not null)
            )
       )
     )
     and not (
       p.scope_type='class'
       and v_sess.role not in ('admin','super_admin')
       and not exists (
         select 1
           from public.teacher_class_assignments a
          where a.school_id=v_sess.school_id
            and a.teacher_id=v_sess.teacher_id
            and a.is_active=true
       )
       and not exists (
         select 1
           from public.teacher_permissions tp
          where tp.school_id=v_sess.school_id
            and tp.teacher_id=v_sess.teacher_id
            and tp.permission_key=p.permission_key
            and tp.scope_type='class'
            and tp.allowed=true
       )
     )
     and not exists (
       select 1
         from public.teacher_permissions tp
        where tp.school_id=v_sess.school_id
          and tp.teacher_id=v_sess.teacher_id
          and tp.permission_key=p.permission_key
          and tp.scope_type='global'
          and tp.allowed=false
          and tp.class_name is null
          and tp.subject_id is null
     );

  update public.app_web_sessions
     set last_seen_at=now(),expires_at=now()+interval '30 days'
   where session_token=p_session_token;

  return jsonb_build_object(
    'ok',true,
    'auth_mode','web',
    'teacher_id',v_sess.teacher_id,
    'teacher_name',v_sess.teacher_name,
    'teacher_role',v_sess.role,
    'teacher_email',v_sess.email,
    'teacher_photo_url',v_sess.photo_url,
    'telegram_id',v_sess.telegram_id,
    'school_id',v_school.school_id,
    'school_name',v_school.school_name,
    'school_config',v_school.config_json,
    'classes',v_classes,
    'assigned_classes',v_assigned_classes,
    'assigned_subjects',v_assigned_subjects,
    'billing_classes',v_billing_classes,
    'permissions',v_permissions,
    'is_admin',v_sess.role in ('admin','super_admin'),
    'ui_prefs',coalesce(v_sess.ui_prefs,'{}'::jsonb)
  );
end;
$function$;

-- 4) Billing session context.
create or replace function public._billing_staff_session(p_session_token text)
returns table(v_school_id text,v_teacher_id text,v_role text)
language plpgsql
security definer
set search_path to public,pg_temp
as $function$
begin
  return query
    select s.school_id,s.teacher_id,s.role
      from public.app_web_sessions s
      join public.teachers t
        on t.teacher_id=s.teacher_id
       and t.school_id=s.school_id
       and t.role=s.role
     where s.session_token=p_session_token
       and s.expires_at>now()
       and t.status='active';
end
$function$;

revoke execute on function public._billing_staff_session(text) from public,anon,authenticated;

-- 5) Billing reads: admins see the whole school; staff see only classes
-- authorized by billing.view.
create or replace function public.rpc_get_fee_items(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not exists (
       select 1
         from public.students s
        where s.school_id=v_sess.v_school_id
          and s.status='Active'
          and nullif(trim(s.class),'') is not null
          and private.web_has_permission(p_session_token,'billing.class.view',trim(s.class),null)
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;
  return jsonb_build_object('ok',true,'rows',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.category,x.name)
      from public.fee_items x
     where x.school_id=v_sess.v_school_id and x.is_active
       and (v_sess.v_role in ('admin','super_admin')
         or exists (
           select 1
             from public.teacher_class_assignments a
            where a.school_id=v_sess.v_school_id and a.teacher_id=v_sess.v_teacher_id and a.is_active
         ))
  ),'[]'::jsonb));
end
$function$;

-- 6) Billing reads.
create or replace function public.rpc_get_invoices(p_session_token text,p_class text,p_status text,p_term_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  return jsonb_build_object('ok',true,'rows',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.due_date nulls last,x.id desc)
      from (
        select i.*,s.name_en,s.class,s.status as student_status,
               case when i.status in ('Unpaid','Partial') and i.due_date<current_date then 'Overdue' else i.status end as display_status
          from public.invoices i
          join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
         where i.school_id=v_sess.v_school_id
           and (p_class is null or s.class=p_class)
           and (p_term_id is null or i.term_id=p_term_id)
           and (p_status is null or i.status=p_status or
                (p_status='Overdue' and i.status in ('Unpaid','Partial') and i.due_date<current_date))
           and (v_sess.v_role in ('admin','super_admin')
                or (private.web_has_permission(p_session_token,'billing.view',null,null) or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)))
      ) x
  ),'[]'::jsonb));
end
$function$;

create or replace function public.rpc_get_invoice_detail(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_invoice record;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;

  select i.*,s.name_en,s.class,s.status as student_status
    into v_invoice
    from public.invoices i
    join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
   where i.id=p_id and i.school_id=v_sess.v_school_id;

  if v_invoice.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not (private.web_has_permission(p_session_token,'billing.view',null,null) or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(v_invoice.class),'')::text,null))
  then return jsonb_build_object('ok',false,'error','permission_denied'); end if;

  return jsonb_build_object(
    'ok',true,
    'invoice',to_jsonb(v_invoice),
    'items',coalesce((select jsonb_agg(to_jsonb(x)) from public.invoice_items x where x.invoice_id=p_id),'[]'::jsonb),
    'payments',coalesce((select jsonb_agg(to_jsonb(x) order by x.payment_date desc,x.id desc) from public.payments x where x.invoice_id=p_id),'[]'::jsonb)
  );
end
$function$;

create or replace function public.rpc_get_billing_summary(p_session_token text,p_class text,p_term_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  return jsonb_build_object(
    'ok',true,
    'total_billed',coalesce((select sum(i.total_amount) from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
      where i.school_id=v_sess.v_school_id and i.status<>'Cancelled'
        and (p_class is null or s.class=p_class) and (p_term_id is null or i.term_id=p_term_id)
        and (v_sess.v_role in ('admin','super_admin') or (private.web_has_permission(p_session_token,'billing.view',null,null) or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)))),0),
    'total_collected',coalesce((select sum(i.paid_amount) from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
      where i.school_id=v_sess.v_school_id and i.status<>'Cancelled'
        and (p_class is null or s.class=p_class) and (p_term_id is null or i.term_id=p_term_id)
        and (v_sess.v_role in ('admin','super_admin') or (private.web_has_permission(p_session_token,'billing.view',null,null) or private.web_has_permission(p_session_token,'billing.class.view',nullif(trim(s.class),'')::text,null)))),0),
    'outstanding',coalesce((select sum(i.total_amount-i.paid_amount) from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
      where i.school_id=v_sess.v_school_id and i.status<>'Cancelled'
        and (p_class is null or s.class=p_class) and (p_term_id is null or i.term_id=p_term_id)
        and (v_sess.v_role in ('admin','super_admin') or private.web_has_permission(p_session_token,'billing.view',nullif(trim(s.class),'')::text,null))),0),
    'overdue_count',coalesce((select count(*) from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
      where i.school_id=v_sess.v_school_id and i.status<>'Cancelled'
        and (p_class is null or s.class=p_class) and (p_term_id is null or i.term_id=p_term_id)
        and (i.status in ('Unpaid','Partial') and i.due_date<current_date)
        and (v_sess.v_role in ('admin','super_admin') or private.web_has_permission(p_session_token,'billing.view',nullif(trim(s.class),'')::text,null))),0)
  );
end
$function$;

-- 7) Billing writes. Fee catalog remains school-wide and is intentionally
-- restricted to the dedicated sensitive permission.
create or replace function public.rpc_add_fee_item(p_session_token text,p_name text,p_category text,p_default_amount numeric,p_is_recurring boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row public.fee_items%rowtype;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not private.web_has_permission(p_session_token,'billing.fees.manage',null,null)
  then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if p_name is null or trim(p_name)='' then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if p_default_amount is not null and p_default_amount<0 then return jsonb_build_object('ok',false,'error','invalid_amount'); end if;
  insert into public.fee_items(school_id,name,category,default_amount,is_recurring)
  values(v_sess.v_school_id,trim(p_name),coalesce(nullif(trim(p_category),''),'Other'),coalesce(p_default_amount,0),coalesce(p_is_recurring,true))
  returning * into v_row;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.v_teacher_id,'billing.fee_item.create',v_sess.v_school_id,jsonb_build_object('fee_item_id',v_row.id,'name',v_row.name,'amount',v_row.default_amount));
  return jsonb_build_object('ok',true,'fee_item',row_to_json(v_row));
end
$function$;

create or replace function public.rpc_update_fee_item(p_session_token text,p_id bigint,p_name text,p_category text,p_default_amount numeric,p_is_recurring boolean,p_is_active boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row public.fee_items%rowtype;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v_sess.v_role not in ('admin','super_admin') and not private.web_has_permission(p_session_token,'billing.fees.manage',null,null)
    then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if p_name is not null and trim(p_name)='' then return jsonb_build_object('ok',false,'error','name_required'); end if;
  if p_default_amount is not null and p_default_amount<0 then return jsonb_build_object('ok',false,'error','invalid_amount'); end if;
  update public.fee_items set name=coalesce(nullif(trim(p_name),''),name),category=coalesce(nullif(trim(p_category),''),category),
    default_amount=coalesce(p_default_amount,default_amount),is_recurring=coalesce(p_is_recurring,is_recurring),is_active=coalesce(p_is_active,is_active)
   where id=p_id and school_id=v_sess.v_school_id returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  insert into public.audit_log(source,actor,action,school_id,payload) values('web',v_sess.v_teacher_id,'billing.fee_item.update',v_sess.v_school_id,jsonb_build_object('fee_item_id',v_row.id,'name',v_row.name,'amount',v_row.default_amount,'is_active',v_row.is_active));
  return jsonb_build_object('ok',true,'fee_item',row_to_json(v_row));
end
$function$;

create or replace function public.rpc_delete_fee_item(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_row public.fee_items%rowtype;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  if v_sess.v_role not in ('admin','super_admin') and not private.web_has_permission(p_session_token,'billing.fees.manage',null,null)
    then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  update public.fee_items set is_active=false where id=p_id and school_id=v_sess.v_school_id returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  insert into public.audit_log(source,actor,action,school_id,payload) values('web',v_sess.v_teacher_id,'billing.fee_item.deactivate',v_sess.v_school_id,jsonb_build_object('fee_item_id',v_row.id));
  return jsonb_build_object('ok',true);
end
$function$;

create or replace function public.rpc_create_invoice(p_session_token text,p_student_id text,p_term_id bigint,p_due_date date,p_notes text,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_student record; v_invoice public.invoices%rowtype; v_item jsonb; v_total numeric:=0; v_amount numeric; v_description text;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select s.* into v_student from public.students s where s.student_id=p_student_id and s.school_id=v_sess.v_school_id limit 1;
  if v_student is null then return jsonb_build_object('ok',false,'error','student_not_found'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not (private.web_has_permission(p_session_token,'billing.write',null,null) or private.web_has_permission(p_session_token,'billing.class.write',nullif(trim(v_student.class),'')::text,null))
  then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if p_term_id is not null and not exists(select 1 from public.terms t where t.id=p_term_id and t.school_id=v_sess.v_school_id) then return jsonb_build_object('ok',false,'error','term_not_found'); end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then return jsonb_build_object('ok',false,'error','no_items','message','Add at least one line item'); end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then return jsonb_build_object('ok',false,'error','invalid_line_item'); end if;
    v_description:=nullif(trim(v_item->>'description'),'');
    if v_description is null then return jsonb_build_object('ok',false,'error','description_required'); end if;
    if nullif(v_item->>'amount','') is null or (v_item->>'amount') !~ '^([0-9]+)(\.[0-9]+)?$' then return jsonb_build_object('ok',false,'error','invalid_amount'); end if;
    v_amount:=(v_item->>'amount')::numeric;
    if v_amount<0 then return jsonb_build_object('ok',false,'error','invalid_amount'); end if;
    if nullif(v_item->>'fee_item_id','') is not null and not exists(select 1 from public.fee_items f where f.id=(v_item->>'fee_item_id')::bigint and f.school_id=v_sess.v_school_id) then return jsonb_build_object('ok',false,'error','fee_item_not_found'); end if;
    v_total:=v_total+v_amount;
  end loop;
  if v_total<=0 then return jsonb_build_object('ok',false,'error','invoice_total_must_be_positive'); end if;
  insert into public.invoices(school_id,student_id,term_id,due_date,notes,total_amount,created_by)
  values(v_sess.v_school_id,p_student_id,p_term_id,p_due_date,p_notes,v_total,v_sess.v_teacher_id) returning * into v_invoice;
  update public.invoices set invoice_number='INV-'||lpad(v_invoice.id::text,5,'0') where id=v_invoice.id returning * into v_invoice;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id,fee_item_id,description,amount)
    values(v_invoice.id,nullif(v_item->>'fee_item_id','')::bigint,trim(v_item->>'description'),(v_item->>'amount')::numeric);
  end loop;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.v_teacher_id,'billing.invoice.create',v_sess.v_school_id,jsonb_build_object('invoice_id',v_invoice.id,'student_id',p_student_id,'total_amount',v_invoice.total_amount,'term_id',p_term_id));
  return jsonb_build_object('ok',true,'invoice',row_to_json(v_invoice));
end
$function$;

create or replace function public.rpc_record_payment(p_session_token text,p_invoice_id bigint,p_amount numeric,p_payment_date date,p_method text,p_notes text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_invoice record; v_outstanding numeric; v_row public.payments%rowtype;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select i.*,s.class as student_class into v_invoice
    from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
   where i.id=p_invoice_id and i.school_id=v_sess.v_school_id for update;
  if v_invoice.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not (private.web_has_permission(p_session_token,'billing.write',null,null) or private.web_has_permission(p_session_token,'billing.class.write',nullif(trim(v_invoice.student_class),'')::text,null))
  then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if p_amount is null or p_amount<=0 then return jsonb_build_object('ok',false,'error','invalid_amount'); end if;
  if p_method is null or trim(p_method)='' then return jsonb_build_object('ok',false,'error','payment_method_required'); end if;
  select v_invoice.total_amount-coalesce(sum(amount),0) into v_outstanding from public.payments where invoice_id=p_invoice_id;
  if p_amount>v_outstanding then return jsonb_build_object('ok',false,'error','payment_exceeds_balance','outstanding_amount',v_outstanding); end if;
  insert into public.payments(school_id,invoice_id,amount,payment_date,method,received_by,notes)
  values(v_sess.v_school_id,p_invoice_id,p_amount,coalesce(p_payment_date,current_date),trim(p_method),v_sess.v_teacher_id,p_notes) returning * into v_row;
  perform public._recalc_invoice(p_invoice_id);
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.v_teacher_id,'billing.payment.create',v_sess.v_school_id,jsonb_build_object('payment_id',v_row.id,'invoice_id',p_invoice_id,'amount',p_amount,'method',trim(p_method)));
  return jsonb_build_object('ok',true,'payment',row_to_json(v_row));
end
$function$;

create or replace function public.rpc_delete_payment(p_session_token text,p_payment_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_invoice record; v_row public.payments%rowtype;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select i.*,s.class as student_class into v_invoice
    from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
    join public.payments p on p.invoice_id=i.id
   where p.id=p_payment_id and i.school_id=v_sess.v_school_id for update;
  if v_invoice.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not (private.web_has_permission(p_session_token,'billing.write',null,null) or private.web_has_permission(p_session_token,'billing.class.write',nullif(trim(v_invoice.student_class),'')::text,null))
  then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  select * into v_row from public.payments where id=p_payment_id and invoice_id=v_invoice.id;
  if v_row.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  delete from public.payments where id=p_payment_id;
  perform public._recalc_invoice(v_invoice.id);
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.v_teacher_id,'billing.payment.delete',v_sess.v_school_id,jsonb_build_object('payment_id',v_row.id,'invoice_id',v_row.invoice_id,'amount',v_row.amount));
  return jsonb_build_object('ok',true);
end
$function$;

create or replace function public.rpc_delete_invoice(p_session_token text,p_id bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_sess record; v_invoice record;
begin
  select * into v_sess from public._billing_staff_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok',false,'error','invalid_session'); end if;
  select i.*,s.class as student_class into v_invoice
    from public.invoices i join public.students s on s.student_id=i.student_id and s.school_id=i.school_id
   where i.id=p_id and i.school_id=v_sess.v_school_id for update;
  if v_invoice.id is null then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if v_sess.v_role not in ('admin','super_admin')
     and not (private.web_has_permission(p_session_token,'billing.write',null,null) or private.web_has_permission(p_session_token,'billing.class.write',nullif(trim(v_invoice.student_class),'')::text,null))
  then return jsonb_build_object('ok',false,'error','permission_denied'); end if;
  if exists(select 1 from public.payments where invoice_id=p_id) or coalesce(v_invoice.paid_amount,0)>0 then
    return jsonb_build_object('ok',false,'error','invoice_has_payments','message','Invoices with payment history cannot be deleted.');
  end if;
  delete from public.invoices where id=p_id and school_id=v_sess.v_school_id;
  insert into public.audit_log(source,actor,action,school_id,payload)
  values('web',v_sess.v_teacher_id,'billing.invoice.delete',v_sess.v_school_id,jsonb_build_object('invoice_id',v_invoice.id,'student_id',v_invoice.student_id,'total_amount',v_invoice.total_amount));
  return jsonb_build_object('ok',true);
end
$function$;

-- 8) Explicit grants. These functions still validate the session and permissions
-- server-side; execute grants are not authorization.
grant execute on function public.rpc_get_fee_items(text) to anon,authenticated;
grant execute on function public.rpc_get_invoices(text,text,text,bigint) to anon,authenticated;
grant execute on function public.rpc_get_invoice_detail(text,bigint) to anon,authenticated;
grant execute on function public.rpc_get_billing_summary(text,text,bigint) to anon,authenticated;
grant execute on function public.rpc_add_fee_item(text,text,text,numeric,boolean) to anon,authenticated;
grant execute on function public.rpc_update_fee_item(text,bigint,text,text,numeric,boolean,boolean) to anon,authenticated;
grant execute on function public.rpc_delete_fee_item(text,bigint) to anon,authenticated;
grant execute on function public.rpc_create_invoice(text,text,bigint,date,text,jsonb) to anon,authenticated;
grant execute on function public.rpc_record_payment(text,bigint,numeric,date,text,text) to anon,authenticated;
grant execute on function public.rpc_delete_payment(text,bigint) to anon,authenticated;
grant execute on function public.rpc_delete_invoice(text,bigint) to anon,authenticated;

-- 9) Teacher Manager role provisioning for operational roles.
-- Admins may assign operational roles. Only Super Admin may assign Admin/Super Admin.
create or replace function public.rpc_admin_create_teacher_v2(
  p_session_token text,p_teacher_id text,p_login_name text,p_teacher_name text,
  p_initial_pin text,p_role text default 'teacher',p_email text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_admin record; v_role text:=lower(trim(coalesce(p_role,'teacher'))); v_email text:=lower(trim(coalesce(p_email,'')));
begin
  select s.teacher_id,s.school_id,t.role as admin_role into v_admin
    from public.app_web_sessions s join public.teachers t
      on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
   limit 1;
  if v_admin is null or v_admin.admin_role not in ('admin','super_admin') then
    return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if v_role not in ('teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin') then
    return jsonb_build_object('ok',false,'error','invalid_role'); end if;
  if v_admin.admin_role<>'super_admin' and v_role in ('admin','super_admin') then
    return jsonb_build_object('ok',false,'error','insufficient_role'); end if;
  if char_length(trim(p_login_name))<3 or char_length(trim(p_login_name))>64 or trim(p_login_name) !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then
    return jsonb_build_object('ok',false,'error','invalid_login_name'); end if;
  if char_length(coalesce(p_initial_pin,''))<6 then return jsonb_build_object('ok',false,'error','pin_too_short'); end if;
  if v_email='' or position('@' in v_email)<2 then return jsonb_build_object('ok',false,'error','email_required'); end if;
  if exists(select 1 from public.teachers where lower(teacher_id)=lower(trim(p_teacher_id))) then return jsonb_build_object('ok',false,'error','duplicate_id'); end if;
  if exists(select 1 from public.teachers where lower(login_name)=lower(trim(p_login_name))) then return jsonb_build_object('ok',false,'error','duplicate_login_name'); end if;
  if exists(select 1 from public.teachers where lower(trim(email))=v_email) then return jsonb_build_object('ok',false,'error','duplicate_email'); end if;
  insert into public.teachers(teacher_id,login_name,teacher_name,school_id,status,role,email,password_hash,must_change_password,password_changed_at)
  values(trim(p_teacher_id),trim(p_login_name),trim(p_teacher_name),v_admin.school_id,'active',v_role,v_email,public._scms_hash_password(p_initial_pin),true,now());
  return jsonb_build_object('ok',true,'teacher_id',trim(p_teacher_id),'login_name',trim(p_login_name),'teacher_name',trim(p_teacher_name),'school_id',v_admin.school_id,'role',v_role);
end
$function$;

create or replace function public.rpc_admin_update_teacher_profile(
  p_session_token text,p_teacher_id text,p_teacher_name text,p_login_name text,
  p_email text default null,p_role text default 'teacher'
) returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $function$
declare v_admin record; v_target_role text; v_role text:=lower(trim(coalesce(p_role,'teacher'))); v_name text:=trim(coalesce(p_teacher_name,'')); v_login text:=trim(coalesce(p_login_name,'')); v_teacher record;
begin
  select s.school_id,t.role as admin_role into v_admin
    from public.app_web_sessions s join public.teachers t on t.teacher_id=s.teacher_id and t.school_id=s.school_id and t.role=s.role
   where s.session_token=p_session_token and s.expires_at>now() and t.status='active'
   limit 1;
  if v_admin is null or v_admin.admin_role not in ('admin','super_admin') then return jsonb_build_object('ok',false,'error','not_admin'); end if;
  if v_role not in ('teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin') then return jsonb_build_object('ok',false,'error','invalid_role'); end if;
  if v_admin.admin_role<>'super_admin' and v_role in ('admin','super_admin') then return jsonb_build_object('ok',false,'error','insufficient_role'); end if;
  select role into v_target_role from public.teachers where teacher_id=p_teacher_id and school_id=v_admin.school_id limit 1;
  if v_target_role is null then return jsonb_build_object('ok',false,'error','teacher_not_found'); end if;
  if v_admin.admin_role<>'super_admin' and v_target_role='super_admin' then return jsonb_build_object('ok',false,'error','insufficient_role'); end if;
  if char_length(v_name)<1 or char_length(v_name)>120 then return jsonb_build_object('ok',false,'error','invalid_teacher_name'); end if;
  if char_length(v_login)<3 or char_length(v_login)>64 or v_login !~ '^[A-Za-z0-9][A-Za-z0-9._-]*$' then return jsonb_build_object('ok',false,'error','invalid_login_name'); end if;
  if exists(select 1 from public.teachers where lower(login_name)=lower(v_login) and teacher_id<>p_teacher_id) then return jsonb_build_object('ok',false,'error','duplicate_login_name'); end if;
  update public.teachers set teacher_name=v_name,login_name=v_login,email=nullif(trim(coalesce(p_email,'')),''),teacher_email=nullif(trim(coalesce(p_email,''),''),''),role=v_role,updated_at=now()
   where teacher_id=p_teacher_id and school_id=v_admin.school_id
   returning teacher_id,login_name,teacher_name,role,email,teacher_email,photo_url,status into v_teacher;
  if not found then return jsonb_build_object('ok',false,'error','teacher_not_found'); end if;
  return jsonb_build_object('ok',true,'teacher',to_jsonb(v_teacher));
end
$function$;

revoke all on function public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_admin_create_teacher_v2(text,text,text,text,text,text,text) to anon,authenticated;
revoke all on function public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.rpc_admin_update_teacher_profile(text,text,text,text,text,text) to anon,authenticated;
