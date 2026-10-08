const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('admin UI actions are gated by the authenticated admin flag', () => {
  const settings = read('js/15_settings.js');
  const more = read('js/12_more.js');
  const students = read('js/04_students.js');
  assert.match(settings, /const isAdmin = !!(window.APP && window.APP.is_admin)/);
  assert.match(settings, /\$\{isAdmin \?/);
  assert.match(more, /const isAdmin = window.APP.is_admin/);
  assert.match(more, /if (!window.APP.is_admin)/);
  assert.match(students, /window.APP.is_admin/);
});

test('admin RPC calls carry a current web session token', () => {
  const source = read('js/15_settings.js');
  for (const fn of [
    'rpc_admin_list_teachers',
    'rpc_admin_create_invite',
    'rpc_admin_create_teacher',
    'rpc_admin_reset_teacher_password',
  ]) {
    const idx = source.indexOf(fn);
    assert.ok(idx >= 0, fn + ' missing');
    const block = source.slice(idx, idx + 1800);
    assert.match(block, /p_session_token/);
  }
});

test('logout clears both legacy and web sessions before reload', () => {
  const source = read('js/14_app.js');
  const idx = source.indexOf('window.signOut');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 1000);
  assert.match(block, /clearSavedSession/);
  assert.match(block, /clearWebSession/);
  assert.match(block, /window.location.reload/);
});

test('web login stores the server-issued session token and role metadata', () => {
  const source = read('js/19_google_auth.js');
  const idx = source.indexOf('function _completeLogin');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 1800);
  assert.match(block, /session_token: result.session_token/);
  assert.match(block, /school_id: result.school_id/);
  assert.match(block, /role: result.role/);
  assert.doesNotMatch(block, /password: result/);
});


test('session-bound backend contract is explicit for bootstrap and verification', () => {
  const source = read('js/02A_api_core.js');
  assert.match(source, /p_session_token/);
  const app = read('js/14_app.js');
  assert.match(app, /APPStore\.patch\('session'/);
  assert.match(app, /sessionToken:/);
});

test('admin role compatibility is explicit at the UI/backend boundary', () => {
  const settings = read('js/15_settings.js');
  const app = read('js/14_app.js');
  assert.match(settings, /window\.APP\.is_admin/);
  assert.match(app, /window\.APP\.is_admin/);
});


test('feature mutations do not send client tenant identity through web RPC', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).filter((name) => name.endsWith('.js') && /^0[3-9]|^1[0-8]|^2[0-9]/.test(name));
  const forbidden = /_webRpc\([^)]*[\\s\\S]{0,800}(?:p_school_id|p_teacher_id)\s*:/;
  for (const name of files) {
    const source = read(path.join('js', name));
    assert.doesNotMatch(source, forbidden, name + ' must derive tenant/actor context server-side');
  }
});

