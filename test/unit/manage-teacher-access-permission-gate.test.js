const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20261005260000_manage_teacher_access_permission_gate.sql',
  'utf8'
);

test('manage_teacher_access hardening fails closed if the target RPC contract changes', () => {
  assert.match(migration, /rpc_manage_teacher_access signature not found/);
  assert.match(migration, /authorization marker not found; refusing unsafe rewrite/);
});

test('manage_teacher_access maps each action family to the intended permission', () => {
  assert.match(migration, /p_action = 'catalog'[\s\S]*permissions\.manage/);
  assert.match(migration, /p_action = 'list'[\s\S]*teachers\.view/);
  assert.match(migration, /p_action in \('class_add','class_remove','subject_add','subject_remove'\)[\s\S]*teachers\.manage/);
  assert.match(migration, /p_action in \('permission_set','permission_remove'\)[\s\S]*permissions\.manage/);
});

test('permission failures return the existing JSON error contract', () => {
  assert.equal((migration.match(/'permission_denied'/g) || []).length, 4);
});

test('existing execute surface remains explicit', () => {
  assert.match(migration, /revoke all on function public\.rpc_manage_teacher_access/);
  assert.match(migration, /grant execute on function public\.rpc_manage_teacher_access.*to anon, authenticated/);
});
