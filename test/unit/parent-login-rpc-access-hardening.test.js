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