test('admin settings use the shared session-aware RPC path for teacher listing', () => {
  const source = read('js/15_settings.js');
  const idx = source.indexOf("rpc_admin_list_teachers");
  assert.ok(idx >= 0);
  const block = source.slice(idx - 120, idx + 500);
  assert.match(block, /_webRpc\(/);
  assert.match(block, /p_session_token/);
});


test('teacher web login accepts Teacher ID/Login Name with PIN and page navigation is permission-aware', () => {
  const landing = read('js/00_landing.js');
  const authMigration = read('supabase/migrations/20261005100000_teacher_role_login_page_access.sql');
  const app = read('js/14_app.js');
  const sidebar = read('js/17_sidebar.js');

  assert.match(landing, /webLoginIdentity/);
  assert.match(landing, /webLoginPin/);
  assert.match(landing, /p_login_name:\s+identity/);
  assert.match(landing, /p_pin:\s+pin/);

  assert.match(authMigration, /lower\(login_name\)\s*=\s*lower\(v_identity\)/);
  assert.match(authMigration, /lower\(teacher_id\)\s*=\s*lower\(v_identity\)/);
  assert.match(authMigration, /'permissions',\s*v_permissions/);

  for (const key of [
    'dashboard.view',
    'students.view',
    'attendance.view',
    'homework.view',
    'assessment.view',
    'billing.view',
    'admissions.view',
    'leave.view',
  ]) {
    assert.match(app, new RegExp(key.replace('.', '\\.'), 'g'));
  }

  assert.match(app, /function _pageAccessAllowed/);
  assert.match(app, /if \(!_pageAccessAllowed\(pageId\)\)/);
  assert.match(sidebar, /function _sidebarCanAccess/);
  assert.match(sidebar, /A\.platform !== 'web'/);
  assert.match(app, /A\.platform !== 'web'/);
  assert.match(sidebar, /\.filter\(it => _sidebarCanAccess\(it\.id\)\)/);
});


test('operational roles, scoped billing, and role-aware settings are explicit', () => {
  const settings = read('js/15_settings.js');
  const billing = read('js/21_billing.js');
  const picker = read('js/03b_student_picker.js');
  const index = read('index.html');
  const migration = read('supabase/migrations/20261005120000_role_access_billing_settings_hardening.sql');

  for (const role of ['assistant_teacher','senior_teacher','school_coordinator','administrative_assistant']) {
    assert.match(settings, new RegExp(role));
    assert.match(migration, new RegExp(role));
  }
  assert.match(settings, /settings\.myAccess/);
  assert.match(settings, /openMyAccessSettings/);
  assert.match(settings, /SCMS_OPERATIONAL_ROLES/);
  assert.match(migration, /billing\.fees\.manage/);
  assert.match(migration, /scope_type='class'/);
  assert.match(migration, /private\.web_has_permission\(p_session_token,'billing\.write'/);
  assert.match(billing, /_billingAllowedClasses/);
  assert.match(billing, /_billingCanWrite/);
  assert.match(billing, /_billingCanManageFees/);
  assert.match(billing, /classAllowlist/);
  assert.match(picker, /classAllowlist/);
  assert.match(index, /billingFeeItemsBtn/);
});


test('transport authorization is dedicated and class-scoped at the RPC boundary', () => {
  const migration = read('supabase/migrations/20261005150000_transport_permission_hardening.sql');
  const api = read('js/02J_api_transport.js');
  for (const key of ['transport.view','transport.edit','transport.manage']) assert.match(migration, new RegExp(key.replaceAll('.', '\\\\.')));
  for (const fn of ['rpc_get_routes','rpc_add_route','rpc_update_route','rpc_delete_route','rpc_get_route_detail','rpc_assign_student_transport','rpc_get_student_transport','rpc_remove_student_transport']) {
    const idx = migration.indexOf('function public.' + fn);
    assert.ok(idx >= 0, fn + ' missing');
  }
  assert.match(migration, /rpc_add_route[\\s\\S]{0,5000}transport\\.manage/);
  assert.match(migration, /rpc_update_route[\\s\\S]{0,5000}transport\\.manage/);
  assert.match(migration, /rpc_delete_route[\\s\\S]{0,5000}transport\\.manage/);
  assert.match(migration, /rpc_assign_student_transport[\\s\\S]{0,6000}transport\\.edit/);
  assert.match(migration, /rpc_get_student_transport[\\s\\S]{0,5000}transport\\.view/);
  assert.match(migration, /rpc_remove_student_transport[\\s\\S]{0,5000}transport\\.edit/);
  assert.match(migration, /private\\.web_has_permission\\(p_session_token,'transport\\.view',nullif\\(trim\\(v_student\\.class\\)/);
  assert.match(api, /rpc_get_routes|rpc_add_route|rpc_update_route|rpc_delete_route|rpc_get_route_detail/);
});


test('resources and library authorization is dedicated and session-bound at the RPC boundary', () => {
  const migration = read('supabase/migrations/20261005170000_resources_library_permission_hardening.sql');
  const api = read('js/02I_api_resources.js');

  for (const key of ['library.view', 'library.manage']) {
    assert.match(migration, new RegExp(key.replaceAll('.', '\\.')));
  }
  for (const fn of [
    'rpc_get_books','rpc_add_book','rpc_update_book','rpc_delete_book',
    'rpc_get_book_checkouts','rpc_checkout_book','rpc_return_book','rpc_get_student_checkouts'
  ]) {
    assert.match(migration, new RegExp('function public\\.' + fn));
  }
  assert.match(migration, /rpc_get_books[\\s\\S]{0,5000}library\\.view/);
  for (const fn of ['rpc_add_book','rpc_update_book','rpc_delete_book','rpc_checkout_book','rpc_return_book']) {
    assert.match(migration, new RegExp(fn + '[\\s\\S]{0,5000}library\\.manage'));
  }
  assert.match(migration, /rpc_get_student_checkouts[\\s\\S]{0,7000}students\\.view/);
  assert.match(migration, /rpc_get_student_checkouts[\\s\\S]{0,7000}v_student\\.class/);
  for (const fn of ['getBooks','addBook','updateBook','deleteBook','getBookCheckouts','checkoutBook','returnBook','getStudentCheckouts']) {
    assert.match(api, new RegExp(fn));
  }
});


test('school asset uploads use the server-authorized upload function', () => {
  const api = read('js/02I_api_resources.js');
  assert.ok(api.includes('functions/v1/upload-school-asset'));
  assert.ok(api.includes('session_token'));
  assert.ok(api.includes('FormData'));
  assert.equal(api.includes('storage/v1/object/school-assets/'), false);
});


test('health authorization is dedicated and class-scoped at the RPC boundary', () => {
  const migration = read('supabase/migrations/20261005190000_health_permission_hardening.sql');
  const api = read('js/02K_api_health.js');
  assert.ok(migration.includes('health.view'));
  assert.ok(migration.includes('health.edit'));
  for (const fn of ['rpc_get_health_profile','rpc_upsert_health_profile','rpc_add_vaccination','rpc_delete_vaccination','rpc_add_health_visit','rpc_delete_health_visit']) {
    assert.ok(migration.includes('function public.' + fn));
  }
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'health.view',nullif(trim(v_student.class),''),null)"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'health.edit',nullif(trim(v_student.class),''),null)"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'health.edit',nullif(trim((select s.class"));
  for (const fn of ['getHealthProfile','upsertHealthProfile','addVaccination','deleteVaccination','addHealthVisit','deleteHealthVisit']) {
    assert.ok(api.includes(fn));
  }
});


test('communications authorization is dedicated and class-scoped at the RPC boundary', () => {
  const migration = read('supabase/migrations/20261005210000_communication_permission_hardening.sql');
  const api = read('js/02H_api_communication.js');
  for (const key of ['communication.view','communication.send','communication.manage']) assert.ok(migration.includes(key));
  for (const fn of ['rpc_send_parent_comm','rpc_get_parent_comms','rpc_delete_parent_comm','rpc_parent_portal_event_create','rpc_parent_portal_event_delete']) {
    assert.ok(migration.includes('function public.' + fn));
  }
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'communication.send'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'communication.view'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'communication.manage'"));
  for (const fn of ['sendParentComm','createParentPortalEvent','deleteParentPortalEvent','deleteParentComm','getParentComms']) assert.ok(api.includes(fn));
});


test('timetable authorization is dedicated and class-scoped at the RPC boundary', () => {
  const migration = read('supabase/migrations/20261005220000_timetable_permission_hardening.sql');
  for (const key of ['timetable.view','timetable.manage']) assert.ok(migration.includes(key));
  for (const fn of ['rpc_get_timetable','rpc_save_timetable','rpc_update_timetable','rpc_delete_timetable']) assert.ok(migration.includes('function public.' + fn));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'timetable.view'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'timetable.manage'"));
});


test('daily reports and incidents authorization is dedicated and class-scoped', () => {
  const migration = read('supabase/migrations/20261005230000_daily_incident_permission_hardening.sql');
  for (const key of ['daily_report.view','incident.view','incident.create','incident.edit','incident.delete']) assert.ok(migration.includes(key));
  for (const fn of ['rpc_get_daily_reports','rpc_save_daily_report','rpc_update_daily_report','rpc_delete_daily_report','rpc_get_incidents','rpc_save_incident','rpc_update_incident','rpc_delete_incident']) {
    assert.ok(migration.includes('function public.' + fn) || migration.includes("web_has_permission(p_session_token,'daily_report"));
  }
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'incident.view'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'incident.create'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'incident.edit'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'incident.delete'"));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'daily_report.view'"));
});


test('summary authorization is dedicated and class-scoped', () => {
  const migration = read('supabase/migrations/20261005240000_summary_permission_hardening.sql');
  assert.ok(migration.includes('summary.view'));
  assert.ok(migration.includes('function public.rpc_get_monthly_summary'));
  assert.ok(migration.includes("private.web_has_permission(p_session_token,'summary.view'"));
});


test('teacher lifecycle authorization is session-bound and frontend uses the guarded RPCs', () => {
  const migration = read('supabase/migrations/20261007030000_add_teacher_lifecycle_controls.sql');
  const grants = read('supabase/migrations/20261007031000_grant_teacher_lifecycle_rpc_client_execute.sql');
  const settings = read('js/15_settings.js');

  for (const fn of ['rpc_admin_deactivate_teacher', 'rpc_admin_reactivate_teacher']) {
    assert.match(migration, new RegExp('CREATE OR REPLACE FUNCTION public\\\\.' + fn));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,1200}p_session_token text'));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,5000}expires_at > now\\(\\\\)'));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,5000}t\\.status = \\'active\\''));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,7000}school_id = v_admin\\.school_id'));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,9000}v_admin\\.admin_role <> \\'super_admin\\'[\\\\s\\\\S]{0,500}v_target\\.role = \\'super_admin\\''));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,10000}audit_log'));
  }

  assert.match(migration, /cannot_deactivate_self/);
  assert.match(migration, /SET status = 'inactive'/);
  assert.match(migration, /SET status = 'active'/);
  assert.match(migration, /UPDATE public\.app_web_sessions[\\s\\S]{0,600}expires_at = now\(\)/);
  assert.match(migration, /teacher\.deactivate/);
  assert.match(migration, /teacher\.reactivate/);

  assert.match(grants, /rpc_admin_deactivate_teacher\(text, text\) TO anon, authenticated/);
  assert.match(grants, /rpc_admin_reactivate_teacher\(text, text\) TO anon, authenticated/);

  const lifecycleIdx = settings.indexOf('window.setTeacherLifecycle');
  assert.ok(lifecycleIdx >= 0, 'teacher lifecycle UI handler missing');
  const lifecycleBlock = settings.slice(lifecycleIdx, lifecycleIdx + 2600);
  assert.match(lifecycleBlock, /window\.APP\?\.is_admin/);
  assert.match(lifecycleBlock, /getWebSession\(\)/);
  assert.match(lifecycleBlock, /p_session_token:\s*sess\.session_token/);
  assert.match(lifecycleBlock, /rpc_admin_deactivate_teacher/);
  assert.match(lifecycleBlock, /rpc_admin_reactivate_teacher/);
  assert.match(lifecycleBlock, /result\?\.ok/);
});


