const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('public admission edge endpoint requires HTTPS Origin and returns exact-origin CORS', () => {
  const edge = read('supabase/functions/public-admission-submit/index.ts');
  assert.match(edge, /function trustedOrigin/);
  assert.match(edge, /parsed\.protocol !== "https:"/);
  assert.match(edge, /Access-Control-Allow-Origin", origin/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin":\s*"\*"/);
  assert.match(edge, /Vary", "Origin"/);
  assert.match(edge, /credentials:\s*"omit"/);
});

test('public admission edge endpoint uses server secret only and calls the isolated intake RPC', () => {
  const edge = read('supabase/functions/public-admission-submit/index.ts');
  assert.match(edge, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.match(edge, /rpc_website_admission_submit/);
  assert.match(edge, /p_hostname:\s*origin\.hostname/);
  assert.match(edge, /p_identity_hash:\s*await sha256\(identity\)/);
  assert.match(edge, /website\.trim\(\)/);
  assert.match(edge, /MAX_BODY_CHARS/);
  assert.match(edge, /credentials/);
  assert.doesNotMatch(edge, /students|service_role.*console\.log/i);
});

test('public admission migration isolates private intake and grants RPC only to service_role', () => {
  const sql = read('supabase/migrations/20261011160000_public_school_website_admission_intake.sql');
  assert.match(sql, /create table if not exists public\.website_sites/i);
  assert.match(sql, /create table if not exists public\.website_admission_applications/i);
  assert.match(sql, /create table if not exists public\.website_admission_rate_limits/i);
  assert.match(sql, /unique \(school_id, idempotency_key\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /revoke all on public\.website_admission_applications from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.rpc_website_admission_submit\([\s\S]*?\) to service_role/i);
  assert.doesNotMatch(sql, /grant select[^;]*to anon/i);
  assert.doesNotMatch(sql, /insert into public\.students/i);
});

test('admission form only submits when an HTTPS backend origin is configured and preserves safe retry idempotency', () => {
  const html = read('school-website/admission.html');
  const js = read('school-website/admission.js');
  assert.match(html, /name="scms-public-website-api-base" content=""/);
  assert.match(html, /id="submitAdmissionButton"/);
  assert.match(js, /normalizeApiBase/);
  assert.match(js, /url\.protocol!=="https:"/);
  assert.match(js, /idempotencyKey/);
  assert.match(js, /functions\/v1\/public-admission-submit/);
  assert.match(js, /form\.reset\(\)/);
  assert.match(js, /not yet a student registration/i);
  assert.doesNotMatch(js, /supabase\.from\(["']students|insert into students/i);
  new Function(js);
});
