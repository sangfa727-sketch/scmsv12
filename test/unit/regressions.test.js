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
  assert.match(dashboard, /data-student-id=/);
  assert.match(css, /#102A43/);
  assert.match(css, /dashboard-link-card/);
  assert.ok(html.includes('dashboard.css?v=20261001e'));
});


test('dashboard notifications and keyboard interaction stay protected', () => {
  const dashboard = read('js/27_dashboard.js');
  const css = read('dashboard.css');
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
  assert.ok(html.includes('dashboard.css?v=20261001f'));
  assert.match(html, /27_dashboard\.js\?v=20261001f/);
});
