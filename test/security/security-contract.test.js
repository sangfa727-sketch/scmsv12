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


test('direct Supabase REST access in student API is isolated to the legacy non-web branch', () => {
  const source = read('js/02C_api_students.js');
  const directRest = source.match(/\/rest\/v1\/students/g) || [];
  assert.ok(directRest.length > 0, 'student API should retain its legacy TWA REST path until a dedicated RPC replaces it');
  const webBranch = source.slice(0, source.indexOf('// Whitelist fields that exist in the DB schema'));
  assert.equal(webBranch.includes('/rest/v1/students'), false, 'web student mutations must use the shared session-aware RPC boundary');
  assert.ok(source.includes("if (window.APP.platform === 'web') return _webRpc('rpc_update_student'"));
  assert.ok(source.includes("if (window.APP.platform === 'web') return _webRpc('rpc_deactivate_student'"));
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


test('teacher invite redemption is serialized against concurrent use', () => {
  const migration = read('supabase/migrations/20260929051500_email_signup_invite_race_hardening.sql');
  assert.match(migration, /from public\.teacher_invites[\\s\\S]*limit 1 for update/i);
  assert.match(migration, /security definer/i);
});

test('dependency security guardrails are configured', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.overrides?.tar, '^7.5.22');
  const dependabot = read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: "npm"/);
  assert.match(dependabot, /package-ecosystem: "github-actions"/);
  const workflow = read('.github/workflows/test.yml');
  assert.match(workflow, /npm audit --audit-level=high/);
});

test('billing write RPCs are admin-only and keep tenant scope checks', () => {
  const migration = read('supabase/migrations/20260929060000_billing_admin_only_write_authorization.sql');
  assert.match(migration, /_billing_admin_session[\s\S]*t\.role in \('admin','super_admin'\)/i);
  for (const fn of [
    'rpc_add_fee_item',
    'rpc_create_invoice',
    'rpc_delete_fee_item',
    'rpc_delete_invoice',
    'rpc_delete_payment',
    'rpc_link_admission_invoice',
    'rpc_record_payment',
    'rpc_update_fee_item',
  ]) {
    const start = migration.indexOf('create or replace function public.' + fn);
    assert.ok(start >= 0, fn + ' must remain explicitly defined in the billing hardening migration');
    const end = migration.indexOf('create or replace function public.', start + 1);
    const body = migration.slice(start, end === -1 ? migration.length : end);
    assert.match(body, /_billing_admin_session|t\.role in \('admin','super_admin'\)/i, fn + ' must require an admin session');
  }
});

test('billing admin session helper is not directly executable by client roles', () => {
  const migration = read('supabase/migrations/20260929060010_billing_admin_session_execute_hardening.sql');
  assert.match(migration, /revoke execute on function public\._billing_admin_session\(text\) from public, anon, authenticated/i);
});

test('billing financial integrity contracts reject unsafe money operations', () => {
  const migration = read('supabase/migrations/20260929062000_billing_financial_integrity_hardening.sql');
  assert.match(migration, /p_default_amount[\\s\\S]*< 0[\\s\\S]*invalid_amount/i);
  assert.match(migration, /p_amount[\\s\\S]*<= 0[\\s\\S]*invalid_amount/i);
  assert.match(migration, /for update/i);
  assert.match(migration, /payment_exceeds_balance/i);
  assert.match(migration, /invoice_has_payments/i);
  assert.match(migration, /billing\\.invoice\\.create/i);
  assert.match(migration, /billing\\.payment\\.create/i);
});

test('billing tables enforce non-negative and positive amount invariants', () => {
  const migration = read('supabase/migrations/20260929062010_billing_amount_constraints.sql');
  assert.match(migration, /fee_items_default_amount_nonnegative/);
  assert.match(migration, /invoice_items_amount_nonnegative/);
  assert.match(migration, /invoices_total_amount_positive/);
  assert.match(migration, /invoices_paid_amount_nonnegative/);
  assert.match(migration, /payments_amount_positive/);
});
