-- SCMS v12: enforce billing.class.write / billing.class.view at the RPC boundary.
-- The canonical role matrix already grants billing.class.write to teacher-family
-- roles. This migration reconciles the Billing RPCs with that live permission
-- model while keeping billing.fees.manage and whole-school billing.write global.

create or replace function public.rpc_get_fee_items(p_session_token text)
returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  -- Fee catalog is visible to whole-school billing readers, fee managers,
  -- and staff who have class-scoped billing write access.
  if not private.web_has_permission(p_session_token,'billing.view',null,null)
     and not private.web_has_permission(p_session_token,'billing.fees.manage',null,null)
     and not exists (
       select 1
         from public.teacher_class_assignments a
        where a.school_id=v_sess.v_school_id
          and a.teacher_id=v_sess.v_teacher_id
          and a.is_active=true
          and private.web_has_permission(
            p_session_token,'billing.class.write',nullif(trim(a.class_name),'')::text,null
          )
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  return jsonb_build_object('ok',true,'rows',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.category,x.name)
      from (
        select * from public.fee_items
         where school_id=v_sess.v_school_id and is_active
      ) x
  ),'[]'::jsonb));
end
$function$;

create or replace function public.rpc_get_invoices(
  p_session_token text,p_class text,p_status text,p_term_id bigint
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  return jsonb_build_object('ok',true,'rows',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.due_date nulls last,x.id desc)
      from (
        select i.*,s.name_en,s.class,s.status as student_status,
               case when i.status in ('Unpaid','Partial')
                          and i.due_date < current_date
                    then 'Overdue' else i.status end as display_status
          from public.invoices i
          join public.students s
            on s.student_id=i.student_id
           and s.school_id=i.school_id
         where i.school_id=v_sess.v_school_id
           and (p_class is null or s.class=p_class)
           and (p_term_id is null or i.term_id=p_term_id)
           and (p_status is null
                or i.status=p_status
                or (p_status='Overdue'
                    and i.status in ('Unpaid','Partial')
                    and i.due_date < current_date))
           and (
             private.web_has_permission(p_session_token,'billing.view',null,null)
             or private.web_has_permission(
               p_session_token,'billing.class.view',
               nullif(trim(s.class),'')::text,null
             )
           )
      ) x
  ),'[]'::jsonb));
end
$function$;

create or replace function public.rpc_get_invoice_detail(
  p_session_token text,p_id bigint
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_sess record; v_invoice record;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select i.*,s.name_en,s.class,s.status as student_status
    into v_invoice
    from public.invoices i
    join public.students s
      on s.student_id=i.student_id
     and s.school_id=i.school_id
   where i.id=p_id
     and i.school_id=v_sess.v_school_id;

  if v_invoice.id is null then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if not private.web_has_permission(p_session_token,'billing.view',null,null)
     and not private.web_has_permission(
       p_session_token,'billing.class.view',
       nullif(trim(v_invoice.class),'')::text,null
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  return jsonb_build_object(
    'ok',true,
    'invoice',to_jsonb(v_invoice),
    'items',coalesce((
      select jsonb_agg(to_jsonb(x))
        from public.invoice_items x
       where x.invoice_id=p_id
    ),'[]'::jsonb),
    'payments',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.payment_date desc,x.id desc)
        from public.payments x
       where x.invoice_id=p_id
    ),'[]'::jsonb)
  );
end
$function$;

