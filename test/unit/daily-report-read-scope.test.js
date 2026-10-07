const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

describe('daily report read authorization contract', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/20261007070000_daily_report_read_scope.sql'),
    'utf8'
  );

  it('defines daily_report.view as a class-scoped permission', () => {
    assert.match(migration, /daily_report\.view/);
    assert.match(migration, /'daily_report\\.view'/);\n    assert.match(migration, /'daily',/);\n    assert.match(migration, /'View daily reports for assigned classes'/);\n    assert.match(migration, /'class',/);
  });

  it('grants view permission to the intended school roles', () => {
    for (const role of [
      'teacher',
      'assistant_teacher',
      'senior_teacher',
      'school_coordinator',
      'administrative_assistant',
      'admin',
      'super_admin'
    ]) {
      assert.ok(migration.includes(`('${role}')`));
    }
  });

  it('binds returned reports to the caller permission and report class', () => {
    assert.match(migration, /private\.web_has_permission\(/);
    assert.match(migration, /'daily_report\.view'/);
    assert.match(migration, /nullif\(trim\(class\), ''\)/);
  });

  it('keeps the active-session and school boundary', () => {
    assert.match(migration, /s\.session_token = p_session_token/);
    assert.match(migration, /s\.expires_at > now\(\)/);
    assert.match(migration, /t\.status = 'active'/);
    assert.match(migration, /school_id = v_sess\.school_id/);
  });

  it('preserves the browser RPC execute contract', () => {
    assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.rpc_get_daily_reports\(text, integer\)/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rpc_get_daily_reports\(text, integer\)/);
    assert.match(migration, /TO anon, authenticated/);
  });
});
