const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('admin UI actions are gated by the authenticated admin flag', () => {
  const settings = read('js/15_settings.js');
  const more = read('js/12_more.js');
  const students = read('js/04_students.js');
  assert.match(settings, /const isAdmin = !!(window.APP && window.APP.is_admin)/);
  assert.match(settings, /\$\{isAdmin \?/);
  assert.match(more, /const isAdmin = window.APP.is_admin/);
  assert.match(more, /if (!window.APP.is_admin)/);
  assert.match(students, /window.APP.is_admin/);
});

test('admin RPC calls carry a current web session token', () => {
  const source = read('js/15_settings.js');
  for (const fn of [
    'rpc_admin_list_teachers',
    'rpc_admin_create_invite',
    'rpc_admin_create_teacher',
    'rpc_admin_reset_teacher_password',
  ]) {
    const idx = source.indexOf(fn);
    assert.ok(idx >= 0, fn + ' missing');
    const block = source.slice(idx, idx + 1800);
    assert.match(block, /p_session_token/);
  }
});

test('logout clears both legacy and web sessions before reload', () => {
  const source = read('js/14_app.js');
  const idx = source.indexOf('window.signOut');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 1000);
  assert.match(block, /clearSavedSession/);
  assert.match(block, /clearWebSession/);
  assert.match(block, /window.location.reload/);
});

test('web login stores the server-issued session token and role metadata', () => {
  const source = read('js/19_google_auth.js');
  const idx = source.indexOf('function _completeLogin');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 1800);
  assert.match(block, /session_token: result.session_token/);
  assert.match(block, /school_id: result.school_id/);
  assert.match(block, /role: result.role/);
  assert.doesNotMatch(block, /password: result/);
});


test('session-bound backend contract is explicit for bootstrap and verification', () => {
  const source = read('js/02A_api_core.js');
  assert.match(source, /p_session_token/);
  const app = read('js/14_app.js');
  assert.match(app, /APPStore\.patch\('session'/);
  assert.match(app, /sessionToken:/);
});

test('admin role compatibility is explicit at the UI/backend boundary', () => {
  const settings = read('js/15_settings.js');
  const app = read('js/14_app.js');
  assert.match(settings, /window\.APP\.is_admin/);
  assert.match(app, /window\.APP\.is_admin/);
});


test('feature mutations do not send client tenant identity through web RPC', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((name) => name.endsWith('.js') && /^0[3-9]|^1[0-8]|^2[0-9]/.test(name));
  const forbidden = /_webRpc\([^)]*[\\s\\S]{0,800}(?:p_school_id|p_teacher_id)\s*:/;
  for (const name of files) {
    const source = read(path.join('js', name));
    assert.doesNotMatch(source, forbidden, name + ' must derive tenant/actor context server-side');
  }
});

test('admin settings use the shared session-aware RPC path for teacher listing', () => {
  const source = read('js/15_settings.js');
  const idx = source.indexOf("rpc_admin_list_teachers");
  assert.ok(idx >= 0);
  const block = source.slice(idx - 120, idx + 500);
  assert.match(block, /_webRpc\(/);
  assert.match(block, /p_session_token/);
});


test('teacher web login accepts Teacher ID/Login Name with PIN and page navigation is permission-aware', () => {
  const landing = read('js/00_landing.js');
  const authMigration = read('supabase/migrations/20261005100000_teacher_role_login_page_access.sql');
  const app = read('js/14_app.js');
  const sidebar = read('js/17_sidebar.js');

  assert.match(landing, /webLoginIdentity/);
  assert.match(landing, /webLoginPin/);
  assert.match(landing, /p_login_name:\s+identity/);
  assert.match(landing, /p_pin:\s+pin/);

  assert.match(authMigration, /lower\(login_name\)\s*=\s*lower\(v_identity\)/);
  assert.match(authMigration, /lower\(teacher_id\)\s*=\s*lower\(v_identity\)/);
  assert.match(authMigration, /'permissions',\s*v_permissions/);

  for (const key of [
    'dashboard.view',
    'students.view',
    'attendance.view',
    'homework.view',
    'assessment.view',
    'billing.view',
    'admissions.view',
    'leave.view',
  ]) {
    assert.match(app, new RegExp(key.replace('.', '\\.'), 'g'));
  }

  assert.match(app, /function _pageAccessAllowed/);
  assert.match(app, /if \(!_pageAccessAllowed\(pageId\)\)/);
  assert.match(sidebar, /function _sidebarCanAccess/);
  assert.match(sidebar, /A\.platform !== 'web'/);
  assert.match(app, /A\.platform !== 'web'/);
  assert.match(sidebar, /\.filter\(it => _sidebarCanAccess\(it\.id\)\)/);
});
