const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

const ROLE_MATRIX = {
  super_admin: { admissions: ['view', 'manage'], billing: ['view', 'write', 'fees.manage'], billingClass: ['view', 'write'], teachers: ['view', 'manage'], permissions: ['manage'] },
  admin: { admissions: ['view', 'manage'], billing: ['view', 'write', 'fees.manage'], billingClass: ['view', 'write'], teachers: ['view', 'manage'], permissions: ['manage'] },
  administrative_assistant: { admissions: ['view', 'manage'], billing: [], billingClass: ['view', 'write'], teachers: ['view'], permissions: [] },
  school_coordinator: { admissions: ['view', 'manage'], billing: [], billingClass: ['view', 'write'], teachers: ['view'], permissions: [] },
  senior_teacher: { admissions: ['view'], billing: [], billingClass: ['view', 'write'], teachers: ['view'], permissions: [] },
  teacher: { admissions: [], billing: [], billingClass: ['view', 'write'], teachers: [], permissions: [] },
  assistant_teacher: { admissions: [], billing: [], billingClass: ['view', 'write'], teachers: [], permissions: [] },
};

const has = (group, value) => group.includes(value);

test('role-access matrix explicitly covers all seven operational roles', () => {
  const settings = read('js/15_settings.js');
  for (const role of Object.keys(ROLE_MATRIX)) assert.match(settings, new RegExp(role));
});

test('Admissions registration billing remains admin/super_admin only', () => {
  const source = read('js/22_admissions.js');
  const idx = source.indexOf('function _admCanRegistrationBilling');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 700);
  assert.match(block, /admin/);
  assert.match(block, /super_admin/);
});

test('Admissions role boundary is explicit', () => {
  for (const role of ['admin', 'super_admin', 'administrative_assistant', 'school_coordinator']) {
    assert.equal(has(ROLE_MATRIX[role].admissions, 'view'), true, role);
    assert.equal(has(ROLE_MATRIX[role].admissions, 'manage'), true, role);
  }
  assert.deepEqual(ROLE_MATRIX.senior_teacher.admissions, ['view']);
  assert.deepEqual(ROLE_MATRIX.teacher.admissions, []);
  assert.deepEqual(ROLE_MATRIX.assistant_teacher.admissions, []);
});

test('Manage Access boundaries are explicit', () => {
  const source = read('js/29_teacher_access.js');
  assert.match(source, /permissions\.manage/);
  assert.match(source, /teachers\.manage/);
  assert.match(source, /teachers\.view/);
  assert.match(source, /_taPermissionFallback/);

  for (const role of ['teacher', 'assistant_teacher', 'senior_teacher', 'school_coordinator', 'administrative_assistant']) {
    assert.equal(has(ROLE_MATRIX[role].permissions, 'manage'), false, role);
  }
  for (const role of ['admin', 'super_admin']) {
    assert.equal(has(ROLE_MATRIX[role].permissions, 'manage'), true, role);
  }
});

test('Billing whole-school versus class-scoped authority is explicit', () => {
  const source = read('js/21_billing.js');
  assert.match(source, /_billingCanView/);
  assert.match(source, /_billingCanWrite/);
  assert.match(source, /_billingCanManageFees/);
  assert.match(source, /_billingAllowedClasses/);
  assert.match(source, /classAllowlist/);

  for (const role of ['teacher', 'assistant_teacher', 'senior_teacher', 'school_coordinator', 'administrative_assistant']) {
    assert.equal(has(ROLE_MATRIX[role].billingClass, 'view'), true, role);
    assert.equal(has(ROLE_MATRIX[role].billingClass, 'write'), true, role);
    assert.equal(has(ROLE_MATRIX[role].billing, 'view'), false, role);
    assert.equal(has(ROLE_MATRIX[role].billing, 'write'), false, role);
  }
  for (const role of ['admin', 'super_admin']) {
    assert.equal(has(ROLE_MATRIX[role].billing, 'view'), true, role);
    assert.equal(has(ROLE_MATRIX[role].billing, 'write'), true, role);
    assert.equal(has(ROLE_MATRIX[role].billing, 'fees.manage'), true, role);
  }
});
