const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const block = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, 'missing source marker: ' + start);
  const to = end ? source.indexOf(end, from + start.length) : source.length;
  assert.ok(!end || to > from, 'missing end marker: ' + end);
  return source.slice(from, to < 0 ? source.length : to);
};

test('Manage Teachers cache uses TTL, deduplicates concurrent loads, and resets in finally', () => {
  const source = read('js/15_settings.js');
  assert.match(source, /const TEACHER_MANAGER_CACHE_TTL = 30000/);
  assert.match(source, /if \(_teacherManagerCacheFresh\(\)\) return _teacherManagerCache\.rows/);
  assert.match(source, /if \(_teacherManagerLoadPromise\) return _teacherManagerLoadPromise/);
  assert.match(source, /_teacherManagerLoadPromise = null/);
  assert.match(block(source, 'async function _fetchTeacherManagerRows()', 'function _prefetchTeacherManagerList'), /finally/);
  assert.match(source, /_invalidateTeacherManagerCache\(\)/);
});

test('Manage Teachers list has loading, empty, error, and escaped teacher-row states', () => {
  const source = read('js/15_settings.js');
  const manager = block(source, 'window.openTeacherManager = async function()', 'async function _refreshTeacherManagerList');
  assert.match(manager, /teacher-manager-loading/);
  assert.match(manager, /aria-busy="true"/);
  assert.match(manager, /_renderTeacherList\(rows\)/);
  assert.match(manager, /tm\.loadFailed/);
  const render = block(source, 'function _renderTeacherList(teachers)', 'function _teacherLifecycleCopy');
  assert.match(render, /if \(!teachers\.length\)/);
  for (const field of ['teacher.teacher_id', 'teacher.teacher_name', 'teacher.email', 'teacher.role']) {
    assert.ok(render.includes(field), 'list should render ' + field);
  }
  assert.match(render, /esc\(teacher\.teacher_name\)/);
  assert.match(render, /esc\(teacher\.teacher_id\)/);
  assert.match(render, /openTeacherEditModal/);
  assert.match(render, /openTeacherAccess/);
  assert.match(render, /openTeacherCardModal/);
  assert.match(render, /resetTeacherPassword/);
  assert.match(render, /setTeacherLifecycle/);
});

test('Create and edit teacher forms validate required fields and restore save controls', () => {
  const source = read('js/15_settings.js');
  const create = block(source, 'window.doCreateTeacher = async function()', 'window.openTeacherCardModal');
  assert.match(create, /if \(!id \|\| !login \|\| !name \|\| !email \|\| !pw\)/);
  assert.match(create, /pw\.length < 6/);
  assert.match(create, /btn\.disabled = true/);
  assert.match(create, /finally/);
  assert.match(create, /_invalidateTeacherManagerCache\(\)/);

  const edit = block(source, 'window.saveTeacherEdit = async function(teacherId)', 'window.doCreateTeacher');
  assert.match(edit, /if \(!login \|\| !name \|\| !email\)/);
  assert.match(edit, /rpc_admin_update_teacher_profile/);
  assert.match(edit, /if \(!result\?\.ok\)/);
  assert.match(edit, /btn\.disabled = true/);
  assert.match(edit, /finally/);
  assert.match(edit, /_invalidateTeacherManagerCache\(\)/);
});

test('Role picker never offers admin or super_admin unless the current actor is super_admin', () => {
  const source = read('js/15_settings.js');
  assert.match(source, /SCMS_OPERATIONAL_ROLES = Object\.freeze\(\['teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin'\]\)/);
  const roles = block(source, 'function _teacherRoleOptions', 'function _loginMethodLabel');
  assert.match(roles, /window\.APP\?\.teacher_role==='super_admin'/);
  assert.match(roles, /role=>isSuperAdmin\|\|!\['admin','super_admin'\]\.includes\(role\)/);
  assert.match(roles, /esc\(role\)/);
  assert.match(roles, /esc\(_teacherRoleLabel\(role\)\)/);
});