test('Smart Staff Chat uses server-authorized direct messaging contracts', () => {
  const api = read('js/02L_api_chat.js');
  const chat = read('js/16_chat.js');
  const migration = read('supabase/migrations/20261008110000_staff_direct_messaging.sql');

  for (const fn of [
    'rpc_chat_staff_directory',
    'rpc_chat_direct_open',
    'rpc_chat_direct_conversations',
    'rpc_chat_direct_messages',
    'rpc_chat_direct_send',
    'rpc_chat_direct_mark_read',
  ]) {
    assert.match(migration, new RegExp('function public\\.' + fn));
  }

  for (const fn of [
    'getDirectStaffDirectory',
    'getDirectConversations',
    'openDirectConversation',
    'getDirectMessages',
    'sendDirectMessage',
    'markDirectRead',
  ]) assert.match(api, new RegExp(fn));

  assert.match(chat, /1-on-1 Direct Messages/);
  assert.match(chat, /openDirectChat/);
  assert.match(chat, /sendDirectChat/);
  assert.match(chat, /API\.sendDirectMessage/);
  assert.match(chat, /Only registered active staff in your school are shown/);
});

test('Direct messaging is tenant- and membership-bound server-side', () => {
  const migration = read('supabase/migrations/20261008110000_staff_direct_messaging.sql');
  for (const fn of ['rpc_chat_staff_directory','rpc_chat_direct_open','rpc_chat_direct_conversations','rpc_chat_direct_messages','rpc_chat_direct_send','rpc_chat_direct_mark_read']) {
    const idx = migration.indexOf('function public.' + fn);
    assert.ok(idx >= 0, fn + ' missing');
    const block = migration.slice(idx, idx + 9000);
    assert.match(block, /p_session_token text/);
    assert.match(block, /expires_at>now\(\)/);
    assert.match(block, /t\.status='active'/);
    assert.match(block, /t\.school_id=s\.school_id/);
  }
  const send = migration.slice(migration.indexOf('function public.rpc_chat_direct_send'), migration.indexOf('function public.rpc_chat_direct_mark_read'));
  assert.match(send, /not exists\(select 1 from public\.staff_direct_members/);
  assert.match(send, /school_id=v_sess\.school_id/);
  assert.match(send, /invalid_reply_target/);
  assert.match(send, /r\.conversation_id=p_conversation_id/);
  assert.match(send, /r\.school_id=v_sess\.school_id/);
});


test('Official Staff Announcements use a server-authorized recipient snapshot and audit contract', () => {
  const migration = read('supabase/migrations/20261008130000_official_announcements.sql');
  for (const table of ['staff_announcements','staff_announcement_recipients']) assert.match(migration, new RegExp('create table if not exists public\\\\.' + table));
  for (const fn of ['rpc_chat_announcement_create','rpc_chat_announcement_list','rpc_chat_announcement_mark_read']) {
    assert.match(migration, new RegExp('function public\\\\.' + fn));
  }
  assert.match(migration, /expires_at>now\\(\\)/);
  assert.match(migration, /t\\.status='active'/);
  assert.match(migration, /t\\.school_id=s\\.school_id/);
  assert.match(migration, /communication\.send/);
  assert.match(migration, /school_id,v_sess\.school_id/);
  assert.match(migration, /recipient_count/);
  assert.match(migration, /'all_staff'/);
  assert.match(migration, /no_verified_recipients/);
  assert.match(migration, /official_announcement\.create/);
  assert.match(migration, /audit_log/);
  assert.match(migration, /revoke all on function public\.rpc_chat_announcement_create/);
  assert.match(migration, /grant execute on function public\.rpc_chat_announcement_create/);
});


test('Official Staff Announcements UI and API are connected to the guarded server route', () => {
  const api = read('js/02L_api_chat.js');
  const chat = read('js/16_chat.js');
  assert.match(api, /createStaffAnnouncement/);
  assert.match(api, /rpc_chat_announcement_create/);
  assert.match(api, /getStaffAnnouncements/);
  assert.match(api, /rpc_chat_announcement_list/);
  assert.match(api, /markStaffAnnouncementRead/);
  assert.match(api, /rpc_chat_announcement_mark_read/);
  assert.match(chat, /sendOfficialAnnouncement/);
  assert.match(chat, /value="all_staff">All Staff/);
  assert.match(chat, /API\.createStaffAnnouncement/);
  assert.match(chat, /Reason and message body are required/);
  assert.match(chat, /No verified recipients/);
  assert.match(chat, /Department — coming next/);
  assert.match(chat, /teacher — coming next/);
});


test('Staff Inquiry Tickets use session, tenant and membership-bound server contracts', () => {
  const migration = read('supabase/migrations/20261008190000_staff_inquiry_tickets.sql');
  for (const fn of ['rpc_chat_inquiry_list','rpc_chat_inquiry_open','rpc_chat_inquiry_send','rpc_chat_inquiry_create']) {
    assert.match(migration, new RegExp('function public\\\\.' + fn));
  }
  for (const marker of ['p_session_token text','expires_at>now\\(\\)','t\\.status=\'active\'','t\\.school_id=s\\.school_id','ticket_forbidden','ticket_closed','student_forbidden','invalid_session']) {
    assert.match(migration, new RegExp(marker));
  }
  assert.match(migration, /staff_inquiry_tickets/);
  assert.match(migration, /staff_inquiry_ticket_members/);
  assert.match(migration, /staff_inquiry_ticket_messages/);
  assert.match(migration, /school_id=v\.school_id/);
  assert.match(migration, /revoke all on function public\.rpc_chat_inquiry_send/);
  assert.match(migration, /grant execute on function public\.rpc_chat_inquiry_send/);
});


test('Staff Inquiry Ticket assignment/status is admin-bound and school-scoped', () => {
  const migration = read('supabase/migrations/20261008200000_staff_inquiry_assignment_status.sql');
  assert.match(migration, /function public\\.rpc_chat_inquiry_update/);
  assert.match(migration, /v\.role not in \('admin','super_admin'\)/);
  assert.match(migration, /assignee_forbidden/);
  assert.match(migration, /school_id=v\.school_id/);
  assert.match(migration, /member_role='ASSIGNEE'/);
  assert.match(migration, /grant execute on function public\.rpc_chat_inquiry_update/);
});


test('Department Chat is session, tenant, membership, and read-state bound', () => {
  const migration = read('supabase/migrations/20261008240000_staff_department_messaging.sql');
  const readState = read('supabase/migrations/20261008241000_staff_department_read_state.sql');
  const api = read('js/02L_api_chat.js');
  const chat = read('js/16_chat_department.js');

  for (const fn of ['rpc_chat_department_open','rpc_chat_department_send','rpc_chat_department_mark_read']) {
    assert.match(migration, new RegExp('function public\\\\.' + fn));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,5000}p_session_token text'));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,5000}expires_at>now\\\\(\\\\)'));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,5000}t\\\\.status=\\\\'active\\\\''));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,5000}t\\\\.school_id=s\\\\.school_id'));
    assert.match(migration, new RegExp(fn + '[\\\\s\\\\S]{0,7000}school_id=v_sess\\\\.school_id'));
  }
  assert.match(migration, /alter table public\\.staff_department_messages enable row level security/);
  assert.match(migration, /revoke all on public\\.staff_department_messages from anon, authenticated/);
  assert.match(migration, /return jsonb_build_object\\('ok',false,'error','forbidden'\\)/);
  assert.match(migration, /grant execute on function public\\.rpc_chat_department_send\\(text,bigint,text\\) to anon,authenticated/);
  assert.match(readState, /last_read_at timestamptz not null default now\\(\\)/);
  assert.match(readState, /set last_read_at=now\\(\\)/);
  assert.match(readState, /unread_count/);
  for (const fn of ['getDepartmentChats','openDepartmentChat','sendDepartmentMessage','markDepartmentRead']) assert.match(api, new RegExp(fn));
  assert.match(chat, /setInterval/);
  assert.match(chat, /API\\.markDepartmentRead/);
});


