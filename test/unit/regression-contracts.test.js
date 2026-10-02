const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('dashboard navigation targets resolve to real app pages', () => {
  const dashboard = read('js/27_dashboard.js');
  const html = read('index.html');
  for (const page of ['attend','hw','incidents','parents','students']) assert.ok(dashboard.includes("goToPage('" + page + "')") || dashboard.includes('goToPage("' + page + '")'), 'missing dashboard destination: ' + page);
  assert.ok(html.includes('id="page-attend"') && html.includes('id="page-hw"') && html.includes('id="page-incidents"'));
});

test('dashboard drill-down handlers keep destination contracts', () => {
  const source = read('js/27_dashboard.js');
  for (const fn of ['_dashboardGoToAttendance','_dashboardOpenHomework','_dashboardOpenIncidentStudent','_dashboardOpenStudent']) assert.ok(source.includes(fn), 'missing handler: ' + fn);
  for (const page of ['attend','hw','incidents','students']) assert.ok(source.includes("goToPage('" + page + "')") || source.includes('goToPage("' + page + '")'), 'missing destination: ' + page);
});

test('management center actions resolve to existing handlers', () => {
  const source = read('js/12_more.js');
  for (const fn of ['openTeacherManager','openManageClassesModal','showAdminInfo','openSchoolLogoModal','openSchoolCoverModal','openModulesMenu','openSettings']) assert.ok(source.includes(fn + '(') || source.includes(fn + ' ('), 'missing handler: ' + fn);
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
  const english = read(files[0]);
  for (const file of files.slice(1)) {
    const locale = read(file);
    for (const key of ['dash.wholeSchool','dash.myClassesOnly','btn.retry','settings.title']) assert.ok(english.includes(key) && locale.includes(key), file + ' missing shared key: ' + key);
  }
});

test('teacher permission locale map covers all supported languages', () => {
  const source = read('js/29_teacher_access.js');
  for (const lang of ['en','my','th','jp','zh','km','ms']) assert.ok(source.includes(lang + ':'), 'missing locale: ' + lang);
  for (const key of ['dashboard.view','students.view','attendance.view','homework.view','permissions.manage']) assert.ok(source.includes(key), 'missing permission key: ' + key);
});

test('critical page renderers stay wired at boot', () => {
  const source = read('js/14_app.js');
  for (const fn of ['renderDashboard','renderStudents','renderAttendance','renderHomework','renderComms','renderIncidents','renderMore','renderSidebar']) assert.ok(source.includes(fn), 'missing boot renderer: ' + fn);
});

console.log('SCMS regression contract suite loaded.');