test('Teacher lifecycle requires admin, valid action, confirmation, and a session before RPC', () => {
  const source = read('js/15_settings.js');
  const lifecycle = block(source, 'window.setTeacherLifecycle = async function(teacherId, action)', 'function _renderTeacherList');
  assert.match(lifecycle, /if \(!window\.APP\?\.is_admin\)/);
  assert.match(lifecycle, /!\['deactivate','reactivate'\]\.includes\(action\)/);
  assert.match(lifecycle, /window\.confirm\(/);
  assert.match(lifecycle, /if \(!sess\?\.session_token\)/);
  assert.match(lifecycle, /rpc_admin_deactivate_teacher/);
  assert.match(lifecycle, /rpc_admin_reactivate_teacher/);
  assert.match(lifecycle, /p_session_token: sess\.session_token/);
  assert.match(lifecycle, /_invalidateTeacherManagerCache\(\)/);
  assert.match(lifecycle, /setAttribute\('aria-busy','true'\)/);
  assert.match(lifecycle, /finally/);
  assert.match(lifecycle, /removeAttribute\('aria-busy'\)/);
});

test('Manage Access RPC fails closed on missing admin privilege or session token', () => {
  const source = read('js/29_teacher_access.js');
  const rpc = block(source, 'async function _teacherAccessRpc(action, teacherId, extra)', 'function _taOpt');
  assert.match(rpc, /if \(!window\.APP\?\.is_admin\) throw new Error\('ADMIN_REQUIRED'\)/);
  assert.match(rpc, /if \(!sess\?\.session_token\) throw new Error\('AUTH_REQUIRED'\)/);
  assert.match(rpc, /'rpc_manage_teacher_access'/);
  assert.match(rpc, /p_session_token: sess\.session_token/);
  assert.match(rpc, /p_action: action/);
  assert.match(rpc, /p_teacher_id: teacherId/);
});

test('Manage Access modal stays hidden until its final-sized content is ready', () => {
  const source = read('js/29_teacher_access.js');
  const open = block(source, 'window.openTeacherAccess = async function(teacherId, teacherName)', 'window.teacherAccessAddClass');
  assert.match(open, /if \(!window\.APP\?\.is_admin\)/);
  assert.match(open, /teacher-modal-preparing/);
  assert.match(open, /visibility:hidden/);
  assert.match(open, /await _renderTeacherAccess\(\)/);
  assert.match(open, /finally/);
  assert.match(open, /classList\.remove\('teacher-modal-preparing'\)/);
  assert.match(open, /classList\.add\('teacher-modal-ready'\)/);
  assert.match(open, /style\.visibility = 'visible'/);
  assert.match(open, /esc\(teacherName\)/);
  assert.match(open, /esc\(teacherId\)/);
});

test('Manage Access loads catalog and assignments together and renders scoped permission controls', () => {
  const source = read('js/29_teacher_access.js');
  const render = block(source, 'async function _renderTeacherAccess()', 'window.openTeacherAccess');
  assert.match(render, /Promise\.all\(\[/);
  assert.match(render, /_teacherAccessRpc\('catalog', teacherId\)/);
  assert.match(render, /_teacherAccessRpc\('list', teacherId\)/);
  assert.match(render, /data-permission=/);
  assert.match(render, /data-scope=/);
  assert.match(render, /teacher-access-perm-state/);
  assert.match(render, /value="default"/);
  assert.match(render, /value="allow"/);
  assert.match(render, /value="deny"/);
  assert.match(render, /_taScopeControls\(p,catalog\)/);
  assert.match(render, /addEventListener\('change'/);
  assert.match(render, /catch \(e\)/);
  assert.match(render, /_taUi\('loadFailed'\)/);
});

test('Class and subject assignment handlers validate required selections and send the correct RPC actions', () => {
  const source = read('js/29_teacher_access.js');
  const addClass = block(source, 'window.teacherAccessAddClass = async function()', 'window.teacherAccessRemoveClass');
  assert.match(addClass, /if \(!value\)/);
  assert.match(addClass, /_teacherAccessRpc\('class_add'/);
  assert.match(addClass, /p_assignment_type:'class_teacher'/);
  assert.match(addClass, /await _renderTeacherAccess\(\)/);

  const removeClass = block(source, 'window.teacherAccessRemoveClass = async function(className, assignmentType)', 'window.teacherAccessAddSubject');
  assert.match(removeClass, /_teacherAccessRpc\('class_remove'/);
  assert.match(removeClass, /p_assignment_type:assignmentType/);
  assert.match(removeClass, /await _renderTeacherAccess\(\)/);

  const addSubject = block(source, 'window.teacherAccessAddSubject = async function()', 'window.teacherAccessRemoveSubject');
  assert.match(addSubject, /if \(!cls \|\| !subject\)/);
  assert.match(addSubject, /_teacherAccessRpc\('subject_add'/);
  assert.match(addSubject, /p_class_name:cls,p_subject_id:subject/);

  const removeSubject = block(source, 'window.teacherAccessRemoveSubject = async function(className, subjectId)', 'window.teacherAccessSavePermission');
  assert.match(removeSubject, /_teacherAccessRpc\('subject_remove'/);
  assert.match(removeSubject, /p_subject_id:Number\(subjectId\)/);
});

test('Permission updates map Default to removal and Allow/Deny to persisted boolean values', () => {
  const source = read('js/29_teacher_access.js');
  const save = block(source, 'window.teacherAccessSavePermission = async function(select)', null);
  assert.match(save, /if \(\(scope === 'class' \|\| scope === 'class_subject'\) && !cls\)/);
  assert.match(save, /if \(\(scope === 'subject' \|\| scope === 'class_subject'\) && !subject\)/);
  assert.match(save, /if \(select\.value === 'default'\)/);
  assert.match(save, /_teacherAccessRpc\('permission_remove'/);
  assert.match(save, /_teacherAccessRpc\('permission_set'/);
  assert.match(save, /p_allowed:select\.value === 'allow'/);
  assert.match(save, /p_scope_type:scope/);
  assert.match(save, /p_permission_key:key/);
  assert.match(save, /await _renderTeacherAccess\(\)/);
  assert.match(save, /Re-read the persisted server state/);
  assert.match(save, /catch\(e\)/);
});

test('Effective access honors explicit overrides first and assignment-scopes teacher roles', () => {
  const source = read('js/29_teacher_access.js');
  const effective = block(source, 'function _taEffectiveAllowed(', 'function _taEffectiveLabel');
  assert.match(effective, /if \(override\) return !!override\.allowed/);
  assert.match(effective, /teacher\.role === 'admin' \|\| teacher\.role === 'super_admin'/);
  assert.match(effective, /permission\.permission_key === 'students\.view' \|\| permission\.permission_key === 'students\.edit'/);
  assert.match(effective, /if \(!roleDefault\) return false/);
  assert.match(effective, /a\.is_active && a\.class_name === cls/);
  assert.match(effective, /a\.is_active && String\(a\.subject_id\) === String\(subject\)/);
  assert.match(effective, /a\.is_active && a\.class_name === cls && String\(a\.subject_id\) === String\(subject\)/);
});

test('Server RPC permission matrix remains school-scoped and fail-closed for unsupported actions', () => {
  const migration = read('supabase/migrations/20261005260000_manage_teacher_access_permission_gate.sql', 'utf8');
  assert.match(migration, /rpc_manage_teacher_access signature not found/);
  assert.match(migration, /authorization marker not found; refusing unsafe rewrite/);
  assert.match(migration, /p_action = 'catalog'[\s\S]*permissions\.manage/);
  assert.match(migration, /p_action = 'list'[\s\S]*teachers\.view/);
  assert.match(migration, /p_action in \('class_add','class_remove','subject_add','subject_remove'\)[\s\S]*teachers\.manage/);
  assert.match(migration, /p_action in \('permission_set','permission_remove'\)[\s\S]*permissions\.manage/);
  assert.equal((migration.match(/'permission_denied'/g) || []).length, 4);
  assert.match(migration, /revoke all on function public\.rpc_manage_teacher_access/);
  assert.match(migration, /grant execute on function public\.rpc_manage_teacher_access.*to anon, authenticated/);
});

test('Sensitive teacher mutations keep super_admin target guards on the server', () => {
  const migration = read('supabase/migrations/20261002200000_management_sensitive_actions_superadmin_guard.sql');
  for (const fn of [
    'rpc_admin_reset_teacher_password',
    'rpc_admin_set_teacher_login_name',
    'rpc_admin_create_teacher_card',
    'rpc_admin_revoke_teacher_card'
  ]) {
    assert.match(migration, new RegExp('create or replace function public\\.' + fn));
  }
  assert.match(migration, /a\.admin_role <> 'super_admin' and teacher_row\.role='super_admin'/);
  assert.match(migration, /v_admin\.admin_role <> 'super_admin' and v_target_role='super_admin'/);
});
