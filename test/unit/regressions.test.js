const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('critical frontend files have no obvious unresolved merge markers', () => {
  const files = [
    'js/15_settings.js',
    'js/27_dashboard.js',
    'js/28_leave_requests.js',
    'js/02B_api_auth.js',
    'js/02H_api_communication.js'
  ];
  for (const file of files) {
    const source = read(file);
    assert.equal(source.includes('<<<<<<<'), false, file);
    assert.equal(source.includes('======='), false, file);
    assert.equal(source.includes('>>>>>>>'), false, file);
  }
});

test('teacher manager regression stays protected', () => {
  const source = read('js/15_settings.js');
  assert.match(source, /teachers\.map\(teacher\s*=>/);
  assert.doesNotMatch(source, /teachers\.map\(t\s*=>/);
  assert.match(source, /teacher\.teacher_id/);
  assert.doesNotMatch(source, /esc\(t\.teacher_id\)/);
  assert.match(source, /teacher-manager-actions/);
});

test('dashboard notification regression stays protected', () => {
  const source = read('js/27_dashboard.js');
  assert.match(source, /dashboardNotificationWrap/);
  assert.match(source, /_renderDashboardNotificationBell\(leavePending, queuedComms\.length\)/);
  assert.match(source, /const total = leavePending \+ queuedCount/);
  assert.doesNotMatch(source, /dashboard-banner/);
});

test('notification CSS supports compact responsive UI', () => {
  const css = read('style.css');
  assert.match(css, /\.dashboard-notification-btn/);
  assert.match(css, /\.dashboard-notification-badge/);
  assert.match(css, /\.dashboard-notification-menu/);
  assert.match(css, /@media \(max-width: 520px\)/);
});

test('dashboard script cache version is bumped after notification change', () => {
  const html = read('index.html');
  assert.match(html, /27_dashboard\.js\?v=20260928d/);
});

test('all JavaScript source files are present and non-empty', () => {
  const dir = path.join(ROOT, 'js');
  const jsFiles = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.ok(jsFiles.length >= 25);
  for (const file of jsFiles) assert.ok(fs.statSync(path.join(dir, file)).size > 0, file);
});

test('protected page list layout stays on the compact baseline', () => {
  const css = read('style.css');

  // These page lists are intentionally single-column baseline surfaces.
  // Do not reintroduce page-wide desktop grid overrides without an explicit
  // product request for that page.
  const protectedLists = [
    '#page-students #studentList',
    '#page-daily #dailyList',
    '#page-hw #hwList',
    '#page-parents #commsList',
    '#page-incidents #incidentList',
    '#page-library #libraryList',
    '#page-transport #transportList',
    '#page-admissions #admissionsList',
    '#page-summary #summaryList'
  ];

  assert.doesNotMatch(css, /Desktop common list surfaces/i);
  assert.doesNotMatch(css, /actual responsive card grid, not a vertical feed/i);
  assert.doesNotMatch(css, /SCMS v12\.12 — compact controls \+ consistent page rail/i);

  for (const selector of protectedLists) {
    assert.doesNotMatch(
      css,
      new RegExp(selector.replace(/[.*+?^()|[\]\\]/g, '\\$&') + '[\\s\\S]{0,900}display\\s*:\\s*grid', 'i'),
      selector
    );
  }
});

test('dashboard baseline anchors remain present', () => {
  const html = read('index.html');
  const source = read('js/27_dashboard.js');

  assert.match(html, /id="dashboardContent"/);
  assert.match(html, /id="dashboardNotificationWrap"/);
  assert.match(html, /class="page-header dashboard-page-header"/);
  assert.match(source, /dashboardContent/);
});


test('student history feature stays wired', () => {
  const source = read('js/04_students.js');
  assert.match(source, /showStudentHistory/);
  assert.match(source, /API\.getStudentHistory\(studentId, 50\)/);
  assert.match(source, /studentHistoryBody/);
});

test('grade assessment time feature stays wired', () => {
  const source = read('js/20_grades.js');
  assert.match(source, /a\.start_time/);
  assert.match(source, /a\.end_time/);
  assert.match(source, /id="gaStartTime"/);
  assert.match(source, /id="gaEndTime"/);
  assert.match(source, /start_time:\s*document\.getElementById\('gaStartTime'\)\.value/);
  assert.match(source, /end_time:\s*document\.getElementById\('gaEndTime'\)\.value/);
});

test('parent communication page keeps message workflow wired', () => {
  const source = read('js/08_comms.js');
  assert.match(source, /message_preview/);
  assert.match(source, /label class="field-label">\$\{t\('comms\.message'\)\}/);
});


test('compact form modal baseline is not overridden by extra-small global CSS', () => {
  const css = read('style.css');
  assert.match(css, /SCMS v12\.2 — Premium compact data-entry forms/);
  assert.match(css, /@media \(max-width:380px\)/);
  assert.match(css, /\.modal-sheet:has\(\.form-input, \.form-textarea, \.picker-trigger, input, select, textarea\)\{width:94vw!important;max-width:94vw!important\}/);
  assert.doesNotMatch(css, /\.modal-sheet\{width:95vw!important;max-width:95vw!important\}/);
});


test('entry-form shells keep the compact width and control baseline', () => {
  const css = read('style.css');
  const compactShells = [
    'billing-form-sheet', 'admission-form-sheet', 'health-form-sheet',
    'grades-form-sheet', 'timetable-form-sheet', 'homework-form-sheet',
    'comms-form-sheet', 'attendance-form-sheet', 'daily-form-sheet',
    'incident-form-sheet', 'library-form-sheet', 'transport-form-sheet',
    'branding-form-sheet', 'settings-form-sheet'
  ];

  for (const shell of compactShells) {
    assert.match(css, new RegExp('\\.' + shell + '[\\s\\S]{0,260}max-width: (?:440|520|560)px !important'));
  }

  assert.match(css, /SCMS v12\\.2 — Premium compact data-entry forms/);
  assert.match(css, /min-height: 38px !important; height: 38px !important/);
  assert.match(css, /@media \\(max-width: 430px\\)[\\s\\S]{0,320}width: 94vw !important/);
});
