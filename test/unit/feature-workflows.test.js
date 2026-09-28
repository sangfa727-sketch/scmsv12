const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const assertContains = (file, patterns) => {
  const source = read(file);
  for (const pattern of patterns) assert.match(source, pattern, file + ': ' + pattern);
};

test('attendance workflow keeps audit and school/teacher context wired', () => {
  assertContains('js/05_attendance.js', [
    /getAttendanceAudit/,
    /school_id:\s*window\.APP\.school_id/,
    /teacher_id:\s*window\.APP\.teacher_id/
  ]);
});

test('daily reports keep create/delete workflows wired', () => {
  assertContains('js/06_daily.js', [
    /API\.deleteDailyReport/,
    /teacher_id:\s*window\.APP\.teacher_id/,
    /school_id:\s*window\.APP\.school_id/
  ]);
});

test('homework keeps update/delete workflows wired', () => {
  assertContains('js/07_homework.js', [
    /API\.updateHomework/,
    /API\.deleteHomework/,
    /teacher_id:\s*window\.APP\.teacher_id/,
    /school_id:\s*window\.APP\.school_id/
  ]);
});

test('parent communications keep delete and portal-event workflows wired', () => {
  assertContains('js/08_comms.js', [
    /API\.deleteParentComm/,
    /API\.createParentPortalEvent/
  ]);
});

test('grades keep assessment create/delete and score loading wired', () => {
  assertContains('js/20_grades.js', [
    /API\.createAssessment/,
    /API\.deleteAssessment/,
    /API\.getGrades/
  ]);
});

test('billing keeps invoice/payment/fee-item mutations wired', () => {
  assertContains('js/21_billing.js', [
    /API\.createInvoice/,
    /API\.deletePayment/,
    /API\.deleteInvoice/,
    /API\.deleteFeeItem/
  ]);
});

test('admissions keep status, edit, enrollment and delete workflows wired', () => {
  assertContains('js/22_admissions.js', [
    /API\.updateAdmissionStatus/,
    /API\.createAdmission/,
    /API\.updateAdmission/,
    /API\.createInvoice/,
    /API\.deleteAdmission/
  ]);
});

test('library and transport keep protected delete workflows wired', () => {
  assertContains('js/24_library.js', [
    /API\.updateBook/,
    /API\.deleteBook/,
    /has_active_checkouts/
  ]);
  assertContains('js/25_transport.js', [
    /API\.updateRoute/,
    /API\.deleteRoute/
  ]);
});

test('authentication bootstrap supports both teacher and Telegram paths', () => {
  assertContains('js/02B_api_auth.js', [
    /async bootstrap\(/,
    /async bootstrapByTeacher\(/,
    /rpc_web_bootstrap/
  ]);
});

test('destructive feature actions consistently expose failure handling', () => {
  const files = [
    'js/06_daily.js', 'js/07_homework.js', 'js/08_comms.js',
    'js/20_grades.js', 'js/21_billing.js', 'js/22_admissions.js',
    'js/24_library.js', 'js/25_transport.js'
  ];

  for (const file of files) {
    const source = read(file);
    const deletes = source.match(/API\.delete[A-Za-z0-9_]+\(/g) || [];
    assert.ok(deletes.length > 0, file + ' has no protected delete workflow');
    assert.ok(
      /catch\s*\(e\)/.test(source),
      file + ' should keep user-visible error handling around async mutations'
    );
  }
});
