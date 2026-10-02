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
