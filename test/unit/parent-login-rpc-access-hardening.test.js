const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261014132000_restrict_parent_login_rpc.sql', 'utf8');

test('parent login RPC cannot be invoked directly by browser roles', () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_parent_google_login\(text, text, text\)\s+FROM anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_parent_google_login\(text, text, text\)\s+TO service_role/i);
});
