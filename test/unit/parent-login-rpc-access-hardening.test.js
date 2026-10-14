const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const migration = fs.readFileSync('supabase/migrations/20261014132000_restrict_parent_login_rpc.sql', 'utf8');

test('parent login RPC cannot be invoked directly by browser roles', () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_parent_google_login\(text, text, text\)\s+FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_parent_google_login\(text, text, text\)\s+TO service_role/i);
});

test('teacher invite redemption locks the invite row before creating the account', () => {
  const inviteMigration = fs.readFileSync('supabase/migrations/20261014133000_lock_teacher_invite_redemption.sql', 'utf8');
  assert.match(inviteMigration, /FROM public\.teacher_invites[\s\S]*WHERE invite_code = p_invite_code[\s\S]*redeemed_at IS NULL[\s\S]*LIMIT 1\s+FOR UPDATE/i);
});

test('school ID generation serializes MAX-plus-one allocation', () => {
  const schoolIdMigration = fs.readFileSync('supabase/migrations/20261014134000_serialize_school_id_generation.sql', 'utf8');
  assert.match(schoolIdMigration, /pg_advisory_xact_lock[\s\S]*hashtext\('scms\.rpc_generate_school_id'\)/);
  assert.match(schoolIdMigration, /MAX\(CAST\(SUBSTRING\(school_id FROM 'SCH-/);
});

test('parent login Edge Function is version-controlled and rejects malformed expiry/body inputs', () => {
  const edge = fs.readFileSync('supabase/functions/parent-google-login/index.ts', 'utf8');
  assert.match(edge, /MAX_BODY_BYTES\s*=\s*16\s*\*\s*1024/);
  assert.match(edge, /body_too_large/);
  assert.match(edge, /claims\.exp\s*===\s*undefined/);
  assert.match(edge, /!Number\.isFinite\(exp\)/);
  assert.match(edge, /exp\s*<=\s*Math\.floor\(Date\.now\(\)\s*\/\s*1000\)/);
  assert.match(edge, /claims\.aud\s*!==\s*GOOGLE_CLIENT_ID/);
  assert.match(edge, /claims\.email_verified/);
  assert.match(edge, /Authorization.*Bearer.*SERVICE_ROLE_KEY/);
  assert.match(edge, /rpc_parent_google_login/);
});
