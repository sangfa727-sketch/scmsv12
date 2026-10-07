const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('report-card RPC enforces class-scoped assessment.view before returning grades', () => {
  const migration = read('supabase/migrations/20261007130000_report_card_access_scope.sql');
  assert.ok(migration.includes('CREATE OR REPLACE FUNCTION public.rpc_get_report_card'));
  assert.ok(migration.includes("private.web_has_permission("));
  assert.ok(migration.includes("'assessment.view'"));
  assert.ok(migration.includes("trim(p_class)"));
  assert.ok(migration.includes("'permission_denied'"));
  assert.ok(migration.includes("st.class = trim(p_class)"));
  assert.ok(migration.includes("a.class = trim(p_class)"));
  assert.ok(migration.includes("a.term_id = p_term_id"));
  assert.ok(migration.includes("school_id = v_sess.school_id"));
  assert.ok(migration.includes("GRANT EXECUTE ON FUNCTION public.rpc_get_report_card(text, bigint, text)"));
});

test('report-card permission guard is fail-closed before the result query', () => {
  const migration = read('supabase/migrations/20261007130000_report_card_access_scope.sql');
  const guard = migration.indexOf("if not private.web_has_permission(");
  const query = migration.indexOf('with subject_avg as');
  assert.ok(guard >= 0 && query > guard, 'permission guard must execute before report-card data query');
});
