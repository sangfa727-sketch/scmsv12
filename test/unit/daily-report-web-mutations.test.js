const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

describe('daily report web mutation routing contract', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../js/02E_api_academics.js'),
    'utf8'
  );

  it('routes web updates through the session-bound scoped RPC', () => {
    assert.match(source, /if \(window\.APP\.platform === 'web'\) return _webRpc\('rpc_update_daily_report'/);
    assert.match(source, /p_session_token: _webSessionToken\(\)/);
    assert.match(source, /p_id: id/);
    assert.match(source, /p_meal: patch\.meal/);
    assert.match(source, /p_nap_min: patch\.nap_min \?\? null/);
    assert.match(source, /p_mood: patch\.mood/);
    assert.match(source, /p_behaviour_note: patch\.behaviour_note \|\| null/);
    assert.match(source, /p_toilet_ok: patch\.toilet_ok \?\? null/);
  });

  it('routes web deletes through the session-bound scoped RPC', () => {
    assert.match(source, /if \(window\.APP\.platform === 'web'\) return _webRpc\('rpc_delete_daily_report'/);
    assert.match(source, /p_session_token: _webSessionToken\(\)/);
    assert.match(source, /p_id: id/);
  });

  it('retains the legacy path only for non-web platforms', () => {
    assert.match(source, /return twaPost\('update_daily_report', \{ id, patch \}\);/);
    assert.match(source, /return twaPost\('delete_daily_report', \{ id \}\);/);
  });
});
