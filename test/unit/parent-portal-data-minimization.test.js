const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261014130000_minimize_parent_portal_payload.sql', 'utf8');

test('parent login returns an allowlisted student profile, never the full row or QR token', () => {
  assert.match(migration, /SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,\s+st.parent_email, st.school_id, st.status, sc.school_name\s+INTO v_student\s+FROM public\.students st\s+JOIN public\.schools sc\s+ON sc\.school_id = st\.school_id\s+AND sc\.status = 'active'/);
  assert.match(migration, /'student_id', v_student\.student_id/);
  assert.match(migration, /'name_en', v_student\.name_en/);
  assert.match(migration, /'name_local', v_student\.name_local/);
  assert.match(migration, /'class', v_student\.class/);
  assert.match(migration, /'photo_url', v_student\.photo_url/);
  assert.match(migration, /'school_name', v_student\.school_name/);
  assert.doesNotMatch(migration, /'student', to_jsonb\(v_student\)/);
  assert.doesNotMatch(migration, /'qr_token', v_student\.qr_token/);
});

test('parent dashboard selects only needed student fields and returns an allowlist', () => {
  assert.match(migration, /SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,\s+st.school_id, sc.school_name\s+INTO v_student\s+FROM public\.students st\s+JOIN public\.schools sc\s+ON sc\.school_id = st\.school_id\s+AND sc\.status = 'active'/);
  assert.match(migration, /'student', jsonb_strip_nulls\(jsonb_build_object\('student_id'/);
  assert.doesNotMatch(migration, /'student', to_jsonb\(v_student\)/);
});

test('parent login, dashboard, and leave requests fail closed for inactive students or schools', () => {
  assert.match(migration, /AND st\.status = 'Active'/);
  assert.match(migration, /AND sc\.status = 'active'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_parent_submit_leave_request/);
  assert.match(migration, /s\.status = 'Active'/);
  assert.match(migration, /ps\.school_id/);
  assert.match(migration, /'invalid_session'/);
  assert.match(migration, /'request', jsonb_build_object/);
});

test('parent invoice responses expose only fields consumed by the portal', () => {
  assert.match(migration, /jsonb_build_object\('id', i\.id, 'invoice_number', i\.invoice_number, 'due_date', i\.due_date, 'status', i\.status, 'total_amount', i\.total_amount, 'paid_amount', i\.paid_amount,/);
  assert.doesNotMatch(migration, /to_jsonb\(i\)/);
  assert.match(migration, /'items', COALESCE/);
  assert.match(migration, /FROM \(\s*SELECT it\.id, it\.description, it\.amount[\s\S]*?ORDER BY it\.id\s*\) x/);
  assert.match(migration, /FROM \(\s*SELECT p\.id, p\.payment_date, p\.method, p\.amount[\s\S]*?ORDER BY p\.payment_date DESC, p\.id DESC\s*\) x/);
  assert.match(migration, /FROM \(\s*SELECT i\.\*[\s\S]*?ORDER BY i\.id DESC\s*\) i/);
  assert.match(migration, /'payments', COALESCE/);
});

test('parent SECURITY DEFINER functions put pg_catalog before application schemas', () => {
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'/);
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public', 'pg_temp'/);
});

test('parent portal messages, events, timetable, and exams expose only UI fields', () => {
  assert.match(migration, /jsonb_build_object\('date', x\.date, 'type', x\.type, 'message_preview', x\.message_preview\)/);
  assert.match(migration, /'title', x\.title,\s*'description', x\.description,\s*'starts_at', x\.starts_at/);
  assert.match(migration, /FROM \(\s*SELECT e\.id, e\.title, e\.description, e\.starts_at[\s\S]*?LIMIT 50\s*\) x;/);
  assert.match(migration, /FROM \(\s*SELECT date, status[\s\S]*?ORDER BY date DESC\s*\) a;/);
  assert.match(migration, /FROM \(\s*SELECT sub\.subject_name, asmt\.title, g\.percentage, g\.letter_grade, asmt\.date[\s\S]*?ORDER BY asmt\.date DESC\s*\) x;/);
  assert.match(migration, /FROM \(\s*SELECT sub\.subject_name, asmt\.title, asmt\.date, asmt\.start_time, asmt\.end_time, asmt\.id[\s\S]*?LIMIT 20\s*\) x;/);
  assert.match(migration, /FROM \(\s*SELECT lr\.id, lr\.start_date, lr\.end_date, lr\.reason, lr\.status, lr\.created_at[\s\S]*?ORDER BY lr\.created_at DESC\s*\) x;/);
  assert.match(migration, /FROM \(\s*SELECT pc\.date, pc\.type, pc\.message_preview[\s\S]*?ORDER BY pc\.date DESC, pc\.created_at DESC\s*\) pc/);
  assert.match(migration, /'day', tt\.day,\s*'start_time', tt\.start_time,\s*'end_time', tt\.end_time,\s*'subject', tt\.subject,\s*'room', tt\.room/);
  assert.match(migration, /FROM \(\s*SELECT tt\.day, tt\.start_time, tt\.end_time, tt\.subject, tt\.room, tt\.period[\s\S]*?LIMIT 100\s*\) tt;/);
  assert.doesNotMatch(migration, /'student_id', e\.student_id/);
  assert.doesNotMatch(migration, /'school_id', e\.school_id/);
  assert.doesNotMatch(migration, /'student_id', pc\.student_id/);
  assert.doesNotMatch(migration, /'notes', tt\.notes/);
  assert.doesNotMatch(migration, /'type', asmt\.type/);
});
