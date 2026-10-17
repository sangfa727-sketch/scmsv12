const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const migration = fs.readFileSync('supabase/migrations/20261017100000_revoke_browser_internal_table_mutations.sql', 'utf8');
test('migration revokes browser-role grants from internal tables', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES/);
  assert.match(migration, /public\.app_sessions/);
  assert.match(migration, /public\.audit_log/);
  assert.match(migration, /public\.n8n_state/);
  assert.match(migration, /FROM PUBLIC, anon, authenticated/);
});
test('app_sessions keeps only the documented constrained insert path for browser roles', () => {
  assert.match(migration, /GRANT INSERT ON TABLE public\.app_sessions TO anon, authenticated/);
  assert.match(migration, /pending bootstrap sessions/);
});
