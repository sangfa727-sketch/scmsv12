const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261014131000_revoke_internal_table_client_mutation.sql', 'utf8');

test('internal session, audit, and automation tables are not directly accessible to browser roles', () => {
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE[\s\S]*public\.app_sessions,[\s\S]*public\.audit_log,[\s\S]*public\.n8n_state[\s\S]*FROM anon, authenticated/i);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/i);
});
