const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname,'../../supabase/migrations/20261005000000_ai_execution_session_id_runtime_fix.sql'),
  'utf8'
);

test('AI execution uses the canonical hashed session identity', () => {
  assert.match(sql, /v_session_id := encode\(digest\(p_session_token,'sha256'\),'hex'\)/i);
  assert.doesNotMatch(sql, /s\.session_id/i);
});

test('reserve persists hashed session identity and detects replay/conflict', () => {
  assert.match(sql, /session_id=v_session_id/i);
  assert.match(sql, /idempotency_key_conflict/i);
  assert.match(sql, /'replayed',true/i);
});

test('complete locks by canonical session identity and preserves exactly-once audit', () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /session_id=v_session_id/i);
  assert.match(sql, /v_row\.status<>'reserved'/i);
  assert.match(sql, /insert into public\.audit_log/i);
  assert.match(sql, /correlation_id,idempotency_key/i);
});

test('authorization returns canonical session identity', () => {
  assert.match(sql, /'session_id',v_session_id/i);
  assert.match(sql, /private\.web_has_permission/i);
});
