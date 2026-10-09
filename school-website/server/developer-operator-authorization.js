'use strict';

/**
 * Developer Control Center authorization decision contract.
 *
 * This pure policy helper is neither an HTTP endpoint nor an identity verifier.
 * A trusted server adapter must verify the provider session and load identity,
 * session, operator, action policies, and any approval record from server-owned
 * sources. It must also resolve the actual target resource to its authoritative
 * school/tenant before constructing this context. Never build it from request
 * JSON or client claims.
 *
 * Approval consumption and audit persistence must be atomic in the repository
 * adapter. This helper does not mutate persistent state and is not sufficient
 * on its own to enforce one-time approval use.
 */

function deny(reason) {
  return { allowed: false, reason };
}

function authorizeDeveloperAction(context, request) {
  if (!context || typeof context !== 'object' || !request || typeof request !== 'object') {
    return deny('invalid_context');
  }

  const { identity, session, operator, actionPolicies } = context;
  if (!identity || identity.verified !== true || typeof identity.userId !== 'string' || !identity.userId.trim()) {
    return deny('verified_identity_required');
  }
  if (!session || session.revoked === true || typeof session.expiresAt !== 'string') {
    return deny('active_session_required');
  }
  const expiry = Date.parse(session.expiresAt);
  const now = Number.isFinite(context.now) ? context.now : Date.now();
  if (!Number.isFinite(expiry) || expiry <= now) return deny('session_expired');

  if (!operator || operator.status !== 'active' || operator.userId !== identity.userId) {
    return deny('active_operator_required');
  }
  if (typeof request.action !== 'string' || !request.action.trim()) return deny('action_required');

  // Policy is loaded by the trusted adapter, never supplied by the request.
  const policy = actionPolicies && Object.hasOwn(actionPolicies, request.action)
    ? actionPolicies[request.action]
    : null;
  if (!policy || typeof policy !== 'object') return deny('action_policy_missing');

  const capabilities = Array.isArray(operator.capabilities) ? operator.capabilities : [];
  if (!capabilities.includes(request.action)) return deny('capability_denied');

  const scope = operator.scope;
  if (!scope || !['platform', 'schools'].includes(scope.type)) return deny('invalid_operator_scope');

  const targetRequired = policy.targetRequired === true || scope.type === 'schools';
  if (request.targetSchoolId !== undefined) {
    if (typeof request.targetSchoolId !== 'string' || !request.targetSchoolId.trim()) {
      return deny('invalid_target_school');
    }
    if (scope.type === 'schools' && (!Array.isArray(scope.schoolIds) || !scope.schoolIds.includes(request.targetSchoolId))) {
      return deny('cross_tenant_denied');
    }
  } else if (targetRequired) {
    return deny('target_required');
  }

  if (policy.requiresApproval === true) {
    // Approval record must be fetched by a trusted adapter using approvalId.
    // It must bind both the exact resource and its authoritative school scope.
    // Never trust a record/object submitted by the caller.
    const approval = context.approval;
    if (!approval || typeof approval !== 'object' ||
        typeof request.approvalId !== 'string' || !request.approvalId ||
        approval.id !== request.approvalId) return deny('approval_required');
    if (approval.status !== 'approved') return deny('approval_not_approved');
    const targetId = request.targetId ?? request.targetSchoolId ?? null;
    if (approval.action !== request.action ||
        approval.targetId !== targetId ||
        (request.targetSchoolId !== undefined && approval.targetSchoolId !== request.targetSchoolId)) {
      return deny('approval_binding_mismatch');
    }
    if (approval.requestedBy !== identity.userId || typeof approval.approvedBy !== 'string' ||
        !approval.approvedBy.trim() || approval.approvedBy === approval.requestedBy) {
      return deny('independent_approval_required');
    }
    if (approval.consumedAt !== null && approval.consumedAt !== undefined) return deny('approval_already_consumed');
    const approvalExpiry = Date.parse(approval.expiresAt);
    if (!Number.isFinite(approvalExpiry) || approvalExpiry <= now) return deny('approval_expired');
  }

  return {
    allowed: true,
    reason: 'authorized',
    actorId: identity.userId,
    action: request.action,
    targetSchoolId: request.targetSchoolId ?? null
  };
}

module.exports = { authorizeDeveloperAction };
