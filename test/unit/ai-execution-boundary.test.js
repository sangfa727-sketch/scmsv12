import test from 'node:test';
import assert from 'node:assert/strict';

const CONTROL_RPCS = new Set([
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
]);

function executeBoundary(input) {
  if (!input?.contract) return { decision: 'DENY', reason: 'missing_contract' };
  if (!input.session?.active) return { decision: 'DENY', reason: 'session_required' };
  if (!input.authority?.allowed) return { decision: 'DENY', reason: 'authority_denied' };
  if (!input.scope?.allowed) return { decision: 'DENY', reason: 'scope_denied' };
  if (CONTROL_RPCS.has(input.contract.rpc)) {
    return { decision: 'DENY', reason: 'internal_control_rpc' };
  }
  if (input.contract.risk_level === 'UNKNOWN') {
    return { decision: 'DENY', reason: 'unknown_risk' };
  }
  if (['HIGH', 'VERY_HIGH', 'CRITICAL'].includes(input.contract.risk_level) &&
      !input.confirmation?.valid) {
    return { decision: 'CONFIRM_REQUIRED', reason: 'confirmation_required' };
  }
  if (input.contract.target_validation && !input.target?.valid) {
    return { decision: 'DENY', reason: 'target_validation_failed' };
  }
  if (input.contract.rpc !== input.resolved?.rpc) {
    return { decision: 'DENY', reason: 'rpc_substitution' };
  }
  if (input.action_digest !== input.confirmation?.action_digest && input.confirmation?.valid) {
    return { decision: 'DENY', reason: 'action_digest_mismatch' };
  }
  return { decision: 'ALLOW', rpc: input.contract.rpc };
}

test('execution boundary fails closed without contract', () => {
  assert.equal(executeBoundary({}).decision, 'DENY');
});

test('execution boundary checks session, authority and scope before execution', () => {
  const base = {
    contract: { rpc: 'rpc_update_student', risk_level: 'MEDIUM' },
    resolved: { rpc: 'rpc_update_student' }
  };
  assert.equal(executeBoundary(base).reason, 'session_required');
  assert.equal(executeBoundary({ ...base, session: { active: true } }).reason, 'authority_denied');
  assert.equal(executeBoundary({ ...base, session: { active: true }, authority: { allowed: true } }).reason, 'scope_denied');
});

test('high-risk actions require valid confirmation', () => {
  const input = {
    contract: { rpc: 'rpc_delete_student', risk_level: 'HIGH' },
    resolved: { rpc: 'rpc_delete_student' },
    session: { active: true },
    authority: { allowed: true },
    scope: { allowed: true }
  };
  assert.equal(executeBoundary(input).decision, 'CONFIRM_REQUIRED');
});

test('confirmation cannot replace authorization or scope', () => {
  const input = {
    contract: { rpc: 'rpc_delete_student', risk_level: 'HIGH' },
    resolved: { rpc: 'rpc_delete_student' },
    session: { active: true },
    authority: { allowed: false },
    scope: { allowed: true },
    confirmation: { valid: true, action_digest: 'd' },
    action_digest: 'd'
  };
  assert.equal(executeBoundary(input).reason, 'authority_denied');
});

test('execution rejects RPC substitution after confirmation', () => {
  const input = {
    contract: { rpc: 'rpc_update_student', risk_level: 'MEDIUM' },
    resolved: { rpc: 'rpc_delete_student' },
    session: { active: true },
    authority: { allowed: true },
    scope: { allowed: true }
  };
  assert.equal(executeBoundary(input).reason, 'rpc_substitution');
});

test('execution rejects confirmation digest mismatch', () => {
  const input = {
    contract: { rpc: 'rpc_update_student', risk_level: 'MEDIUM' },
    resolved: { rpc: 'rpc_update_student' },
    session: { active: true },
    authority: { allowed: true },
    scope: { allowed: true },
    confirmation: { valid: true, action_digest: 'confirmed' },
    action_digest: 'tampered'
  };
  assert.equal(executeBoundary(input).reason, 'action_digest_mismatch');
});

test('internal control RPCs are never executable business actions', () => {
  const input = {
    contract: { rpc: 'rpc_ai_confirmation_consume', risk_level: 'CRITICAL' },
    resolved: { rpc: 'rpc_ai_confirmation_consume' },
    session: { active: true },
    authority: { allowed: true },
    scope: { allowed: true },
    confirmation: { valid: true, action_digest: 'd' },
    action_digest: 'd'
  };
  assert.equal(executeBoundary(input).reason, 'internal_control_rpc');
});

test('target validation runs before execution', () => {
  const input = {
    contract: { rpc: 'rpc_delete_student', risk_level: 'HIGH', target_validation: 'student_id' },
    resolved: { rpc: 'rpc_delete_student' },
    session: { active: true },
    authority: { allowed: true },
    scope: { allowed: true },
    confirmation: { valid: true, action_digest: 'd' },
    action_digest: 'd',
    target: { valid: false }
  };
  assert.equal(executeBoundary(input).reason, 'target_validation_failed');
});
