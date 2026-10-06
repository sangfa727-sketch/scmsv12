const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname,'../../supabase/migrations/20261006110000_ai_action_registry_billing_library_transport_mapping.sql'),
  'utf8'
);

const mappings = [
  ['get_billing_summary','rpc_get_billing_summary','billing.view'],
  ['get_invoices','rpc_get_invoices','billing.view'],
  ['get_invoice_detail','rpc_get_invoice_detail','billing.view'],
  ['get_books','rpc_get_books','library.view'],
  ['get_book_checkouts','rpc_get_book_checkouts','library.view'],
  ['add_book','rpc_add_book','library.manage'],
  ['update_book','rpc_update_book','library.manage'],
  ['delete_book','rpc_delete_book','library.manage'],
  ['checkout_book','rpc_checkout_book','library.manage'],
  ['return_book','rpc_return_book','library.manage'],
  ['get_routes','rpc_get_routes','transport.view'],
  ['get_route_detail','rpc_get_route_detail','transport.view'],
  ['add_route','rpc_add_route','transport.manage'],
  ['update_route','rpc_update_route','transport.manage'],
  ['delete_route','rpc_delete_route','transport.manage'],
];

test('binds exactly 15 existing RPC actions to existing global permissions', () => {
  assert.match(sql, /v_expected integer := 15/i);
  assert.match(sql, /v_updated integer/i);
  assert.match(sql, /v_updated <> v_expected/i);
  for (const [action, rpc, permission] of mappings) {
    assert.match(sql, new RegExp(`'${action}', '${rpc}', '${permission}'`));
  }
});

test('mapping remains fail-closed and scope-consistent', () => {
  assert.match(sql, /r\.active = true/i);
  assert.match(sql, /scope_type = 'global'/i);
  assert.match(sql, /p\.is_active IS NOT TRUE/i);
  assert.match(sql, /r\.scope_type IS DISTINCT FROM p\.scope_type/i);
});

test('migration does not fabricate permissions or registry rows', () => {
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+public\.permission_definitions/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+private\.ai_action_execution_registry/i);
  assert.match(sql, /UPDATE private\.ai_action_execution_registry/i);
});
