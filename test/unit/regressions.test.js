const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8'); // theme-control regression contract

test('teacher ID card foundation stays protected', () => {
  const settings = read('js/15_settings.js');
  const css = read('style.css');
  const access = read('js/29_teacher_access.js');
  const html = read('index.html');
  assert.match(settings, /rpc_admin_create_teacher_card/);
  assert.match(settings, /openTeacherCardModal\(id, name, login\)/);
  assert.match(settings, /openTeacherCardModal/);
  assert.match(settings, /openTeacherEditModal/);
  assert.match(settings, /saveTeacherEdit/);
  assert.match(settings, /rpc_admin_update_teacher_profile/);
  assert.match(settings, /teacher-edit-btn/);
  assert.match(settings, /printTeacherCard/);
  assert.match(settings, /setTimeout\(\(\) => openTeacherCardModal\(id, name, login\), 280\)/);
  assert.match(access, /teacher-modal-preparing/);
  assert.match(access, /teacher-modal-ready/);
  assert.match(settings, /result\.login_name \|\| teacherLoginName/);
  assert.match(settings, /Teacher ID/);
  assert.match(settings, /teacher-id-card-avatar-fallback/);
  assert.match(settings, /teacher-id-card-vertical/);
  assert.match(settings, /tm\.cardPurpose/);
  assert.match(settings, /teacherManagerCacheFresh/);
  assert.match(settings, /_prefetchTeacherManagerList/);
  assert.match(settings, /toggleTeacherCardHelp/);
  assert.match(settings, /teacher-id-card-help-popover/);
  assert.match(settings, /result\.photo_url/);
  assert.match(settings, /teacherProfile\?\.photo_url/);
  assert.match(settings, /_renderTeacherCardQrLegacy/);
  assert.doesNotMatch(settings, /<span>SCMS<\\\/span>/);
  assert.match(css, /\.teacher-id-card/);
  assert.match(css, /\.teacher-id-card-vertical/);
  assert.match(css, /printing-teacher-card/);
  assert.ok(html.includes('qrcode@1.5.4'));
  assert.ok(html.includes('qrcodejs/1.0.0'));
  assert.match(html, /29_teacher_access\.js\?v=20261001a/);
  assert.match(html, /15_settings\.js\?v=20261001c/);
  assert.match(html, /style\.css\?v=20261001d/);
});


