import test from 'node:test';
import assert from 'node:assert/strict';

const CONTROL_RPCS = new Set(['rpc_ai_confirmation_create','rpc_ai_confirmation_consume','rpc_ai_confirmation_cancel','rpc_web_session_verify','rpc_teacher_login','rpc_teacher_web_login','rpc_app_login_bind','rpc_app_session_poll','rpc_teacher_card_login_start','rpc_qr_resolve']);
const VALID_FAILURE_MODES = new Set(['permission_denied','scope_denied','confirmation_required','target_invalid','conflict','not_found','validation_error','execution_failed']);

function executeBoundary(input) {
  if (!input?.contract) return {decision:'DENY',reason:'missing_contract'};
  if (!input.session?.active) return {decision:'DENY',reason:'session_required'};
  if (!input.authority?.allowed) return {decision:'DENY',reason:'authority_denied'};
  if (!input.scope?.allowed) return {decision:'DENY',reason:'scope_denied'};
  if (CONTROL_RPCS.has(input.contract.rpc)) return {decision:'DENY',reason:'internal_control_rpc'};
  if (input.contract.risk_level === 'UNKNOWN') return {decision:'DENY',reason:'unknown_risk'};
  if (['HIGH','VERY_HIGH','CRITICAL'].includes(input.contract.risk_level) && !input.confirmation?.valid) return {decision:'CONFIRM_REQUIRED',reason:'confirmation_required'};
  if (input.contract.target_validation && !input.target?.valid) return {decision:'DENY',reason:'target_validation_failed'};
  if (input.contract.rpc !== input.resolved?.rpc) return {decision:'DENY',reason:'rpc_substitution'};
  if (input.confirmation?.valid && input.action_digest !== input.confirmation.action_digest) return {decision:'DENY',reason:'action_digest_mismatch'};
  if (input.contract.classification === 'MUTATION') {
    if (input.contract.session_required !== true) return {decision:'DENY',reason:'mutation_session_required'};
    if (!input.contract.audit_required) return {decision:'DENY',reason:'mutation_audit_required'};
    if (!input.contract.idempotency || input.contract.idempotency === 'read-only') return {decision:'DENY',reason:'mutation_idempotency_required'};
    if (!VALID_FAILURE_MODES.has(input.contract.failure_mode)) return {decision:'DENY',reason:'failure_semantics_required'};
    if (!input.contract.audit_event || input.contract.audit_event !== input.contract.action_id) return {decision:'DENY',reason:'audit_event_integrity_required'};
  }
  return {decision:'ALLOW',rpc:input.contract.rpc};
}

const mutationBase = {
  contract:{action_id:'student.update',rpc:'rpc_update_student',risk_level:'MEDIUM',classification:'MUTATION',session_required:true,audit_required:true,idempotency:'request-key',failure_mode:'execution_failed',audit_event:'student.update'},
  resolved:{rpc:'rpc_update_student'},session:{active:true},authority:{allowed:true},scope:{allowed:true}
};

