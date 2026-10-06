-- Bind the canonical AI action registry to permissions already enforced by the
-- live billing, library, and transport RPC gates.
-- No new capability is introduced: unmapped actions remain fail-closed.

BEGIN;

DO $$
DECLARE
  v_expected integer := 15;
  v_updated integer;
BEGIN
  UPDATE private.ai_action_execution_registry r
     SET permission_key = x.permission_key,
         scope_type = 'global'
    FROM (
      VALUES
        ('get_billing_summary', 'rpc_get_billing_summary', 'billing.view'),
        ('get_invoices', 'rpc_get_invoices', 'billing.view'),
        ('get_invoice_detail', 'rpc_get_invoice_detail', 'billing.view'),
        ('get_books', 'rpc_get_books', 'library.view'),
        ('get_book_checkouts', 'rpc_get_book_checkouts', 'library.view'),
        ('add_book', 'rpc_add_book', 'library.manage'),
        ('update_book', 'rpc_update_book', 'library.manage'),
        ('delete_book', 'rpc_delete_book', 'library.manage'),
        ('checkout_book', 'rpc_checkout_book', 'library.manage'),
        ('return_book', 'rpc_return_book', 'library.manage'),
        ('get_routes', 'rpc_get_routes', 'transport.view'),
        ('get_route_detail', 'rpc_get_route_detail', 'transport.view'),
        ('add_route', 'rpc_add_route', 'transport.manage'),
        ('update_route', 'rpc_update_route', 'transport.manage'),
        ('delete_route', 'rpc_delete_route', 'transport.manage')
    ) AS x(action, rpc, permission_key)
   WHERE r.action = x.action
     AND r.rpc = x.rpc
     AND r.active = true;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION
      'AI action registry mapping refused: expected %, updated %',
      v_expected, v_updated;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM private.ai_action_execution_registry r
      JOIN public.permission_definitions p
        ON p.permission_key = r.permission_key
     WHERE r.action IN (
       'get_billing_summary','get_invoices','get_invoice_detail',
       'get_books','get_book_checkouts','add_book','update_book',
       'delete_book','checkout_book','return_book',
       'get_routes','get_route_detail','add_route','update_route','delete_route'
     )
       AND (
         r.permission_key IS NULL
         OR r.scope_type IS DISTINCT FROM p.scope_type
         OR p.is_active IS NOT TRUE
       )
  ) THEN
    RAISE EXCEPTION 'AI action registry mapping refused: permission contract mismatch';
  END IF;
END $$;

COMMIT;
