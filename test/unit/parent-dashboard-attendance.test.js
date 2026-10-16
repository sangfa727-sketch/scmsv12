const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('parent.html', 'utf8');

test('Parent Portal uses full-history attendance totals and remains compatible with older payloads', () => {
  assert.match(source, /attendance_summary/);
  assert.match(source, /Number\.isFinite\(Number\(attendance_summary\?\.present\)\)/);
  assert.match(source, /Number\.isFinite\(Number\(attendance_summary\?\.absent\)\)/);
  assert.match(source, /Number\.isFinite\(Number\(attendance_summary\?\.late\)\)/);
  assert.match(source, /attendance\.filter\(a => a\.status === 'Present'\)\.length/);
  assert.match(source, /attendance\.filter\(a => a\.status === 'Absent'\)\.length/);
  assert.match(source, /attendance\.filter\(a => a\.status === 'Late'\)\.length/);
});
