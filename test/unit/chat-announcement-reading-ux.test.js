const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('official announcements expose a readable preview and full detail view', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  assert.ok(source.includes('_announcementExcerpt(a.body)'), 'show message content in the announcement list');
  assert.ok(source.includes("replace(/\\\\s+/g,' ').trim()"), 'collapse newlines and repeated whitespace in list excerpts');
  assert.ok(!source.includes("t('chat.officialNotice')"), 'use a localized key that exists in the chat locale catalog');
  assert.ok(source.includes('smart-chat-announcement-excerpt'), 'render a readable summary for each item');
  assert.ok(source.includes('smart-chat-announcement-detail'), 'render a dedicated full-message reading surface');
  assert.ok(source.includes('_formatAnnouncementDate(a.created_at)'), 'format announcement timestamps for people');
  assert.ok(source.includes("if(result?.ok!==true)throw new Error"), 'only mark an announcement read after server confirmation');
  assert.ok(styles.includes('#page-chat .smart-chat-announcement-detail'), 'scope readable detail typography to announcements');
  assert.ok(styles.includes('line-height:1.85'), 'provide comfortable line spacing for long announcements');
  assert.ok(styles.includes('@media(max-width:760px)'), 'provide mobile-specific reading layout');
});
