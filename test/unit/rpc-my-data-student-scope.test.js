const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('rpc_get_my_data student reads enforce assignment class scope', () => {
  const m = read('supabase/migrations/20261007150000_repair_rpc_get_my_data_student_scope.sql');
  assert.match(m, /p_table = 'students'[\s\S]*private\.web_has_permission\(p_session_token, 'students\.view'\)/);
  assert.match(m, /private\.web_has_student_class_permission\(p_session_token, 'students\.view', class\)/);
  assert.match(m, /school_id = v_sess\.school_id/);
  assert.match(m, /status = 'Active'/);
});