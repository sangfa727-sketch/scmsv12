const fs = require('fs');
const path = require('path');
const sql = fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20261004150000_ai_execution_audit_idempotency_contract.sql'),'utf8');

test('AI audit correlation fields and indexes exist', () => {
  expect(sql).toMatch(/add column if not exists correlation_id uuid/i);
  expect(sql).toMatch(/add column if not exists idempotency_key text/i);
  expect(sql).toMatch(/audit_log_correlation_id_idx/i);
  expect(sql).toMatch(/audit_log_idempotency_key_uq/i);
});

test('idempotency registry is private and fail-closed', () => {
  expect(sql).toMatch(/create table if not exists private\.ai_execution_idempotency/i);
  expect(sql).toMatch(/primary key/i);
  expect(sql).toMatch(/alter table private\.ai_execution_idempotency enable row level security/i);
  expect(sql).toMatch(/revoke all on private\.ai_execution_idempotency from public,anon,authenticated/i);
});

test('reservation binds idempotency to session, actor, action, rpc and digest', () => {
  expect(sql).toMatch(/v_existing\.session_id <> v_sess\.session_id/i);
  expect(sql).toMatch(/v_existing\.school_id <> v_sess\.school_id/i);
  expect(sql).toMatch(/v_existing\.teacher_id <> v_sess\.teacher_id/i);
  expect(sql).toMatch(/v_existing\.action <> p_action/i);
  expect(sql).toMatch(/v_existing\.resolved_rpc <> p_resolved_rpc/i);
  expect(sql).toMatch(/v_existing\.action_digest <> p_action_digest/i);
  expect(sql).toMatch(/'idempotency_key_conflict'/i);
});

test('completion remains session and tenant bound', () => {
  expect(sql).toMatch(/where idempotency_key=p_idempotency_key/i);
  expect(sql).toMatch(/and session_id=v_sess\.session_id/i);
  expect(sql).toMatch(/and school_id=v_sess\.school_id/i);
  expect(sql).toMatch(/and teacher_id=v_sess\.teacher_id/i);
});
