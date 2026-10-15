const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const edge = fs.readFileSync('supabase/functions/parent-google-login/index.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261016100000_parent_login_rate_limit.sql', 'utf8');

test('parent login uses persistent per-IP and per-email rate limits before the login RPC', () => {
  assert.match(edge, /x-forwarded-for/i);
  assert.match(edge, /sha256Hex/);
  assert.match(edge, /rpc_parent_login_rate_limit/);
  assert.match(edge, /MAX_IP_ATTEMPTS\s*=\s*10/);
  assert.match(edge, /MAX_EMAIL_ATTEMPTS\s*=\s*5/);
  assert.match(edge, /RATE_LIMIT_WINDOW_SECONDS\s*=\s*900/);
  assert.match(edge, /rate_limited/);
  assert.match(edge, /checkRateLimit[\s\S]{0,100}ip:/);
  assert.match(edge, /checkRateLimit[\s\S]{0,100}email:/);
  assert.ok(edge.indexOf('checkRateLimit') < edge.indexOf('oauth2.googleapis.com/tokeninfo'));
  assert.ok(edge.lastIndexOf('checkRateLimit') < edge.indexOf('rpc_parent_google_login'));
});

test('rate-limit RPC is atomic, bounded, and unavailable to browser roles', () => {
  assert.match(migration, /INSERT INTO private\.parent_login_rate_limits AS current_limit[\s\S]*ON CONFLICT \(key_hash\) DO UPDATE/);
  assert.match(migration, /p_window_seconds < 1 OR p_window_seconds > 86400/);
  assert.match(migration, /p_max_attempts < 1 OR p_max_attempts > 1000/);
  assert.match(migration, /REVOKE ALL ON TABLE private\.parent_login_rate_limits[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.rpc_parent_login_rate_limit\(text, integer, integer\)[\s\S]*FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_parent_login_rate_limit\(text, integer, integer\)[\s\S]*TO service_role/i);
});
