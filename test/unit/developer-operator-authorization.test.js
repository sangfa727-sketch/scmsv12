'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authorizeDeveloperAction } = require('../../school-website/server/developer-operator-authorization');

const NOW = Date.parse('2026-10-09T07:00:00.000Z');

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
    ...overrides
  };
}

function request(overrides = {}) {
  return { action: 'schools.read', targetSchoolId: 'school-a', ...overrides };
}

function approval(overrides = {}) {
  return {
    status: 'approved',
    action: 'schools.delete',
    targetId: 'school-a',
    requestedBy: 'operator-1',
    approvedBy: 'operator-2',
    expiresAt: '2026-10-09T07:30:00.000Z',
    consumedAt: null,
    ...overrides
  };
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

test('denies actions absent from the explicit capability list', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'billing.refund' })).reason, 'capability_denied');
});

test('denies cross-tenant targets for school-scoped operators', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ targetSchoolId: 'school-b' })).reason, 'cross_tenant_denied');
});

test('platform-scoped operators may target another school only with the explicit capability', () => {
  const c = context({ operator: { ...context().operator, scope: { type: 'platform' } } });
  assert.equal(authorizeDeveloperAction(c, request({ targetSchoolId: 'school-b' })).allowed, true);
});

test('denies high-risk actions when approval is missing or not approved', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', requiresApproval: true })).reason, 'approval_required');
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', requiresApproval: true, approval: approval({ status: 'pending' }) })).reason, 'approval_not_approved');
});

test('denies approval bound to a different action or target', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', requiresApproval: true, approval: approval({ action: 'billing.refund' }) })).reason, 'approval_binding_mismatch');
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', targetSchoolId: 'school-b', requiresApproval: true, approval: approval() })).reason, 'cross_tenant_denied');
});

test('denies self-approved, replayed, or expired approvals', () => {
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', requiresApproval: true, approval: approval({ approvedBy: 'operator-1' }) })).reason, 'independent_approval_required');
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', requiresApproval: true, approval: approval({ consumedAt: '2026-10-09T06:59:00Z' }) })).reason, 'approval_already_consumed');
  assert.equal(authorizeDeveloperAction(context(), request({ action: 'schools.delete', requiresApproval: true, approval: approval({ expiresAt: '2026-10-09T06:59:00Z' }) })).reason, 'approval_expired');
});

test('does not authorize a request with missing target when the policy requires one', () => {
  assert.equal(authorizeDeveloperAction(context(), { action: 'schools.read', targetRequired: true }).reason, 'target_required');
});
