'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeDeveloperAction } = require('../../school-website/server/developer-operator-authorization');

const NOW = Date.parse('2026-10-09T07:00:00.000Z');
const ACTION_POLICIES = Object.freeze({
  'schools.read': Object.freeze({ targetRequired: true, requiresApproval: false }),
  'schools.delete': Object.freeze({ targetRequired: true, requiresApproval: true })
});

function context(overrides = {}) {
  return {
    now: NOW,
    identity: { userId: 'operator-1', verified: true },
    session: { expiresAt: '2026-10-09T08:00:00.000Z', revoked: false },
    operator: {
      userId: 'operator-1',
      status: 'active',
      capabilities: ['schools.read', 'schools.delete'],
      scope: { type: 'schools', schoolIds: ['school-a'] }
    },
    actionPolicies: ACTION_POLICIES,
    ...overrides
  };
}

function request(overrides = {}) {
  return { action: 'schools.read', targetSchoolId: 'school-a', ...overrides };
}

function approval(overrides = {}) {
  return {
    id: 'approval-1',
    status: 'approved',
    action: 'schools.delete',
    targetId: 'school-a',
    targetSchoolId: 'school-a',
    requestedBy: 'operator-1',
    approvedBy: 'operator-2',
    expiresAt: '2026-10-09T07:30:00.000Z',
    consumedAt: null,
    ...overrides
  };
}

function highRiskRequest(overrides = {}) {
  return request({ action: 'schools.delete', approvalId: 'approval-1', ...overrides });
}

function approvedContext(approvalOverrides = {}, contextOverrides = {}) {
  return context({ approval: approval(approvalOverrides), ...contextOverrides });
}

test('allows a verified active operator with an explicit capability and in-scope target', () => {
  assert.equal(authorizeDeveloperAction(context(), request()).allowed, true);
});

test('denies anonymous or unverified identities', () => {
  assert.equal(authorizeDeveloperAction(context({ identity: null }), request()).reason, 'verified_identity_required');
  assert.equal(authorizeDeveloperAction(context({ identity: { userId: 'operator-1', verified: false } }), request()).reason, 'verified_identity_required');
});

test('denies revoked, expired, or malformed sessions', () => {
  assert.equal(authorizeDeveloperAction(context({ session: { expiresAt: '2026-10-09T08:00:00Z', revoked: true } }), request()).reason, 'active_session_required');
  assert.equal(authorizeDeveloperAction(context({ session: { expiresAt: '2026-10-09T06:00:00Z', revoked: false } }), request()).reason, 'session_expired');
  assert.equal(authorizeDeveloperAction(context({ session: { expiresAt: 'not-a-date', revoked: false } }), request()).reason, 'session_expired');
});

test('denies unprovisioned, disabled, and identity-mismatched operators', () => {
  assert.equal(authorizeDeveloperAction(context({ operator: null }), request()).reason, 'active_operator_required');
  assert.equal(authorizeDeveloperAction(context({ operator: { ...context().operator, status: 'disabled' } }), request()).reason, 'active_operator_required');
  assert.equal(authorizeDeveloperAction(context({ operator: { ...context().operator, userId: 'operator-2' } }), request()).reason, 'active_operator_required');
});

test('denies actions absent from the server-owned policy registry', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'billing.refund' })).reason, 'action_policy_missing');
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'toString' })).reason, 'action_policy_missing');
});

test('denies cross-tenant targets for school-scoped operators', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ targetSchoolId: 'school-b' })).reason, 'cross_tenant_denied');
});

test('platform-scoped operators may target another school only with the explicit capability', () => {
  const c = context({ operator: { ...context().operator, scope: { type: 'platform' } } });
  assert.equal(authorizeDeveloperAction(c, request({ targetSchoolId: 'school-b' })).allowed, true);
});

test('requires a server-loaded approval record for high-risk actions', () => {
  assert.equal(authorizeDeveloperAction(context(), highRiskRequest()).reason, 'approval_required');
  assert.equal(authorizeDeveloperAction(context(), highRiskRequest({ approval: approval() })).reason, 'approval_required');
  assert.equal(authorizeDeveloperAction(approvedContext({ status: 'pending' }), highRiskRequest()).reason, 'approval_not_approved');
  assert.equal(authorizeDeveloperAction(approvedContext(), highRiskRequest({ approvalId: 'different-id' })).reason, 'approval_required');
});

test('denies approval bound to a different action, resource, or school scope', () => {
  assert.equal(authorizeDeveloperAction(approvedContext({ action: 'billing.refund' }), highRiskRequest()).reason, 'approval_binding_mismatch');
  assert.equal(authorizeDeveloperAction(approvedContext({ targetId: 'school-b' }), highRiskRequest()).reason, 'approval_binding_mismatch');
  assert.equal(authorizeDeveloperAction(approvedContext({ targetSchoolId: 'school-b' }), highRiskRequest()).reason, 'approval_binding_mismatch');
  assert.equal(authorizeDeveloperAction(approvedContext({ targetId: 'school-b', targetSchoolId: 'school-b' }, {
    operator: { ...context().operator, scope: { type: 'platform' } }
  }), highRiskRequest({ targetSchoolId: 'school-b' })).allowed, true);
});

test('denies self-approved, replayed, or expired approvals', () => {
  assert.equal(authorizeDeveloperAction(approvedContext({ approvedBy: 'operator-1' }), highRiskRequest()).reason, 'independent_approval_required');
  assert.equal(authorizeDeveloperAction(approvedContext({ consumedAt: '2026-10-09T06:59:00Z' }), highRiskRequest()).reason, 'approval_already_consumed');
  assert.equal(authorizeDeveloperAction(approvedContext({ expiresAt: '2026-10-09T06:59:00Z' }), highRiskRequest()).reason, 'approval_expired');
});

test('school-scoped operators cannot omit a target or weaken the server-owned target requirement', () => {
  assert.equal(authorizeDeveloperAction(context(), { action: 'schools.read', targetRequired: false }).reason, 'target_required');
});

test('denies malformed action policy context by default', () => {
  assert.equal(authorizeDeveloperAction(context({ actionPolicies: null }), request()).reason, 'action_policy_missing');
});
