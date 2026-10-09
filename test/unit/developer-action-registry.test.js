'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTION_DEFINITIONS,
  getEnabledDeveloperActionPolicy,
  listDeveloperActionDefinitions,
  validateDeveloperActionRegistry
} = require('../../school-website/server/developer-action-registry');

test('DCC action registry is structurally valid and has unique action IDs', () => {
  const result = validateDeveloperActionRegistry();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.count, ACTION_DEFINITIONS.length);
  assert.equal(new Set(ACTION_DEFINITIONS.map((item) => item.actionId)).size, ACTION_DEFINITIONS.length);
});

test('DCC action definitions are immutable and every action remains disabled', () => {
  assert.equal(Object.isFrozen(ACTION_DEFINITIONS), true);
  assert.ok(ACTION_DEFINITIONS.length >= 35);
  for (const definition of listDeveloperActionDefinitions()) {
    assert.equal(Object.isFrozen(definition), true, definition.actionId);
    assert.equal(definition.enabled, false, definition.actionId);
    assert.equal(definition.requiredCapability, definition.actionId);
  }
});

test('unknown, malformed, and currently disabled actions have no executable policy', () => {
  for (const actionId of [
    'overview.read',
    'releases.deploy.production',
    'security.operator.grant',
    'unknown.action',
    '',
    null,
    { action: 'overview.read' }
  ]) {
    assert.equal(getEnabledDeveloperActionPolicy(actionId), null);
  }
});

test('critical actions require step-up, confirmation, independent approval, and idempotency', () => {
  for (const definition of ACTION_DEFINITIONS.filter((item) => item.riskTier === 'R3')) {
    assert.equal(definition.requiresStepUp, true, definition.actionId);
    assert.equal(definition.requiresConfirmation, true, definition.actionId);
    assert.equal(definition.requiresIndependentApproval, true, definition.actionId);
    assert.equal(definition.requiresApproval, true, definition.actionId);
    assert.equal(definition.idempotencyRequired, true, definition.actionId);
  }
});

test('registry validator fails closed for duplicate IDs, approval drift, and incomplete critical controls', () => {
  const valid = ACTION_DEFINITIONS[0];
  assert.deepEqual(
    validateDeveloperActionRegistry([valid, valid]),
    { ok: false, error: 'duplicate_action_id' }
  );
  const approvalDrift = ACTION_DEFINITIONS[0];
  assert.deepEqual(
    validateDeveloperActionRegistry([{ ...approvalDrift, requiresApproval: true }]),
    { ok: false, error: 'approval_policy_mismatch' }
  );
  const critical = ACTION_DEFINITIONS.find((item) => item.riskTier === 'R3');
  assert.deepEqual(
    validateDeveloperActionRegistry([{ ...critical, requiresIndependentApproval: false }]),
    { ok: false, error: 'critical_action_controls_missing' }
  );
});
