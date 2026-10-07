const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('student update requires both existing-student and target-class authorization', () => {
  const migration = read('supabase/migrations/20261007130000_repair_student_update_class_scope.sql');
  assert.match(migration, /IF NOT private\.web_has_student_permission\(p_session_token, 'students\.edit', p_student_id\)/);
  assert.match(migration, /OR NOT private\.web_has_student_class_permission\(p_session_token, 'students\.edit', p_class\)/);
  assert.doesNotMatch(migration, /IF NOT private\.web_has_student_permission\(p_session_token, 'students\.edit', p_student_id\)[\s\S]*AND private\.web_has_student_class_permission/,
    'student update must not use the weaker AND gate');
});
