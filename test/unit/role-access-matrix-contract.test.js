const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('role-access matrix keeps the current Admissions and Billing contract explicit', () => {
  const settings = read('js/15_settings.js');
  const access = read('js/29_teacher_access.js');
  const admissions = read('js/22_admissions.js');
  const billing = read('js/21_billing.js');

  for (const role of [
    'teacher',
    'assistant_teacher',
    'senior_teacher',
    'school_coordinator',
    'administrative_assistant',
    'admin',
    'super_admin',
  ]) assert.match(settings, new RegExp(role));

  assert.match(access, /permissions\.manage/);
  assert.match(access, /teachers\.manage/);
  assert.match(access, /teachers\.view/);

  assert.match(admissions, /_admCanView\(\)/);
  assert.match(admissions, /_admCanManage\(\)/);
  assert.match(admissions, /_admCanRegistrationBilling\(\)/);

  assert.match(billing, /billing\.class\.view/);
  assert.match(billing, /billing\.class\.write/);
  assert.match(billing, /billing\.view/);
  assert.match(billing, /billing\.write/);
  assert.match(billing, /billing\.fees\.manage/);
});

test('Admissions registration billing stays restricted to the backend-compatible authority', () => {
  const source = read('js/22_admissions.js');
  const idx = source.indexOf('function _admCanRegistrationBilling');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 700);
  assert.match(block, /admin/);
  assert.match(block, /super_admin/);
});

test('Manage Access retains separate view, teacher-management, and permission-management gates', () => {
  const source = read('js/29_teacher_access.js');
  assert.match(source, /permissions\.manage/);
  assert.match(source, /teachers\.manage/);
  assert.match(source, /teachers\.view/);
  assert.match(source, /_taPermissionFallback/);
});

test('Billing UI distinguishes whole-school and class-scoped authority', () => {
  const source = read('js/21_billing.js');
  assert.match(source, /_billingCanView/);
  assert.match(source, /_billingCanWrite/);
  assert.match(source, /_billingCanManageFees/);
  assert.match(source, /_billingAllowedClasses/);
  assert.match(source, /classAllowlist/);
});
