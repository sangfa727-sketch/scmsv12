const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8'); // theme-control regression contract

test('teacher ID card foundation stays protected', () => {
  const settings = read('js/15_settings.js');
  const css = read('style.css');
  const access = read('js/29_teacher_access.js');
  const html = read('index.html');
  assert.match(settings, /rpc_admin_create_teacher_card/);
  assert.match(settings, /openTeacherCardModal\(id, name, login\)/);
  assert.match(settings, /openTeacherCardModal/);
  assert.match(settings, /openTeacherEditModal/);
  assert.match(settings, /saveTeacherEdit/);
  assert.match(settings, /rpc_admin_update_teacher_profile/);
  assert.match(settings, /teacher-edit-btn/);
  assert.match(settings, /printTeacherCard/);
  assert.match(settings, /setTimeout\(\(\) => openTeacherCardModal\(id, name, login\), 280\)/);
  assert.match(access, /teacher-modal-preparing/);
  assert.match(access, /teacher-modal-ready/);
  assert.match(settings, /result\.login_name \|\| teacherLoginName/);
  assert.match(settings, /Teacher ID/);
  assert.match(settings, /teacher-id-card-avatar-fallback/);
  assert.match(settings, /teacher-id-card-vertical/);
  assert.match(settings, /tm\.cardPurpose/);
  assert.match(settings, /teacherManagerCacheFresh/);
  assert.match(settings, /_prefetchTeacherManagerList/);
  assert.match(settings, /toggleTeacherCardHelp/);
  assert.match(settings, /teacher-id-card-help-popover/);
  assert.match(settings, /result\.photo_url/);
  assert.match(settings, /teacherProfile\?\.photo_url/);
  assert.match(settings, /_renderTeacherCardQrLegacy/);
  assert.doesNotMatch(settings, /<span>SCMS<\\\/span>/);
  assert.match(css, /\.teacher-id-card/);
  assert.match(css, /\.teacher-id-card-vertical/);
  assert.match(css, /printing-teacher-card/);
  assert.ok(html.includes('qrcode@1.5.4'));
  assert.ok(html.includes('qrcodejs/1.0.0'));
  assert.match(html, /29_teacher_access\.js\?v=20261007b/);
  assert.match(html, /15_settings\.js\?v=20261007b/);
  assert.match(html, /style\.css\?v=20261009e/);
});


