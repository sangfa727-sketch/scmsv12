const { test, expect } = require('@playwright/test');

async function mountAdmin(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof window.openTeacherManager === 'function' &&
    typeof window.openTeacherAccess === 'function' &&
    typeof window._webRpc === 'function' &&
    !!window.APP
  );

  await page.evaluate(() => {
    window.APP.is_admin = true;
    window.APP.teacher_role = 'super_admin';
    window.APP.teacher_id = 'admin-test';
    window.APP.teacher_name = 'Test Admin';
    window.APP.school_id = 'school-test';
    window.APP.webSession = { session_token: 'e2e-test-session', auth_mode: 'password' };
    window.__teacherTestCalls = [];
    window.getWebSession = () => ({ session_token: 'e2e-test-session' });
    const teacher = {
      teacher_id: 'teacher-2',
      login_name: 'teacher.two',
      teacher_name: 'Other Teacher',
      email: 'teacher.two@example.test',
      role: 'teacher',
      is_active: true
    };
    const catalog = {
      classes: ['Grade 1', 'Grade 2'],
      subjects: [{ id: 10, subject_name: 'Mathematics', subject_code: 'MATH' }],
      permissions: [
        { permission_key: 'students.view', category: 'Students', scope_type: 'global', description: 'View students' },
        { permission_key: 'students.edit', category: 'Students', scope_type: 'class', description: 'Edit students' },
        { permission_key: 'attendance.view', category: 'Attendance', scope_type: 'subject', description: 'View attendance' },
        { permission_key: 'grades.edit', category: 'Academics', scope_type: 'class_subject', description: 'Edit grades' }
      ],
      role_permissions: [{ role: 'teacher', permission_key: 'students.view', allowed: true }]
    };
    window._webRpc = async (name, payload) => {
      window.__teacherTestCalls.push({ name, payload });
      if (name === 'rpc_admin_list_teachers') return { rows: [teacher] };
      if (name === 'rpc_admin_update_teacher_profile') return { ok: true };
      if (name === 'rpc_manage_teacher_access') {
        if (payload.p_action === 'catalog') return catalog;
        if (payload.p_action === 'list') return {
          teacher,
          classes: [],
          subjects: [],
          permissions: []
        };
        if (payload.p_action === 'permission_set' || payload.p_action === 'permission_remove') return { ok: true };
        return { ok: true };
      }
      return { ok: true };
    };
  });
}

async function rpcCalls(page, name) {
  return page.evaluate((target) => window.__teacherTestCalls.filter((call) => call.name === target), name);
}

test('Manage Teachers renders teacher rows and opens the Edit form', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => window.openTeacherManager());
  await expect(page.locator('.teacher-manager-sheet')).toBeVisible();
  await expect(page.locator('#teacherList')).toContainText('Other Teacher');
  await page.locator('.teacher-edit-btn').first().click();
  await expect(page.locator('.teacher-edit-sheet')).toBeVisible();
  await expect(page.locator('#editTName')).toHaveValue('Other Teacher');
});

test('Edit Teacher sends the selected role and updated fields to the RPC', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => window.openTeacherEditModal('teacher-2'));
  await expect(page.locator('.teacher-edit-sheet')).toBeVisible();
  await page.locator('#editTLogin').fill('teacher.two.updated');
  await page.locator('#editTName').fill('Other Teacher Updated');
  await page.locator('#editTEmail').fill('updated@example.test');
  await page.locator('#editTRole').selectOption('senior_teacher');
  await page.locator('#editTBtn').click();
  await expect.poll(async () => (await rpcCalls(page, 'rpc_admin_update_teacher_profile')).length).toBe(1);
  const call = (await rpcCalls(page, 'rpc_admin_update_teacher_profile'))[0];
  expect(call.payload.p_teacher_id).toBe('teacher-2');
  expect(call.payload.p_role).toBe('senior_teacher');
  expect(call.payload.p_login_name).toBe('teacher.two.updated');
  expect(call.payload.p_teacher_name).toBe('Other Teacher Updated');
  expect(call.payload.p_email).toBe('updated@example.test');
});

test('Manage Access renders scoped permissions and persists Allow/Default choices through RPC', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => window.openTeacherAccess('teacher-2', 'Other Teacher'));
  await expect(page.locator('.teacher-access-sheet')).toBeVisible();
  await expect(page.locator('.teacher-access-sheet')).toContainText('Manage Access');
  await expect(page.locator('#teacherAccessRoot')).toContainText('Other Teacher');

  const globalRow = page.locator('.teacher-access-perm-row[data-permission="students.view"][data-scope="global"]');
  await globalRow.locator('.teacher-access-perm-state').selectOption('deny');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(1);
  let calls = await rpcCalls(page, 'rpc_manage_teacher_access');
  let saved = calls.find((call) => call.payload.p_action === 'permission_set');
  expect(saved.payload.p_permission_key).toBe('students.view');
  expect(saved.payload.p_allowed).toBe(false);
  expect(saved.payload.p_scope_type).toBe('global');

  await globalRow.locator('.teacher-access-perm-state').selectOption('default');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_remove'
  ).length).toBe(1);
  calls = await rpcCalls(page, 'rpc_manage_teacher_access');
  saved = calls.find((call) => call.payload.p_action === 'permission_remove');
  expect(saved.payload.p_permission_key).toBe('students.view');
  expect(saved.payload.p_scope_type).toBe('global');
});

test('Manage Access refuses to open for a non-admin session', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => {
    window.APP.is_admin = false;
    window.openTeacherAccess('teacher-2', 'Other Teacher');
  });
  await expect(page.locator('.teacher-access-sheet')).toHaveCount(0);
  expect(await rpcCalls(page, 'rpc_manage_teacher_access')).toHaveLength(0);
});


