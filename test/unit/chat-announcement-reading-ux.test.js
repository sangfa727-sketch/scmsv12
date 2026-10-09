const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('official announcements expose a readable preview and full detail view', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  const api = fs.readFileSync(path.resolve(__dirname, '../../js/02L_api_chat.js'), 'utf8');
  assert.ok(api.includes('announcement_list_failed'), 'surface announcement RPC failures instead of showing a false empty state');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  assert.ok(source.includes('_announcementExcerpt(a.body)'), 'show message content in the announcement list');
  assert.ok(source.includes('Announcement IDs are UUIDs from Postgres'), 'document UUID identity handling');
  assert.ok(source.includes("find(x=>String(x.id)===String(id))"), 'open announcements by their UUID string');
  assert.ok(source.includes("_openAnnouncement(String(rows[0].id))"), 'auto-open using the UUID string');
  assert.ok(!source.includes('Number(a.id)'), 'never coerce announcement UUIDs to numbers');
  assert.ok(source.includes("replace(/\\s+/g,' ').trim()"), 'collapse newlines and repeated whitespace in list excerpts');
  assert.ok(!source.includes("t('chat.officialNotice')"), 'use a localized key that exists in the chat locale catalog');
  assert.ok(source.includes('smart-chat-announcement-excerpt'), 'render a readable summary for each item');
  assert.ok(source.includes('smart-chat-announcement-detail'), 'render a dedicated full-message reading surface');
  assert.ok(source.includes('_formatAnnouncementDate(a.created_at)'), 'format announcement timestamps for people');
  assert.ok(source.includes("if(result?.ok!==true)throw new Error"), 'only mark an announcement read after server confirmation');
  assert.ok(styles.includes('#page-chat .smart-chat-announcement-detail'), 'scope readable detail typography to announcements');
  assert.ok(styles.includes('line-height:1.85'), 'provide comfortable line spacing for long announcements');
  assert.ok(styles.includes('@media(max-width:760px)'), 'provide mobile-specific reading layout');
});


test('announcement reading uses only keys available in every supported locale', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  const start = source.indexOf('function _announcementExcerpt');
  const end = source.indexOf('function _renderDirectWorkspace()', start);
  assert.ok(start >= 0 && end > start, 'find the announcement workspace block');
  const block = source.slice(start, end);
  const keys = [...new Set(block.split("t('chat.").slice(1).map(part => part.split("'")[0]))];
  const localeFiles = [
    '../../js/00a_locales_en.js',
    '../../js/00b_locales_my.js',
    '../../js/00_locales_jp.js',
    '../../js/00_locales_thai.js',
    '../../js/00d_locales_ms.js',
    '../../js/00e_locales_km.js',
    '../../js/00e_locales_zh.js',
  ];
  for (const localeFile of localeFiles) {
    const locale = fs.readFileSync(path.resolve(__dirname, localeFile), 'utf8');
    for (const key of keys) {
      const found = locale.includes("'chat." + key + "':") || locale.includes('"chat.' + key + '":');
      assert.ok(found, localeFile + ' is missing chat.' + key);
    }
  }
});
