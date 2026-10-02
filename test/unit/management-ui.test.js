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
