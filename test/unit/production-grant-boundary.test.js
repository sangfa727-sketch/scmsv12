const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = (file) => fs.readFileSync(file, 'utf8');

test('client API no longer falls back to direct table reads for hardened domains', () => {
  for (const file of [
    'js/02C_api_students.js',
    'js/02D_api_attendance.js',
    'js/02E_api_academics.js',
    'js/02H_api_communication.js',
  ]) {
    assert.doesNotMatch(read(file), /sbQuery\(/, file + ' must not bypass server RPCs');
  }
});

test('direct client table exposure migration covers the audited domains', () => {
  const sql = read('supabase/migrations/20261004090000_revoke_direct_client_table_grants.sql');
  for (const table of [
    'assessments','attendance','communications','daily_reports','grades',
    'homework','homework_log','incidents','monthly_summary','parent_comms',
    'schools','students','subjects','teachers','terms','timetable',
  ]) {
    assert.match(sql, new RegExp("'" + table + "'"));
  }
  assert.match(sql, /REVOKE ALL ON TABLE public\.%I FROM PUBLIC, anon, authenticated/);
});

test('RPC implicit PUBLIC execution is removed without deleting explicit grants', () => {
  const sql = read('supabase/migrations/20261004090001_revoke_rpc_public_execute.sql');
  assert.match(sql, /p\.proname LIKE 'rpc_%'/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.%I\(%s\) FROM PUBLIC/);
  assert.doesNotMatch(sql, /FROM PUBLIC, anon, authenticated/);
});

test('future public-schema client grants are fail-closed by default', () => {
  const sql = read('supabase/migrations/20261004090002_lock_down_postgres_default_client_grants.sql');
  assert.match(sql, /REVOKE ALL ON TABLES FROM anon, authenticated/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON SEQUENCES FROM anon, authenticated/);
});
