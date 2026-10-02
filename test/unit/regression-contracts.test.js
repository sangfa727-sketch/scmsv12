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
