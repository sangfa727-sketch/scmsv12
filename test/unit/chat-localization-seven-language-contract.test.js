const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const LOCALE_FILES = [
  '00a_locales_en.js',
  '00b_locales_my.js',
  '00_locales_thai.js',
  '00_locales_jp.js',
  '00d_locales_ms.js',
  '00e_locales_km.js',
  '00e_locales_zh.js',
  '00f_chat_locales.js',
];
const LANGUAGES = ['en', 'my', 'th', 'jp', 'ms', 'km', 'zh'];
const REQUIRED_KEYS = [
  'chat.schoolChat',
  'chat.oneVerifiedRecipient',
  'chat.staffNotice',
  'chat.groupMembersPrompt',
  // Official Announcements composer and its modal controls.
  'chat.adminTools', 'chat.officialMessage', 'chat.officialMessageHint',
  'chat.serverVerified', 'chat.recipientType', 'chat.allStaff', 'chat.grade',
  'chat.individualTeacher', 'chat.messageType', 'chat.announcement', 'chat.officialTask',
  'chat.refreshRecipients', 'chat.sendOfficialMessage', 'chat.checkingRecipients',
  'chat.reasonBodyRequired', 'chat.messageBody', 'chat.writeOfficialMessage',
  'chat.loading', 'chat.openFailed', 'chat.schoolIsolated', 'chat.gradeRecipientsMissing',
  'chat.retry', 'chat.sendFailed',
  'chat.newOfficialMessage', 'chat.closeOfficialMessage', 'chat.officialAnnouncements',
  'chat.officialNotices', 'chat.refresh', 'chat.noVerifiedSameSchoolRecipient', 'chat.verifiedRecipients',
];

function loadChatLocales() {
  const window = {};
  const context = { window };
  let baseLocales = {};
  for (const filename of LOCALE_FILES) {
    const fullPath = path.join(ROOT, 'js', filename);
    if (filename === '00f_chat_locales.js') {
      baseLocales = Object.fromEntries(LANGUAGES.map(code => {
        const globalName = 'I18N_' + code.toUpperCase();
        return [code, { ...(window[globalName] || {}) }];
      }));
    }
    const source = fs.readFileSync(fullPath, 'utf8');
    vm.runInNewContext(source, context, { filename: fullPath });
  }
  const result = Object.fromEntries(LANGUAGES.map(code => {
    const globalName = 'I18N_' + code.toUpperCase();
    assert.equal(typeof window[globalName], 'object', globalName + ' must be exported');
    return [code, window[globalName]];
  }));
  loadChatLocales.baseLocales = baseLocales;
  return result;
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

test('Staff Chat and Official Announcements labels do not silently fall back to English in non-English locales', () => {
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


test('Chat locale extension preserves base send-failure translations when it has no override', () => {
  const locales = loadChatLocales();
  const base = loadChatLocales.baseLocales;
  for (const code of ['th', 'jp', 'ms', 'km', 'zh']) {
    assert.ok(base[code]['chat.sendFailed'], code + ' base locale must define chat.sendFailed');
    assert.notEqual(base[code]['chat.sendFailed'], locales.en['chat.sendFailed'], code + ' base send-failure text must be translated');
    assert.equal(locales[code]['chat.sendFailed'], base[code]['chat.sendFailed'], code + ' base translation must survive the Chat extension');
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


test('every literal Staff Chat UI key has an explicit non-English translation', () => {
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
    for (const match of source.matchAll(/\bt\(\s*['"]chat\.([^'"]+)['"]\s*\)/g)) {
      usedKeys.add('chat.' + match[1]);
    }
  }

  assert.ok(usedKeys.size > 100, 'audit the actual Staff Chat UI key set');
  for (const code of LANGUAGES.filter(code => code !== 'en')) {
    for (const key of usedKeys) {
      const translated = locales[code][key];
      assert.equal(typeof translated, 'string', code + ' is missing ' + key);
      assert.notEqual(translated.trim(), '', code + ' has an empty translation for ' + key);
      assert.notEqual(translated, locales.en[key],
        code + ' is silently falling back to English for ' + key);
    }
  }
});
