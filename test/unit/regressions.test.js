const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('teacher ID card foundation stays protected', () => {
  const settings = read('js/15_settings.js');
  const css = read('style.css');
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
  assert.match(settings, /result\.login_name \|\| teacherLoginName/);
  assert.match(settings, /Teacher ID/);
  assert.match(settings, /teacher-id-card-avatar-fallback/);
  assert.match(settings, /teacher-id-card-vertical/);
  assert.match(settings, /tm\.cardPurpose/);
  assert.match(settings, /result\.photo_url/);
  assert.match(settings, /teacherProfile\?\.photo_url/);
  assert.match(settings, /_renderTeacherCardQrLegacy/);
  assert.doesNotMatch(settings, /<span>SCMS<\\\/span>/);
  assert.match(css, /\.teacher-id-card/);
  assert.match(css, /\.teacher-id-card-vertical/);
  assert.match(css, /printing-teacher-card/);
  assert.ok(html.includes('qrcode@1.5.4'));
  assert.ok(html.includes('qrcodejs/1.0.0'));
  assert.match(html, /15_settings\.js\?v=20260930q/);
  assert.match(html, /style\.css\?v=20260930q/);
});


test('dashboard interactive cards remain keyboard accessible', () => {
  const dashboard = read('js/27_dashboard.js');
  assert.match(dashboard, /dashboard-leave-card[\s\S]*onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)/);
  assert.match(dashboard, /_dashboardGoToAttendance\(this\.dataset\.class\)[\s\S]*onkeydown="if\(event\.key==='Enter'\|\|event\.key===' '\)/);
});

test('dashboard refreshes notification slices when revisiting cached data', () => {
  const dashboard = read('js/27_dashboard.js');
  assert.match(dashboard, /if \(_dashboardLoadedOnce && _dashboardCache\) \{[\s\S]*_paintDashboard\(container\);[\s\S]*void window\.refreshDashboardNotifications\(\);/);
});

test('sidebar keeps aria-hidden synchronized with its visual state', () => {
  const sidebar = read('js/17_sidebar.js');
  assert.match(sidebar, /classList\.add\('open'\)[\s\S]*setAttribute\('aria-hidden', 'false'\)/);
  assert.match(sidebar, /classList\.remove\('open'\)[\s\S]*setAttribute\('aria-hidden', 'true'\)/);
});

test('dashboard notification keys remain available across all shipped locales', () => {
  const keys = [
    'dash.notifications',
    'dash.newCount',
    'dash.leavePendingOne',
    'dash.leavePendingMany',
    'dash.leaveReview',
    'dash.messageNotDeliveredOne',
    'dash.messageNotDeliveredMany',
    'dash.bannerText',
    'dash.noNewNotifications',
  ];
  for (const file of ['js/00a_locales_en.js', 'js/00b_locales_my.js', 'js/00_locales_thai.js', 'js/00_locales_jp.js']) {
    const source = read(file);
    for (const key of keys) {
      assert.ok(source.includes("'" + key + "'"), file + ': missing ' + key);
    }
  }
});

test('dashboard notification bell keeps accessible disclosure semantics', () => {
  const dashboard = read('js/27_dashboard.js');
  const locales = read('js/00a_locales_en.js');
  assert.match(dashboard, /class="dashboard-notification-btn" type="button"/);
  assert.ok(dashboard.includes('aria-label="${t(\'dash.notifications\')}'));
  assert.match(dashboard, /aria-expanded="false"/);
  assert.match(dashboard, /aria-controls="dashboardNotificationMenu"/);
  assert.match(dashboard, /id="dashboardNotificationMenu" hidden>/);
  assert.match(dashboard, /btn\?\.setAttribute\('aria-expanded', String\(open\)\)/);
  assert.match(dashboard, /window\.closeDashboardNotifications = function\(\)[\s\S]*setAttribute\('aria-expanded', 'false'\)/);
  assert.match(dashboard, /event\.key !== 'Escape'/);
  assert.match(dashboard, /!wrap\?\.contains\(event\.target\)/);
  for (const key of [
    'dash.notifications',
    'dash.newCount',
    'dash.leavePendingOne',
    'dash.leavePendingMany',
    'dash.leaveReview',
    'dash.messageNotDeliveredOne',
    'dash.messageNotDeliveredMany',
    'dash.bannerText',
    'dash.noNewNotifications',
  ]) {
    assert.match(locales, new RegExp('(?:[\\\'\"])' + key.replace('.', '\\.') + '(?:[\\\'\"])'));
  }
});

test('teacher access management keeps session-token RPC boundary', () => {
  const source = read('js/29_teacher_access.js');
  assert.ok(source.includes('getWebSession()'));
  assert.ok(source.includes('session_token'));
  assert.ok(source.includes('rpc_manage_teacher_access'));
  assert.ok(source.includes('p_teacher_id: teacherId'));
  assert.ok(source.includes("'permission_set'"));
  assert.ok(source.includes("'permission_remove'"));
});

test('parent communication send flow prevents duplicate submissions and refreshes notifications', () => {
  const comms = read('js/08_comms.js');
  assert.ok(comms.includes("btn.disabled = true; btn.textContent = t('comms.sending')"));
  assert.ok(comms.includes('await API.sendParentComm('));
  assert.ok(comms.includes('void window.refreshDashboardNotifications()'));
  assert.ok(comms.includes("btn.disabled = false; btn.textContent = t('comms.send')"));
});
