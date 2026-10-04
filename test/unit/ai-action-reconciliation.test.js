const test = require('node:test');
const assert = require('node:assert/strict');

const REQUIRED_FIELDS = [
  'action_id','domain','actor','session_required','scope','permission',
  'risk_level','confirmation_required','target_validation','rpc',
  'audit_required','idempotency','failure_mode','classification'
];

const CONTROL_CLASSIFICATIONS = new Set(['CONTROL','INTERNAL_SYSTEM','INTERNAL/SYSTEM']);
const MULTI_ACTION_CLASSIFICATIONS = new Set(['MULTI_ACTION','MULTI-ACTION']);
const HIGH_RISK = new Set(['HIGH','VERY_HIGH','CRITICAL']);
const PROTECTED_DOMAINS = new Set(['HEALTH','QR','SECURITY']);
const MUTATIONS = new Set(['MUTATION','DELETE','DESTRUCTIVE']);

function validateCanonicalRows(rows) {
  const errors = [];
  if (!Array.isArray(rows)) return ['registry must be an array'];
  if (rows.length !== 117) errors.push(`registry must contain exactly 117 business actions; got ${rows.length}`);

  const ids = new Set();
  for (const [index, action] of rows.entries()) {
    const label = `row ${index + 1}`;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      errors.push(`${label}: action must be an object`);
      continue;
    }

    for (const field of REQUIRED_FIELDS) {
      if (!(field in action)) errors.push(`${label}: missing ${field}`);
    }

    if (typeof action.action_id !== 'string' || !action.action_id.trim()) {
      errors.push(`${label}: invalid action_id`);
    } else if (ids.has(action.action_id)) {
      errors.push(`duplicate action_id: ${action.action_id}`);
    } else {
      ids.add(action.action_id);
    }

    if (CONTROL_CLASSIFICATIONS.has(action.classification)) {
      errors.push(`${label}: internal/system control cannot be a business action`);
    }
    if (MULTI_ACTION_CLASSIFICATIONS.has(action.classification)) {
      errors.push(`${label}: multi-action RPC must be split into semantic actions`);
    }

    const isMutation = MUTATIONS.has(action.classification);
    if (isMutation && action.session_required !== true) {
      errors.push(`${label}: mutation requires session_required=true`);
    }
    if (isMutation && action.audit_required !== true) {
      errors.push(`${label}: mutation requires audit_required=true`);
    }
    if (isMutation && action.idempotency === 'read-only') {
      errors.push(`${label}: mutation cannot use read-only idempotency`);
    }
    if (action.classification === 'DESTRUCTIVE' && (!action.target_validation || !String(action.target_validation).trim())) {
      errors.push(`${label}: destructive action requires target_validation`);
    }
    if (HIGH_RISK.has(action.risk_level) && action.confirmation_required !== true) {
      errors.push(`${label}: high-risk action requires confirmation`);
    }

    const domain = String(action.domain || '').toUpperCase();
    if (PROTECTED_DOMAINS.has(domain) && !HIGH_RISK.has(action.risk_level)) {
      errors.push(`${label}: ${domain} action cannot be downgraded below HIGH`);
    }

    if (action.rpc != null && !/^rpc_[a-z0-9_]+$/.test(String(action.rpc))) {
      errors.push(`${label}: invalid RPC boundary`);
    }
  }
  return errors;
}

test('canonical reconciliation fails closed when registry is absent', () => {
  assert.ok(validateCanonicalRows(undefined).length > 0);
});

test('canonical reconciliation requires exactly 117 business rows', () => {
  const errors = validateCanonicalRows([]);
  assert.ok(errors.some((e) => e.includes('exactly 117')));
});

test('canonical reconciliation rejects duplicate action IDs and control rows', () => {
  const row = {
    action_id:'x',domain:'SYSTEM',actor:'admin',session_required:true,scope:'school',
    permission:'admin',risk_level:'LOW',confirmation_required:false,target_validation:'',
    rpc:'rpc_x',audit_required:false,idempotency:'read-only',failure_mode:'forbidden',
    classification:'CONTROL'
  };
  const errors = validateCanonicalRows([row, {...row}]);
  assert.ok(errors.some((e) => e.includes('duplicate action_id')));
  assert.ok(errors.some((e) => e.includes('internal/system control')));
});

test('canonical reconciliation rejects multi-action rows', () => {
  const row = {
    action_id:'x',domain:'STUDENT',actor:'admin',session_required:true,scope:'school',
    permission:'admin',risk_level:'MEDIUM',confirmation_required:false,target_validation:'',
    rpc:'rpc_x',audit_required:true,idempotency:'safe-retry',failure_mode:'forbidden',
    classification:'MULTI_ACTION'
  };
  const errors = validateCanonicalRows(Array.from({length:117}, (_, i) => ({...row, action_id:`x_${i}`})));
  assert.ok(errors.some((e) => e.includes('multi-action')));
});

test('canonical reconciliation rejects unsafe mutations', () => {
  const row = {
    action_id:'x',domain:'STUDENT',actor:'admin',session_required:false,scope:'school',
    permission:'admin',risk_level:'MEDIUM',confirmation_required:false,target_validation:'',
    rpc:'rpc_x',audit_required:false,idempotency:'read-only',failure_mode:'forbidden',
    classification:'MUTATION'
  };
  const errors = validateCanonicalRows(Array.from({length:117}, (_, i) => ({...row, action_id:`x_${i}`})));
  assert.ok(errors.some((e) => e.includes('mutation requires session_required')));
  assert.ok(errors.some((e) => e.includes('mutation requires audit_required')));
  assert.ok(errors.some((e) => e.includes('read-only idempotency')));
});