test('Create Teacher validates and sends the selected operational role to the server', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => window.openCreateTeacherModal());
  await expect(page.locator('#newTId')).toBeVisible();
  await page.locator('#newTId').fill('teacher-new');
  await page.locator('#newTLogin').fill('teacher.new');
  await page.locator('#newTName').fill('New Teacher');
  await page.locator('#newTEmail').fill('new.teacher@example.test');
  await page.locator('#newTRole').selectOption('assistant_teacher');
  await page.locator('#newTPw').fill('valid-pin-123');
  await page.locator('#newTBtn').click();

  await expect.poll(async () => (await rpcCalls(page, 'rpc_admin_create_teacher_v2')).length).toBe(1);
  const call = (await rpcCalls(page, 'rpc_admin_create_teacher_v2'))[0];
  expect(call.payload.p_teacher_id).toBe('teacher-new');
  expect(call.payload.p_login_name).toBe('teacher.new');
  expect(call.payload.p_teacher_name).toBe('New Teacher');
  expect(call.payload.p_email).toBe('new.teacher@example.test');
  expect(call.payload.p_role).toBe('assistant_teacher');
});

test('Teacher deactivate/reactivate requires confirmation and sends the correct guarded RPC', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => { window.confirm = () => true; });

  await page.evaluate(() => window.setTeacherLifecycle('teacher-2', 'deactivate'));
  await expect.poll(async () => (await rpcCalls(page, 'rpc_admin_deactivate_teacher')).length).toBe(1);
  let call = (await rpcCalls(page, 'rpc_admin_deactivate_teacher'))[0];
  expect(call.payload.p_teacher_id).toBe('teacher-2');
  expect(call.payload.p_session_token).toBe('e2e-test-session');

  await page.evaluate(() => window.setTeacherLifecycle('teacher-2', 'reactivate'));
  await expect.poll(async () => (await rpcCalls(page, 'rpc_admin_reactivate_teacher')).length).toBe(1);
  call = (await rpcCalls(page, 'rpc_admin_reactivate_teacher'))[0];
  expect(call.payload.p_teacher_id).toBe('teacher-2');
  expect(call.payload.p_session_token).toBe('e2e-test-session');
});

test('Teacher lifecycle cancels safely when confirmation is declined', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => { window.confirm = () => false; });
  await page.evaluate(() => window.setTeacherLifecycle('teacher-2', 'deactivate'));
  expect(await rpcCalls(page, 'rpc_admin_deactivate_teacher')).toHaveLength(0);
});


test('Manage Access validates class, subject, and class-subject scopes before writing overrides', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => window.openTeacherAccess('teacher-2', 'Other Teacher'));
  await expect(page.locator('.teacher-access-sheet')).toBeVisible();

  const classRow = page.locator('.teacher-access-perm-row[data-permission="students.edit"][data-scope="class"]');
  await classRow.locator('.teacher-access-perm-state').selectOption('allow');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(0);
  await classRow.locator('.teacher-access-class').selectOption('Grade 1');
  await classRow.locator('.teacher-access-perm-state').selectOption('allow');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(1);
  let saved = (await rpcCalls(page, 'rpc_manage_teacher_access')).find((call) => call.payload.p_action === 'permission_set');
  expect(saved.payload.p_permission_key).toBe('students.edit');
  expect(saved.payload.p_scope_type).toBe('class');
  expect(saved.payload.p_class_name).toBe('Grade 1');
  expect(saved.payload.p_subject_id).toBeNull();

  const subjectRow = page.locator('.teacher-access-perm-row[data-permission="attendance.view"][data-scope="subject"]');
  await subjectRow.locator('.teacher-access-perm-state').selectOption('deny');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(1);
  await subjectRow.locator('.teacher-access-subject').selectOption('10');
  await subjectRow.locator('.teacher-access-perm-state').selectOption('deny');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(2);
  saved = (await rpcCalls(page, 'rpc_manage_teacher_access')).filter((call) => call.payload.p_action === 'permission_set')[1];
  expect(saved.payload.p_permission_key).toBe('attendance.view');
  expect(saved.payload.p_scope_type).toBe('subject');
  expect(saved.payload.p_class_name).toBeNull();
  expect(saved.payload.p_subject_id).toBe(10);
  
  const combinedRow = page.locator('.teacher-access-perm-row[data-permission="grades.edit"][data-scope="class_subject"]');
  await combinedRow.locator('.teacher-access-perm-state').selectOption('allow');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(2);
  await combinedRow.locator('.teacher-access-class').selectOption('Grade 2');
  await combinedRow.locator('.teacher-access-subject').selectOption('10');
  await combinedRow.locator('.teacher-access-perm-state').selectOption('allow');
  await expect.poll(async () => (await rpcCalls(page, 'rpc_manage_teacher_access')).filter(
    (call) => call.payload.p_action === 'permission_set'
  ).length).toBe(3);
  saved = (await rpcCalls(page, 'rpc_manage_teacher_access')).filter((call) => call.payload.p_action === 'permission_set')[2];
  expect(saved.payload.p_permission_key).toBe('grades.edit');
  expect(saved.payload.p_scope_type).toBe('class_subject');
  expect(saved.payload.p_class_name).toBe('Grade 2');
  expect(saved.payload.p_subject_id).toBe(10);
});

test('Manage Access refuses RPC calls when the admin session token is missing', async ({ page }) => {
  await mountAdmin(page);
  await page.evaluate(() => {
    window.getWebSession = () => null;
    window.APP.webSession = null;
  });
  await page.evaluate(async () => {
    try {
      await window.openTeacherAccess('teacher-2', 'Other Teacher');
    } catch (_) {}
  });
  expect(await rpcCalls(page, 'rpc_manage_teacher_access')).toHaveLength(0);
});