create or replace function public.rpc_create_invoice(
  p_session_token text,p_student_id text,p_term_id bigint,p_due_date date,
  p_notes text,p_items jsonb
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record; v_student record; v_invoice public.invoices%rowtype;
  v_item jsonb; v_total numeric:=0; v_amount numeric; v_description text;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select s.student_id,s.class
    into v_student
    from public.students s
   where s.student_id=p_student_id
     and s.school_id=v_sess.v_school_id
   limit 1;

  if v_student is null then
    return jsonb_build_object('ok',false,'error','student_not_found');
  end if;

  if not private.web_has_permission(p_session_token,'billing.write',null,null)
     and not private.web_has_permission(
       p_session_token,'billing.class.write',
       nullif(trim(v_student.class),'')::text,null
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if p_student_id is null or trim(p_student_id)='' then
    return jsonb_build_object('ok',false,'error','student_required');
  end if;
  if p_term_id is not null and not exists(
    select 1 from public.terms t
     where t.id=p_term_id and t.school_id=v_sess.v_school_id
  ) then
    return jsonb_build_object('ok',false,'error','term_not_found');
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items)=0 then
    return jsonb_build_object('ok',false,'error','no_items','message','Add at least one line item');
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item)<>'object' then
      return jsonb_build_object('ok',false,'error','invalid_line_item');
    end if;
    v_description:=nullif(trim(v_item->>'description'),'');
    if v_description is null then
      return jsonb_build_object('ok',false,'error','description_required');
    end if;
    if nullif(v_item->>'amount','') is null
       or (v_item->>'amount') !~ '^([0-9]+)(\\.[0-9]+)?$' then
      return jsonb_build_object('ok',false,'error','invalid_amount');
    end if;
    v_amount:=(v_item->>'amount')::numeric;
    if v_amount < 0 then
      return jsonb_build_object('ok',false,'error','invalid_amount');
    end if;
    if nullif(v_item->>'fee_item_id','') is not null
       and not exists(
         select 1 from public.fee_items f
          where f.id=(v_item->>'fee_item_id')::bigint
            and f.school_id=v_sess.v_school_id
       ) then
      return jsonb_build_object('ok',false,'error','fee_item_not_found');
    end if;
    v_total:=v_total+v_amount;
  end loop;

  if v_total<=0 then
    return jsonb_build_object('ok',false,'error','invoice_total_must_be_positive');
  end if;

  insert into public.invoices(
    school_id,student_id,term_id,due_date,notes,total_amount,created_by
  )
  values(
    v_sess.v_school_id,p_student_id,p_term_id,p_due_date,p_notes,
    v_total,v_sess.v_teacher_id
  )
  returning * into v_invoice;

  update public.invoices
     set invoice_number='INV-'||lpad(v_invoice.id::text,5,'0')
   where id=v_invoice.id
   returning * into v_invoice;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(
      invoice_id,fee_item_id,description,amount
    )
    values(
      v_invoice.id,
      nullif(v_item->>'fee_item_id','')::bigint,
      trim(v_item->>'description'),
      (v_item->>'amount')::numeric
    );
  end loop;

  insert into public.audit_log(source,actor,action,school_id,payload)
  values(
    'web',v_sess.v_teacher_id,'billing.invoice.create',v_sess.v_school_id,
    jsonb_build_object(
      'invoice_id',v_invoice.id,
      'student_id',p_student_id,
      'total_amount',v_invoice.total_amount,
      'term_id',p_term_id
    )
  );

  return jsonb_build_object('ok',true,'invoice',row_to_json(v_invoice));
end
$function$;