test('dashboard summary cards and incident entry points stay protected', () => {
  const dashboard = read('js/27_dashboard.js');
  const css = read('dashboard.css');
  const html = read('index.html');
  assert.match(dashboard, /dashboard-link-card/);
  assert.match(dashboard, /window\.goToPage\('attend'\)/);
  assert.match(dashboard, /window\.goToPage\('hw'\)/);
  assert.match(dashboard, /window\.goToPage\('incidents'\)/);
  assert.match(dashboard, /window\.goToPage\('parents'\)/);
  assert.match(dashboard, /_dashboardOpenIncidentStudent/);
  assert.match(dashboard, /_dashboardOpenStudent/);
  assert.match(dashboard, /dashboard-class-card/);
  assert.match(dashboard, /dashboard-missing-attendance-card/);
  assert.match(dashboard, /dashboard-homework-card/);
  assert.match(dashboard, /dashboard-attention-card/);
  assert.match(dashboard, /window\.goToPage\('students'\)/);
  assert.match(dashboard, /window\.goToPage\('hw'\)/);
  assert.match(dashboard, /_dashboardGoToAttendance\(this\.dataset\.class\)/);
  assert.match(dashboard, /data-student-id=/);
  assert.match(css, /\[data-theme="dark"\] #page-dashboard \.dashboard-link-card\.stat-card/);
  assert.match(css, /dashboard-link-card/);
  assert.ok(html.includes('dashboard.css?v=20261001j'));
});


test('dashboard quick action buttons keep native button semantics', () => {
  const dashboard = read('js/27_dashboard.js');
  for (const token of [
    '<button type="button" onclick="window.goToPage(\'attend\')">',
    '<button type="button" onclick="window.goToPage(\'hw\')">',
    '<button type="button" onclick="window.goToPage(\'parents\')">',
    '<button type="button" onclick="window.goToPage(\'incidents\')">',
  ]) {
    assert.ok(dashboard.includes(token), 'missing dashboard action button contract: ' + token);
  }
});


test('dashboard notifications and keyboard interaction stay protected', () => {
  const dashboard = read('js/27_dashboard.js');
  const css = read('dashboard.css');
  const html = read('index.html');
  assert.match(dashboard, /refreshDashboardNotifications/);
  assert.match(dashboard, /_renderDashboardNotificationBell/);
  assert.match(dashboard, /dashboard-notification-btn/);
  assert.match(dashboard, /dashboard-notification-badge/);
  assert.match(dashboard, /aria-label="\$\{t\('dash\.notifications'\)\}"/);
  assert.match(dashboard, /aria-expanded="false"/);
  assert.match(dashboard, /aria-controls="dashboardNotificationMenu"/);
  assert.match(dashboard, /id="dashboardNotificationMenu"/);
  assert.match(dashboard, /closeDashboardNotifications/);
  assert.match(dashboard, /event\.key !== 'Escape'/);
  assert.match(dashboard, /\['Enter', ' '\]\.includes\(event\.key\)/);
  assert.match(dashboard, /closest\?\.\('\.dashboard-link-card\[role="button"\]\[tabindex="0"\]'\)/);
  assert.match(dashboard, /event\.preventDefault\(\)/);
  assert.match(dashboard, /card\.click\(\)/);
  assert.match(dashboard, /pointerdown/);
  assert.match(dashboard, /dash\.noNewNotifications/);
  assert.match(dashboard, /role="button"/);
  assert.match(dashboard, /tabindex="0"/);
  assert.match(css, /dashboard-link-card:focus-visible/);
  assert.match(css, /dashboard-notification-wrap/);
  assert.match(css, /dashboard-notification-btn/);
  assert.match(css, /dashboard-notification-menu/);
  assert.match(css, /dashboard-notification-badge/);
  assert.match(css, /dashboard-notification-item:focus-visible/);
  assert.ok(html.includes('dashboard.css?v=20261001j'));
  assert.match(html, /27_dashboard\.js\?v=20261001i/);
});


test('app bootstrap runs after FAB page registries initialize', () => {
  const app = read('js/14_app.js');
  const fabRegistry = app.indexOf('const FAB_PAGES = {');
  const autoRun = app.lastIndexOf('\ninitApp();');
  assert.ok(fabRegistry >= 0, 'FAB_PAGES registry must exist');
  assert.ok(autoRun > fabRegistry, 'initial app bootstrap must run after FAB_PAGES initialization');
  assert.match(app, /function _updateFabForPage\(pageId\)[\s\S]*?const conf = FAB_PAGES\[pageId\]/);
});

test('language changes repaint active dynamic UI', () => {
  const app = read('js/14_app.js');
  assert.match(app, /_i18nPageRefreshBound/);
  assert.match(app, /addEventListener\('languageChanged'/);
  for (const token of [
    'dashboard: window.renderDashboard',
    'students: window.renderStudents',
    'attend: window.renderAttendance',
    'parents: window.renderComms',
    'incidents: window.renderIncidents',
    'leave: window.renderLeaveRequests',
    'more: window.renderMore'
  ]) assert.ok(app.includes(token), 'missing language refresh renderer: ' + token);
  assert.match(app, /window\.renderSidebar/);
  assert.match(app, /window\._updateFabForPage/);
});


test('dashboard-to-detail context handoff remains wired', () => {
  const dashboard = read('js/27_dashboard.js');
  const app = read('js/14_app.js');
  const students = read('js/04_students.js');
  const homework = read('js/07_homework.js');
  const incidents = read('js/09_incidents.js');
  const css = read('dashboard.css');

  for (const token of ['_dashboardSetContext', "type: 'attendance'", "type: 'student'", "type: 'homework'", "type: 'incident'", '_dashboardOpenHomework']) {
    assert.ok(dashboard.includes(token), 'missing dashboard context token: ' + token);
  }
  for (const token of ['_applyDashboardContext', 'dashboard-context-highlight', 'clearDashboardContext']) {
    assert.ok(app.includes(token), 'missing destination context token: ' + token);
  }
  assert.ok(app.includes("_applyDashboardContext(pageId);"));
  assert.ok(app.includes("window.requestAnimationFrame(retryDashboardContext);"));
  assert.ok(app.includes("window._dashboardContextInteractionBound"));
  assert.ok(app.includes("event.isTrusted"));
  assert.ok(app.includes("dismissDashboardContextOnInteraction"));
  assert.ok(app.includes("window.addEventListener('pointerdown', dismissDashboardContextOnInteraction, true)"));
  assert.ok(app.includes("window.addEventListener('click', dismissDashboardContextOnInteraction, true)"));
  assert.ok(app.includes('dashboardContextPages'));
  assert.ok(app.includes('dashboardContextPages[pageId] !== window.APP.dashboardContext.type'));
  assert.ok(app.includes('sidebar/tab'));
  assert.doesNotMatch(app, /const page = event\.target\?\.closest\?\.\('\.page\.active'\)/);
  assert.ok(students.includes('data-student-id="${esc(s.student_id)}"'));
  assert.ok(homework.includes('data-hw-id="${esc(h.id)}"'));
  assert.ok(incidents.includes('data-incident-id="${esc(i.id)}"'));
  assert.ok(css.includes('.dashboard-context-highlight'));
  assert.doesNotMatch(app, /dashboard-context-banner/);
  assert.ok(app.includes('dashboard-context-fade'));
  assert.ok(app.includes("el.classList.add('dashboard-context-fade')"));
  assert.ok(!app.includes("scrollIntoView({ behavior: 'smooth', block: 'center' })"));
  assert.ok(!css.includes('dashboard-context-banner'));
});

test('dashboard scope controls stay localized and functional', () => {
  const dashboard = read('js/27_dashboard.js');
  const en = read('js/00a_locales_en.js');
  const my = read('js/00b_locales_my.js');
  assert.match(dashboard, /_dashboardMyClassSet/);
  assert.match(dashboard, /scopedAttendance/);
  assert.match(dashboard, /scopedHomework/);
  assert.match(dashboard, /scopedIncidents/);
  assert.match(dashboard, /aria-pressed/);
  assert.match(dashboard, /dash\.wholeSchool/);
  assert.match(dashboard, /dash\.myClassesOnly/);
  assert.match(en, /'dash\.wholeSchool': 'Whole school'/);
  assert.match(my, /'dash\.wholeSchool': 'ကျောင်းတစ်ကျောင်းလုံး'/);
});


test('teacher access localization covers all supported UI languages', () => {
  const access = read('js/29_teacher_access.js');
  assert.ok(access.includes("['en','my','th','jp','zh','km','ms']"));
  for (const token of ['ms: {', 'zh: {', "ms:{'dashboard.view'", 'ms:{dashboard:', 'ms:{class_teacher:']) {
    assert.ok(access.includes(token), `missing teacher access locale map: ${token}`);
  }
  assert.ok(access.includes("ms:{'dashboard.view'"));
});

test('password prompt remains fully localized', () => {
  const app = read('js/14_app.js');
  for (const key of ['password.newLabel', 'password.newPlaceholder', 'password.show', 'password.reset']) {
    assert.ok(app.includes(`t('${key}')`), `missing localized password key: ${key}`);
  }
  assert.doesNotMatch(app, /Password အသစ်/);
  assert.doesNotMatch(app, /အနည်းဆုံး ၆ လုံး/);
  assert.doesNotMatch(app, /Password ပြန်သတ်မှတ်မည်/);
});

test('all supported locales keep the English translation key contract', () => {
  const localeFiles = [
    'js/00a_locales_en.js',
    'js/00b_locales_my.js',
    'js/00_locales_jp.js',
    'js/00_locales_thai.js',
    'js/00d_locales_ms.js',
    'js/00e_locales_km.js',
    'js/00e_locales_zh.js',
  ];
  const parseLocale = (source) => {
    const entries = new Map();
    const re = /(['"])([^\\]*?)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3/g;
    let match;
    while ((match = re.exec(source))) entries.set(match[2], match[4]);
    return entries;
  };
  const english = parseLocale(read(localeFiles[0]));
  assert.ok(english.size >= 1408, 'English locale key count unexpectedly regressed');
  for (const file of localeFiles.slice(1)) {
    const source = read(file);
    const rawKeys = [...source.matchAll(/(['"])([^\\]*?)\1\s*:/g)].map(m => m[2]);
    const uniqueKeys = new Set(rawKeys);
    assert.equal(rawKeys.length, uniqueKeys.size, file + ' contains duplicate locale keys');
    const locale = parseLocale(source);
    assert.equal(locale.size, english.size, file + ' locale key count differs from English');
    for (const key of english.keys()) {
      assert.ok(locale.has(key), file + ' is missing locale key: ' + key);
      const placeholders = (value) => [...value.matchAll(/\{[a-zA-Z0-9_]+\}/g)].map(m => m[0]).sort().join('|');
      const htmlTags = (value) => [...value.matchAll(/<\/?[a-zA-Z][^>]*>/g)].map(m => m[0]).sort().join('|');
      assert.equal(placeholders(locale.get(key)), placeholders(english.get(key)), file + ' placeholder mismatch: ' + key);
      assert.equal(htmlTags(locale.get(key)), htmlTags(english.get(key)), file + ' HTML tag mismatch: ' + key);
    }
  }
});


test('parent portal event form stays fully localized', () => {
  const comms = read('js/08_comms.js');
  for (const key of [
    'comms.portalEventType', 'comms.portalEventMeeting', 'comms.portalEventAnnouncement',
    'comms.portalEventSchool', 'comms.portalEventHoliday', 'comms.portalTitle', 'comms.portalClass',
    'comms.portalWholeSchool', 'comms.portalStart', 'comms.portalEnd', 'comms.portalOptional',
    'comms.portalDescription', 'comms.portalPublish', 'comms.portalCancel'
  ]) {
    assert.ok(comms.includes("t('" + key + "')"), 'missing localized parent portal key: ' + key);
  }
  assert.doesNotMatch(comms, /Event type/);
  assert.doesNotMatch(comms, /Parent meeting/);
  assert.doesNotMatch(comms, /School event/);
  assert.doesNotMatch(comms, /Publish to Parent Portal/);
});


test('dashboard summary caches refresh after attendance and homework mutations', () => {
  const dashboard = read('js/27_dashboard.js');
  const attendance = read('js/05_attendance.js');
  const homework = read('js/07_homework.js');
  assert.match(dashboard, /refreshDashboardAttendance/);
  assert.match(dashboard, /API\.getAttendance\(14\)/);
  assert.match(dashboard, /refreshDashboardHomework/);
  assert.match(dashboard, /API\.getHomework\(14\)/);
  assert.match(attendance, /refreshDashboardAttendance/);
  assert.match(homework, /refreshDashboardHomework/);
});

test('notification state stays synchronized after parent communication and leave mutations', () => {
  const dashboard = read('js/27_dashboard.js');
  const comms = read('js/08_comms.js');
  const leave = read('js/28_leave_requests.js');
  assert.match(dashboard, /API\.getLeaveRequests\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(dashboard, /API\.getParentComms\(14\)\.catch\(\(\) => \[\]\)/);
  assert.match(dashboard, /_syncDashboardLeaveCount\(safeLeaveRequests\)/);
  assert.match(dashboard, /_renderDashboardNotificationBell\(leavePending, queuedComms\.length\)/);
  assert.match(comms, /refreshDashboardNotifications/);
  assert.match(comms, /API\.sendParentComm/);
  assert.match(comms, /API\.deleteParentComm/);
  assert.match(leave, /API\.decideLeaveRequest/);
  assert.match(leave, /await window\.refreshDashboardNotifications\(\)/);
});

test('i18n registration and language switching stay complete', () => {
  const i18n = read('js/00c_i18n.js');
  for (const code of ['en', 'my', 'th', 'jp', 'ms', 'km', 'zh']) {
    assert.match(i18n, new RegExp("code: ['\\\"]" + code + "['\\\"]"));
  }
  assert.match(i18n, /storageKey: 'scms_lang'/);
  assert.match(i18n, /document\.documentElement\.lang = this\.current/);
  assert.match(i18n, /window\.dispatchEvent\(new CustomEvent\('languageChanged'/);
  assert.match(i18n, /LANGUAGE_ALIASES/);
});


test('student detail actions and parent contact labels stay localized', () => {
  const students = read('js/04_students.js');
  for (const key of [
    'students.history.action','students.parent.action','students.reactivate','students.classAndGrade',
    'idCard.qrUnavailable','students.parentGuardianName','students.phone','students.phone2','students.email',
    'students.linked','students.sendParentLink','students.saveParentDetails'
  ]) assert.ok(students.includes("t('" + key + "')"), 'missing localized student detail key: ' + key);
  assert.doesNotMatch(students, />History<\/button>/);
  assert.doesNotMatch(students, />Parent<\/button>/);
  assert.doesNotMatch(students, />Reactivate<\/button>/);
  assert.doesNotMatch(students, /aria-label="Class and grade"/);
  assert.doesNotMatch(students, />QR unavailable<\/span>/);
  assert.doesNotMatch(students, />Send parent link<\/button>/);
  assert.doesNotMatch(students, />Save parent details<\/button>/);
});


test('theme controller keeps theme state isolated and extensible', () => {
  const theme = read('js/30_theme.js');
  const css = read('style.css');
  assert.match(theme, /const KEY = 'scms_theme'/);
  assert.match(theme, /const THEMES = new Set\(\['light', 'dark'\]\)/);
  assert.match(theme, /function normalize\(value\)/);
  assert.match(theme, /normalize\(scheme\)/);
  assert.match(theme, /document\.documentElement\.setAttribute\('data-theme', value\)/);
  assert.match(theme, /document\.documentElement\.style\.colorScheme = value/);
  assert.match(theme, /window\.dispatchEvent\(new CustomEvent\('themeChanged'/);
  assert.match(theme, /syncExternal\(scheme\)/);
  assert.match(theme, /hasUserPreference/);
  assert.match(css, /\[data-theme="dark"\]/);
});

test('theme controls stay wired to the shared theme controller', () => {
  const more = read('js/12_more.js');
  const settings = read('js/15_settings.js');
  const theme = read('js/30_theme.js');

  assert.match(more, /window\.SCMSTheme\?\.current\?\.\(\)/);
  assert.match(more, /SCMSTheme\.set\('light'\)/);
  assert.match(more, /SCMSTheme\.set\('dark'\)/);
  assert.match(more, /window\.refreshMoreThemeControl/);

  assert.match(settings, /SCMSTheme\.set\('light'\)/);
  assert.match(settings, /SCMSTheme\.set\('dark'\)/);
  assert.match(settings, /window\.refreshSettingsThemeControl/);
  assert.match(settings, /settings-theme-option/);

  assert.match(theme, /window\.dispatchEvent\(new CustomEvent\('themeChanged'/);
  assert.match(theme, /localStorage\.setItem\(KEY, value\)/);
});

test('dashboard notification labels remain localized across supported locales', () => {
  const localeFiles = [
    'js/00a_locales_en.js', 'js/00b_locales_my.js', 'js/00_locales_jp.js',
    'js/00_locales_thai.js', 'js/00d_locales_ms.js', 'js/00e_locales_km.js', 'js/00e_locales_zh.js'
  ];
  const dashboard = read('js/27_dashboard.js');
  for (const key of [
    'dash.notifications', 'dash.newCount', 'dash.leavePendingOne', 'dash.leavePendingMany',
    'dash.leaveReview', 'dash.messageNotDeliveredOne', 'dash.messageNotDeliveredMany',
    'dash.bannerText', 'dash.noNewNotifications'
  ]) {
    assert.match(dashboard, new RegExp(key.replace('.', '\\.') + '\\s*[\'\"]'), 'dashboard missing notification key: ' + key);
    for (const file of localeFiles) {
      assert.match(read(file), new RegExp("['\\\"]" + key.replace('.', '\\.') + "['\\\"]\\s*:"), file + ' missing ' + key);
    }
  }
});


test('dashboard notification locale placeholders stay consistent', () => {
  const localeFiles = [
    'js/00a_locales_en.js', 'js/00b_locales_my.js', 'js/00_locales_jp.js',
    'js/00_locales_thai.js', 'js/00d_locales_ms.js', 'js/00e_locales_km.js', 'js/00e_locales_zh.js'
  ];
  const keys = [
    'dash.newCount', 'dash.leavePendingOne', 'dash.leavePendingMany',
    'dash.messageNotDeliveredOne', 'dash.messageNotDeliveredMany'
  ];
  const placeholders = (value) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]).sort();
  const valueFor = (source, key) => {
    const match = source.match(new RegExp("['\\\"]" + key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + "['\\\"]\\s*:\\s*([^,\\n]+)"));
    assert.ok(match, 'missing notification locale value: ' + key);
    return match[1];
  };
  const baseline = Object.fromEntries(keys.map(key => [key, placeholders(valueFor(read(localeFiles[0]), key))]));
  for (const file of localeFiles.slice(1)) {
    for (const key of keys) {
      assert.deepEqual(placeholders(valueFor(read(file), key)), baseline[key], file + ' placeholder mismatch for ' + key);
    }
  }
});


test('notification data flow keeps API transport contracts aligned', () => {
  const api = read('js/02E_api_academics.js');
  const commsApi = read('js/02H_api_communication.js');
  const dashboard = read('js/27_dashboard.js');
  const comms = read('js/08_comms.js');
  const leave = read('js/28_leave_requests.js');

  assert.match(api, /async getLeaveRequests\(status = null\)/);
  assert.match(api, /rpc_get_leave_requests/);
  assert.match(api, /p_status: status/);
  assert.match(api, /twaPost\('get_leave_requests', \{ status \}\)/);
  assert.match(api, /async decideLeaveRequest\(id, decision, teacherNote = null\)/);
  assert.match(api, /rpc_decide_leave_request/);
  assert.match(api, /p_decision: decision/);
  assert.match(api, /twaPost\('decide_leave_request'/);

  assert.match(commsApi, /async sendParentComm\(data\)/);
  assert.match(commsApi, /rpc_send_parent_comm/);
  assert.match(commsApi, /twaPost\('send_parent_comm'/);
  assert.match(commsApi, /async deleteParentComm\(id\)/);
  assert.match(commsApi, /rpc_delete_parent_comm/);
  assert.match(commsApi, /twaPost\('delete_parent_comm'/);
  assert.match(commsApi, /async getParentComms\(daysBack = 30\)/);
  assert.match(commsApi, /rpc_get_parent_comms/);
  assert.match(commsApi, /p_days_back: daysBack/);
  assert.match(commsApi, /twaPost\('get_parent_comms'/);

  assert.match(dashboard, /API\.getLeaveRequests\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(dashboard, /API\.getParentComms\(14\)\.catch\(\(\) => \[\]\)/);
  assert.match(comms, /await API\.sendParentComm/);
  assert.match(comms, /API\.deleteParentComm/);
  assert.match(leave, /await API\.decideLeaveRequest/);
  assert.match(leave, /await renderLeaveRequests\(\)/);
  assert.match(leave, /await window\.refreshDashboardNotifications\(\)/);
});


test('communication and leave filters preserve accessible selected state', () => {
  const comms = read('js/08_comms.js');
  const leave = read('js/28_leave_requests.js');
  assert.match(comms, /data-value="class" aria-pressed="true"/);
  assert.match(comms, /data-value="student" aria-pressed="false"/);
  assert.match(comms, /setAttribute\('aria-pressed', active \? 'true' : 'false'\)/);
  assert.match(leave, /id="leaveFilterChips" role="group"/);
  assert.match(leave, /data-filter="\$\{s\}" aria-pressed="\$\{_leaveRequestFilter === s \? 'true' : 'false'\}"/);
});

test('filter controls preserve native button semantics and selected state', () => {
  const files = [
    ['js/04_students.js', /<button type="button" class="chip' \+ \(value === _stuStatus/, /aria-pressed="/],
    ['js/06_daily.js', /<button type="button" class="chip\$\{c === _dailyClass/, /aria-pressed="\$\{c === _dailyClass/],
    ['js/07_homework.js', /<button type="button" class="chip\$\{c === _hwClass/, /aria-pressed="\$\{c === _hwClass/],
    ['js/08_comms.js', /<button type="button" class="chip\$\{ty === _commsType/, /aria-pressed="\$\{ty === _commsType/],
    ['js/09_incidents.js', /<button type="button" class="chip\$\{ty === _incidentType/, /aria-pressed="\$\{ty === _incidentType/],
    ['js/11_summary.js', /<button type="button" class="chip\$\{c === _sumClass/, /aria-pressed="\$\{c === _sumClass/],
    ['js/20_grades.js', /<button type="button" class="chip\$\{c === _gradesClass/, /aria-pressed="\$\{c === _gradesClass/],
    ['js/21_billing.js', /<button type="button" class="chip\$\{c === _billingClass/, /<button type="button" class="chip\$\{s === _billingStatus/],
    ['js/22_admissions.js', /<button type="button" class="chip\$\{c === _admClass/, /<button type="button" class="chip\$\{s === _admStatus/],
  ];
  for (const [path, first, second] of files) {
    const source = read(path);
    assert.match(source, first);
    assert.match(source, second);
  }
});
test('sidebar navigation preserves active and native button accessibility state', () => {
  const sidebar = read('js/17_sidebar.js');
  assert.ok(sidebar.includes('<button type="button" class="sidebar-item ${window.APP.currentPage === it.id ? \'active\' : \'\'}"'));
  assert.ok(sidebar.includes('data-page="${esc(it.id)}" aria-current="${window.APP.currentPage === it.id ? \'page\' : \'false\'}"'));
  assert.ok(sidebar.includes('sidebar-badge" aria-label="${badgeCount}"'));
  assert.ok(sidebar.includes('<button type="button" class="sidebar-item" onclick="sidebarGo(\'more\')">'));
  assert.ok(sidebar.includes('<button type="button" class="sidebar-item sidebar-signout"'));
});

test('dashboard load failure stays on a localized error key', () => {
  const dashboard = read('js/27_dashboard.js');
  const en = read('js/00a_locales_en.js');
  assert.match(dashboard, /emptyState\('⚠️', t\('dash\.loadFailed'\),/);
  assert.match(en, /['\"]dash\.loadFailed['\"]\s*:/);
  assert.doesNotMatch(dashboard, /t\\('dash\\.loadError'\\)/);
});


test('teacher QR login requires a short-lived one-time challenge', () => {
  const landing = read('js/00_landing.js');
  const migration = read('supabase/migrations/20261003003000_teacher_email_bound_auth.sql');
  const html = read('index.html');

  assert.match(landing, /_teacherCardLoginContext = \{ challengeId: result\.challenge_id \}/);
  assert.match(landing, /p_challenge: ctx\.challengeId/);
  assert.doesNotMatch(landing, /p_teacher_id: ctx\.teacherId/);

  assert.match(migration, /create table if not exists public\.teacher_card_login_challenges/);
  assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '2 minutes'\)/);
  assert.match(migration, /consumed_at timestamptz/);
  assert.match(migration, /extensions\.digest\(trim\(p_challenge\), 'sha256'\)/);
  assert.match(migration, /consumed_at = now\(\)/);
  assert.match(migration, /where challenge_id = v_challenge\.challenge_id/);
  assert.match(migration, /'challenge_id', raw_challenge/);
  assert.match(migration, /'error', 'invalid_challenge'/);

  assert.ok(html.includes('js/00_landing.js?v=20261006a'));
});

test('official announcement stays disabled while recipient verification is pending and explains missing grade assignments', () => {
  const chat = read('js/16_chat.js');
  const locales = read('js/00f_chat_locales.js');
  assert.match(chat, /_adminRecipientLoading = true/);
  assert.match(chat, /sendBtn\.disabled = !canSend/);
  assert.match(chat, /sendBtn\.classList\.toggle\('smart-chat-send-ready', canSend\)/);
  assert.match(chat, /adminMsgSendHint/);
  assert.match(chat, /t\('chat\.gradeRecipientsMissing'\)/);
  assert.match(locales, /chat\.gradeRecipientsMissing/);
});

test('announcement recipient feedback assets use refreshed cache keys', () => {
  const html = read('index.html');
  assert.match(html, /js\/00f_chat_locales\.js\?v=20261009f/);
  assert.match(html, /js\/16_chat\.js\?v=20261009f/);
});
