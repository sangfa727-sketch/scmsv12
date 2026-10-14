const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('js/02C_api_students.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261014138000_secure_native_student_mutations.sql', 'utf8');

test('native student mutations use a linked Telegram session and RPC, never anonymous table writes', () => {
  assert.match(api, /window\.getSavedSession\?\.\(\)/);
  assert.match(api, /rest\/v1\/rpc\/\$\{name\}/);
  assert.match(api, /rpc_app_update_student/);
  assert.match(api, /rpc_app_delete_student/);
  assert.doesNotMatch(api, /rest\/v1\/students[\s\S]{0,350}method:\s*'PATCH'/);
});

test('native mutation RPCs validate current identity, active school, and tenant ownership', () => {
  assert.match(migration, /a\.status = 'linked'/);
  assert.match(migration, /t\.telegram_id = a\.telegram_id/);
  assert.match(migration, /t\.school_id = a\.school_id/);
  assert.match(migration, /sc\.status = 'active'/);
  assert.match(migration, /st\.school_id = v_sess\.school_id|school_id = v_sess\.school_id/);
  assert.match(migration, /'admin', 'super_admin', 'school_coordinator', 'administrative_assistant'/);
  assert.match(migration, /'student\.update'/);
  assert.match(migration, /'student\.deactivate'/);
});

test('native update RPC rejects internal fields and minimizes student response', () => {
  assert.match(migration, /jsonb_object_keys\(p_patch\)/);
  assert.match(migration, /unsupported_fields/);
  assert.match(migration, /'student_id', v_row\.student_id/);
  assert.doesNotMatch(migration, /'qr_token',\s*v_row\.qr_token/);
  assert.doesNotMatch(migration, /'parent_tg_id',\s*v_row\.parent_tg_id/);
});
