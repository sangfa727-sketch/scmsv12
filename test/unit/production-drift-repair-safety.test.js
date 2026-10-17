const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync(
  'supabase/migrations/20261016120000_production_security_drift_repair.sql',
  'utf8',
);

test('production repair revokes inherited and direct browser mutation grants but preserves bootstrap INSERT', () => {
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON TABLE\s+public\.app_sessions,\s+public\.audit_log,\s+public\.n8n_state\s+FROM PUBLIC, anon, authenticated;/,
  );
  assert.match(
    migration,
    /GRANT INSERT ON TABLE public\.app_sessions TO anon, authenticated;/,
  );
  assert.match(migration, /RLS-checked pending-session bootstrap insert/i);
  assert.doesNotMatch(
    migration,
    /GRANT\s+(?:SELECT|UPDATE|DELETE|ALL PRIVILEGES)\s+ON TABLE public\.app_sessions TO anon, authenticated/i,
  );
});

test('Parent Login RPC returns a bounded student allowlist and remains service-role-only', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.rpc_parent_google_login(');
  const end = migration.indexOf('-- Parent Portal dashboard and leave-request RPCs', start);
  assert.ok(start >= 0 && end > start, 'Parent Login function section exists');
  const section = migration.slice(start, end);
  assert.match(section, /jsonb_build_object\(\s*'student_id', v_student\.student_id/);
  assert.match(section, /'school_name', v_student\.school_name/);
  assert.doesNotMatch(section, /to_jsonb\(v_student\)/i);
  assert.match(section, /REVOKE EXECUTE ON FUNCTION public\.rpc_parent_google_login\(text, text, text\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(section, /GRANT EXECUTE ON FUNCTION public\.rpc_parent_google_login\(text, text, text\)\s+TO service_role;/);
});

test('Parent Login rate limiter uses hashed keys, bounded cleanup, and service-role-only execution', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.parent_login_rate_limits/);
  assert.match(migration, /key_hash text PRIMARY KEY CHECK \(key_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /LIMIT 1000/);
  assert.match(migration, /p_window_seconds < 1 OR p_window_seconds > 86400/);
  assert.match(migration, /p_max_attempts < 1 OR p_max_attempts > 1000/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.rpc_parent_login_rate_limit\(text, integer, integer\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_parent_login_rate_limit\(text, integer, integer\)\s+TO service_role;/);
});

test('student photo authorization is service-role-only and storage policy removal is deferred', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.rpc_authorize_student_photo_upload\(\s*p_session_token text,\s*p_student_id text/s);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.rpc_authorize_student_photo_upload\(text, text\)\s+FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_authorize_student_photo_upload\(text, text\)\s+TO service_role;/);
  assert.match(migration, /Storage policy removal is deliberately separated into a follow-up migration/);
});

test('production repair is transactional', () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
});
