-- Billing financial integrity hardening: validate money inputs, serialize payment writes,
-- preserve tenant scope, and create immutable audit entries for billing mutations.

CREATE OR REPLACE FUNCTION public.rpc_add_fee_item(
  p_session_token text, p_name text, p_category text, p_default_amount numeric, p_is_recurring boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_sess record; v_row public.fee_items%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_name IS NULL OR trim(p_name)='' THEN RETURN jsonb_build_object('ok',false,'error','name_required'); END IF;
  IF p_default_amount IS NOT NULL AND p_default_amount < 0 THEN RETURN jsonb_build_object('ok',false,'error','invalid_amount'); END IF;
  INSERT INTO public.fee_items (school_id,name,category,default_amount,is_recurring)
  VALUES (v_sess.v_school_id,trim(p_name),coalesce(nullif(trim(p_category),''),'Other'),coalesce(p_default_amount,0),coalesce(p_is_recurring,true))
  RETURNING * INTO v_row;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES ('web',v_sess.v_teacher_id,'billing.fee_item.create',v_sess.v_school_id,
          jsonb_build_object('fee_item_id',v_row.id,'name',v_row.name,'amount',v_row.default_amount));
  RETURN jsonb_build_object('ok',true,'fee_item',row_to_json(v_row));
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_update_fee_item(
  p_session_token text, p_id bigint, p_name text, p_category text, p_default_amount numeric,
  p_is_recurring boolean, p_is_active boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE v_sess record; v_row public.fee_items%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_name IS NOT NULL AND trim(p_name)='' THEN RETURN jsonb_build_object('ok',false,'error','name_required'); END IF;
  IF p_default_amount IS NOT NULL AND p_default_amount < 0 THEN RETURN jsonb_build_object('ok',false,'error','invalid_amount'); END IF;
  UPDATE public.fee_items
     SET name=coalesce(nullif(trim(p_name),''),name), category=coalesce(nullif(trim(p_category),''),category),
         default_amount=coalesce(p_default_amount,default_amount), is_recurring=coalesce(p_is_recurring,is_recurring),
         is_active=coalesce(p_is_active,is_active)
   WHERE id=p_id AND school_id=v_sess.v_school_id
   RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES ('web',v_sess.v_teacher_id,'billing.fee_item.update',v_sess.v_school_id,
          jsonb_build_object('fee_item_id',v_row.id,'name',v_row.name,'amount',v_row.default_amount,'is_active',v_row.is_active));
  RETURN jsonb_build_object('ok',true,'fee_item',row_to_json(v_row));
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_fee_item(p_session_token text,p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_sess record; v_row public.fee_items%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  UPDATE public.fee_items SET is_active=false WHERE id=p_id AND school_id=v_sess.v_school_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES ('web',v_sess.v_teacher_id,'billing.fee_item.deactivate',v_sess.v_school_id,jsonb_build_object('fee_item_id',v_row.id));
  RETURN jsonb_build_object('ok',true);
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_invoice(
  p_session_token text,p_student_id text,p_term_id bigint,p_due_date date,p_notes text,p_items jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_sess record; v_invoice public.invoices%rowtype; v_item jsonb; v_total numeric:=0; v_amount numeric; v_description text;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_student_id IS NULL OR trim(p_student_id)='' THEN RETURN jsonb_build_object('ok',false,'error','student_required'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.students s WHERE s.student_id=p_student_id AND s.school_id=v_sess.v_school_id) THEN RETURN jsonb_build_object('ok',false,'error','student_not_found'); END IF;
  IF p_term_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.terms t WHERE t.id=p_term_id AND t.school_id=v_sess.v_school_id) THEN RETURN jsonb_build_object('ok',false,'error','term_not_found'); END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 THEN RETURN jsonb_build_object('ok',false,'error','no_items','message','Add at least one line item'); END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item)<>'object' THEN RETURN jsonb_build_object('ok',false,'error','invalid_line_item'); END IF;
    v_description:=nullif(trim(v_item->>'description'),'');
    IF v_description IS NULL THEN RETURN jsonb_build_object('ok',false,'error','description_required'); END IF;
    IF nullif(v_item->>'amount','') IS NULL OR (v_item->>'amount') !~ '^([0-9]+)(\.[0-9]+)?$' THEN RETURN jsonb_build_object('ok',false,'error','invalid_amount'); END IF;
    v_amount:=(v_item->>'amount')::numeric;
    IF v_amount < 0 THEN RETURN jsonb_build_object('ok',false,'error','invalid_amount'); END IF;
    IF nullif(v_item->>'fee_item_id','') IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.fee_items f WHERE f.id=(v_item->>'fee_item_id')::bigint AND f.school_id=v_sess.v_school_id
    ) THEN RETURN jsonb_build_object('ok',false,'error','fee_item_not_found'); END IF;
    v_total:=v_total+v_amount;
  END LOOP;
  IF v_total <= 0 THEN RETURN jsonb_build_object('ok',false,'error','invoice_total_must_be_positive'); END IF;
  INSERT INTO public.invoices(school_id,student_id,term_id,due_date,notes,total_amount,created_by)
  VALUES(v_sess.v_school_id,p_student_id,p_term_id,p_due_date,p_notes,v_total,v_sess.v_teacher_id) RETURNING * INTO v_invoice;
  UPDATE public.invoices SET invoice_number='INV-'||lpad(v_invoice.id::text,5,'0') WHERE id=v_invoice.id RETURNING * INTO v_invoice;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.invoice_items(invoice_id,fee_item_id,description,amount)
    VALUES(v_invoice.id,nullif(v_item->>'fee_item_id','')::bigint,trim(v_item->>'description'),(v_item->>'amount')::numeric);
  END LOOP;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES('web',v_sess.v_teacher_id,'billing.invoice.create',v_sess.v_school_id,
         jsonb_build_object('invoice_id',v_invoice.id,'student_id',p_student_id,'total_amount',v_invoice.total_amount,'term_id',p_term_id));
  RETURN jsonb_build_object('ok',true,'invoice',row_to_json(v_invoice));
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_record_payment(
  p_session_token text,p_invoice_id bigint,p_amount numeric,p_payment_date date,p_method text,p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_sess record; v_row public.payments%rowtype; v_invoice public.invoices%rowtype; v_outstanding numeric;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('ok',false,'error','invalid_amount'); END IF;
  IF p_method IS NULL OR trim(p_method)='' THEN RETURN jsonb_build_object('ok',false,'error','payment_method_required'); END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_invoice_id AND school_id=v_sess.v_school_id FOR UPDATE;
  IF v_invoice.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  SELECT v_invoice.total_amount-coalesce(sum(amount),0) INTO v_outstanding FROM public.payments WHERE invoice_id=p_invoice_id;
  IF p_amount > v_outstanding THEN RETURN jsonb_build_object('ok',false,'error','payment_exceeds_balance','outstanding_amount',v_outstanding); END IF;
  INSERT INTO public.payments(school_id,invoice_id,amount,payment_date,method,received_by,notes)
  VALUES(v_sess.v_school_id,p_invoice_id,p_amount,coalesce(p_payment_date,current_date),trim(p_method),v_sess.v_teacher_id,p_notes) RETURNING * INTO v_row;
  PERFORM public._recalc_invoice(p_invoice_id);
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES('web',v_sess.v_teacher_id,'billing.payment.create',v_sess.v_school_id,
         jsonb_build_object('payment_id',v_row.id,'invoice_id',p_invoice_id,'amount',p_amount,'method',trim(p_method)));
  RETURN jsonb_build_object('ok',true,'payment',row_to_json(v_row));
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_payment(p_session_token text,p_payment_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_sess record; v_invoice public.invoices%rowtype; v_row public.payments%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  SELECT i.* INTO v_invoice FROM public.invoices i JOIN public.payments p ON p.invoice_id=i.id
   WHERE p.id=p_payment_id AND i.school_id=v_sess.v_school_id FOR UPDATE;
  IF v_invoice.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  SELECT * INTO v_row FROM public.payments WHERE id=p_payment_id AND invoice_id=v_invoice.id;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  DELETE FROM public.payments WHERE id=p_payment_id;
  PERFORM public._recalc_invoice(v_invoice.id);
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES('web',v_sess.v_teacher_id,'billing.payment.delete',v_sess.v_school_id,
         jsonb_build_object('payment_id',v_row.id,'invoice_id',v_row.invoice_id,'amount',v_row.amount));
  RETURN jsonb_build_object('ok',true);
END
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_invoice(p_session_token text,p_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
DECLARE v_sess record; v_invoice public.invoices%rowtype;
BEGIN
  SELECT * INTO v_sess FROM public._billing_admin_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','invalid_session'); END IF;
  SELECT * INTO v_invoice FROM public.invoices WHERE id=p_id AND school_id=v_sess.v_school_id FOR UPDATE;
  IF v_invoice.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF exists(SELECT 1 FROM public.payments WHERE invoice_id=p_id) OR coalesce(v_invoice.paid_amount,0)>0 THEN
    RETURN jsonb_build_object('ok',false,'error','invoice_has_payments','message','Invoices with payment history cannot be deleted.');
  END IF;
  DELETE FROM public.invoices WHERE id=p_id AND school_id=v_sess.v_school_id;
  INSERT INTO public.audit_log(source,actor,action,school_id,payload)
  VALUES('web',v_sess.v_teacher_id,'billing.invoice.delete',v_sess.v_school_id,
         jsonb_build_object('invoice_id',v_invoice.id,'student_id',v_invoice.student_id,'total_amount',v_invoice.total_amount));
  RETURN jsonb_build_object('ok',true);
END
$function$;