test('execution boundary fails closed without contract',()=>assert.equal(executeBoundary({}).decision,'DENY'));
test('execution boundary checks session, authority and scope before execution',()=>{
  const b={contract:{rpc:'rpc_update_student',risk_level:'MEDIUM'},resolved:{rpc:'rpc_update_student'}};
  assert.equal(executeBoundary(b).reason,'session_required');
  assert.equal(executeBoundary({...b,session:{active:true}}).reason,'authority_denied');
  assert.equal(executeBoundary({...b,session:{active:true},authority:{allowed:true}}).reason,'scope_denied');
});
test('high-risk actions require valid confirmation',()=>{
  const i={contract:{rpc:'rpc_delete_student',risk_level:'HIGH'},resolved:{rpc:'rpc_delete_student'},session:{active:true},authority:{allowed:true},scope:{allowed:true}};
  assert.equal(executeBoundary(i).decision,'CONFIRM_REQUIRED');
});
test('confirmation cannot replace authorization or scope',()=>{
  const i={contract:{rpc:'rpc_delete_student',risk_level:'HIGH'},resolved:{rpc:'rpc_delete_student'},session:{active:true},authority:{allowed:false},scope:{allowed:true},confirmation:{valid:true,action_digest:'d'},action_digest:'d'};
  assert.equal(executeBoundary(i).reason,'authority_denied');
});
test('execution rejects RPC substitution after confirmation',()=>{
  const i={contract:{rpc:'rpc_update_student',risk_level:'MEDIUM'},resolved:{rpc:'rpc_delete_student'},session:{active:true},authority:{allowed:true},scope:{allowed:true}};
  assert.equal(executeBoundary(i).reason,'rpc_substitution');
});
test('execution rejects confirmation digest mismatch',()=>{
  const i={contract:{rpc:'rpc_update_student',risk_level:'MEDIUM'},resolved:{rpc:'rpc_update_student'},session:{active:true},authority:{allowed:true},scope:{allowed:true},confirmation:{valid:true,action_digest:'confirmed'},action_digest:'tampered'};
  assert.equal(executeBoundary(i).reason,'action_digest_mismatch');
});
test('internal control RPCs are never executable business actions',()=>{
  const i={contract:{rpc:'rpc_ai_confirmation_consume',risk_level:'CRITICAL'},resolved:{rpc:'rpc_ai_confirmation_consume'},session:{active:true},authority:{allowed:true},scope:{allowed:true},confirmation:{valid:true,action_digest:'d'},action_digest:'d'};
  assert.equal(executeBoundary(i).reason,'internal_control_rpc');
});
test('target validation runs before execution',()=>{
  const i={contract:{rpc:'rpc_delete_student',risk_level:'HIGH',target_validation:'student_id'},resolved:{rpc:'rpc_delete_student'},session:{active:true},authority:{allowed:true},scope:{allowed:true},confirmation:{valid:true,action_digest:'d'},action_digest:'d',target:{valid:false}};
  assert.equal(executeBoundary(i).reason,'target_validation_failed');
});
test('mutation contracts require audit and non-read-only idempotency',()=>{
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,audit_required:false}}).reason,'mutation_audit_required');
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,idempotency:'read-only'}}).reason,'mutation_idempotency_required');
  assert.equal(executeBoundary(mutationBase).decision,'ALLOW');
});
test('mutation contracts require explicit failure semantics',()=>{
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,failure_mode:''}}).reason,'failure_semantics_required');
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,failure_mode:'unknown'}}).reason,'failure_semantics_required');
  assert.equal(executeBoundary(mutationBase).decision,'ALLOW');
});
test('mutation audit event must bind to the canonical action id',()=>{
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,audit_event:'student.delete'}}).reason,'audit_event_integrity_required');
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,audit_event:''}}).reason,'audit_event_integrity_required');
  assert.equal(executeBoundary(mutationBase).decision,'ALLOW');
});
test('failure results must use declared failure semantics and cannot report success',()=>{
  const failure={status:'failure',failure_mode:'execution_failed',error_code:'RPC_ERROR'};
  assert.equal(VALID_FAILURE_MODES.has(failure.failure_mode),true);
  assert.notEqual(failure.status,'success');
  assert.equal(VALID_FAILURE_MODES.has('made_up_mode'),false);
});
test('mutation idempotency requires an explicit replay strategy, not authorization bypass',()=>{
  const strategies=new Set(['request-key','idempotency-key','natural-key','unique-constraint']);
  assert.equal(strategies.has(mutationBase.contract.idempotency),true);
  assert.equal(executeBoundary({...mutationBase,contract:{...mutationBase.contract,idempotency:'read-only'}}).reason,'mutation_idempotency_required');
  assert.equal(executeBoundary({...mutationBase,confirmation:{valid:true,action_digest:'x'},action_digest:'x'}).decision,'ALLOW');
  assert.equal(executeBoundary({...mutationBase,confirmation:{valid:true,action_digest:'x'},action_digest:'y'}).reason,'action_digest_mismatch');
});
