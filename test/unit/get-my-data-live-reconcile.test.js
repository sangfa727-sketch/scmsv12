const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(
  path.join(__dirname, '../../supabase/migrations/20261005280000_get_my_data_permission_gate_live_reconcile.sql'),
  'utf8'
);

test('get_my_data reconciliation keeps session, permission, and fail-closed gates', () => {
  expect(migration).toContain("join public.teachers t");
  expect(migration).toContain("t.school_id = s.school_id");
  expect(migration).toContain("t.status = 'active'");
  expect(migration).toContain("private.web_has_permission(p_session_token, 'students.view')");
  expect(migration).toContain("'attendance','homework_log','daily_reports','incidents'");
  expect(migration).toContain("'parent_comms','timetable','subjects','terms'");
  expect(migration).toContain("REVOKE ALL ON FUNCTION public.rpc_get_my_data(text,text,integer) FROM PUBLIC;");
  expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.rpc_get_my_data(text,text,integer) TO anon, authenticated;");
});

test('get_my_data reconciliation does not widen scoped permissions', () => {
  expect(migration).not.toContain("web_has_permission(p_session_token, 'attendance.view')");
  expect(migration).not.toContain("web_has_permission(p_session_token, 'homework.view')");
});
