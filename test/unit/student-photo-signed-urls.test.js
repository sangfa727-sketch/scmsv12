const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const endpoint = fs.readFileSync('supabase/functions/student-photo-signed-urls/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261017110000_authorize_student_photo_reads.sql', 'utf8');
const api = fs.readFileSync('js/02C_api_students.js', 'utf8');
const boot = fs.readFileSync('js/14_app.js', 'utf8');
const parent = fs.readFileSync('parent.html', 'utf8');
const avatars = fs.readFileSync('js/03_utils.js', 'utf8');
const studentUi = fs.readFileSync('js/04_students.js', 'utf8');

test('signed photo endpoint is POST-only, bounded, and limits batch size', () => {
  assert.match(endpoint, /req\.method !== "POST"/);
  assert.match(endpoint, /32 \* 1024/);
  assert.match(endpoint, /studentIds\.length > 100/);
  assert.match(endpoint, /body\.student_ids/);
});

test('signed photo endpoint calls the service-only authorization RPC for every requested ID', () => {
  assert.match(endpoint, /rpc_authorize_student_photo_read/);
  assert.match(endpoint, /for \(const studentId of studentIds\)/);
  assert.match(endpoint, /authorization\.object_path/);
  assert.match(endpoint, /expiresIn: 300/);
  assert.match(endpoint, /path\.startsWith\(schoolPrefix\)/);
  assert.match(endpoint, /path\.includes\("\.\."/);
  assert.match(endpoint, /path\.includes\(String\.fromCharCode\(92\)\)/,
    'single backslashes must be rejected in authorized object paths');
});

test('authorization RPC supports parent-owned student only and validates staff tenant/permissions', () => {
  assert.match(migration, /ps\.student_id = p_student_id/);
  assert.match(migration, /ps\.expires_at > now\(\)/);
  assert.match(migration, /ws\.expires_at > now\(\)/);
  assert.match(migration, /s\.school_id = v_web\.school_id/);
  assert.match(migration, /private\.web_has_student_permission\(p_session_token, 'students\.view', p_student_id\) IS NOT TRUE/);
  assert.match(migration, /a\.status = 'linked'/);
  assert.match(migration, /v_native\.role NOT IN \('teacher', 'senior_teacher', 'assistant_teacher'\)/);
  assert.match(migration, /a\.teacher_id = v_native\.teacher_id/);
  assert.match(migration, /a\.class_name = trim\(v_student\.class\)/);
  assert.match(migration, /a\.is_active = true/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_authorize_student_photo_read\(text, text\)\s+TO service_role/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.rpc_authorize_student_photo_read\(text, text\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /storage\/v1\/object\/public\/student-photos/);
  assert.match(migration, /position\('\.\.' in v_path\)/);
});

test('staff and native bootstrap photo data are resolved through the signed URL endpoint', () => {
  assert.match(api, /functions\/v1\/student-photo-signed-urls/);
  assert.match(api, /API\.signStudentPhotoUrls\(rows \|\| \[\]\)/);
  assert.match(api, /s\.photo_url = result\.photos\[s\.student_id\] \|\| null/);
  assert.match(boot, /API\.signStudentPhotoUrls\(window\.APP\.students\)/);
});

test('Parent Portal resolves only its linked student photo and fails closed on signing errors', () => {
  assert.match(parent, /functions\/v1\/student-photo-signed-urls/);
  assert.match(parent, /student_ids: \[student\.student_id\]/);
  assert.match(parent, /student\.photo_url = null/);
});

test('avatar renderer consumes the resolved URL on the student object without adding a public URL fallback', () => {
  assert.match(avatars, /if \(s && s\.photo_url\)/);
  assert.match(avatars, /src="\$\{esc\(s\.photo_url\)\}"/);
  assert.doesNotMatch(avatars, /storage\/v1\/object\/public\/student-photos/);
});

test('newly uploaded student photos are replaced with short-lived signed URLs before rendering', () => {
  assert.match(studentUi, /API\.signStudentPhotoUrls/);
  assert.match(studentUi, /signedStudent\?\.photo_url \|\| null/);
});

test('cached student roster refreshes expiring signed photo URLs without refetching the full list', () => {
  const loader = fs.readFileSync('js/02M_data_loader.js', 'utf8');
  assert.match(loader, /Signed URLs expire/);
  assert.match(loader, /API\.signStudentPhotoUrls\(cached\)/);
  assert.match(loader, /cache\.set\(key, refreshed\)/);
});
