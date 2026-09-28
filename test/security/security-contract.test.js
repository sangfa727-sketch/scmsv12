const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('web RPC transport requires a server-issued session token', () => {
  const source = read('js/02A_api_core.js');
  assert.match(source, /function _webSessionToken()/);
  assert.match(source, /if \(!token\)/);
  assert.match(source, /err\.code\s*=\s*['"]AUTH_REQUIRED['"]/);
  assert.match(source, /if \(!params\.p_session_token\) params\.p_session_token\s*=\s*_webSessionToken\(\)/);
});

test('web RPC transport uses the publishable/anon key, never a service-role key', () => {
  const source = read('js/02A_api_core.js');
  assert.match(source, /apikey:\s*SCMS_CONFIG\.SUPABASE_ANON/);
  assert.match(source, /Authorization:\s*\`Bearer \$\{SCMS_CONFIG\.SUPABASE_ANON\}\`/);
  assert.doesNotMatch(source, /service[_-]?role/i);
});

test('client configuration does not embed a Supabase service-role secret', () => {
  const config = read('js/01_config.js');
  assert.doesNotMatch(config, /service[_-]?role/i);
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE/i);
});

test('web API modules delegate RPC transport through the shared session-aware helper', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js'))
    .filter((f) => /^02[B-L]_api_.*\.js$/.test(f));

  assert.ok(files.length >= 10);
  for (const file of files) {
    const source = read('js/' + file);
    const rawRpc = /fetch\(\s*\`\$\{SCMS_CONFIG\.SUPABASE_URL\}\/rest\/v1\/rpc\//.test(source);
    assert.equal(rawRpc, false, file + ' must not bypass _webRpc session handling');
  }
});

test('session-bound feature RPC calls do not rely on client-supplied school identity in the web API layer', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js'))
    .filter((f) => /^02[B-L]_api_.*\.js$/.test(f));

  for (const file of files) {
    const source = read('js/' + file);
    if (!source.includes('_webRpc(')) continue;
    assert.doesNotMatch(
      source,
      /p_(?:school_id|teacher_id)\s*:\s*window\.APP\.(?:school_id|teacher_id)/,
      file + ' should use the authenticated session context for tenant/teacher identity'
    );
  }
});


test('legacy privileged RPCs are not callable from frontend feature code', () => {
  const jsDir = path.join(ROOT, 'js');
  const files = fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'));
  const forbidden = [
    'rpc_approve_school',
    'rpc_reject_school',
    'rpc_update_school_config',
    'rpc_seed_default_config',
    'rpc_bootstrap',
  ];
  for (const name of files) {
    const source = read(path.join('js', name));
    for (const fn of forbidden) {
      assert.doesNotMatch(
        source,
        new RegExp('(?:_webRpc|fetch)[\\s\\S]{0,500}' + fn.replace(/_/g, '\\_')),
        name + ' must not call legacy privileged RPC ' + fn
      );
    }
  }
});


test('feature modules do not bypass the shared web RPC transport', () => {
  const jsDir = path.join(ROOT, 'js');
  const files = fs.readdirSync(jsDir).filter((name) => name.endsWith('.js'));
  const allowed = new Set(['02A_api_core.js', '02B_api_auth.js', '19_google_auth.js']);
  for (const name of files) {
    if (allowed.has(name)) continue;
    const source = read(path.join('js', name));
    assert.equal(source.includes('/rest/v1/rpc/'), false, name + ' must use the shared API/auth boundary');
  }
});


test('admin teacher mutations stay behind the shared session-aware RPC boundary', () => {
  const source = read('js/15_settings.js');
  assert.ok(source.includes("_webRpc('rpc_admin_create_teacher'"));
  assert.ok(source.includes("_webRpc('rpc_admin_reset_teacher_password'"));
  assert.equal(source.includes('rest/v1/rpc/rpc_admin_create_teacher'), false);
  assert.equal(source.includes('rest/v1/rpc/rpc_admin_reset_teacher_password'), false);
});
