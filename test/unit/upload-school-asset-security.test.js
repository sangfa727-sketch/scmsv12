const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('supabase/functions/upload-school-asset/index.ts', 'utf8');
const authorizationMigration = fs.readFileSync('supabase/migrations/20261014136000_secure_student_photo_upload.sql', 'utf8');
const rolloutScript = fs.readFileSync('scripts/rollouts/enforce_student_photo_upload_endpoint.sql', 'utf8');
const api = fs.readFileSync('js/02C_api_students.js', 'utf8');
const runtimeTest = fs.readFileSync('test/db/non_ai_tenant_crud_security_runtime_test.sql', 'utf8');

test('upload rejects oversized multipart bodies before parsing FormData', () => {
  assert.match(source, /async function readRequestBodyBounded\(req: Request, maxBytes: number\)/);
  assert.match(source, /const maxRequestBytes = 5 \* 1024 \* 1024 \+ 128 \* 1024/);
  assert.match(source, /return json\(\{ error: "Request body too large" \}, 413\)/);
  const boundedRead = source.indexOf('const requestBytes = await readRequestBodyBounded');
  const parseForm = source.indexOf('const form = await formRequest.formData()');
  assert.ok(boundedRead >= 0 && parseForm > boundedRead,
    'request body must be bounded before multipart parsing');
});

test('school asset upload accepts only active web sessions bound to the current school and role', () => {
  assert.match(source, /rest\/v1\/app_web_sessions/);
  assert.match(source, /session\.expires_at/);
  assert.match(source, /String\(teacher\.status \|\| ""\)\.toLowerCase\(\) !== "active"/);
  assert.match(source, /teacher\.school_id !== session\.school_id/);
  assert.match(source, /teacher\.role !== session\.role/);
  assert.doesNotMatch(source, /rest\/v1\/app_sessions/);
  assert.doesNotMatch(source, /sessionKind|telegram_id/);
  assert.match(source, /schools\[0\]\.status \|\| ""\)\.toLowerCase\(\) !== "active"/);
});

test('school asset upload verifies image signatures, not only client MIME', () => {
  assert.match(source, /function matchesImageSignature\(type: string, bytes: Uint8Array\)/);
  assert.match(source, /bytes\[0\] === 0xff && bytes\[1\] === 0xd8 && bytes\[2\] === 0xff/);
  assert.match(source, /bytes\[0\] === 0x89 && bytes\[1\] === 0x50 && bytes\[2\] === 0x4e && bytes\[3\] === 0x47/);
  assert.match(source, /String\.fromCharCode\(\.\.\.bytes\.slice\(0, 4\)\) === "RIFF"/);
  assert.match(source, /String\.fromCharCode\(\.\.\.bytes\.slice\(8, 12\)\) === "WEBP"/);
  assert.match(source, /Image content does not match its declared type/);
});

test('upload endpoint applies bucket-specific size caps and retains role restrictions', () => {
  assert.match(source, /const maxBytes = kind === "student" \? 3 \* 1024 \* 1024 : 5 \* 1024 \* 1024/);
  assert.match(source, /file\.size > maxBytes/);
  assert.match(source, /kind === "logo" \|\| kind === "cover"/);
  assert.match(source, /!\["admin", "super_admin"\]\.includes\(session\.role\)/);
  assert.match(source, /session\.expires_at/);
});

test('student photo upload is authorized for the same school and student before storage write', () => {
  assert.match(source, /rpc_authorize_student_photo_upload/);
  assert.match(source, /authorization\.school_id !== session\.school_id/);
  assert.match(source, /authorization\.student_id !== studentId/);
  assert.match(source, /const bucket = kind === "student" \? "student-photos" : "school-assets"/);
  assert.match(authorizationMigration, /private\.web_has_student_permission/);
  assert.match(authorizationMigration, /web_has_student_permission\([\s\S]*?\) IS NOT TRUE/);
  assert.match(rolloutScript, /DROP POLICY IF EXISTS "anon upload student photos" ON storage\.objects/);
  assert.doesNotMatch(rolloutScript, /DROP POLICY IF EXISTS "public read student photos" ON storage\.objects/);
  assert.match(rolloutScript, /Keep public read temporarily for compatibility/);
  assert.match(authorizationMigration, /GRANT EXECUTE ON FUNCTION public\.rpc_authorize_student_photo_upload\(text, text\)\s+TO service_role/);
});

test('gated rollout runtime assertion removes anonymous upload only and preserves public read', () => {
  assert.match(runtimeTest, /policyname\s*=\s*'anon upload student photos'[\s\S]*?gated student-photo rollout left legacy anonymous upload enabled/);
  assert.match(runtimeTest, /policyname\s*=\s*'public read student photos'[\s\S]*?gated student-photo rollout removed public-read compatibility prematurely/);
});

test('browser student-photo flow uses the trusted Edge Function, not direct anonymous Storage writes', () => {
  assert.match(api, /functions\/v1\/upload-school-asset/);
  assert.match(api, /form\.append\('session_token', sessionToken\)/);
  assert.match(api, /form\.append\('student_id', studentId\)/);
  assert.match(api, /window\.getSavedSession\?\.\(\)\?\.token/);
  assert.doesNotMatch(api, /storage\/v1\/object\/student-photos/);
});
