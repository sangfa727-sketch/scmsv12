const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'js');
const EN_FILE = path.join(JS_DIR, '00a_locales_en.js');
const MS_FILE = path.join(JS_DIR, '00d_locales_ms.js');

function readLocale(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractKeys(source) {
  const keys = [];
  const seen = new Set();
  const re = /^\s{2}['"]([^'"]+)['"]\s*:/gm;
  let match;
  while ((match = re.exec(source))) {
    const key = match[1];
    assert.equal(seen.has(key), false, `duplicate locale key: ${key}`);
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function extractValues(source) {
  const values = new Map();
  const re = /^\s{2}['"]([^'"]+)['"]\s*:\s*(['"])(.*?)\2\s*,?\s*$/gm;
  let match;
  while ((match = re.exec(source))) {
    values.set(match[1], match[3]);
  }
  return values;
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

  const en = readLocale(EN_FILE);
  const ms = readLocale(MS_FILE);
  const enKeys = extractKeys(en);
  const msKeys = extractKeys(ms);

  assert.deepEqual(msKeys, enKeys, 'Malay locale keys must exactly match English keys');

  const enValues = extractValues(en);
  const msValues = extractValues(ms);

  for (const key of enKeys) {
    assert.equal(msValues.has(key), true, `Malay locale is missing value for ${key}`);

    const msValue = msValues.get(key);
    assert.notEqual(msValue.trim(), '', `Malay locale has an empty value for ${key}`);

    assert.deepEqual(
      tokens(msValue),
      tokens(enValues.get(key) || ''),
      `placeholder tokens differ for ${key}`
    );

    assert.deepEqual(
      htmlTags(msValue),
      htmlTags(enValues.get(key) || ''),
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
  assert.match(source, /^window\.I18N_MS\s*=\s*\{/);
  assert.match(source, /\};\s*$/);
});
