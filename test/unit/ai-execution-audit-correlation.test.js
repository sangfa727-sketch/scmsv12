const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(
  path.join(__dirname,'../../supabase/migrations/20261004160000_ai_execution_audit_correlation_integration.sql'),
  'utf8'
);

test('completion writes correlation and idempotency into existing audit_log', () => {
  assert.match(sql, /insert into public\.audit_log/i);
  assert.match(sql, /correlation_id, idempotency_key/i);
  assert.match(sql, /v_row\.correlation_id/i);
  assert.match(sql, /v_row\.idempotency_key/i);
  assert.match(sql, /'ai\.execution\.' \|\| v_status/i);
});

test('completion audit is tenant and actor bound', () => {
  assert.match(sql, /session_id=v_sess\.session_id/i);
  assert.match(sql, /school_id=v_sess\.school_id/i);
  assert.match(sql, /teacher_id=v_sess\.teacher_id/i);
  assert.match(sql, /v_sess\.teacher_id/i);
});

test('completion is exactly-once for an idempotency key', () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /v_row\.status <> 'reserved'/i);
  assert.match(sql, /'replayed',true/i);
  assert.match(sql, /where idempotency_key=v_row\.idempotency_key/i);
});

test('audit failure cannot be reported as successful completion', () => {
  assert.match(sql, /If this insert fails/i);
  assert.match(sql, /exception when others then/i);
  assert.match(sql, /'idempotency_complete_failed'/i);
});

test('AI execution audit carries action, RPC and digest without changing business audit architecture', () => {
  assert.match(sql, /'action',v_row\.action/i);
  assert.match(sql, /'resolved_rpc',v_row\.resolved_rpc/i);
  assert.match(sql, /'action_digest',v_row\.action_digest/i);
  assert.doesNotMatch(sql, /create table.*audit_log/i);
  assert.doesNotMatch(sql, /drop table.*audit_log/i);
});
