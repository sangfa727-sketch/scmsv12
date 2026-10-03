const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('management center keeps admin gating and core management actions wired', () => {
  const source = read('js/12_more.js');

  assert.match(source, /window\.openManagementCenter\s*=\s*function/);
  assert.match(source, /!window\.APP\?\.is_admin/);

  for (const key of [
    'more.teachers',
    'more.classes',
    'more.schoolSettings',
    'more.logo',
    'more.cover',
    'more.modules',
    'settings.title'
  ]) {
    assert.match(source, new RegExp(key.replace('.', '\\.')));
  }

  for (const fn of [
    'openTeacherManager',
    'openManageClassesModal',
    'showAdminInfo',
    'openSchoolLogoModal',
    'openSchoolCoverModal',
    'openModulesMenu',
    'openSettings'
  ]) {
    assert.match(source, new RegExp(fn + '\\('));
  }

  assert.match(source, /data-management-action/);
  assert.match(source, /setTimeout\(item\[2\], 190\)/);
});

test('teacher access helpers stay defined once to avoid shadowed localization logic', () => {
  const source = read('js/29_teacher_access.js');
  for (const name of ['_taCategory', '_taDescription', '_taAssignmentTypeLabel']) {
    const count = (source.match(new RegExp('function ' + name + '\\s*\\(', 'g')) || []).length;
    assert.equal(count, 1, name + ' should have one canonical definition');
  }
});

test('branding labels resolve from i18n at modal-open time', () => {
  const source = read('js/26_branding.js');
  assert.match(source, /titleKey:\s*['"]branding\.logoTitle['"]/);
  assert.match(source, /subtitleKey:\s*['"]branding\.logoSubtitle['"]/);
  assert.match(source, /esc\(t\(K\.titleKey\)\)/);
  assert.match(source, /esc\(t\(K\.subtitleKey\)\)/);
  assert.match(source, /esc\(t\(K\.tipKey\)\)/);
  assert.doesNotMatch(source, /title:\s*t\('branding\.logoTitle'\)/);
});

test('teacher access includes Khmer permission descriptions', () => {
  const source = read('js/29_teacher_access.js');
  assert.match(source, /km:\{['"]dashboard\.view['"]:/);
  assert.match(source, /['"]permissions\.manage['"]:\s*['"]គ្រប់គ្រងសិទ្ធិ['"]/);
});

test('classes and grades save lifecycle prevents concurrent writes and stale UI on failure', () => {
  const source = read('js/12_more.js');
  assert.match(source, /let _cgSaveInFlight = false/);
  assert.match(source, /if \(_cgSaveInFlight\) return;/);
  assert.match(source, /_cgSetSaveBusy\(true\)/);
  assert.match(source, /_cgSetSaveBusy\(false\)/);
  assert.match(source, /const saved = await _cgSavePaired/);
  assert.match(source, /if \(!saved\) return;/);
  assert.match(source, /return true;/);
  assert.match(source, /return false;/);
});

test('teacher profile edit prevents non-super-admin role escalation', () => {
  const source = read('supabase/migrations/20261002183000_teacher_manager_role_escalation_hardening.sql');
  assert.match(source, /v_target_role text/);
  assert.match(source, /v_admin\.admin_role <> 'super_admin'/);
  assert.match(source, /v_role in \('admin','super_admin'\)/);
  assert.match(source, /v_target_role='super_admin'/);
  assert.match(source, /'insufficient_role'/);
});

test('sensitive teacher management actions block non-super-admin access to super_admin targets', () => {
  const source = read('supabase/migrations/20261002200000_management_sensitive_actions_superadmin_guard.sql');
  for (const fn of [
    'rpc_admin_reset_teacher_password',
    'rpc_admin_set_teacher_login_name',
    'rpc_admin_create_teacher_card',
    'rpc_admin_revoke_teacher_card'
  ]) {
    assert.match(source, new RegExp('create or replace function public\\.' + fn));
  }
  const guards = (source.match(/insufficient_role/g) || []).length;
  assert.ok(guards >= 4, 'each sensitive action should have a super_admin target guard');
  assert.match(source, /v_admin\.admin_role <> 'super_admin' and v_target_role='super_admin'/);
  assert.match(source, /a\.admin_role <> 'super_admin' and teacher_row\.role='super_admin'/);
});

test('teacher access management blocks non-super-admin changes to super_admin targets', () => {
  const source = read('supabase/migrations/20261003070000_teacher_access_superadmin_guard.sql');
  assert.match(source, /create or replace function public\.rpc_manage_teacher_access/i);
  assert.match(source, /if v_admin\.role <> 'super_admin' and v_teacher\.role='super_admin'/);
  assert.match(source, /'insufficient_role'/);
  assert.match(source, /school_id=v_admin\.school_id/);
});

test('teacher photo RPC returns only a safe profile payload', () => {
  const source = read('supabase/migrations/20261003090000_harden_teacher_photo_rpc.sql');
  assert.match(source, /create or replace function public\.rpc_set_teacher_photo/);
  assert.match(source, /and school_id = v_sess\.school_id/);
  assert.match(source, /jsonb_build_object\(/);
  assert.match(source, /'teacher_id'/);
  assert.match(source, /'teacher_name'/);
  assert.match(source, /'photo_url'/);
  assert.doesNotMatch(source, /to_jsonb\(v_teacher\)/);
  assert.doesNotMatch(source, /to_jsonb\(v_row\)/);
  assert.doesNotMatch(source, /password_hash/);
});
