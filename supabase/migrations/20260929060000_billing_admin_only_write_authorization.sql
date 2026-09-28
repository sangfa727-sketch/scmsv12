-- Billing write operations are restricted to school admins and system super admins.
-- Teachers retain read-only access through the existing billing read RPCs.

create or replace function public._billing_admin_session(p_session_token text)
returns table(v_school_id text, v_teacher_id text)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  return query
    select s.school_id, s.teacher_id
      from public.app_web_sessions s
      join public.teachers t on t.teacher_id = s.teacher_id
     where s.session_token = p_session_token
       and s.expires_at > now()
       and t.status = 'active'
       and t.role in ('admin','super_admin');
end
$function$;

create or replace function public.rpc_add_fee_item(p_session_token text, p_name text, p_category text, p_default_amount numeric, p_is_recurring boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record; v_row public.fee_items%rowtype;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  insert into public.fee_items (school_id, name, category, default_amount, is_recurring)
  values (v_sess.v_school_id, p_name, coalesce(p_category,'Other'), coalesce(p_default_amount,0), coalesce(p_is_recurring,true))
  returning * into v_row;
  return jsonb_build_object('ok', true, 'fee_item', row_to_json(v_row));
end
$function$;

create or replace function public.rpc_create_invoice(p_session_token text, p_student_id text, p_term_id bigint, p_due_date date, p_notes text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_sess record; v_invoice public.invoices%rowtype; v_item jsonb; v_total numeric := 0;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  if not exists (select 1 from public.students s where s.student_id = p_student_id and s.school_id = v_sess.v_school_id) then return jsonb_build_object('ok', false, 'error', 'student_not_found'); end if;
  if p_term_id is not null and not exists (select 1 from public.terms t where t.id = p_term_id and t.school_id = v_sess.v_school_id) then return jsonb_build_object('ok', false, 'error', 'term_not_found'); end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then return jsonb_build_object('ok', false, 'error', 'no_items', 'message', 'Add at least one line item'); end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where nullif(x->>'fee_item_id','') is not null
      and not exists (
        select 1 from public.fee_items f
        where f.id = nullif(x->>'fee_item_id','')::bigint
          and f.school_id = v_sess.v_school_id
      )
  ) then return jsonb_build_object('ok', false, 'error', 'fee_item_not_found'); end if;
  select coalesce(sum((x->>'amount')::numeric), 0) into v_total from jsonb_array_elements(p_items) x;
  insert into public.invoices (school_id, student_id, term_id, due_date, notes, total_amount, created_by)
  values (v_sess.v_school_id, p_student_id, p_term_id, p_due_date, p_notes, v_total, v_sess.v_teacher_id)
  returning * into v_invoice;
  update public.invoices set invoice_number = 'INV-' || lpad(v_invoice.id::text, 5, '0') where id = v_invoice.id returning * into v_invoice;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (invoice_id, fee_item_id, description, amount)
    values (v_invoice.id, nullif(v_item->>'fee_item_id','')::bigint, v_item->>'description', coalesce((v_item->>'amount')::numeric, 0));
  end loop;
  return jsonb_build_object('ok', true, 'invoice', row_to_json(v_invoice));
end
$function$;

create or replace function public.rpc_delete_fee_item(p_session_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  update public.fee_items set is_active = false where id = p_id and school_id = v_sess.v_school_id;
  return jsonb_build_object('ok', true);
end
$function$;

create or replace function public.rpc_delete_invoice(p_session_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  delete from public.invoices where id = p_id and school_id = v_sess.v_school_id;
  return jsonb_build_object('ok', true);
end
$function$;

create or replace function public.rpc_delete_payment(p_session_token text, p_payment_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record; v_invoice_id bigint; v_school_check text;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  select invoice_id into v_invoice_id from public.payments where id = p_payment_id;
  select school_id into v_school_check from public.invoices where id = v_invoice_id;
  if v_school_check is null or v_school_check <> v_sess.v_school_id then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  delete from public.payments where id = p_payment_id;
  perform public._recalc_invoice(v_invoice_id);
  return jsonb_build_object('ok', true);
end
$function$;

create or replace function public.rpc_link_admission_invoice(p_session_token text, p_id bigint, p_invoice_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record; v_row record; v_inv record;
begin
  select s.teacher_id, s.school_id into v_sess
    from public.app_web_sessions s
    join public.teachers t on t.teacher_id = s.teacher_id
   where s.session_token = p_session_token
     and s.expires_at > now()
     and t.status = 'active'
     and t.role in ('admin','super_admin')
   limit 1;
  if v_sess is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  select * into v_inv from public.invoices where id = p_invoice_id and school_id = v_sess.school_id;
  if v_inv is null then return jsonb_build_object('ok', false, 'error', 'invoice_not_found'); end if;
  update public.admissions set registration_invoice_id = p_invoice_id
   where id = p_id and school_id = v_sess.school_id
   returning * into v_row;
  if v_row is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'admission', to_jsonb(v_row));
end
$function$;

create or replace function public.rpc_record_payment(p_session_token text, p_invoice_id bigint, p_amount numeric, p_payment_date date, p_method text, p_notes text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record; v_row public.payments%rowtype; v_school_check text;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  select school_id into v_school_check from public.invoices where id = p_invoice_id;
  if v_school_check is null or v_school_check <> v_sess.v_school_id then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  insert into public.payments (school_id, invoice_id, amount, payment_date, method, received_by, notes)
  values (v_sess.v_school_id, p_invoice_id, p_amount, coalesce(p_payment_date, current_date), coalesce(p_method,'Cash'), v_sess.v_teacher_id, p_notes)
  returning * into v_row;
  perform public._recalc_invoice(p_invoice_id);
  return jsonb_build_object('ok', true, 'payment', row_to_json(v_row));
end
$function$;

create or replace function public.rpc_update_fee_item(p_session_token text, p_id bigint, p_name text, p_category text, p_default_amount numeric, p_is_recurring boolean, p_is_active boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare v_sess record; v_row public.fee_items%rowtype;
begin
  select * into v_sess from public._billing_admin_session(p_session_token);
  if v_sess.v_school_id is null then return jsonb_build_object('ok', false, 'error', 'invalid_session'); end if;
  update public.fee_items
     set name = coalesce(p_name, name), category = coalesce(p_category, category),
         default_amount = coalesce(p_default_amount, default_amount),
         is_recurring = coalesce(p_is_recurring, is_recurring),
         is_active = coalesce(p_is_active, is_active)
   where id = p_id and school_id = v_sess.v_school_id
   returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'fee_item', row_to_json(v_row));
end
$function$;
