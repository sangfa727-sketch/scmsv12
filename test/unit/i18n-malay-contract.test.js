const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');
const EN_FILE = path.join(JS_DIR, '00a_locales_en.js');
const MS_FILE = path.join(JS_DIR, '00d_locales_ms.js');

function readLocale(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadLocale(file, globalName) {
  const source = readLocale(file);
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: file });
  const dict = sandbox.window[globalName];
  assert.equal(typeof dict, 'object', `${globalName} must export an object`);
  assert.equal(dict !== null, true, `${globalName} must not be null`);
  return dict;
}

function tokens(value) {
  return [...value.matchAll(/\{[^{}]+\}/g)].map(m => m[0]).sort();
}

function htmlTags(value) {
  return [...value.matchAll(/<\/?[a-z][^>]*>/gi)]
    .map(m => m[0].replace(/\s+/g, ' ').trim())
    .sort();
}

test('Malay locale contract is enforced when the locale file is present', (t) => {
  if (!fs.existsSync(MS_FILE)) {
    t.skip('js/00d_locales_ms.js is not present yet; enable this contract as soon as Malay translations are added.');
    return;
  }

  const enValues = loadLocale(EN_FILE, 'I18N_EN');
  const msValues = loadLocale(MS_FILE, 'I18N_MS');
  const enKeys = Object.keys(enValues);
  const msKeys = Object.keys(msValues);

  assert.equal(new Set(enKeys).size, enKeys.length, 'English locale must not contain duplicate keys');
  assert.equal(new Set(msKeys).size, msKeys.length, 'Malay locale must not contain duplicate keys');
  assert.deepEqual(msKeys, enKeys, 'Malay locale keys must exactly match English keys');

  for (const key of enKeys) {
    assert.equal(Object.prototype.hasOwnProperty.call(msValues, key), true, `Malay locale is missing value for ${key}`);

    const msValue = msValues[key];
    assert.equal(typeof msValue, 'string', `Malay locale value must be a string for ${key}`);
    assert.notEqual(msValue.trim(), '', `Malay locale has an empty value for ${key}`);

    assert.deepEqual(
      tokens(msValue),
      tokens(enValues[key] || ''),
      `placeholder tokens differ for ${key}`
    );

    assert.deepEqual(
      htmlTags(msValue),
      htmlTags(enValues[key] || ''),
      `HTML tags differ for ${key}`
    );
  }
});

test('Malay locale source is valid UTF-8 JavaScript when present', (t) => {
  if (!fs.existsSync(MS_FILE)) {
    t.skip('Malay locale file not present yet.');
    return;
  }

  const source = readLocale(MS_FILE);
  assert.match(source, /window\.I18N_MS\s*=\s*\{/);
  assert.match(source, /\};\s*$/);
});

const I18N_ENGINE_FILE = path.join(JS_DIR, '00c_i18n.js');
const INDEX_FILE = path.join(ROOT, 'index.html');

test('Malay locale is registered and loaded before the i18n engine', () => {
  const engine = readLocale(I18N_ENGINE_FILE);
  const index = readLocale(INDEX_FILE);

  assert.match(
    engine,
    /\{\s*code:\s*'ms',\s*label:\s*'BM',\s*name:\s*'Bahasa Melayu',\s*dict:\s*\(\)\s*=>\s*window\.I18N_MS\s*\}/
  );
  assert.match(engine, /ms:\s*\['ms'\]/);
  assert.match(engine, /ms:\s*'ms-MY'/);

  const localeScript = index.indexOf('js/00d_locales_ms.js');
  const engineScript = index.indexOf('js/00c_i18n.js');
  assert.ok(localeScript >= 0, 'index.html must load the Malay locale script');
  assert.ok(engineScript >= 0, 'index.html must load the i18n engine');
  assert.ok(localeScript < engineScript, 'Malay locale must load before the i18n engine');

  assert.match(
    index,
    /<button[^>]+class="lang-option"[^>]+data-lang="ms"[^>]*>BM<\/button>/
  );
});


test('Malay runtime can be selected, translated, persisted, and localized', () => {
  const sandbox = {
    window: {
      I18N_EN: loadLocale(EN_FILE, 'I18N_EN'),
      I18N_MS: loadLocale(MS_FILE, 'I18N_MS'),
      matchMedia: () => ({ matches: false }),
      dispatchEvent: () => {},
    },
    localStorage: {
      values: new Map(),
      getItem(key) { return this.values.get(key) ?? null; },
      setItem(key, value) { this.values.set(key, value); },
    },
    navigator: { language: 'en-US' },
    document: {
      readyState: 'complete',
      documentElement: { lang: '' },
      title: '',
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    CustomEvent: function CustomEvent(type, init) {
      this.type = type;
      this.detail = init?.detail;
    },
  };

  vm.runInNewContext(
    readLocale(I18N_ENGINE_FILE),
    sandbox,
    { filename: I18N_ENGINE_FILE }
  );

  const i18n = sandbox.window.I18N;
  assert.equal(i18n.current, 'en');
  i18n.setLang('ms');

  assert.equal(i18n.current, 'ms');
  assert.equal(sandbox.localStorage.getItem('scms_lang'), 'ms');
  assert.equal(sandbox.document.documentElement.lang, 'ms');
  assert.equal(sandbox.document.title, sandbox.window.I18N_MS['app.title']);
  assert.equal(i18n.dateLocale(), 'ms-MY');
  assert.equal(i18n.t('common.saveFailed'), sandbox.window.I18N_MS['common.saveFailed']);
  assert.equal(i18n.t('students.subtitle', { n: 7, c: 2 }), '7 murid aktif merentas 2 kelas');
});
