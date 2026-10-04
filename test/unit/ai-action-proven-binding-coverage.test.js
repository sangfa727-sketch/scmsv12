const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const registrySql = fs.readFileSync(
  'supabase/migrations/20261004120000_ai_execution_permission_gate.sql',
  'utf8'
);
const bindingSql = fs.readFileSync(
  'supabase/migrations/20261004130000_ai_action_permission_binding.sql',
  'utf8'
);

const registryRows = registrySql.match(
  /\('[a-z0-9_]+','rpc_[a-z0-9_]+','(?:read|medium|high|very_high|critical)',(?:true|false)\)/g
) || [];

const mappingBlock =
  (bindingSql.match(/values([\s\S]*?)\) as v\(action,permission_key\)/i) || [])[1] || '';
const mappings = [...mappingBlock.matchAll(
  /\('([a-z0-9_]+)','([^']+)'\)/g
)].map((m) => [m[1], m[2]]);

test('canonical registry remains exactly 117 actions', () => {
  assert.equal(registryRows.length, 117);
});

test('proven permission binding coverage is explicit and unique', () => {
  assert.equal(mappings.length, 65);
  const actions = mappings.map(([action]) => action);
  assert.equal(new Set(actions).size, actions.length);

  for (const [action, permission] of mappings) {
    assert.match(action, /^[a-z0-9_]+$/);
    assert.match(permission, /^[a-z0-9_]+\.[a-z0-9_]+$/);
  }
});

test('newly proven admin and billing bindings are explicit', () => {
  const expected = new Map([
    ['register_student', 'students.edit'],
    ['admin_create_invite', 'teachers.manage'],
    ['admin_create_teacher', 'teachers.manage'],
    ['admin_create_teacher_card', 'teachers.manage'],
    ['admin_create_teacher_v2', 'teachers.manage'],
    ['admin_list_invites', 'teachers.view'],
    ['admin_list_teachers', 'teachers.view'],
    ['admin_reset_teacher_password', 'teachers.manage'],
    ['admin_revoke_teacher_card', 'teachers.manage'],
    ['admin_set_teacher_login_name', 'teachers.manage'],
    ['admin_update_teacher_profile', 'teachers.manage'],
    ['add_fee_item', 'billing.write'],
    ['create_invoice', 'billing.write'],
    ['delete_fee_item', 'billing.write'],
    ['delete_invoice', 'billing.write'],
    ['delete_payment', 'billing.write'],
    ['record_payment', 'billing.write'],
    ['update_fee_item', 'billing.write']
  ]);

  const actual = new Map(mappings);
  for (const [action, permission] of expected) {
    assert.equal(actual.get(action), permission, action);
  }
});

test('unmapped actions remain fail-closed', () => {
  assert.match(bindingSql, /v_contract\.permission_key is null/);
  assert.match(bindingSql, /'action_permission_unmapped'/);
  assert.match(bindingSql, /where action=p_action/);
  assert.match(bindingSql, /and rpc=p_rpc/);
});

test('caller-supplied permission cannot override the server binding', () => {
  assert.match(bindingSql, /p_permission_key <> v_contract\.permission_key/);
  assert.match(bindingSql, /'permission_binding_mismatch'/);
  assert.match(bindingSql, /private\.web_has_permission\(/);
  assert.match(bindingSql, /v_contract\.permission_key/);
});
