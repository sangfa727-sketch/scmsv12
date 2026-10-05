const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '../../supabase/migrations/20261005300000_library_permission_gates.sql');
const sql = fs.readFileSync(file, 'utf8');

const expected = [
  ['rpc_get_books', 'library.view'],
  ['rpc_get_book_checkouts', 'library.view'],
  ['rpc_add_book', 'library.manage'],
  ['rpc_update_book', 'library.manage'],
  ['rpc_delete_book', 'library.manage'],
  ['rpc_checkout_book', 'library.manage'],
  ['rpc_return_book', 'library.manage'],
];

assert.match(sql, /'library\.view'/);
assert.match(sql, /'library\.manage'/);
for (const [fn, permission] of expected) {
  assert.match(sql, new RegExp(fn.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')));
  assert.match(sql, new RegExp("v_item\\.permission_key.*" + permission.replace('.', '\\.')));
}
assert.match(sql, /permission_denied/);
assert.match(sql, /REVOKE ALL ON FUNCTION/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION/);
assert.match(sql, /pg_get_functiondef/);
assert.match(sql, /Library permission migration refused/);

console.log('library permission gate migration contract: PASS');