test('Official individual staff announcements are server-verified and reason-bound', () => {
  const migration = read('supabase/migrations/20261008193000_staff_official_teacher_routing.sql');
  const chat = read('js/16_chat.js');
  assert.ok(migration.includes("recipient_type in ('all_staff','grade','teacher')"));
  assert.match(migration, /rpc_chat_grade_targets/);
  assert.ok(migration.includes("v_sess.role not in ('admin','super_admin')"));
  assert.match(migration, /t\.teacher_id=v_target/);
  assert.match(migration, /t\.school_id=v_sess\.school_id/);
  assert.match(migration, /t\.status='active'/);
  assert.match(migration, /invalid_recipient/);
  assert.match(migration, /official_announcement\.create/);
  assert.match(chat, /Individual teacher/);
  assert.match(chat, /createStaffAnnouncement/);
  assert.match(chat, /Reason and message body are required/);
  assert.match(chat, /adminMsgTeacher/);
});

test('School Chat mobile workspaces have explicit selection/back contracts', () => {
  const grade = read('js/16_chat_grade.js');
  const groups = read('js/16_chat_groups.js');
  const chat = read('js/16_chat.js');
  assert.match(grade, /Back to grades/);
  assert.match(grade, /_setGradeMobileView/);
  assert.match(groups, /Back to groups/);
  assert.match(groups, /_loadChatGroups\(false\)/);
  assert.match(chat, /Back to announcements/);
  assert.match(chat, /Back to inquiry tickets/);
  assert.match(chat, /has-selection/);
});
