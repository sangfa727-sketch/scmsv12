const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sql = fs.readFileSync('supabase/migrations/20261004120000_ai_execution_permission_gate.sql', 'utf8');

test('server-side registry contains exactly the 117 canonical action/RPC pairs', () => {
  assert.match(sql, /private\.ai_action_execution_registry/);
  const rows = sql.match(/\('[a-z0-9_]+','rpc_[a-z0-9_]+','(?:read|medium|high|very_high|critical)',(?:true|false)\)/g) || [];
  assert.equal(rows.length, 117);
});

test('gate revalidates live session and calls the private permission engine', () => {
  assert.match(sql, /app_web_sessions/);
  assert.match(sql, /expires_at>now\(\)/);
  assert.match(sql, /private\.web_has_permission\(/);
  assert.match(sql, /'permission_denied'/);
});

test('gate binds action and RPC to the server-side registry', () => {
  assert.match(sql, /where action=p_action/);
  assert.match(sql, /and rpc=p_rpc/);
  assert.match(sql, /active=true/);
  assert.match(sql, /'action_not_allowed'/);
});

test('gate rejects invalid and internal/system RPC boundaries', () => {
  assert.match(sql, /p_action !~ '\^\[a-z0-9_\]\+\$'/);
  assert.match(sql, /p_rpc !~ '\^rpc_\[a-z0-9_\]\+\$'/);
  for (const rpc of [
    'rpc_ai_confirmation_create','rpc_ai_confirmation_consume','rpc_ai_confirmation_cancel',
    'rpc_web_session_verify','rpc_teacher_login','rpc_teacher_web_login',
    'rpc_app_login_bind','rpc_app_session_poll','rpc_teacher_card_login_start','rpc_qr_resolve'
  ]) assert.match(sql, new RegExp(rpc));
  assert.match(sql, /'internal_or_invalid_rpc'/);
});

test('gate enforces the registry confirmation requirement before authorization', () => {
  assert.match(sql, /if v_contract\.confirmation_required/);
  assert.match(sql, /p_confirmed is not true/);
  assert.match(sql, /'confirmation_required'/);
});

test('registry is not directly readable or writable by client roles', () => {
  assert.match(sql, /revoke all on table private\.ai_action_execution_registry from public,anon,authenticated/);
  assert.match(sql, /revoke all on function public\.rpc_ai_execution_authorize/);
  assert.match(sql, /grant execute on function public\.rpc_ai_execution_authorize.*to anon,authenticated/);
});
