const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCALE_FILE = path.join(ROOT, 'js', '00f_chat_locales.js');
const LANGUAGES = ['en', 'my', 'th', 'jp', 'ms', 'km', 'zh'];
const REQUIRED_KEYS = [
  'chat.schoolChat',
  'chat.oneVerifiedRecipient',
  'chat.staffNotice',
];

function loadChatLocales() {
  const window = {};
  const source = fs.readFileSync(LOCALE_FILE, 'utf8');
  vm.runInNewContext(source, { window }, { filename: LOCALE_FILE });
  return Object.fromEntries(LANGUAGES.map(code => {
    const globalName = 'I18N_' + code.toUpperCase();
    assert.equal(typeof window[globalName], 'object', globalName + ' must be exported');
    return [code, window[globalName]];
  }));
}

test('School Chat labels exist and are non-empty in every supported language', () => {
  const locales = loadChatLocales();

  for (const code of LANGUAGES) {
    for (const key of REQUIRED_KEYS) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(locales[code], key),
        true,
        code + ' locale is missing ' + key
      );
      assert.equal(typeof locales[code][key], 'string', code + ' ' + key + ' must be a string');
      assert.notEqual(locales[code][key].trim(), '', code + ' ' + key + ' must not be empty');
    }
  }
});

test('School Chat labels do not silently fall back to English in non-English locales', () => {
  const locales = loadChatLocales();
  const english = locales.en;

  for (const code of LANGUAGES.filter(code => code !== 'en')) {
    for (const key of REQUIRED_KEYS) {
      assert.notEqual(
        locales[code][key],
        english[key],
        code + ' locale must translate ' + key + ' instead of copying English'
      );
    }
  }
});

test('one verified recipient wording is intentionally supplied for all seven locales', () => {
  const locales = loadChatLocales();
  const values = LANGUAGES.map(code => locales[code]['chat.oneVerifiedRecipient']);

  assert.equal(new Set(values).size, LANGUAGES.length,
    'each supported language should have its own oneVerifiedRecipient wording');
});
