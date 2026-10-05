const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20261005280000_get_my_data_permission_gate_live_reconcile.sql',
  'utf8'
);

const normalized = migration.replace(/\s+/g, ' ');

test('get_my_data reconciliation keeps session, permission, and fail-closed gates', () => {
  assert.match(normalized, /join public\.teachers t/);
  assert.match(normalized, /t\.school_id = s\.school_id/);
  assert.match(normalized, /t\.status = 'active'/);
  assert.match(normalized, /private\.web_has_permission\(p_session_token, 'students\.view'\)/);
  assert.match(normalized, /'attendance','homework_log','daily_reports','incidents'/);
  assert.match(normalized, /'parent_comms','timetable','subjects','terms'/);
  assert.match(normalized, /REVOKE ALL ON FUNCTION public\.rpc_get_my_data\(text,text,integer\) FROM PUBLIC;/i);
  assert.match(normalized, /GRANT EXECUTE ON FUNCTION public\.rpc_get_my_data\(text,text,integer\) TO anon, authenticated;/i);
});

test('get_my_data reconciliation does not widen scoped permissions', () => {
  assert.doesNotMatch(normalized, /web_has_permission\(p_session_token, 'attendance\.view'\)/);
  assert.doesNotMatch(normalized, /web_has_permission\(p_session_token, 'homework\.view'\)/);
});
