const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync(
  'supabase/migrations/20261004130000_ai_action_permission_binding.sql',
  'utf8'
);

test('execution registry adds server-owned permission and scope bindings', () => {
  assert.match(sql, /add column if not exists permission_key text/);
  assert.match(sql, /add column if not exists scope_type text/);
  assert.match(sql, /permission_key = v\.permission_key/);
  assert.match(sql, /scope_type = pd\.scope_type/);
});

test('caller permission key cannot override the server action contract', () => {
  assert.match(sql, /v_contract\.permission_key is null/);
  assert.match(sql, /p_permission_key <> v_contract\.permission_key/);
  assert.match(sql, /'permission_binding_mismatch'/);
  assert.match(sql, /v_contract\.permission_key,/);
  assert.doesNotMatch(sql, /private\.web_has_permission\(\s*p_session_token,\s*p_permission_key,/);
});

test('unmapped actions fail closed', () => {
  assert.match(sql, /'action_permission_unmapped'/);
  assert.match(sql, /v_contract\.permission_key is null/);
  assert.match(sql, /v_contract\.scope_type is null/);
});

test('permission definition scope must match the action contract', () => {
  assert.match(sql, /permission_definitions/);
  assert.match(sql, /v_permission\.scope_type <> v_contract\.scope_type/);
  assert.match(sql, /'permission_contract_invalid'/);
});

test('scope inputs are constrained by the canonical permission scope', () => {
  assert.match(sql, /v_contract\.scope_type='global'/);
  assert.match(sql, /v_contract\.scope_type='class'/);
  assert.match(sql, /v_contract\.scope_type='class_subject'/);
  assert.match(sql, /v_contract\.scope_type='subject'/);
  assert.match(sql, /'scope_input_invalid'/);
});

test('proven mappings are explicit rather than inferred from action names', () => {
  for (const pair of [
    "('get_students','students.view')",
    "('update_student','students.edit')",
    "('get_grades','assessment.view')",
    "('save_grades','assessment.edit')",
    "('save_homework','homework.create')",
    "('decide_leave_request','leave.approve')",
    "('save_attendance','attendance.edit')",
    "('get_admissions','admissions.view')",
    "('save_daily_report','daily_report.edit')",
    "('regenerate_student_qr','students.edit')"
  ]) assert.ok(sql.includes(pair), `missing proven mapping: ${pair}`);
});
