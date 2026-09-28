const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('frontend loads the environment boundary before production config', () => {
  const html = read('index.html');
  const envIndex = html.indexOf('js/00_env.js?v=20260929a');
  const configIndex = html.indexOf('js/01_config.js');
  assert.ok(envIndex >= 0, 'environment boundary must be loaded');
  assert.ok(configIndex >= 0, 'config module must be loaded');
  assert.ok(envIndex < configIndex, 'environment boundary must load first');
});

test('environment selector never uses URL query parameters', () => {
  const source = read('js/00_env.js');
  assert.doesNotMatch(source, /location\.search|URLSearchParams|searchParams/i);
  assert.match(source, /development/);
  assert.match(source, /staging/);
  assert.match(source, /production/);
});

test('local development is explicitly backend-disabled', () => {
  const source = read('js/01_config.js');
  assert.match(source, /mode === 'development'/);
  assert.match(source, /BACKEND_ENABLED:\s*false/);
  assert.match(source, /SUPABASE_URL:\s*''/);
  assert.match(source, /N8N_WEBHOOK:\s*''/);
  assert.match(source, /N8N_BOOTSTRAP:\s*''/);
});

test('staging never falls back to production backend configuration', () => {
  const source = read('js/01_config.js');
  assert.match(source, /mode === 'staging'/);
  assert.match(source, /window\.__SCMS_STAGING_CONFIG__/);
  assert.match(source, /Never fall back to production here/);
  assert.match(source, /points to a production backend/);
  assert.doesNotMatch(
    source,
    /if \(mode === 'staging'[\s\S]{0,500}return \{\.\.\._SCMS_PRODUCTION_CONFIG/
  );
});

test('production remains the only environment using the committed production backend constants', () => {
  const source = read('js/01_config.js');
  assert.match(source, /const _SCMS_PRODUCTION_CONFIG = \{/);
  assert.match(source, /return \{[\s\S]{0,120}_SCMS_PRODUCTION_CONFIG/);
  assert.match(source, /ENVIRONMENT:\s*mode/);
  assert.match(source, /BACKEND_ENABLED:\s*true/);
});

test('local development bypasses the authenticated landing/backend flow', () => {
  const source = read('js/14_app.js');
  assert.match(
    source,
    /if \(!isTWA\(\) && SCMS_CONFIG\.BACKEND_ENABLED !== false\)/
  );
  assert.match(source, /bootstrapData = _demoBootstrap\(\)/);
});


test('settings CSS stays behind Settings-specific selectors', () => {
  const css = read('style.css');
  const blocks = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  const settingsBlocks = blocks.filter(block => /settings/i.test(block.split('{')[0]));
  assert.ok(settingsBlocks.length > 0, 'Settings CSS contract should remain detectable');
  for (const block of settingsBlocks) {
    const selector = block.split('{')[0];
    assert.match(
      selector,
      /\.settings[-_a-z0-9]*/i,
      'Settings selector must remain scoped: ' + selector.trim()
    );
  }
});

test('Settings module does not directly mutate global page containers or global styles', () => {
  const source = read('js/15_settings.js');
  assert.doesNotMatch(source, /document\.getElementById\(['"](?:pages|app|tabBar|studentList|dashboard|moreMenu)['"]/);
  assert.doesNotMatch(source, /document\.documentElement\.style|document\.body\.style/);
  assert.doesNotMatch(source, /document\.querySelectorAll\(['"](?:\.list-card|\.card|button|\.page)/);
  assert.match(source, /openModal\(/);
  assert.match(source, /_webRpc\(/);
});

test('Settings writes use modal-local DOM targets instead of shared page state', () => {
  const source = read('js/15_settings.js');
  const forbiddenGlobalWrites = [
    /window\.APP\.students\s*=/,
    /window\.APP\.attendance\s*=/,
    /window\.APP\.homework\s*=/,
    /window\.APP\.currentPage\s*=/,
    /window\.APPStore\.set\(['"]ui\./,
  ];
  for (const pattern of forbiddenGlobalWrites) {
    assert.doesNotMatch(source, pattern);
  }
});
