const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const registrySql = fs.readFileSync(
  'supabase/migrations/20261004120000_ai_execution_permission_gate.sql',
  'utf8'
);
const bindingSql = fs.readFileSync(
  'supabase/migrations/20261004130000_ai_action_permission_binding.sql',
  'utf8'
);

const registryRows = [...registrySql.matchAll(
  /\('([a-z0-9_]+)','rpc_[a-z0-9_]+','(?:read|medium|high|very_high|critical)',(?:true|false)\)/g
)].map((m) => m[1]);

const mappingBlock =
  (bindingSql.match(/values([\s\S]*?)\) as v\(action,permission_key\)/i) || [])[1] || '';
const mapped = [...mappingBlock.matchAll(
  /\('([a-z0-9_]+)','([^']+)'\)/g
)].map((m) => m[1]);

const expectedUnmapped = [
  'add_book',
  'add_route',
  'add_subject',
  'add_term',
  'checkout_book',
  'delete_book',
  'delete_incident',
  'delete_parent_comm',
  'delete_route',
  'delete_timetable',
  'get_attendance_audit',
  'get_billing_summary',
  'get_book_checkouts',
  'get_books',
  'get_daily_reports',
  'get_fee_items',
  'get_incidents',
  'get_invoice_detail',
  'get_invoices',
  'get_monthly_summary',
  'get_my_data',
  'get_parent_comms',
  'get_report_card',
  'get_route_detail',
  'get_routes',
  'get_subjects',
  'get_terms',
  'get_timetable',
  'manage_teacher_access',
  'parent_get_dashboard',
  'parent_portal_event_create',
  'parent_portal_event_delete',
  'parent_submit_leave_request',
  'return_book',
  'save_incident',
  'save_timetable',
  'send_parent_comm',
  'set_my_ui_prefs',
  'set_school_branding',
  'set_school_cover',
  'set_school_logo',
  'set_teacher_photo',
  'telegram_connect_finish',
  'telegram_connect_start',
  'telegram_disconnect',
  'update_book',
  'update_incident',
  'update_route',
  'update_school_config_web',
  'update_timetable',
  'web_bootstrap',
  'web_logout'
];

test('canonical registry remains 117 actions', () => {
  assert.equal(registryRows.length, 117);
});

test('the audited fail-closed catalog remains exact', () => {
  const actual = registryRows.filter((action) => !mapped.includes(action));
  assert.deepEqual(actual, [...new Set(expectedUnmapped)]);
});

test('no unmapped action has an explicit permission binding', () => {
  for (const action of expectedUnmapped) {
    assert.equal(mapped.includes(action), false, action);
  }
});