create or replace function public.rpc_delete_invoice(
  p_session_token text,p_id bigint
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_sess record; v_invoice record;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select i.*,s.class
    into v_invoice
    from public.invoices i
    join public.students s
      on s.student_id=i.student_id
     and s.school_id=i.school_id
   where i.id=p_id
     and i.school_id=v_sess.v_school_id
   for update;

  if v_invoice.id is null then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if not private.web_has_permission(p_session_token,'billing.write',null,null)
     and not private.web_has_permission(
       p_session_token,'billing.class.write',
       nullif(trim(v_invoice.class),'')::text,null
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  if exists(select 1 from public.payments where invoice_id=p_id)
     or coalesce(v_invoice.paid_amount,0)>0 then
    return jsonb_build_object(
      'ok',false,'error','invoice_has_payments',
      'message','Invoices with payment history cannot be deleted.'
    );
  end if;

  delete from public.invoices
   where id=p_id
     and school_id=v_sess.v_school_id;

  insert into public.audit_log(source,actor,action,school_id,payload)
  values(
    'web',v_sess.v_teacher_id,'billing.invoice.delete',v_sess.v_school_id,
    jsonb_build_object(
      'invoice_id',v_invoice.id,
      'student_id',v_invoice.student_id,
      'total_amount',v_invoice.total_amount
    )
  );

  return jsonb_build_object('ok',true);
end
$function$;

create or replace function public.rpc_record_payment(
  p_session_token text,p_invoice_id bigint,p_amount numeric,
  p_payment_date date,p_method text,p_notes text
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_sess record; v_row public.payments%rowtype;
  v_invoice record; v_outstanding numeric;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  if p_amount is null or p_amount<=0 then
    return jsonb_build_object('ok',false,'error','invalid_amount');
  end if;
  if p_method is null or trim(p_method)='' then
    return jsonb_build_object('ok',false,'error','payment_method_required');
  end if;

  select i.*,s.class
    into v_invoice
    from public.invoices i
    join public.students s
      on s.student_id=i.student_id
     and s.school_id=i.school_id
   where i.id=p_invoice_id
     and i.school_id=v_sess.v_school_id
   for update;

  if v_invoice.id is null then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if not private.web_has_permission(p_session_token,'billing.write',null,null)
     and not private.web_has_permission(
       p_session_token,'billing.class.write',
       nullif(trim(v_invoice.class),'')::text,null
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  select v_invoice.total_amount-coalesce(sum(amount),0)
    into v_outstanding
    from public.payments
   where invoice_id=p_invoice_id;

  if p_amount>v_outstanding then
    return jsonb_build_object(
      'ok',false,'error','payment_exceeds_balance',
      'outstanding_amount',v_outstanding
    );
  end if;

  insert into public.payments(
    school_id,invoice_id,amount,payment_date,method,received_by,notes
  )
  values(
    v_sess.v_school_id,p_invoice_id,p_amount,
    coalesce(p_payment_date,current_date),trim(p_method),
    v_sess.v_teacher_id,p_notes
  )
  returning * into v_row;

  perform public._recalc_invoice(p_invoice_id);

  insert into public.audit_log(source,actor,action,school_id,payload)
  values(
    'web',v_sess.v_teacher_id,'billing.payment.create',v_sess.v_school_id,
    jsonb_build_object(
      'payment_id',v_row.id,
      'invoice_id',p_invoice_id,
      'amount',p_amount,
      'method',trim(p_method)
    )
  );

  return jsonb_build_object('ok',true,'payment',row_to_json(v_row));
end
$function$;

create or replace function public.rpc_delete_payment(
  p_session_token text,p_payment_id bigint
) returns jsonb
language plpgsql security definer
set search_path to 'public','pg_temp'
as $function$
declare v_sess record; v_invoice record; v_row public.payments%rowtype;
begin
  select * into v_sess from public._billing_session(p_session_token);
  if v_sess.v_school_id is null then
    return jsonb_build_object('ok',false,'error','invalid_session');
  end if;

  select i.*,s.class
    into v_invoice
    from public.invoices i
    join public.payments p on p.invoice_id=i.id
    join public.students s
      on s.student_id=i.student_id
     and s.school_id=i.school_id
   where p.id=p_payment_id
     and i.school_id=v_sess.v_school_id
   for update;

  if v_invoice.id is null then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  if not private.web_has_permission(p_session_token,'billing.write',null,null)
     and not private.web_has_permission(
       p_session_token,'billing.class.write',
       nullif(trim(v_invoice.class),'')::text,null
     ) then
    return jsonb_build_object('ok',false,'error','permission_denied');
  end if;

  select * into v_row
    from public.payments
   where id=p_payment_id
     and invoice_id=v_invoice.id;

  if v_row.id is null then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  delete from public.payments where id=p_payment_id;
  perform public._recalc_invoice(v_invoice.id);

  insert into public.audit_log(source,actor,action,school_id,payload)
  values(
    'web',v_sess.v_teacher_id,'billing.payment.delete',v_sess.v_school_id,
    jsonb_build_object(
      'payment_id',v_row.id,
      'invoice_id',v_row.invoice_id,
      'amount',v_row.amount
    )
  );

  return jsonb_build_object('ok',true);
end
$function$;

revoke all on function public.rpc_get_fee_items(text) from public;
grant execute on function public.rpc_get_fee_items(text) to anon,authenticated;

revoke all on function public.rpc_get_invoices(text,text,text,bigint) from public;
grant execute on function public.rpc_get_invoices(text,text,text,bigint) to anon,authenticated;

revoke all on function public.rpc_get_invoice_detail(text,bigint) from public;
grant execute on function public.rpc_get_invoice_detail(text,bigint) to anon,authenticated;

revoke all on function public.rpc_create_invoice(text,text,bigint,date,text,jsonb) from public;
grant execute on function public.rpc_create_invoice(text,text,bigint,date,text,jsonb) to anon,authenticated;

revoke all on function public.rpc_delete_invoice(text,bigint) from public;
grant execute on function public.rpc_delete_invoice(text,bigint) to anon,authenticated;

revoke all on function public.rpc_record_payment(text,bigint,numeric,date,text,text) from public;
grant execute on function public.rpc_record_payment(text,bigint,numeric,date,text,text) to anon,authenticated;

revoke all on function public.rpc_delete_payment(text,bigint) from public;
grant execute on function public.rpc_delete_payment(text,bigint) to anon,authenticated;
