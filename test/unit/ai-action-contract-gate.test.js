const test = require('node:test');
const assert = require('node:assert/strict');

const REQUIRED_FIELDS = [
  'action_id',
  'domain',
  'actor',
  'session_required',
  'scope',
  'permission',
  'risk_level',
  'confirmation_required',
  'target_validation',
  'rpc',
  'audit_required',
  'idempotency',
  'failure_mode',
  'classification'
];

const INTERNAL_CLASSIFICATIONS = new Set(['INTERNAL_SYSTEM', 'CONTROL']);
const HIGH_RISK = new Set(['HIGH', 'VERY_HIGH', 'CRITICAL']);
const DESTRUCTIVE_ACTIONS = new Set(['DELETE', 'DESTRUCTIVE']);

function validateActionContract(action) {
  const errors = [];
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return ['action must be an object'];
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in action)) errors.push('missing:' + field);
  }

  if (typeof action.action_id !== 'string' || !action.action_id.trim()) errors.push('invalid:action_id');
  if (typeof action.domain !== 'string' || !action.domain.trim()) errors.push('invalid:domain');
  if (typeof action.actor !== 'string' || !action.actor.trim()) errors.push('invalid:actor');
  if (typeof action.session_required !== 'boolean') errors.push('invalid:session_required');
  if (typeof action.confirmation_required !== 'boolean') errors.push('invalid:confirmation_required');
  if (typeof action.audit_required !== 'boolean') errors.push('invalid:audit_required');
  if (typeof action.scope !== 'string' || !action.scope.trim()) errors.push('invalid:scope');
  if (typeof action.permission !== 'string' || !action.permission.trim()) errors.push('invalid:permission');
  if (typeof action.risk_level !== 'string' || !action.risk_level.trim()) errors.push('invalid:risk_level');
  if (typeof action.target_validation !== 'string' || !action.target_validation.trim()) errors.push('invalid:target_validation');
  if (typeof action.idempotency !== 'string' || !action.idempotency.trim()) errors.push('invalid:idempotency');
  if (typeof action.failure_mode !== 'string' || !action.failure_mode.trim()) errors.push('invalid:failure_mode');
  if (typeof action.classification !== 'string' || !action.classification.trim()) errors.push('invalid:classification');

  if (action.rpc !== null && (typeof action.rpc !== 'string' || !/^rpc_[a-z0-9_]+$/.test(action.rpc))) {
    errors.push('invalid:rpc');
  }

  if (INTERNAL_CLASSIFICATIONS.has(action.classification)) {
    errors.push('internal-system-action-not-exposed');
  }

  if (action.classification === 'MULTI_ACTION' || action.classification === 'MULTI-ACTION') {
    errors.push('multi-action-rpc-not-exposed-as-single-business-action');
  }

  if (action.classification === 'MUTATION' && action.session_required !== true) {
    errors.push('mutation-session-required');
  }

  if (action.classification === 'MUTATION' && String(action.idempotency).toLowerCase() === 'read-only') {
    errors.push('mutation-idempotency-required');
  }

  if (DESTRUCTIVE_ACTIONS.has(String(action.classification).toUpperCase()) &&
      (!action.target_validation || String(action.target_validation).trim() === '')) {
    errors.push('destructive-target-validation-required');
  }

  if (HIGH_RISK.has(action.risk_level) && action.confirmation_required !== true) {
    errors.push('high-risk-confirmation-required');
  }

  if (['HEALTH', 'QR', 'SECURITY'].includes(String(action.domain).toUpperCase()) &&
      !HIGH_RISK.has(action.risk_level)) {
    errors.push('sensitive-domain-risk-downgrade');
  }

  if (action.classification === 'MUTATION' && action.audit_required !== true) {
    errors.push('mutation-audit-required');
  }

  return errors;
}

function validateRegistry(registry) {
  if (!Array.isArray(registry)) return ['canonical-registry-missing'];
  const errors = [];
  const ids = new Set();

  if (registry.length !== 117) errors.push('canonical-registry-must-contain-117-business-actions');

  for (const action of registry) {
    const actionErrors = validateActionContract(action);
    for (const error of actionErrors) errors.push((action && action.action_id ? action.action_id + ':' : '') + error);

    if (action && typeof action.action_id === 'string') {
      if (ids.has(action.action_id)) errors.push('duplicate-action-id:' + action.action_id);
      ids.add(action.action_id);
    }
  }

  return errors;
}

test('AI action contract gate fails closed when canonical registry is absent', () => {
  assert.deepEqual(validateRegistry(null), ['canonical-registry-missing']);
  assert.deepEqual(validateRegistry(undefined), ['canonical-registry-missing']);
});

test('AI action contract gate requires exactly 117 business actions', () => {
  const one = {
    action_id: 'student.read',
    domain: 'Student',
    actor: 'teacher',
    session_required: true,
    scope: 'school',
    permission: 'students.view',
    risk_level: 'LOW',
    confirmation_required: false,
    target_validation: 'student_scope',
    rpc: 'rpc_get_student_by_id',
    audit_required: true,
    idempotency: 'read-only',
    failure_mode: 'permission_denied',
    classification: 'READ'
  };
  assert.ok(validateRegistry([one]).includes('canonical-registry-must-contain-117-business-actions'));
});

