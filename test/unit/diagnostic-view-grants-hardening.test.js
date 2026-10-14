const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261014132000_revoke_public_catalog_diagnostic_views.sql', 'utf8');

test('diagnostic catalog views are not directly readable by browser roles', () => {
  assert.match(migration, /REVOKE SELECT ON TABLE public\.tap_funky, public\.pg_all_foreign_keys\s+FROM anon, authenticated/i);
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/i);
});
