const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('critical frontend files have no obvious unresolved merge markers', () => {
  const files = [
    'js/15_settings.js',
    'js/27_dashboard.js',
    'js/28_leave_requests.js',
    'js/02B_api_auth.js',
    'js/02H_api_communication.js'
  ];
  for (const file of files) {
    const source = read(file);
    assert.equal(source.includes('<<<<<<<'), false, file);
    assert.equal(source.includes('======='), false, file);
    assert.equal(source.includes('>>>>>>>'), false, file);
  }
});

test('teacher manager regression stays protected', () => {
  const source = read('js/15_settings.js');
  assert.match(source, /teachers\.map\(teacher\s*=>/);
  assert.doesNotMatch(source, /teachers\.map\(t\s*=>/);
  assert.match(source, /teacher\.teacher_id/);
  assert.doesNotMatch(source, /esc\(t\.teacher_id\)/);
  assert.match(source, /teacher-manager-actions/);
});

test('dashboard notification regression stays protected', () => {
  const source = read('js/27_dashboard.js');
  assert.match(source, /dashboardNotificationWrap/);
  assert.match(source, /_renderDashboardNotificationBell\(leavePending, queuedComms\.length\)/);
  assert.match(source, /const total = leavePending \+ queuedCount/);
  assert.doesNotMatch(source, /dashboard-banner/);
});

test('notification CSS supports compact responsive UI', () => {
  const css = read('style.css');
  assert.match(css, /\.dashboard-notification-btn/);
  assert.match(css, /\.dashboard-notification-badge/);
  assert.match(css, /\.dashboard-notification-menu/);
  assert.match(css, /@media \(max-width: 520px\)/);
});

test('dashboard script cache version is bumped after notification change', () => {
  const html = read('index.html');
  assert.match(html, /27_dashboard\.js\?v=20260928d/);
});

test('all JavaScript source files are present and non-empty', () => {
  const dir = path.join(ROOT, 'js');
  const jsFiles = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  assert.ok(jsFiles.length >= 25);
  for (const file of jsFiles) assert.ok(fs.statSync(path.join(dir, file)).size > 0, file);
});
