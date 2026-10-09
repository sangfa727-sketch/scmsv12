const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const plan = fs.readFileSync(
  path.join(ROOT, 'docs/DEVELOPER-CONTROL-CENTER-PLAN.md'),
  'utf8'
);

test('DCC design defines dedicated operator, role, permission, audit and approval records', () => {
  for (const table of [
    'developer_operators',
    'developer_operator_roles',
    'developer_role_permissions',
    'developer_audit_logs',
    'developer_action_approvals',
  ]) {
    assert.ok(plan.includes(table), `DCC design missing ${table}`);
  }
});

test('DCC release plan requires denial of untrusted identities and tenant crossing', () => {
  for (const requirement of [
    'Anonymous',
    'unprovisioned operators',
    'cross-tenant',
    'Expired, consumed, or mismatched approval',
    'Public signup',
  ]) {
    assert.ok(plan.includes(requirement), `DCC test matrix missing: ${requirement}`);
  }
});

test('DCC release gate keeps sandbox verification separate from production release', () => {
  assert.match(plan, /isolated sandbox/i);
  assert.match(plan, /rollback procedure/i);
  assert.match(plan, /explicit approval before production deployment/i);
  assert.match(plan, /separate explicit approval before merging/i);
});

test('DCC design forbids storing privileged secrets and direct browser CRUD', () => {
  assert.match(plan, /Never store passwords/i);
  assert.match(plan, /No direct browser CRUD/i);
  assert.match(plan, /append-only/i);
});
