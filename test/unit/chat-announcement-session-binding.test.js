'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Staff Chat announcement read receipt rejects stale role-bound sessions', () => {
  const migration = fs.readFileSync(path.resolve(
    __dirname,
    '../../supabase/migrations/20261010162000_staff_chat_announcement_read_session_binding.sql'
  ), 'utf8');

  assert.match(
    migration,
    /join public\.teachers t[\s\S]*?t\.teacher_id\s*=\s*s\.teacher_id[\s\S]*?t\.school_id\s*=\s*s\.school_id[\s\S]*?t\.role\s*=\s*s\.role/,
    'the current teacher role must still match the role bound to the web session'
  );
  assert.match(migration, /s\.expires_at\s*>\s*now\(\)/, 'expired sessions must be rejected');
  assert.match(migration, /t\.status\s*=\s*'active'/, 'inactive teachers must be rejected');
  assert.match(
    migration,
    /where announcement_id\s*=\s*p_announcement_id[\s\S]*?teacher_id\s*=\s*v_sess\.teacher_id[\s\S]*?school_id\s*=\s*v_sess\.school_id/,
    'read receipts must remain limited to the current recipient and tenant'
  );
  assert.match(migration, /revoke all on function public\.rpc_chat_announcement_mark_read\(text, uuid\) from public/);
  assert.match(migration, /grant execute on function public\.rpc_chat_announcement_mark_read\(text, uuid\) to anon, authenticated/);
});
