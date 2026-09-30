const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');
const EN_FILE = path.join(JS_DIR, '00a_locales_en.js');
const KM_FILE = path.join(JS_DIR, '00e_locales_km.js');
const KM_META_FILE = path.join(JS_DIR, '00e_locales_km.meta.js');

// The English dictionary is the single source/reference for Khmer coverage.
// The current English source evaluates to 1346 top-level keys; several of the
// final entries are intentionally declared multiple per line.
const EN_BASELINE_KEYS = 1346;

function loadLocale(file, globalName) {
  const source = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: file });
  const dict = sandbox.window[globalName];
  assert.equal(typeof dict, 'object', globalName + ' must export an object');
  assert.notEqual(dict, null, globalName + ' must not be null');
  return dict;
}

test('English source locale remains the 1346-key baseline for Khmer', () => {
  const en = loadLocale(EN_FILE, 'I18N_EN');
  const keys = Object.keys(en);

  assert.equal(
    new Set(keys).size,
    keys.length,
    'English locale must not contain duplicate top-level keys'
  );
  assert.equal(
    keys.length,
    EN_BASELINE_KEYS,
    'Khmer implementation baseline must remain exactly the current English key count'
  );
});

test('Khmer locale must match the English key set exactly once it is introduced', (t) => {
  if (!fs.existsSync(KM_FILE) || !fs.existsSync(KM_META_FILE)) {
    t.skip('Khmer locale is intentionally not introduced until the staged translation is complete.');
    return;
  }

  const metaSource = fs.readFileSync(KM_META_FILE, 'utf8');
  if (!/complete\s*:\s*true/.test(metaSource)) {
    t.skip('Khmer locale is staged in batches; the full key equality gate activates only when complete=true.');
    return;
  }

  const en = loadLocale(EN_FILE, 'I18N_EN');
  const km = loadLocale(KM_FILE, 'I18N_KM');
  const enKeys = Object.keys(en);
  const kmKeys = Object.keys(km);

  assert.equal(new Set(kmKeys).size, kmKeys.length, 'Khmer locale must not contain duplicate keys');
  assert.deepEqual(kmKeys, enKeys, 'Khmer locale keys must exactly match the 1346-key English baseline');

  for (const key of enKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(km, key), true, 'Khmer locale is missing value for ' + key);
    assert.equal(typeof km[key], 'string', 'Khmer locale value must be a string for ' + key);
    assert.notEqual(km[key].trim(), '', 'Khmer locale has an empty value for ' + key);
  }
});
