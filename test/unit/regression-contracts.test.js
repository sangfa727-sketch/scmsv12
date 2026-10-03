const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('dashboard navigation targets resolve to real app pages', () => {
  const dashboard = read('js/27_dashboard.js');
  const html = read('index.html');
  for (const page of ['attend','hw','incidents','parents','students']) assert.ok(dashboard.includes("goToPage('" + page + "')") || dashboard.includes('goToPage("' + page + '")'), 'missing dashboard destination: ' + page);
  assert.ok(html.includes('id="page-attend"') && html.includes('id="page-hw"') && html.includes('id="page-incidents"'));
});

test('dashboard date filters use the configured school timezone', () => {
  const source = read('js/27_dashboard.js');
  assert.ok(source.includes('_dashboardISODate'), 'dashboard local-date helper missing');
  assert.ok(source.includes('window.APP?.config?.timezone'), 'school timezone must be considered');
  assert.ok(source.includes('Intl.DateTimeFormat'), 'date formatting must be timezone-aware');
  assert.ok(!source.includes("new Date().toISOString().slice(0, 10)"), 'dashboard must not derive calendar dates from UTC');
  assert.ok(source.includes('return _dashboardISODate(d);'), 'relative dashboard dates must use the same date helper');
});

test('dashboard drill-down handlers keep destination contracts', () => {
  const source = read('js/27_dashboard.js');
  for (const fn of ['_dashboardGoToAttendance','_dashboardOpenHomework','_dashboardOpenIncidentStudent','_dashboardOpenStudent']) assert.ok(source.includes(fn), 'missing handler: ' + fn);
  for (const page of ['attend','hw','incidents','students']) assert.ok(source.includes("goToPage('" + page + "')") || source.includes('goToPage("' + page + '")'), 'missing destination: ' + page);
});

test('management center actions resolve to existing handlers', () => {
  const source = read('js/12_more.js');
  for (const fn of ['openTeacherManager','openManageClassesModal','showAdminInfo','openSchoolLogoModal','openSchoolCoverModal','openModulesMenu','openSettings']) assert.ok(source.includes(fn + '(') || source.includes(fn + ' ('), 'missing handler: ' + fn);
});

test('attendance history labels remain localized', () => {
  const source = read('js/05_attendance.js');
  const locale = read('js/00a_locales_en.js');
  for (const key of ['common.all','att.present','att.absent','att.code.E.label','att.code.H.label','att.code.T.label','att.code.S.label','att.historyEmpty','att.historyDays','att.stat.marked','att.auditTitle','btn.refresh','common.close','common.edit']) {
    assert.ok(source.includes("t('" + key + "')") || locale.includes("'" + key + "'"), 'missing attendance i18n contract: ' + key);
  }
  assert.ok(!source.includes('<option value="">All classes</option>'), 'attendance class filters must not hard-code English');
  assert.ok(!source.includes('No attendance history found.'), 'attendance history empty state must use i18n');
  for (const text of ['>Days</span>','>Marked</span>','>Present</span>','>Late <b>','>Sick <b>','>Audit</button>','>Refresh</button>','>Close</button>','>Edit</button>','>Load</button>','>Loading audit…</div>']) assert.ok(!source.includes(text), 'attendance history contains hard-coded UI: ' + text);
  assert.ok(!source.includes('empty-state-text">${t("att.auditLoading")}'), 'audit loading must interpolate the translation key');
});

test('premium select controls stay in-app and keyboard accessible', () => {
  const js = read('js/31_premium_selects.js');
  const css = read('premium-selects.css');
  for (const token of ['scms-select-trigger','scms-select-menu','setAttribute(\'role\', \'listbox\')','setAttribute(\'role\', \'option\')','ArrowDown','ArrowUp','Escape','MutationObserver']) {
    assert.ok(js.includes(token), 'premium select contract missing: ' + token);
  }
  assert.ok(css.includes('position:fixed'), 'premium select menu must escape page overflow');
  assert.ok(css.includes('z-index:10050'), 'premium select menu must stay above page surfaces');
  assert.ok(css.includes('.scms-select-menu.is-open'), 'premium select open state styling missing');
  assert.ok(css.includes('.scms-select-wrap>select{position:absolute'), 'native select must be visually hidden behind the in-app control');
});

