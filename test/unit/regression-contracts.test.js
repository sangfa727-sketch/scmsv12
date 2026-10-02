const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('dashboard navigation targets resolve to real app pages', () => {
  const dashboard = read('js/27_dashboard.js');
  const html = read('index.html');
  const targets = [...dashboard.matchAll(/window\\.goToPage\\(['\"]([^'\"]+)['\"]\\)/g)].map((m) => m[1]);
  assert.ok(targets.length >= 4);
  for (const page of new Set(targets)) assert.ok(html.includes('id="page-' + page + '"'), 'missing page: ' + page);
});

test('dashboard drill-down handlers keep destination contracts', () => {
  const source = read('js/27_dashboard.js');
  for (const fn of ['_dashboardGoToAttendance','_dashboardOpenHomework','_dashboardOpenIncidentStudent','_dashboardOpenStudent']) assert.match(source, new RegExp(fn + '\\\\b'));
  for (const page of ['attend','hw','incidents','students']) assert.ok(source.includes("goToPage('" + page + "')") || source.includes('goToPage("' + page + '")'), 'missing destination: ' + page);
});

test('management center actions resolve to existing handlers', () => {
  const source = read('js/12_more.js');
  for (const fn of ['openTeacherManager','openManageClassesModal','showAdminInfo','openSchoolLogoModal','openSchoolCoverModal','openModulesMenu','openSettings']) assert.match(source, new RegExp(fn + '\\\\s*\\\\('));
});

test('student ID card flow keeps QR API contract', () => {
  const source = read('js/04_students.js');
  for (const token of ['showStudentIdCard','getOrCreateStudentQr','idCard.failed','qr_token']) assert.ok(source.includes(token), 'missing ID-card contract: ' + token);
});

test('dashboard scope, notifications and context handoff stay wired', () => {
  const dashboard = read('js/27_dashboard.js');
  const app = read('js/14_app.js');
  for (const token of ['_dashboardMyClassSet','dash.wholeSchool','dash.myClassesOnly','refreshDashboardNotifications','dashboard-notification-btn','_dashboardSetContext']) assert.ok(dashboard.includes(token), 'missing dashboard contract: ' + token);
  for (const token of ['_applyDashboardContext','dashboard-context-highlight','clearDashboardContext','languageChanged']) assert.ok(app.includes(token), 'missing app contract: ' + token);
});

test('supported locales preserve the English key set', () => {
  const files = ['js/00a_locales_en.js','js/00b_locales_my.js','js/00_locales_jp.js','js/00_locales_thai.js','js/00d_locales_ms.js','js/00e_locales_km.js','js/00e_locales_zh.js'];
  const keys = (source) => new Set([...source.matchAll(/(['\"])([^\\\\]*?)\\1\\s*:/g)].map((m) => m[2]));
  const english = keys(read(files[0]));
  assert.ok(english.size >= 1408);
  for (const file of files.slice(1)) { const locale = keys(read(file)); assert.equal(locale.size, english.size, file + ' key count differs'); for (const key of english) assert.ok(locale.has(key), file + ' missing: ' + key); }
});

test('teacher permission locale map covers all supported languages', () => {
  const source = read('js/29_teacher_access.js');
  for (const lang of ['en','my','th','jp','zh','km','ms']) assert.match(source, new RegExp(lang + '\\\\s*:'), 'missing locale: ' + lang);
  for (const key of ['dashboard.view','students.view','attendance.manage','homework.manage','permissions.manage']) assert.ok(source.includes(key), 'missing permission key: ' + key);
});

test('critical page renderers stay wired at boot', () => {
  const source = read('js/14_app.js');
  for (const fn of ['renderDashboard','renderStudents','renderAttendance','renderHomework','renderComms','renderIncidents','renderMore','renderSidebar']) assert.ok(source.includes(fn), 'missing boot renderer: ' + fn);
});

console.log('SCMS regression contract suite loaded.');