test('dashboard summary cards and incident entry points stay protected', () => {
  const dashboard = read('js/27_dashboard.js');
  const css = read('dashboard.css');
  const html = read('index.html');
  assert.match(dashboard, /dashboard-link-card/);
  assert.match(dashboard, /window\.goToPage\('attend'\)/);
  assert.match(dashboard, /window\.goToPage\('hw'\)/);
  assert.match(dashboard, /window\.goToPage\('incidents'\)/);
  assert.match(dashboard, /window\.goToPage\('parents'\)/);
  assert.match(dashboard, /_dashboardOpenIncidentStudent/);
  assert.match(dashboard, /_dashboardOpenStudent/);
  assert.match(dashboard, /dashboard-class-card/);
  assert.match(dashboard, /dashboard-missing-attendance-card/);
  assert.match(dashboard, /dashboard-homework-card/);
  assert.match(dashboard, /dashboard-attention-card/);
  assert.match(dashboard, /window\.goToPage\('students'\)/);
  assert.match(dashboard, /window\.goToPage\('hw'\)/);
  assert.match(dashboard, /_dashboardGoToAttendance\(this\.dataset\.class\)/);
  assert.match(dashboard, /data-student-id=/);
  assert.match(css, /#102A43/);
  assert.match(css, /dashboard-link-card/);
  assert.ok(html.includes('dashboard.css?v=20261001h'));
});


test('dashboard notifications and keyboard interaction stay protected', () => {
  const dashboard = read('js/27_dashboard.js');
  const css = read('dashboard.css');
  const html = read('index.html');
  assert.match(dashboard, /refreshDashboardNotifications/);
  assert.match(dashboard, /_renderDashboardNotificationBell/);
  assert.match(dashboard, /dashboard-notification-btn/);
  assert.match(dashboard, /dashboard-notification-badge/);
  assert.match(dashboard, /aria-label="\$\{t\('dash\.notifications'\)\}"/);
  assert.match(dashboard, /aria-expanded="false"/);
  assert.match(dashboard, /aria-controls="dashboardNotificationMenu"/);
  assert.match(dashboard, /id="dashboardNotificationMenu"/);
  assert.match(dashboard, /closeDashboardNotifications/);
  assert.match(dashboard, /event\.key !== 'Escape'/);
  assert.match(dashboard, /\['Enter', ' '\]\.includes\(event\.key\)/);
  assert.match(dashboard, /closest\?\.\('\.dashboard-link-card\[role="button"\]\[tabindex="0"\]'\)/);
  assert.match(dashboard, /event\.preventDefault\(\)/);
  assert.match(dashboard, /card\.click\(\)/);
  assert.match(dashboard, /pointerdown/);
  assert.match(dashboard, /dash\.noNewNotifications/);
  assert.match(dashboard, /role="button"/);
  assert.match(dashboard, /tabindex="0"/);
  assert.match(css, /dashboard-link-card:focus-visible/);
  assert.match(css, /dashboard-notification-wrap/);
  assert.match(css, /dashboard-notification-btn/);
  assert.match(css, /dashboard-notification-menu/);
  assert.match(css, /dashboard-notification-badge/);
  assert.match(css, /dashboard-notification-item:focus-visible/);
  assert.ok(html.includes('dashboard.css?v=20261001h'));
  assert.match(html, /27_dashboard\.js\?v=20261001h/);
});


test('dashboard-to-detail context handoff remains wired', () => {
  const dashboard = read('js/27_dashboard.js');
  const app = read('js/14_app.js');
  const students = read('js/04_students.js');
  const homework = read('js/07_homework.js');
  const incidents = read('js/09_incidents.js');
  const css = read('dashboard.css');

  for (const token of ['_dashboardSetContext', "type: 'attendance'", "type: 'student'", "type: 'homework'", "type: 'incident'", '_dashboardOpenHomework']) {
    assert.ok(dashboard.includes(token), 'missing dashboard context token: ' + token);
  }
  for (const token of ['_applyDashboardContext', 'dashboard-context-banner', 'dashboard-context-highlight', 'clearDashboardContext', "t('dash.fromDashboard')"]) {
    assert.ok(app.includes(token), 'missing destination context token: ' + token);
  }
  assert.ok(app.includes("_applyDashboardContext(pageId);"));
  assert.ok(app.includes("window.requestAnimationFrame(retryDashboardContext);"));
  assert.ok(students.includes('data-student-id="${esc(s.student_id)}"'));
  assert.ok(homework.includes('data-hw-id="${esc(h.id)}"'));
  assert.ok(incidents.includes('data-incident-id="${esc(i.id)}"'));
  assert.ok(css.includes('.dashboard-context-banner'));
  assert.ok(css.includes('.dashboard-context-highlight'));
});

test('dashboard scope controls stay localized and functional', () => {
  const dashboard = read('js/27_dashboard.js');
  const en = read('js/00a_locales_en.js');
  const my = read('js/00b_locales_my.js');
  assert.match(dashboard, /_dashboardMyClassSet/);
  assert.match(dashboard, /scopedAttendance/);
  assert.match(dashboard, /scopedHomework/);
  assert.match(dashboard, /scopedIncidents/);
  assert.match(dashboard, /aria-pressed/);
  assert.match(dashboard, /dash\.wholeSchool/);
  assert.match(dashboard, /dash\.myClassesOnly/);
  assert.match(en, /'dash\.wholeSchool': 'Whole school'/);
  assert.match(my, /'dash\.wholeSchool': 'ကျောင်းတစ်ကျောင်းလုံး'/);
});


test('teacher access localization covers all supported UI languages', () => {
  const access = read('js/29_teacher_access.js');
  assert.ok(access.includes("['en','my','th','jp','zh','km','ms']"));
  for (const token of ['ms: {', 'zh: {', "ms:{'dashboard.view'", 'ms:{dashboard:', 'ms:{class_teacher:']) {
    assert.ok(access.includes(token), `missing teacher access locale map: ${token}`);
  }
  assert.ok(access.includes("ms:'Guru'"));
});

test('password prompt remains fully localized', () => {
  const app = read('js/14_app.js');
  for (const key of ['password.newLabel', 'password.newPlaceholder', 'password.show', 'password.reset']) {
    assert.ok(app.includes(`t('${key}')`), `missing localized password key: ${key}`);
  }
  assert.doesNotMatch(app, /Password အသစ်/);
  assert.doesNotMatch(app, /အနည်းဆုံး ၆ လုံး/);
  assert.doesNotMatch(app, /Password ပြန်သတ်မှတ်မည်/);
});

test('all supported locales keep the English translation key contract', () => {
  const localeFiles = [
    'js/00a_locales_en.js',
    'js/00b_locales_my.js',
    'js/00_locales_jp.js',
    'js/00_locales_thai.js',
    'js/00d_locales_ms.js',
    'js/00e_locales_km.js',
    'js/00e_locales_zh.js',
  ];
  const keySet = (source) => {
    const keys = new Set();
    const re = /(?:'([^']+)'|"([^"]+)")\\s*:/g;
    let match;
    while ((match = re.exec(source))) keys.add(match[1] || match[2]);
    return keys;
  };
  const english = keySet(read(localeFiles[0]));
  for (const file of localeFiles.slice(1)) {
    const locale = keySet(read(file));
    for (const key of english) {
      assert.ok(locale.has(key), `${file} is missing locale key: ${key}`);
    }
  }
});