test('grades assessment time labels remain localized', () => {
  const source = read('js/20_grades.js');
  const locale = read('js/00a_locales_en.js');
  assert.ok(source.includes("t('grades.startTime')"), 'start time label must use i18n');
  assert.ok(source.includes("t('grades.endTime')"), 'end time label must use i18n');
  assert.ok(locale.includes("'grades.startTime'") && locale.includes("'grades.endTime'"), 'grade time locale keys missing');
  assert.ok(!source.includes('<label class="field-label">Start time</label>'), 'start time must not be hard-coded');
  assert.ok(!source.includes('<label class="field-label">End time</label>'), 'end time must not be hard-coded');
});

test('student ID card flow keeps QR API contract', () => {
  const source = read('js/04_students.js');
  for (const token of ['showStudentIdCard','getOrCreateStudentQr','idCard.failed','qr_token']) assert.ok(source.includes(token), 'missing ID-card contract: ' + token);
});

test('student ID card labels remain localized', () => {
  const source = read('js/04_students.js');
  const locale = read('js/00a_locales_en.js');
  assert.ok(source.includes("t('idCard.studentId')"), 'student ID card label must use i18n');
  assert.ok(locale.includes("'idCard.studentId'"), 'student ID card locale key missing');
  assert.ok(!source.includes('<div class="idc-label">Student ID</div>'), 'student ID card label must not be hard-coded');
});

test('dashboard scope, notifications and context handoff stay wired', () => {
  const dashboard = read('js/27_dashboard.js');
  const app = read('js/14_app.js');
  for (const token of ['_dashboardMyClassSet','dash.wholeSchool','dash.myClassesOnly','refreshDashboardNotifications','dashboard-notification-btn','_dashboardSetContext']) assert.ok(dashboard.includes(token), 'missing dashboard contract: ' + token);
  for (const token of ['_applyDashboardContext','dashboard-context-highlight','clearDashboardContext','languageChanged']) assert.ok(app.includes(token), 'missing app contract: ' + token);
});

test('supported locales preserve the English key set', () => {
  const files = ['js/00a_locales_en.js','js/00b_locales_my.js','js/00_locales_jp.js','js/00_locales_thai.js','js/00d_locales_ms.js','js/00e_locales_km.js','js/00e_locales_zh.js'];
  const english = read(files[0]);
  for (const file of files.slice(1)) {
    const locale = read(file);
    for (const key of ['dash.wholeSchool','dash.myClassesOnly','btn.retry','settings.title']) assert.ok(english.includes(key) && locale.includes(key), file + ' missing shared key: ' + key);
  }
});

test('teacher permission locale map covers all supported languages', () => {
  const source = read('js/29_teacher_access.js');
  for (const lang of ['en','my','th','jp','zh','km','ms']) assert.ok(source.includes(lang + ':'), 'missing locale: ' + lang);
  for (const key of ['dashboard.view','students.view','attendance.view','homework.view','permissions.manage']) assert.ok(source.includes(key), 'missing permission key: ' + key);
});

test('critical page renderers stay wired at boot', () => {
  const source = read('js/14_app.js');
  for (const fn of ['renderDashboard','renderStudents','renderAttendance','renderHomework','renderComms','renderIncidents','renderMore','renderSidebar']) assert.ok(source.includes(fn), 'missing boot renderer: ' + fn);
});

console.log('SCMS regression contract suite loaded.');

