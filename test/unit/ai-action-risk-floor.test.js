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
const confirmationSql = fs.readFileSync(
  'supabase/migrations/20261003_ai_confirmation_persistence.sql',
  'utf8'
);

const rows = [...registrySql.matchAll(
  /\('([a-z0-9_]+)','(rpc_[a-z0-9_]+)','(read|medium|high|very_high|critical)',(true|false)\)/g
)].map((m) => ({
  action: m[1],
  rpc: m[2],
  risk: m[3],
  confirmation: m[4] === 'true'
}));

test('canonical high-risk actions require server-side confirmation', () => {
  const highRisk = rows.filter((r) => ['high', 'very_high', 'critical'].includes(r.risk));
  assert.ok(highRisk.length > 0);
  for (const row of highRisk) {
    assert.equal(row.confirmation, true, row.action);
  }
});

test('confirmation persistence is session-bound, expiring, digest-bound and replay-aware', () => {
  assert.match(confirmationSql, /session_token/i);
  assert.match(confirmationSql, /expires_at/i);
  assert.match(confirmationSql, /digest/i);
  assert.match(confirmationSql, /rpc_ai_confirmation_consume/i);
  assert.match(confirmationSql, /rpc_ai_confirmation_cancel/i);
  assert.match(confirmationSql, /consumed_at/i);
  assert.match(confirmationSql, /cancelled_at/i);
  assert.match(confirmationSql, /uq_ai_confirmation_pending_active_session/i);
  assert.match(confirmationSql, /enable row level security/i);
});

test('AI authorization rejects missing confirmation before permission evaluation', () => {
  assert.match(bindingSql, /v_contract\.confirmation_required/);
  assert.match(bindingSql, /p_confirmed is not true/);
  assert.match(bindingSql, /'confirmation_required'/);
});

test('AI authorization constrains target inputs to the server permission scope', () => {
  assert.match(bindingSql, /v_contract\.scope_type='global'/);
  assert.match(bindingSql, /v_contract\.scope_type='class'/);
  assert.match(bindingSql, /v_contract\.scope_type='class_subject'/);
  assert.match(bindingSql, /v_contract\.scope_type='subject'/);
  assert.match(bindingSql, /'scope_input_invalid'/);
  assert.match(bindingSql, /private\.web_has_permission\(/);
});

test('internal security/session RPCs cannot enter the business-action registry', () => {
  for (const rpc of [
    'rpc_ai_confirmation_create',
    'rpc_ai_confirmation_consume',
    'rpc_ai_confirmation_cancel',
    'rpc_web_session_verify',
    'rpc_teacher_login',
    'rpc_teacher_web_login',
    'rpc_app_login_bind',
    'rpc_app_session_poll',
    'rpc_teacher_card_login_start',
    'rpc_qr_resolve'
  ]) {
    assert.match(bindingSql, new RegExp(rpc));
  }
  assert.match(bindingSql, /'internal_or_invalid_rpc'/);
});
