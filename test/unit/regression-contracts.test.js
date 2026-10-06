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

test('student ID card QR RPC returns the QR token contract', () => {
  const migration = read('supabase/migrations/20261005250000_student_qr_token_response_fix.sql');
  assert.ok(migration.includes('RETURNING student_id, name_mm, name_en, name_local, class, grade, gender,'), 'QR RPC projection must include the card fields');
  assert.ok(migration.includes('date_of_birth, status, photo_url, house, home_color, qr_token'), 'QR RPC must project qr_token');
  assert.ok(migration.includes("'qr_token', v_row.qr_token"), 'QR RPC response must return qr_token');
  assert.ok(migration.includes('rpc_regenerate_student_qr'), 'regenerate QR RPC must remain covered');
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

test('web boot defers bulk list RPC fan-out to the shared loader', () => {
  const app = read('js/14_app.js');
  const loader = read('js/02M_data_loader.js');
  assert.ok(app.includes('list RPC fan-out deferred'), 'web boot must defer list loading');
  assert.ok(app.includes('SCMSDataLoader.ensurePageData'), 'navigation must use the shared page loader');
  assert.ok(loader.includes('inflight'), 'loader must track in-flight requests');
  assert.ok(loader.includes('Promise.all(names.map'), 'loader must dedupe concurrent page resources');
  assert.ok(loader.includes('loadDashboardData'), 'dashboard must have a dedicated loader');
  assert.ok(!app.includes('API.getStudents().catch(() => [])'), 'web boot must not preload students');
});

test('shared loader keeps APP compatibility and supports explicit refresh', () => {
  const loader = read('js/02M_data_loader.js');
  for (const token of ['window.APP.students','window.APP.attendance','window.APP.homework','window.APP.incidents','window.APP.timetable']) {
    assert.ok(loader.includes(token), 'APP compatibility assignment missing: ' + token);
  }
  assert.ok(loader.includes('force = false'), 'loader force-refresh contract missing');
  assert.ok(loader.includes('refreshAllData'), 'public refresh facade missing');
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


test('teacher QR auth challenge contract stays one-time and school-bound', () => {
  const migration = read('supabase/migrations/20261003003000_teacher_email_bound_auth.sql');
  const fix = read('supabase/migrations/20261003020000_fix_teacher_card_challenge_school_id.sql');
  const landing = read('js/00_landing.js');

  assert.ok(migration.includes('create table if not exists public.teacher_card_login_challenges'));
  assert.ok(migration.includes('challenge_hash text not null unique'));
  assert.ok(migration.includes('expires_at timestamptz not null'));
  assert.ok(migration.includes('consumed_at timestamptz'));
  assert.ok(migration.includes("set consumed_at = now()"));
  assert.ok(migration.includes("and consumed_at is null"));
  assert.ok(migration.includes("v_challenge.expires_at <= now()"));
  assert.ok(migration.includes("where teacher_id = v_challenge.teacher_id"));
  assert.ok(migration.includes("and school_id = v_challenge.school_id"));
  assert.ok(migration.includes("encode(extensions.digest(trim(p_challenge), 'sha256'), 'hex')"));

  assert.ok(fix.includes('alter column school_id type text'));
  assert.ok(fix.includes('using school_id::text'));

  assert.ok(landing.includes("p_challenge: ctx.challengeId"));
  assert.ok(!landing.includes("p_teacher_id: ctx.teacherId"));
  assert.ok(landing.includes("window._teacherCardLoginContext = { challengeId: result.challenge_id }"));
});


test('daily report RPCs enforce session school isolation and class permissions', () => {
  const migration = read('supabase/migrations/20261003110000_daily_report_secure_rpc.sql');
  for (const fn of ['rpc_save_daily_report','rpc_update_daily_report','rpc_delete_daily_report']) {
    assert.ok(migration.includes('create or replace function public.' + fn), 'missing secure daily report RPC: ' + fn);
  }
  const guarded = (migration.match(/private\.web_has_permission\(p_session_token,'daily_report\.(edit|delete)'/g) || []).length;
  assert.equal(guarded, 3);
  assert.ok(migration.includes('s.school_id=v_sess.school_id'), 'student/report access must be school-scoped');
  assert.ok(migration.includes('where id=v_report.id and school_id=v_sess.school_id'), 'delete must re-bind school scope');
  for (const action of ['daily_report.save','daily_report.update','daily_report.delete']) assert.ok(migration.includes(action));
  assert.ok(migration.includes("'error','forbidden'"), 'permission denial must fail closed');
});

test('daily report save never trusts client class, teacher, or school fields', () => {
  const migration = read('supabase/migrations/20261003110000_daily_report_secure_rpc.sql');
  const save = migration.slice(migration.indexOf('create or replace function public.rpc_save_daily_report'), migration.indexOf('create or replace function public.rpc_update_daily_report'));
  assert.ok(save.includes('v_student.class'));
  assert.ok(save.includes('v_sess.teacher_id'));
  assert.ok(save.includes('v_sess.school_id'));
  assert.ok(!save.match(/values\s*\([^\n]*p_class/i));
});


test('AI confirmation persistence migration enforces session scope, expiry, replay protection and RPC boundaries', () => {
  const migration = read('supabase/migrations/20261003_ai_confirmation_persistence.sql');
  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS public.ai_confirmation_pending'));
  assert.ok(migration.includes('ALTER TABLE public.ai_confirmation_pending ENABLE ROW LEVEL SECURITY'));
  assert.ok(migration.includes('REVOKE ALL ON TABLE public.ai_confirmation_pending FROM PUBLIC, anon, authenticated'));
  assert.ok(migration.includes('SET search_path=public,extensions'));
  assert.ok(migration.includes("s.session_token=p_session_token AND s.expires_at>now()"));
  assert.ok(migration.includes("t.status='active'"));
  assert.ok(migration.includes("encode(digest(p_session_token,'sha256'),'hex')"));
  assert.ok(migration.includes("p_expires_at>now()+interval '5 minutes'"));
  assert.ok(migration.includes("v_row.session_id<>v_session_id OR v_row.teacher_id<>v_sess.teacher_id OR v_row.school_id<>v_sess.school_id"));
  assert.ok(migration.includes("v_row.action_digest<>trim(p_action_digest)"));
  assert.ok(migration.includes("v_row.consumed_at IS NOT NULL"));
  assert.ok(migration.includes("v_row.cancelled_at IS NOT NULL"));
  assert.ok(migration.includes("SELECT * INTO v_row FROM public.ai_confirmation_pending WHERE confirmation_id=trim(p_confirmation_id) FOR UPDATE"));
  assert.ok(migration.includes("SET consumed_at=now() WHERE confirmation_id=v_row.confirmation_id"));
  assert.ok(migration.includes("UPDATE public.ai_confirmation_pending SET cancelled_at=now()"));
  assert.ok(migration.includes("p_resolved_rpc) !~ '^rpc_[a-z0-9_]+$'"));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.rpc_ai_confirmation_create'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.rpc_ai_confirmation_consume'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION public.rpc_ai_confirmation_cancel'));
  assert.ok(!migration.includes('GRANT SELECT ON TABLE public.ai_confirmation_pending'));
  assert.ok(!migration.includes('GRANT INSERT ON TABLE public.ai_confirmation_pending'));
  assert.ok(!migration.includes('service_role'));
});


test('teacher role save accepts the full canonical operational role set', () => {
  const migration = read('supabase/migrations/20261005133000_sync_teacher_role_validation.sql');
  const settings = read('js/15_settings.js');
  for (const role of ['teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin']) {
    assert.ok(migration.includes("'" + role + "'"), 'role missing from live-sync validation: ' + role);
    assert.ok(settings.includes(role), 'role missing from Teacher Manager UI: ' + role);
  }
  assert.ok(migration.includes("v_role text:=lower(trim(coalesce(p_role,'teacher'))"), 'role input must be normalized');
  assert.ok(migration.includes("'invalid_role'"), 'invalid role must still fail closed');
  assert.ok(migration.includes("'insufficient_role'"), 'admin/super-admin escalation boundary must remain');
  assert.ok(migration.includes('teacher_email=v_email'), 'teacher email mirror must remain synchronized');
});


test('teacher creation accepts the full canonical role set and preserves escalation guards', () => {
  const migration = read('supabase/migrations/20261005143000_sync_teacher_create_role_validation.sql');
  const roles = ['teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin'];
  for (const role of roles) assert.ok(migration.includes("'" + role + "'"), 'role missing from teacher-create validation: ' + role);
  assert.ok(migration.includes("v_role text:=lower(trim(coalesce(p_role,'teacher'))"), 'create role input must be normalized');
  assert.ok(migration.includes("'invalid_role'"), 'invalid create role must fail closed');
  assert.ok(migration.includes("'insufficient_role'"), 'create Admin/Super Admin escalation boundary must remain');
  assert.ok(migration.includes('v_role,v_email'), 'normalized role must be persisted');
  assert.ok(migration.includes('revoke execute on function public.rpc_admin_create_teacher_v2'), 'create RPC execute boundary must be explicit');
});


test('teacher role validation stays synchronized across create, update and invite flows', () => {
  const migration = read('supabase/migrations/20261005152000_sync_teacher_role_validation_all_flows.sql');
  const roles = ['teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin'];
  for (const role of roles) assert.ok(migration.includes("'" + role + "'"), 'role missing from unified validation: ' + role);
  assert.ok((migration.match(/v_role text:=lower\(trim\(coalesce\(p_role,'teacher'\)\)\)/g) || []).length >= 3);
  assert.equal((migration.match(/'invalid_role'/g) || []).length, 3);
  assert.ok((migration.match(/'insufficient_role'/g) || []).length >= 3, 'each active flow must retain an escalation guard');
  assert.ok(migration.includes('rpc_admin_create_teacher_v2'));
  assert.ok(migration.includes('rpc_admin_update_teacher_profile'));
  assert.ok(migration.includes('rpc_admin_create_invite'));
  assert.match(migration, /revoke execute on function public\.rpc_admin_create_invite/i);
  assert.ok(migration.includes('t.role in (\'admin\',\'super_admin\')'));
  assert.ok((migration.match(/v_admin\.(?:admin_role|teacher_role)<>['"]super_admin['"]\s+AND\s+v_role\s+IN\s*\(['"]admin['"]\s*,\s*['"]super_admin['"]\)/gi) || []).length >= 3);
  assert.ok(migration.includes("v_admin.admin_role<>'super_admin' AND v_target_role='super_admin'"));
});


test('web bootstrap restores effective role permissions and assignments', () => {
  const migration = read('supabase/migrations/20261006122628_sync_web_bootstrap_teacher_permissions.sql');
  for (const token of [
    'role_permissions',
    'teacher_permissions',
    'permission_definitions',
    "'permissions', v_permissions",
    "'assigned_classes', v_assigned_classes",
    "'assigned_subjects', v_assigned_subjects"
  ]) assert.ok(migration.includes(token), 'web bootstrap permission contract missing: ' + token);
  assert.ok(migration.includes('when go.allowed is not null then go.allowed'), 'global override precedence must be explicit');
  assert.ok(migration.includes('scope_type <> \'global\''), 'scoped teacher permissions must be considered');
  assert.ok(migration.includes("t.status = 'active'"), 'bootstrap must remain active-teacher gated');
  assert.ok(migration.includes('s.school_id = t.school_id'), 'bootstrap must remain tenant-bound');
});

test('web bootstrap assignments propagate into APP context', () => {
  const app = read('js/14_app.js');
  const assignmentTokens = [
    "assigned_classes: Array.isArray(webData.assigned_classes) ? webData.assigned_classes : []",
    "assigned_subjects: Array.isArray(webData.assigned_subjects) ? webData.assigned_subjects : []",
    "window.APP.assigned_classes = Array.isArray(u.assigned_classes) ? u.assigned_classes : [];",
    "window.APP.assigned_subjects = Array.isArray(u.assigned_subjects) ? u.assigned_subjects : [];"
  ];
  for (const token of assignmentTokens) {
    assert.ok(app.includes(token), 'web bootstrap assignment propagation missing: ' + token);
  }
});

test('role-gated navigation covers canonical permission-backed modules', () => {
  const app = read('js/14_app.js');
  const sidebar = read('js/17_sidebar.js');
  for (const token of [
    "attend: 'attendance.view'",
    "daily: 'daily_report.edit'",
    "hw: 'homework.view'",
    "grades: 'assessment.view'",
    "billing: 'billing.view'",
    "admissions: 'admissions.view'",
    "library: 'library.view'",
    "transport: 'transport.view'",
    "leave: 'leave.view'"
  ]) {
    assert.ok(app.includes(token), 'page permission mapping missing: ' + token);
    assert.ok(sidebar.includes(token), 'sidebar permission mapping missing: ' + token);
  }
  assert.ok(app.includes("A.permissions.includes('daily_report.edit') || A.permissions.includes('daily_report.delete')"), 'daily page access must use a valid daily-report permission');
  assert.ok(sidebar.includes("A.permissions.includes('daily_report.edit') || A.permissions.includes('daily_report.delete')"), 'daily sidebar access must use a valid daily-report permission');
});

test('Manage Teacher uses a single modal instance after edit', () => {
  const settings = read('js/15_settings.js');
  assert.ok(settings.includes("document.querySelector('#modalOverlay .teacher-manager-sheet')"), 'Manager must detect an existing modal instance');
  assert.ok(settings.includes('async function _refreshTeacherManagerList()'), 'Manager must refresh the existing list instead of reopening a second card');
  assert.ok(settings.includes("closeModal(() => {\n      showToast(t('toast.updated'));\n      _refreshTeacherManagerList();\n    });"), 'Edit Teacher save must refresh the existing Manager after the edit modal closes');
  assert.ok(!settings.includes("closeModal(() => { showToast(t('toast.updated')); openTeacherManager(); });"), 'Edit Teacher save must not reopen a second Manager modal');
  assert.ok(!settings.includes("closeModal(); setTimeout(() => openTeacherManager(), 190)"), 'stale timeout reopen race must be removed');
});


test('canonical role matrix keeps representative module access consistent', () => {
  const roles = ['teacher','assistant_teacher','senior_teacher','school_coordinator','administrative_assistant','admin','super_admin'];
  const migration = read('supabase/migrations/20261006122628_sync_web_bootstrap_teacher_permissions.sql');
  const app = read('js/14_app.js');
  const sidebar = read('js/17_sidebar.js');

  assert.equal(roles.length, 7, 'canonical operational role count must remain seven');
  for (const role of roles) {
    assert.ok(migration.includes("role_permissions"), role + ' must resolve through role_permissions');
  }

  for (const token of [
    "attend: 'attendance.view'",
    "daily: 'daily_report.edit'",
    "hw: 'homework.view'",
    "grades: 'assessment.view'",
    "billing: 'billing.view'",
    "library: 'library.view'",
    "transport: 'transport.view'",
    "leave: 'leave.view'"
  ]) {
    assert.ok(app.includes(token), 'app mapping missing: ' + token);
    assert.ok(sidebar.includes(token), 'sidebar mapping missing: ' + token);
  }

  const rolePermissions = read('supabase/migrations/20261006122628_sync_web_bootstrap_teacher_permissions.sql');
  assert.ok(rolePermissions.includes('left join public.role_permissions rp'), 'bootstrap must join role permissions');
  assert.ok(rolePermissions.includes('left join lateral'), 'bootstrap must evaluate teacher overrides');
  assert.ok(rolePermissions.includes('go.allowed is not null'), 'global teacher override must take precedence');
  const daily = read('supabase/migrations/20261003110000_daily_report_secure_rpc.sql');
  assert.ok(daily.includes('daily_report.edit') && daily.includes('daily_report.delete'), 'daily report backend must retain both permission boundaries');
});

test('view permissions do not imply mutation permissions in the navigation contract', () => {
  const app = read('js/14_app.js');
  const sidebar = read('js/17_sidebar.js');

  assert.ok(app.includes("attend: 'attendance.view'"));
  assert.ok(sidebar.includes("attend: 'attendance.view'"));
  assert.ok(app.includes("billing: 'billing.view'"));
  assert.ok(sidebar.includes("billing: 'billing.view'"));

  const fabSource = app.slice(app.indexOf('const FAB_PERMISSION'), app.indexOf('function _updateFabForPage'));
  assert.ok(fabSource.includes("billing: ['billing.write', 'billing.class.write']"),
    'billing actions must require a billing mutation permission');
});

test('administrative assistant keeps attendance view/edit distinction', () => {
  const migration = read('supabase/migrations/20261006122628_sync_web_bootstrap_teacher_permissions.sql');
  assert.ok(migration.includes('role_permissions'), 'bootstrap must use canonical role permissions');

  const settings = read('js/15_settings.js');
  assert.ok(settings.includes('administrative_assistant'), 'role must remain selectable in Teacher Manager');

  const access = read('js/29_teacher_access.js');
  assert.ok(access.includes('attendance.view'), 'attendance view permission must remain defined');
  assert.ok(access.includes('attendance.edit'), 'attendance edit permission must remain defined');
});


test('action FABs require mutation permissions', () => {
  const app = read('js/14_app.js');
  const expected = [
    "students: ['students.edit']",
    "daily: ['daily_report.edit', 'daily_report.delete']",
    "hw: ['homework.create', 'homework.edit']",
    "grades: ['assessment.create', 'assessment.edit']",
    "billing: ['billing.write', 'billing.class.write']",
    "admissions: ['admissions.manage']",
    "library: ['library.manage']",
    "transport: ['transport.manage']"
  ];
  for (const token of expected) assert.ok(app.includes(token), 'FAB mutation gate missing: ' + token);
  assert.ok(app.includes('FAB_PERMISSION'), 'FAB permission contract must exist');
  assert.ok(app.includes('required.some((p) => perms.includes(p))'), 'FAB must require an effective permission');
  assert.ok(app.includes("timetable: null"), 'unsupported timetable mutation must not be inferred as a teacher permission');
});
