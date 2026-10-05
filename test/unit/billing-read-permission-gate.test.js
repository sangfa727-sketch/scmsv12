const assert = require('node:assert/strict');
const fs = require('node:fs');

const file = fs.readFileSync(
  'supabase/migrations/20261005290000_billing_read_permission_gate.sql',
  'utf8'
);

for (const fn of [
  'rpc_get_billing_summary',
  'rpc_get_invoices',
  'rpc_get_invoice_detail',
]) {
  const marker = `CREATE OR REPLACE FUNCTION public.${fn}`;
  assert.ok(file.includes(marker), `${fn} definition missing`);
}

assert.equal(
  (file.match(/private\.web_has_permission\(p_session_token, 'billing\.view'\)/g) || []).length,
  3,
  'all three billing read RPCs must enforce billing.view'
);

assert.equal(
  (file.match(/error', 'permission_denied'/g) || []).length,
  3,
  'all three billing read RPCs must fail closed'
);

assert.ok(file.includes("v_sess.v_school_id"), 'billing school scope must be preserved');
assert.ok(file.includes("REVOKE ALL ON FUNCTION"), 'explicit privilege reset required');
assert.ok(file.includes("GRANT EXECUTE"), 'explicit execution grants required');

console.log('billing read permission gate migration contract: PASS');