test('student RPCs enforce the existing student permission contracts', () => {
  const migration = read('supabase/migrations/20261002030000_student_rpc_permission_hardening.sql');
  for (const fn of ['rpc_get_students','rpc_register_student','rpc_update_student']) {
    assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.' + fn), 'missing hardened RPC: ' + fn);
  }
  assert.ok(migration.includes("private.web_has_permission(p_session_token, 'students.view', NULL, NULL)"), 'students.view permission missing');
  assert.equal((migration.match(/private\.web_has_permission\(p_session_token, 'students\.edit'/g) || []).length, 2, 'students.edit must guard register and update');
  assert.ok(migration.includes("RETURN jsonb_build_object('ok', false, 'error', 'permission_denied')"), 'permission denial contract missing');
});

test('assessment grade RPCs enforce view/edit permission contracts', () => {
  const migration = read('supabase/migrations/20261002050000_assessment_rpc_permission_hardening.sql');
  for (const fn of ['rpc_get_grades','rpc_save_grades']) {
    assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.' + fn), 'missing hardened RPC: ' + fn);
  }
  assert.equal((migration.match(/'assessment\.view'/g) || []).length, 1, 'assessment.view must guard grade reads');
  assert.equal((migration.match(/'assessment\.edit'/g) || []).length, 1, 'assessment.edit must guard grade writes');
  assert.equal((migration.match(/'permission_denied'/g) || []).length, 2, 'both grade RPCs must expose permission_denied');
  assert.ok(migration.includes('v_assessment.subject_id'), 'grade permission scope must include subject');
  assert.ok(migration.includes('v_assessment.class'), 'grade permission scope must include class');
});


test('n8n state keeps telegram_id uniqueness through the primary key only', () => {
  const migration = read('supabase/migrations/20261003060000_n8n_state_redundant_unique_constraint_cleanup.sql');
  assert.ok(migration.includes('DROP CONSTRAINT IF EXISTS n8n_state_telegram_id_key'));
  assert.ok(migration.includes('n8n_state'));
});

test('n8n state RLS policy uses an init-plan-safe auth.role call', () => {
  const migration = read('supabase/migrations/20261003050000_n8n_state_rls_initplan_cleanup.sql');
  assert.ok(migration.includes('USING ((select auth.role()) = \'service_role\')'));
  assert.ok(migration.includes('WITH CHECK ((select auth.role()) = \'service_role\')'));
  assert.ok(!migration.includes('USING (auth.role()'));
});

test('database cleanup migration only removes confirmed redundant objects', () => {
  const migration = read('supabase/migrations/20261003040000_duplicate_index_policy_cleanup.sql');
  for (const name of ['idx_attendance_date','idx_attendance_school_date','idx_attendance_student_date','idx_dr_date','idx_ms_ym','n8n_state_tg_uq','students_school_idx','students_class_idx','teachers_school_idx','teachers_tg_idx']) {
    assert.ok(migration.includes('DROP INDEX IF EXISTS public.' + name), 'missing safe index cleanup: ' + name);
  }
  for (const name of ['svc_all','srv_all','service_role_all_n8n_state']) {
    assert.ok(migration.includes('DROP POLICY IF EXISTS ' + name + ' ON public.n8n_state'), 'missing redundant n8n policy cleanup: ' + name);
  }
  assert.ok(!migration.includes('DROP INDEX public.n8n_state_pkey'), 'primary key index must never be dropped');
  assert.ok(!migration.includes('DROP INDEX public.n8n_state_telegram_id_key'), 'constraint-owned unique index must never be dropped');
});

test('admissions access is admin-gated end-to-end', () => {
  const migration = read('supabase/migrations/20261003030000_admissions_permission_domain_hardening.sql');
  const more = read('js/12_more.js');
  for (const key of ['admissions.view','admissions.manage']) assert.ok(migration.includes("'" + key + "'"), 'missing admissions permission: ' + key);
  for (const fn of ['rpc_convert_admission_to_student','rpc_create_admission','rpc_delete_admission','rpc_link_admission_invoice','rpc_set_admission_photo','rpc_update_admission_status','rpc_update_admission']) {
    assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.' + fn), 'missing admissions write guard: ' + fn);
  }
  for (const fn of ['rpc_get_admission_detail','rpc_get_admissions']) {
    assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.' + fn), 'missing admissions read guard: ' + fn);
  }
  assert.equal((migration.match(/private\.web_has_permission\(p_session_token, 'admissions\.manage'/g) || []).length, 7);
  assert.equal((migration.match(/private\.web_has_permission\(p_session_token, 'admissions\.view'/g) || []).length, 2);
  assert.ok(more.includes("id !== 'admissions' || !!window.APP?.is_admin"), 'admissions must be hidden from non-admin module lists');
  assert.ok(more.includes("pageId === 'admissions' && !window.APP?.is_admin"), 'direct admissions navigation must be admin-gated');
});

test('student health delete RPCs enforce students.edit', () => {
  const migration = read('supabase/migrations/20261003020000_student_health_delete_permission_hardening.sql');
  for (const fn of ['rpc_delete_health_visit','rpc_delete_vaccination']) {
    assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.' + fn), 'missing hardened health delete RPC: ' + fn);
  }
  assert.equal((migration.match(/private\.web_has_permission\(p_session_token, 'students\.edit'/g) || []).length, 2);
  assert.equal((migration.match(/'permission_denied'/g) || []).length, 2);
});

test('remaining student-domain RPCs enforce view/edit permission contracts', () => {
  const migration = read('supabase/migrations/20261003010000_student_domain_permission_hardening.sql');
  const editFns = ['rpc_activate_student','rpc_add_health_visit','rpc_add_vaccination','rpc_assign_student_transport','rpc_deactivate_student','rpc_delete_student','rpc_reactivate_student','rpc_remove_student_transport','rpc_update_student_parent','rpc_upsert_health_profile'];
  const viewFns = ['rpc_get_health_profile','rpc_get_student_by_id','rpc_get_student_checkouts','rpc_get_student_history','rpc_get_student_transport'];
  for (const fn of [...editFns, ...viewFns]) assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.' + fn), 'missing hardened RPC: ' + fn);
  assert.equal((migration.match(/private\.web_has_permission\(p_session_token, 'students\.edit'/g) || []).length, editFns.length, 'all student mutations must enforce students.edit');
  assert.equal((migration.match(/private\.web_has_permission\(p_session_token, 'students\.view'/g) || []).length, viewFns.length, 'all student reads must enforce students.view');
  assert.equal((migration.match(/'permission_denied'/g) || []).length, editFns.length + viewFns.length, 'each hardened RPC must expose permission_denied');
});

test('student photo RPC enforces the existing students.edit permission contract', () => {
  const migration = read('supabase/migrations/20261002060000_student_photo_rpc_permission_hardening.sql');
  assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.rpc_set_student_photo'), 'missing hardened student photo RPC');
  assert.equal((migration.match(/private\.web_has_permission\(\s*p_session_token,\s*'students\.edit'/g) || []).length, 1, 'students.edit must guard student photo updates');
  assert.ok(migration.includes("'permission_denied'"), 'permission denial contract missing');
});

test('management admin handlers remain explicitly gated', () => {
  const more = read('js/12_more.js');
  const settings = read('js/15_settings.js');
  const moreStart = more.indexOf('window.showAdminInfo = function () {');
  const moreEnd = more.indexOf('\n};', moreStart);
  assert.ok(moreStart >= 0 && moreEnd > moreStart, 'school settings handler missing');
  const moreBlock = more.slice(moreStart, moreEnd);
  assert.ok(moreBlock.includes('window.APP?.is_admin'), 'school settings handler must enforce admin access');
  assert.ok(moreBlock.includes("showToast(t('cg.adminOnly'))"), 'school settings denial feedback missing');

  const handlers = [
    'openTeacherManager',
    'openInviteCodeModal',
    'doGenerateInvite',
    'openCreateTeacherModal',
    'openTeacherEditModal',
    'saveTeacherEdit',
    'doCreateTeacher',
    'openTeacherCardModal',
    'resetTeacherPassword'
  ];
  for (const name of handlers) {
    const start = settings.indexOf('window.' + name + ' = ');
    const end = settings.indexOf('\n};', start);
    assert.ok(start >= 0 && end > start, 'teacher management handler missing: ' + name);
    const block = settings.slice(start, end);
    assert.ok(block.includes('window.APP?.is_admin'), name + ' must enforce admin access');
    assert.ok(block.includes("showToast(t('cg.adminOnly'))"), name + ' must provide admin denial feedback');
  }
});


test('grades UI preserves school-local dates and surfaces grade-load failures', () => {
  const source = read('js/20_grades.js');
  assert.ok(source.includes('function _gradesISODate'), 'grades local-date helper missing');
  assert.ok(source.includes('window.APP?.config?.timezone'), 'grades date must respect configured timezone');
  assert.ok(source.includes('Intl.DateTimeFormat'), 'grades date must use timezone-aware formatting');
  assert.ok(!source.includes('new Date().toISOString().slice(0, 10)'), 'grades date must not use UTC date slicing');
  assert.ok(source.includes("await API.getGrades(assessmentId)"), 'grade read API contract missing');
  assert.ok(source.includes("showToast(t('common.loadFailed'"), 'grade-load failures must surface to the user');
  assert.ok(!source.includes('/* fresh assessment, no grades yet */'), 'grade-load failures must not be treated as an empty assessment');
});


test('diagnostic views stay inaccessible to public web roles', () => {
  const migration = read('supabase/migrations/20261003070000_revoke_public_diagnostic_views.sql');
  for (const view of ['public.pg_all_foreign_keys','public.tap_funky']) {
    assert.ok(migration.includes('REVOKE ALL ON TABLE ' + view + ' FROM PUBLIC, anon, authenticated;'), 'public access must be revoked: ' + view);
  }
});
