const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261014130000_minimize_parent_portal_payload.sql', 'utf8');

test('parent login returns an allowlisted student profile, never the full row or QR token', () => {
  assert.match(migration, /SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,\s+st.parent_email, st.school_id, st.status, sc.school_name\s+INTO v_student\s+FROM public\.students st\s+LEFT JOIN public\.schools sc ON sc.school_id = st.school_id/);
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
  assert.match(migration, /SELECT st.student_id, st.name_en, st.name_local, st.class, st.photo_url,\s+st.school_id, sc.school_name\s+INTO v_student\s+FROM public\.students st\s+LEFT JOIN public\.schools sc ON sc.school_id = st.school_id/);
  assert.match(migration, /'student', jsonb_strip_nulls\(jsonb_build_object\('student_id'/);
  assert.doesNotMatch(migration, /'student', to_jsonb\(v_student\)/);
});

test('parent invoice responses expose only fields consumed by the portal', () => {
  assert.match(migration, /jsonb_build_object\('id', i\.id, 'invoice_number', i\.invoice_number, 'due_date', i\.due_date, 'status', i\.status, 'total_amount', i\.total_amount, 'paid_amount', i\.paid_amount,/);
  assert.doesNotMatch(migration, /to_jsonb\(i\)/);
  assert.match(migration, /'items', COALESCE/);
  assert.match(migration, /'payments', COALESCE/);
});

test('parent SECURITY DEFINER functions put pg_catalog before application schemas', () => {
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public', 'extensions', 'pg_temp'/);
  assert.match(migration, /SET search_path TO 'pg_catalog', 'public', 'pg_temp'/);
});

test('parent portal messages, events, timetable, and exams expose only UI fields', () => {
  assert.match(migration, /jsonb_build_object\('date', x\.date, 'type', x\.type, 'message_preview', x\.message_preview\)/);
  assert.match(migration, /'title', e\.title,\s*'description', e\.description,\s*'starts_at', e\.starts_at/);
  assert.match(migration, /'day', tt\.day,\s*'start_time', tt\.start_time,\s*'end_time', tt\.end_time,\s*'subject', tt\.subject,\s*'room', tt\.room/);
  assert.doesNotMatch(migration, /'student_id', e\.student_id/);
  assert.doesNotMatch(migration, /'school_id', e\.school_id/);
  assert.doesNotMatch(migration, /'student_id', pc\.student_id/);
  assert.doesNotMatch(migration, /'notes', tt\.notes/);
  assert.doesNotMatch(migration, /'type', asmt\.type/);
});
