const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('legacy rpc_get_my_data overload is not browser-callable', () => {
  const sql = read('supabase/migrations/20261007060000_revoke_legacy_my_data_client_execute.sql');
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.rpc_get_my_data\(text, text, integer\) FROM PUBLIC, anon, authenticated/);
});