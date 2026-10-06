const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('student access migration enforces assignment scope server-side', () => {
  const m = read('supabase/migrations/20261006220000_enforce_teacher_student_class_scope.sql');
  assert.ok(m.includes('private.web_has_student_class_permission'));
  assert.ok(m.includes('private.web_has_student_permission'));
  assert.ok(m.includes('teacher_class_assignments'));
  assert.ok(m.includes("a.is_active=true"));
  assert.ok(m.includes("v_sess.role in ('teacher','senior_teacher','assistant_teacher')"));
  assert.ok(m.includes("v_sess.role in ('admin','super_admin','school_coordinator','administrative_assistant')"));
  assert.ok(m.includes("private.web_has_permission(p_session_token,p_permission_key,null,null)"));
});

test('student list is filtered by the logged-in teacher assignment', () => {
  const m = read('supabase/migrations/20261006220000_enforce_teacher_student_class_scope.sql');
  assert.ok(m.includes("private.web_has_student_class_permission(p_session_token,'students.view',x.class)"));
  assert.ok(m.includes("x.school_id=v_sess.school_id and x.status='Active'"));
});

test('student detail and mutation RPCs are rewritten to student-scoped authorization', () => {
  const m = read('supabase/migrations/20261006220000_enforce_teacher_student_class_scope.sql');
  assert.ok(m.includes("'rpc_get_student_by_id'"));
  assert.ok(m.includes("'rpc_update_student'"));
  assert.ok(m.includes("'rpc_delete_student'"));
  assert.ok(m.includes("'rpc_update_student_parent'"));
  assert.ok(m.includes("'rpc_set_student_photo'"));
  assert.ok(m.includes("'rpc_upsert_health_profile'"));
  assert.ok(m.includes("'rpc_add_health_visit'"));
  assert.ok(m.includes("'rpc_add_vaccination'"));
  assert.ok(m.includes("'rpc_assign_student_transport'"));
  assert.ok(m.includes("'rpc_remove_student_transport'"));
  assert.ok(m.includes("'rpc_regenerate_student_qr'"));
  assert.ok(m.includes("'rpc_get_health_profile'"));
});

test('registration is scoped to the class being created', () => {
  const m = read('supabase/migrations/20261006220000_enforce_teacher_student_class_scope.sql');
  assert.ok(m.includes("'rpc_register_student'"));
  assert.ok(m.includes("private.web_has_student_class_permission(p_session_token, 'students.edit', p_class)"));
});

test('related health/vaccination deletes are resolved back to their student', () => {
  const m = read('supabase/migrations/20261006220000_enforce_teacher_student_class_scope.sql');
  assert.ok(m.includes('private.web_has_student_record_permission'));
  assert.ok(m.includes("'health_visit'"));
  assert.ok(m.includes("'vaccination'"));
  assert.ok(m.includes('p_record_id bigint'));
});
