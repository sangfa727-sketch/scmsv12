-- Harden billing read RPCs with the existing global billing.view permission.
-- Preserve existing session/school isolation and response contracts.

CREATE OR REPLACE FUNCTION public.rpc_get_billing_summary(
  p_session_token text, p_class text, p_term_id bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess RECORD; v_billed numeric; v_collected numeric; v_outstanding numeric; v_overdue_count int;
BEGIN
  SELECT * INTO v_sess FROM public._billing_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_session'); END IF;
  IF NOT private.web_has_permission(p_session_token, 'billing.view') THEN RETURN jsonb_build_object('ok', false, 'error', 'permission_denied'); END IF;
  SELECT COALESCE(SUM(i.total_amount),0), COALESCE(SUM(i.paid_amount),0),
         COALESCE(SUM(i.total_amount - i.paid_amount),0),
         COUNT(*) FILTER (WHERE i.status IN ('Unpaid','Partial') AND i.due_date < current_date)
    INTO v_billed, v_collected, v_outstanding, v_overdue_count
    FROM public.invoices i JOIN public.students s ON s.student_id = i.student_id
   WHERE i.school_id = v_sess.v_school_id AND i.status <> 'Cancelled'
     AND (p_class IS NULL OR s.class = p_class) AND (p_term_id IS NULL OR i.term_id = p_term_id);
  RETURN jsonb_build_object('ok', true, 'total_billed', v_billed, 'total_collected', v_collected,
                             'outstanding', v_outstanding, 'overdue_count', v_overdue_count);
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_invoices(
  p_session_token text, p_class text, p_status text, p_term_id bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess RECORD;
BEGIN
  SELECT * INTO v_sess FROM public._billing_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_session'); END IF;
  IF NOT private.web_has_permission(p_session_token, 'billing.view') THEN RETURN jsonb_build_object('ok', false, 'error', 'permission_denied'); END IF;
  RETURN jsonb_build_object('ok', true, 'rows', COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.due_date NULLS LAST, x.id DESC)
      FROM (
        SELECT i.*, s.name_en, s.class, s.status AS student_status,
               CASE WHEN i.status IN ('Unpaid','Partial') AND i.due_date < current_date THEN 'Overdue' ELSE i.status END AS display_status
          FROM public.invoices i JOIN public.students s ON s.student_id = i.student_id
         WHERE i.school_id = v_sess.v_school_id
           AND (p_class IS NULL OR s.class = p_class)
           AND (p_term_id IS NULL OR i.term_id = p_term_id)
           AND (p_status IS NULL OR i.status = p_status OR (p_status = 'Overdue' AND i.status IN ('Unpaid','Partial') AND i.due_date < current_date))
      ) x
  ), '[]'::jsonb));
END $function$;

CREATE OR REPLACE FUNCTION public.rpc_get_invoice_detail(
  p_session_token text, p_id bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_sess RECORD; v_invoice RECORD;
BEGIN
  SELECT * INTO v_sess FROM public._billing_session(p_session_token);
  IF v_sess.v_school_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_session'); END IF;
  IF NOT private.web_has_permission(p_session_token, 'billing.view') THEN RETURN jsonb_build_object('ok', false, 'error', 'permission_denied'); END IF;
  SELECT i.*, s.name_en, s.class, s.status AS student_status INTO v_invoice
    FROM public.invoices i JOIN public.students s ON s.student_id = i.student_id
   WHERE i.id = p_id AND i.school_id = v_sess.v_school_id;
  IF v_invoice.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true, 'invoice', to_jsonb(v_invoice),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM public.invoice_items x WHERE x.invoice_id = p_id), '[]'::jsonb),
    'payments', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.payment_date DESC, x.id DESC) FROM public.payments x WHERE x.invoice_id = p_id), '[]'::jsonb));
END $function$;

REVOKE ALL ON FUNCTION public.rpc_get_billing_summary(text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_invoices(text,text,text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_invoice_detail(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_get_billing_summary(text,text,bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_invoices(text,text,text,bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_invoice_detail(text,bigint) TO anon, authenticated;
