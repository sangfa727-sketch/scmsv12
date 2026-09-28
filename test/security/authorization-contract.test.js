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
