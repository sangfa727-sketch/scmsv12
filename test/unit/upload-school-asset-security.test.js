const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('supabase/functions/upload-school-asset/index.ts', 'utf8');

test('school asset upload accepts canonical lowercase active status', () => {
  assert.match(source, /String\(teacher\.status \|\| ""\)\.toLowerCase\(\) !== "active"/);
  assert.match(source, /teacher\.school_id !== session\.school_id/);
  assert.match(source, /teacher\.role !== session\.role/);
});

test('school asset upload verifies image signatures, not only client MIME', () => {
  assert.match(source, /function matchesImageSignature\(type: string, bytes: Uint8Array\)/);
  assert.match(source, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8 && bytes\[2\] === 0xff/);
  assert.match(source, /bytes\[0\] === 0x89 && bytes\[1\] === 0x50 && bytes\[2\] === 0x4e && bytes\[3\] === 0x47/);
  assert.match(source, /String\.fromCharCode\(\.\.\.bytes\.slice\(0, 4\)\) === "RIFF"/);
  assert.match(source, /String\.fromCharCode\(\.\.\.bytes\.slice\(8, 12\)\) === "WEBP"/);
  assert.match(source, /Image content does not match its declared type/);
});

test('school asset upload retains size and role restrictions', () => {
  assert.match(source, /file\.size > 5 \* 1024 \* 1024/);
  assert.match(source, /\["logo", "cover"\].*\n\s*!\["admin", "super_admin"\]/s);
  assert.match(source, /session\.expires_at/);
});
