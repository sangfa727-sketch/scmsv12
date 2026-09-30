const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');
const EN_FILE = path.join(JS_DIR, '00a_locales_en.js');
const ZH_FILE = path.join(JS_DIR, '00e_locales_zh.js');
const I18N_ENGINE_FILE = path.join(JS_DIR, '00c_i18n.js');
const INDEX_FILE = path.join(ROOT, 'index.html');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function loadLocale(file, globalName) {
  const source = read(file);
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: file });
  const dict = sandbox.window[globalName];
  assert.equal(typeof dict, 'object', globalName + ' must export an object');
  assert.notEqual(dict, null, globalName + ' must not be null');
  return dict;
}

function tokens(value) {
  return [...String(value).matchAll(/\{[^{}]+\}/g)].map(m => m[0]).sort();
}

function htmlTags(value) {
  return [...String(value).matchAll(/<\/?[a-z][^>]*>/gi)]
    .map(m => m[0].replace(/\s+/g, ' ').trim())
    .sort();
}

test('Simplified Chinese locale contract is enabled only when the locale is production-ready', (t) => {
  if (!fs.existsSync(ZH_FILE)) {
    t.skip('ZH locale is not present yet; keep the production picker unchanged until translation is complete.');
    return;
  }

  const en = loadLocale(EN_FILE, 'I18N_EN');
  const zh = loadLocale(ZH_FILE, 'I18N_ZH');
  const enKeys = Object.keys(en);
  const zhKeys = Object.keys(zh);

  assert.equal(new Set(enKeys).size, enKeys.length, 'English locale must not contain duplicate keys');
  assert.equal(new Set(zhKeys).size, zhKeys.length, 'ZH locale must not contain duplicate keys');
  assert.deepEqual(zhKeys, enKeys, 'ZH locale keys must exactly match English keys');

  for (const key of enKeys) {
    const value = zh[key];
    assert.equal(typeof value, 'string', 'ZH locale value must be a string for ' + key);
    assert.notEqual(value.trim(), '', 'ZH locale has an empty value for ' + key);
    assert.deepEqual(tokens(value), tokens(en[key] || ''), 'placeholder tokens differ for ' + key);
    assert.deepEqual(htmlTags(value), htmlTags(en[key] || ''), 'HTML tags differ for ' + key);
  }
});

test('ZH registration and script order are enforced when enabled', (t) => {
  if (!fs.existsSync(ZH_FILE)) {
    t.skip('ZH locale is not present yet.');
    return;
  }

  const engine = read(I18N_ENGINE_FILE);
  const index = read(INDEX_FILE);

  assert.match(engine, /code:\s*'zh'/);
  assert.match(engine, /zh:\s*\[/);
  assert.match(engine, /zh:\s*'zh-CN'/);
  const localeScript = index.indexOf('00e_locales_zh.js');
  const engineScript = index.indexOf('00c_i18n.js');
  assert.ok(localeScript >= 0, 'index.html must load the ZH locale');
  assert.ok(engineScript >= 0, 'index.html must load the i18n engine');
  assert.ok(localeScript < engineScript, 'ZH locale must load before the i18n engine');
  assert.match(index, /data-lang="zh"[^>]*>简体中文<\/button>/);
});

test('registered locale dictionaries remain duplicate-free', () => {
  const locales = [
    ['en', EN_FILE, 'I18N_EN'],
    ['my', path.join(JS_DIR, '00b_locales_my.js'), 'I18N_MY'],
    ['th', path.join(JS_DIR, '00_locales_thai.js'), 'I18N_TH'],
    ['jp', path.join(JS_DIR, '00_locales_jp.js'), 'I18N_JP'],
    ['ms', path.join(JS_DIR, '00d_locales_ms.js'), 'I18N_MS'],
  ];

  for (const [code, file, globalName] of locales) {
    assert.equal(fs.existsSync(file), true, 'registered locale file is missing for ' + code);
    const dict = loadLocale(file, globalName);
    const keys = Object.keys(dict);
    assert.equal(new Set(keys).size, keys.length, 'locale ' + code + ' must not contain duplicate keys');
  }
});
