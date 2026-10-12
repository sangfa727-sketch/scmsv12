const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const rpc = read('supabase/migrations/20261003070000_teacher_access_superadmin_guard.sql');
const gate = read('supabase/migrations/20261005260000_manage_teacher_access_permission_gate.sql');
const foundation = read('supabase/migrations/20260929070000_teacher_assignment_permission_foundation.sql');

test('Manage Teacher/Access binds the session to an active teacher, school, and role', () => {
  assert.match(rpc, /join public\.teachers t on t\.teacher_id=s\.teacher_id and t\.school_id=s\.school_id and t\.role=s\.role/);
  assert.match(rpc, /s\.session_token=p_session_token and s\.expires_at>now\(\) and t\.status='active'/);
  assert.match(rpc, /v_admin\.role not in \('admin','super_admin'\)/);
});

test('Manage Teacher/Access resolves target teachers inside the actor school before any action', () => {
  const targetLookup = rpc.indexOf('where teacher_id=p_teacher_id and school_id=v_admin.school_id');
  const firstAction = rpc.indexOf("if p_action='catalog'");
  assert.notEqual(targetLookup, -1, 'target teacher lookup must be school-scoped');
  assert.notEqual(firstAction, -1, 'catalog action branch must exist');
  assert.ok(targetLookup < firstAction, 'target lookup must precede action handling');
  assert.match(rpc, /if v_teacher is null then\s+return jsonb_build_object\('ok',false,'error','teacher_not_found'\)/);
});

test('Lower-tier admins cannot manage a super_admin target', () => {
  assert.match(rpc, /if v_admin\.role <> 'super_admin' and v_teacher\.role='super_admin' then\s+return jsonb_build_object\('ok',false,'error','insufficient_role'\)/);
});

test('Every assignment read and mutation is scoped to the actor school', () => {
  for (const table of ['teacher_class_assignments', 'teacher_subject_assignments', 'teacher_permissions']) {
    assert.match(rpc, new RegExp('from public\\.' + table + '[\\s\\S]{0,260}?school_id=v_admin\\.school_id'));
  }
  assert.match(rpc, /insert into public\.teacher_class_assignments\(school_id,teacher_id/);
  assert.match(rpc, /values\(v_admin\.school_id,p_teacher_id/);
  assert.match(rpc, /insert into public\.teacher_subject_assignments\(school_id,teacher_id/);
  assert.match(rpc, /insert into public\.teacher_permissions\(school_id,teacher_id/);
  assert.match(rpc, /delete from public\.teacher_permissions\s+where school_id=v_admin\.school_id and teacher_id=p_teacher_id/);
});

test('Catalog data tied to a school is scoped, while permission definitions remain shared', () => {
  assert.match(rpc, /from public\.students s\s+where s\.school_id=v_admin\.school_id/);
  assert.match(rpc, /from public\.subjects s\s+where s\.school_id=v_admin\.school_id and s\.is_active=true/);
  assert.match(rpc, /from public\.permission_definitions p\s+where p\.is_active=true/);
  assert.match(rpc, /from public\.role_permissions r/);
});

test('Permission-gate migration denies each action family before the original branch executes', () => {
  const expected = [
    ["catalog", "permissions.manage"],
    ["list", "teachers.view"],
    ["class_add','class_remove','subject_add','subject_remove", "teachers.manage"],
    ["permission_set','permission_remove", "permissions.manage"]
  ];
  for (const [action, permission] of expected) {
    assert.ok(gate.includes(action), 'missing action family: ' + action);
    assert.ok(gate.includes(permission), 'missing permission gate: ' + permission);
  }
  assert.equal((gate.match(/'permission_denied'/g) || []).length, 4);
  assert.match(gate, /position\(v_marker in v_def\) = 0/);
  assert.match(gate, /refusing unsafe rewrite/);
});

test('Teacher assignment and permission tables deny direct client grants and enable RLS', () => {
  for (const table of ['teacher_class_assignments', 'teacher_subject_assignments', 'permission_definitions', 'role_permissions', 'teacher_permissions']) {
    assert.match(foundation, new RegExp('alter table public\\.' + table + ' enable row level security'));
    assert.match(foundation, new RegExp(table));
  }
  assert.match(foundation, /revoke all on table public\.teacher_class_assignments, public\.teacher_subject_assignments, public\.permission_definitions, public\.role_permissions, public\.teacher_permissions from anon, authenticated/);
});
