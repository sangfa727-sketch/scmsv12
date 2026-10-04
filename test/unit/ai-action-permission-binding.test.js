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


test('final risk classifications are explicit for the ten audited policy rows', () => {
  const expected = [
    ["add_health_visit","health_mutation"],
    ["add_vaccination","health_mutation"],
    ["upsert_health_profile","health_mutation"],
    ["regenerate_student_qr","qr_regeneration"],
    ["get_health_profile","sensitive_read"],
    ["get_grades","sensitive_read"],
    ["get_invoice_detail","sensitive_financial_read"],
    ["get_invoices","sensitive_financial_read"],
    ["get_report_card","sensitive_read"],
    ["manage_teacher_access","multi_action_denied"]
  ];
  assert.match(sql, /add column if not exists classification text/);
  for (const [action, classification] of expected) {
    assert.match(
      sql,
      new RegExp("when '" + action + "' then '" + classification + "'"),
      "missing final classification for " + action
    );
  }
  assert.match(sql, /classification is null or classification in/);
});

test('high-risk health and QR rows retain confirmation', () => {
  for (const [action, risk] of [
    ["add_health_visit","high"],
    ["add_vaccination","high"],
    ["upsert_health_profile","high"],
    ["regenerate_student_qr","high"]
  ]) {
    assert.ok(
      sql.includes("'" + action + "','rpc_" + action + "','" + risk + "',true"),
      "risk/confirmation drift: " + action
    );
  }
});

test('multi-action teacher access remains fail-closed', () => {
  assert.match(sql, /when 'manage_teacher_access' then 'multi_action_denied'/);
  assert.doesNotMatch(sql, /\('manage_teacher_access','rpc_manage_teacher_access'/);
});

test('all proven permission bindings use the live canonical scope definitions', () => {
  const expectedScopes = [
    ['students.view','global'],
    ['students.edit','global'],
    ['assessment.create','class_subject'],
    ['assessment.delete','class_subject'],
    ['assessment.view','class_subject'],
    ['assessment.edit','class_subject'],
    ['homework.create','class_subject'],
    ['homework.edit','class_subject'],
    ['homework.delete','class_subject'],
    ['homework.view','class_subject'],
    ['leave.approve','class'],
    ['leave.view','class'],
    ['attendance.edit','class'],
    ['attendance.view','class'],
    ['admissions.manage','global'],
    ['admissions.view','global'],
    ['daily_report.edit','class'],
    ['daily_report.delete','class']
  ];
  for (const [permission, scope] of expectedScopes) {
    assert.ok(
      sql.includes("('" + permission + "','" + scope + "')"),
      "missing canonical permission/scope binding: " + permission
    );
  }
});
