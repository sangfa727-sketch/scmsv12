const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20261005270000_get_my_data_permission_gate.sql',
  'utf8'
);

test('get_my_data hardening fails closed if the target RPC contract changes', () => {
  assert.match(migration, /rpc_get_my_data signature not found/);
  assert.match(migration, /authorization marker not found; refusing unsafe rewrite/);
});

test('supported generic tables require explicit existing permissions', () => {
  assert.match(migration, /p_table = 'students'[\s\S]*students\.view/);
  assert.match(migration, /p_table = 'attendance'[\s\S]*attendance\.view/);
  assert.match(migration, /p_table = 'homework_log'[\s\S]*homework\.view/);
});

test('tables without dedicated read permissions remain fail-closed', () => {
  assert.match(migration, /'daily_reports','incidents','parent_comms','timetable','subjects','terms'/);
  assert.equal((migration.match(/'permission_denied'/g) || []).length, 4);
});

test('existing execute surface remains explicit', () => {
  assert.match(migration, /revoke all on function public\.rpc_get_my_data/);
  assert.match(migration, /grant execute on function public\.rpc_get_my_data.*to anon, authenticated/);
});
