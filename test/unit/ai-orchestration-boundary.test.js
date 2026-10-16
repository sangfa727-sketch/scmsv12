import test from 'node:test';
import assert from 'node:assert/strict';

const EXECUTION_OWNERS = new Set(['supabase']);
const FORBIDDEN_EXECUTION_CREDENTIALS = new Set(['service_role','SUPABASE_SERVICE_ROLE_KEY']);

function orchestrationBoundary(input) {
  if (input?.actor === 'n8n' && input?.operation === 'execute_business_rpc') {
    return { decision: 'DENY', reason: 'orchestrator_cannot_execute' };
  }
  if (!EXECUTION_OWNERS.has(input?.execution_owner)) {
    return { decision: 'DENY', reason: 'trusted_execution_owner_required' };
  }
  if (FORBIDDEN_EXECUTION_CREDENTIALS.has(input?.credential)) {
    return { decision: 'DENY', reason: 'privileged_credential_forbidden' };
  }
  if (input?.direct_rpc === true && input?.execution_owner !== 'supabase') {
    return { decision: 'DENY', reason: 'direct_rpc_outside_execution_boundary' };
  }
  return { decision: 'ALLOW' };
}

test('n8n remains orchestration-only and cannot execute business RPCs', () => {
  const result = orchestrationBoundary({
    actor: 'n8n',
    operation: 'execute_business_rpc',
    execution_owner: 'n8n'
  });
  assert.equal(result.decision, 'DENY');
  assert.equal(result.reason, 'orchestrator_cannot_execute');
});

test('business execution requires the trusted Supabase boundary', () => {
  assert.equal(
    orchestrationBoundary({
      actor: 'n8n',
      operation: 'request_action',
      execution_owner: 'n8n'
    }).reason,
    'trusted_execution_owner_required'
  );
  assert.equal(
    orchestrationBoundary({
      actor: 'action-dispatcher',
      operation: 'execute_business_rpc',
      execution_owner: 'supabase'
    }).decision,
    'ALLOW'
  );
});

test('service-role credentials are never part of the AI execution contract', () => {
  for (const credential of FORBIDDEN_EXECUTION_CREDENTIALS) {
    const result = orchestrationBoundary({
      actor: 'action-dispatcher',
      operation: 'execute_business_rpc',
      execution_owner: 'supabase',
      credential
    });
    assert.equal(result.decision, 'DENY');
    assert.equal(result.reason, 'privileged_credential_forbidden');
  }
});

test('direct business RPC execution outside Supabase boundary is denied', () => {
  const result = orchestrationBoundary({
    actor: 'n8n',
    operation: 'execute_business_rpc',
    execution_owner: 'n8n',
    direct_rpc: true
  });
  assert.equal(result.decision, 'DENY');
});
