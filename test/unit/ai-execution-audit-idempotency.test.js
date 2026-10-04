const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261004150000_ai_execution_audit_idempotency_contract.sql'),'utf8');

test('AI audit correlation fields and indexes exist', () => {
  assert.match(sql, /add column if not exists correlation_id uuid/i);
  assert.match(sql, /add column if not exists idempotency_key text/i);
  assert.match(sql, /audit_log_correlation_id_idx/i);
  assert.match(sql, /audit_log_idempotency_key_uq/i);
});

test('idempotency registry is private and fail-closed', () => {
  assert.match(sql, /create table if not exists private\.ai_execution_idempotency/i);
  assert.match(sql, /primary key/i);
  assert.match(sql, /alter table private\.ai_execution_idempotency enable row level security/i);
  assert.match(sql, /revoke all on private\.ai_execution_idempotency from public,anon,authenticated/i);
});

test('reservation binds idempotency to session, actor, action, rpc and digest', () => {
  assert.match(sql, /v_existing\.session_id <> v_sess\.session_id/i);
  assert.match(sql, /v_existing\.school_id <> v_sess\.school_id/i);
  assert.match(sql, /v_existing\.teacher_id <> v_sess\.teacher_id/i);
  assert.match(sql, /v_existing\.action <> p_action/i);
  assert.match(sql, /v_existing\.resolved_rpc <> p_resolved_rpc/i);
  assert.match(sql, /v_existing\.action_digest <> p_action_digest/i);
  assert.match(sql, /'idempotency_key_conflict'/i);
});

test('completion remains session and tenant bound', () => {
  assert.match(sql, /where idempotency_key=p_idempotency_key/i);
  assert.match(sql, /and session_id=v_sess\.session_id/i);
  assert.match(sql, /and school_id=v_sess\.school_id/i);
  assert.match(sql, /and teacher_id=v_sess\.teacher_id/i);
});