test('AI action contract gate rejects incomplete contracts', () => {
  const errors = validateActionContract({ action_id: 'student.read' });
  assert.ok(errors.includes('missing:permission'));
  assert.ok(errors.includes('missing:risk_level'));
  assert.ok(errors.includes('missing:rpc'));
  assert.ok(errors.includes('missing:failure_mode'));
});

test('AI action contract gate rejects internal/system controls as business actions', () => {
  const action = {
    action_id: 'control.confirmation.consume',
    domain: 'Security',
    actor: 'system',
    session_required: true,
    scope: 'session',
    permission: 'system.control',
    risk_level: 'CRITICAL',
    confirmation_required: true,
    target_validation: 'confirmation',
    rpc: 'rpc_ai_confirmation_consume',
    audit_required: true,
    idempotency: 'atomic-once',
    failure_mode: 'forbidden',
    classification: 'CONTROL'
  };
  assert.ok(validateActionContract(action).includes('internal-system-action-not-exposed'));
});

test('AI action contract gate requires confirmation for high-risk actions', () => {
  const action = {
    action_id: 'student.delete',
    domain: 'Student',
    actor: 'admin',
    session_required: true,
    scope: 'school',
    permission: 'students.edit',
    risk_level: 'HIGH',
    confirmation_required: false,
    target_validation: 'student_scope',
    rpc: 'rpc_delete_student',
    audit_required: true,
    idempotency: 'target-key',
    failure_mode: 'permission_denied',
    classification: 'MUTATION'
  };
  assert.ok(validateActionContract(action).includes('high-risk-confirmation-required'));
});

test('AI action contract gate prevents health, QR and security risk downgrades', () => {
  for (const domain of ['HEALTH', 'QR', 'SECURITY']) {
    const action = {
      action_id: domain.toLowerCase() + '.test',
      domain,
      actor: 'admin',
      session_required: true,
      scope: 'school',
      permission: 'students.edit',
      risk_level: 'MEDIUM',
      confirmation_required: false,
      target_validation: 'target',
      rpc: 'rpc_test_action',
      audit_required: true,
      idempotency: 'target-key',
      failure_mode: 'permission_denied',
      classification: 'MUTATION'
    };
    assert.ok(validateActionContract(action).includes('sensitive-domain-risk-downgrade'));
  }
});

test('AI action contract gate rejects duplicate action ids', () => {
  const action = {
    action_id: 'student.read',
    domain: 'Student',
    actor: 'teacher',
    session_required: true,
    scope: 'school',
    permission: 'students.view',
    risk_level: 'LOW',
    confirmation_required: false,
    target_validation: 'student_scope',
    rpc: 'rpc_get_student_by_id',
    audit_required: true,
    idempotency: 'read-only',
    failure_mode: 'permission_denied',
    classification: 'READ'
  };
  const errors = validateRegistry([action, action]);
  assert.ok(errors.includes('duplicate-action-id:student.read'));
});

test('AI action contract gate validates RPC boundary syntax', () => {
  const action = {
    action_id: 'student.write',
    domain: 'Student',
    actor: 'teacher',
    session_required: true,
    scope: 'school',
    permission: 'students.edit',
    risk_level: 'MEDIUM',
    confirmation_required: false,
    target_validation: 'student_scope',
    rpc: 'delete from students',
    audit_required: true,
    idempotency: 'target-key',
    failure_mode: 'permission_denied',
    classification: 'MUTATION'
  };
  assert.ok(validateActionContract(action).includes('invalid:rpc'));
});


test('AI action contract gate requires session binding and idempotency for mutations', () => {
  const action = {
    action_id: 'student.write',
    domain: 'Student',
    actor: 'teacher',
    session_required: false,
    scope: 'school',
    permission: 'students.edit',
    risk_level: 'MEDIUM',
    confirmation_required: false,
    target_validation: 'student_scope',
    rpc: 'rpc_update_student',
    audit_required: true,
    idempotency: 'read-only',
    failure_mode: 'permission_denied',
    classification: 'MUTATION'
  };
  const errors = validateActionContract(action);
  assert.ok(errors.includes('mutation-session-required'));
  assert.ok(errors.includes('mutation-idempotency-required'));
});

test('AI action contract gate rejects multi-action RPC exposure', () => {
  const action = {
    action_id: 'management.multi',
    domain: 'Management',
    actor: 'admin',
    session_required: true,
    scope: 'school',
    permission: 'management.edit',
    risk_level: 'HIGH',
    confirmation_required: true,
    target_validation: 'teacher_scope',
    rpc: 'rpc_manage_teacher_access',
    audit_required: true,
    idempotency: 'atomic-once',
    failure_mode: 'conflict',
    classification: 'MULTI_ACTION'
  };
  assert.ok(validateActionContract(action).includes('multi-action-rpc-not-exposed-as-single-business-action'));
});

test('AI action contract gate requires target validation for destructive actions', () => {
  const action = {
    action_id: 'student.delete',
    domain: 'Student',
    actor: 'admin',
    session_required: true,
    scope: 'school',
    permission: 'students.edit',
    risk_level: 'CRITICAL',
    confirmation_required: true,
    target_validation: '',
    rpc: 'rpc_delete_student',
    audit_required: true,
    idempotency: 'strict-once',
    failure_mode: 'target_state_invalid',
    classification: 'DELETE'
  };
  assert.ok(validateActionContract(action).includes('destructive-target-validation-required'));
});
