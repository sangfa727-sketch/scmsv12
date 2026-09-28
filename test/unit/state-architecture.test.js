const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('central state store exposes bounded state sections', () => {
  const source = read('js/01B_state.js');
  for (const section of ['session:', 'tenant:', 'data:', 'ui:', 'flags:']) {
    assert.match(source, new RegExp(section));
  }
  assert.match(source, /root\.APPStore/);
  assert.doesNotMatch(source, /window\.(students|attendance|billing|admissions)\s*=/);
});

test('state store provides reads, writes, subscriptions and reset', () => {
  const source = read('js/01B_state.js');
  assert.match(source, /function read\(\)/);
  assert.match(source, /function get\(path\)/);
  assert.match(source, /function patch\(section, value\)/);
  assert.match(source, /function set\(path, value\)/);
  assert.match(source, /function subscribe\(listener\)/);
  assert.match(source, /function reset\(section\)/);
  assert.match(source, /Object\.freeze\(\{ read, get, patch, set, subscribe, reset \}\)/);
});

test('app bootstrap mirrors identity into the central store', () => {
  const source = read('js/14_app.js');
  assert.match(source, /APPStore\.patch\('session'/);
  assert.match(source, /APPStore\.patch\('tenant'/);
  assert.match(source, /APPStore\.set\('ui\.currentPage'/);
  assert.match(source, /sessionToken: webSession\?\.session_token/);
});

test('architecture documents protect environment and tenant boundaries', () => {
  const source = read('docs/ARCHITECTURE.md');
  assert.match(source, /staging\/preview/);
  assert.match(source, /Production uses the production Supabase/);
  assert.match(source, /school A cannot access school B/);
  assert.match(source, /client-provided.*school_id.*teacher_id/);
});

test('release gates require isolated backend testing before production', () => {
  const source = read('docs/RELEASE-GATES.md');
  assert.match(source, /Supabase preview branch or separate staging project/);
  assert.match(source, /Do not use customer credentials/);
  assert.match(source, /RLS\/tenant boundaries/);
});


test('navigation state mirrors the compatibility page value', () => {
  const source = read('js/14_app.js');
  assert.match(source, /window\.APP\.currentPage = pageId/);
  assert.match(source, /APPStore\.set\('ui\.currentPage', pageId\)/);
});

test('logout resets the central state before reload', () => {
  const source = read('js/14_app.js');
  const idx = source.indexOf('window.signOut');
  assert.ok(idx >= 0);
  const block = source.slice(idx, idx + 900);
  assert.match(block, /APPStore\.reset\(\)/);
  assert.match(block, /window\.location\.reload/);
});
