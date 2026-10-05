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

test('students uses only the existing global read permission', () => {
  assert.match(migration, /p_table = 'students'[\s\S]*students\.view/);
});

test('scoped or undefined domains remain fail-closed', () => {
  assert.match(
    migration,
    /'attendance','homework_log','daily_reports','incidents'[\s\S]*'parent_comms','timetable','subjects','terms'/
  );
  assert.match(migration, /scoped permissions cannot safely authorize/i);
  assert.equal((migration.match(/'permission_denied'/g) || []).length, 2);
});

test('no scoped permission is reused without scope arguments', () => {
  assert.doesNotMatch(migration, /p_table = 'attendance'[\s\S]*attendance\.view/);
  assert.doesNotMatch(migration, /p_table = 'homework_log'[\s\S]*homework\.view/);
});

test('existing execute surface remains explicit', () => {
  assert.match(migration, /revoke all on function public\.rpc_get_my_data/);
  assert.match(migration, /grant execute on function public\.rpc_get_my_data.*to anon, authenticated/);
});
