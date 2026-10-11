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
  'chat.groupMembersPrompt',
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

test('group member picker instruction is explicitly translated in all seven locales', () => {
  const locales = loadChatLocales();
  const values = LANGUAGES.map(code => locales[code]['chat.groupMembersPrompt']);

  assert.equal(new Set(values).size, LANGUAGES.length,
    'each supported language should have its own group member picker instruction');
  for (const value of values) {
    assert.match(value, /./, 'group member picker instruction must not be empty');
    assert.doesNotMatch(value, /comma-separated|កော်မာဖြင့် ခွဲ/, 
      'group member picker must not instruct users to type a comma-separated ID list');
  }
});

test('one verified recipient wording is intentionally supplied for all seven locales', () => {
  const locales = loadChatLocales();
  const values = LANGUAGES.map(code => locales[code]['chat.oneVerifiedRecipient']);

  assert.equal(new Set(values).size, LANGUAGES.length,
    'each supported language should have its own oneVerifiedRecipient wording');
});

test('Official Announcements composer labels are explicitly translated in all seven languages', () => {
  const locales = loadChatLocales();
  const keys = [
    'chat.adminTools', 'chat.officialMessage', 'chat.officialMessageHint',
    'chat.serverVerified', 'chat.recipientType', 'chat.allStaff', 'chat.grade',
    'chat.individualTeacher', 'chat.teacher', 'chat.loadingGrades',
    'chat.messageType', 'chat.reason', 'chat.officialCommunication',
    'chat.announcement', 'chat.officialTask', 'chat.staffNotice',
    'chat.messageBody', 'chat.writeOfficialMessage', 'chat.checkingRecipients',
    'chat.refreshRecipients', 'chat.send'
  ];

  for (const code of LANGUAGES) {
    for (const key of keys) {
      const value = locales[code][key];
      assert.equal(typeof value, 'string', code + ' is missing ' + key);
      assert.notEqual(value.trim(), '', code + ' has an empty translation for ' + key);
      if (code !== 'en') {
        assert.notEqual(value, locales.en[key], code + ' must not fall back to English for ' + key);
      }
    }
  }
});

test('every literal Staff Chat UI key has a real translation in all seven supported languages', () => {
  const locales = loadChatLocales();
  const chatFiles = [
    'js/16_chat.js',
    'js/16_chat_department.js',
    'js/16_chat_grade.js',
    'js/16_chat_groups.js'
  ];
  const usedKeys = new Set();
  for (const relativePath of chatFiles) {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    for (const match of source.matchAll(/\\bt\\(\\s*['"]chat\\.([^'"]+)['"]\\s*\\)/g)) {
      usedKeys.add('chat.' + match[1]);
    }
  }

  assert.ok(usedKeys.size > 150, 'audit the complete Staff Chat UI rather than a small hand-picked sample');
  for (const code of LANGUAGES.filter(code => code !== 'en')) {
    for (const key of usedKeys) {
      const translated = locales[code][key];
      assert.equal(typeof translated, 'string', code + ' is missing ' + key);
      assert.notEqual(translated.trim(), '', code + ' has an empty translation for ' + key);
      assert.notEqual(
        translated,
        locales.en[key],
        code + ' is silently falling back to English for ' + key
      );
    }
  }
});
