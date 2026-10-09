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

test('staff chat mobile navigation allows vertical page scrolling and prioritizes official announcements', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  const navStart = source.indexOf('function _chatQuickNavChannels()');
  const navEnd = source.indexOf('function _renderChatQuickNav()', navStart);
  assert.ok(navStart >= 0 && navEnd > navStart, 'find the persistent chat channel navigation');
  const nav = source.slice(navStart, navEnd);
  assert.ok(nav.indexOf("id:'staff'") < nav.indexOf("id:'announcements'"), 'All Staff remains the first channel');
  assert.ok(nav.indexOf("id:'announcements'") < nav.indexOf("id:'direct'"), 'Official Announcements is promoted near the top');
  assert.ok(styles.includes('touch-action:pan-x pan-y;transition:background .16s ease'), 'quick navigation buttons permit vertical page gestures');
  assert.ok(styles.includes('overscroll-behavior-x:contain;touch-action:pan-x pan-y;scroll-snap-type:x proximity'), 'mobile channel strip permits vertical page scrolling while preserving horizontal scrolling');
  assert.ok(styles.includes('min-width:144px;touch-action:pan-x pan-y;scroll-snap-align:start'), 'All Staff channel cards do not trap vertical touch gestures');
  const modeStart = source.indexOf('function _renderChatMode()');
  const modeEnd = source.indexOf('function _renderInquiryWorkspace()', modeStart);
  assert.ok(modeStart >= 0 && modeEnd > modeStart, 'find the staff chat mode renderer');
  assert.ok(!source.slice(modeStart, modeEnd).includes('${_renderAdminComposer()}'), 'admin official-message composer must not be appended below the All Staff conversation');
  assert.ok(styles.includes('overscroll-behavior-x:contain;touch-action:pan-x pan-y;scroll-snap-type:x proximity'), 'final mobile rail override must preserve vertical gestures');
});


test('staff chat uses a coherent social-first responsive visual system', () => {
  const styles = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  assert.ok(styles.includes('Smart Chat social-first redesign: consistent hierarchy'), 'include the unified social-first chat redesign');
  assert.ok(styles.includes('#page-chat .smart-chat-school-grid {\n  display:grid; grid-template-columns:minmax(245px, .78fr) minmax(0, 1.8fr)'), 'use a conversation-list plus chat-view desktop hierarchy');
  assert.ok(styles.includes('#page-chat .smart-chat-quick-nav-track {\n  display:flex; gap:8px; width:100%; overflow-x:auto; overflow-y:hidden;'), 'keep chat type navigation in a horizontally swipeable rail');
  assert.ok(styles.includes('#page-chat .smart-chat-school-grid > .smart-chat-channel-list {\n    display:flex; flex-direction:row; flex-wrap:nowrap; gap:7px; overflow-x:auto; overflow-y:hidden;'), 'render channel cards as a compact mobile swipe rail');
  assert.ok(styles.includes('#page-chat .smart-chat-school-grid > .smart-chat-channel-list {\n    display:flex; flex-direction:row; flex-wrap:nowrap;'), 'mobile channel rail overrides the higher-specificity desktop-hidden rule');
  assert.ok(styles.includes('#page-chat .smart-chat-admin-card {\n  margin-top:18px; padding:clamp(16px,2vw,24px);'), 'style admin tools as a distinct, deliberate section');
  assert.ok(styles.includes('#page-chat .chat-composer textarea,\n#page-chat .smart-chat-direct-composer textarea {\n  min-width:0; min-height:46px;'), 'provide a consistent touch-friendly message composer');
});


test('staff chat full-screen controls persist the selected type and support animated menu transitions', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(source.includes("localStorage.getItem('scms_chat_mode') === 'ai'"), 'restore the saved School Chat or AI Chat selection');
  assert.ok(source.includes("localStorage.setItem('scms_chat_mode', _chatMode)"), 'persist the selected chat type');
  assert.ok(source.includes('sc-chat-topbar'), 'render the compact full-screen control bar');
  assert.ok(source.includes('sc-chat-mode-pill'), 'show the active chat type in the central pill');
  assert.ok(source.includes('sc-chat-type-menu'), 'provide the chat type menu behind the ellipsis control');
  assert.ok(source.includes('window._toggleChatTypeMenu'), 'wire the menu open and close control');
  assert.ok(source.includes('window._chooseChatType'), 'wire chat type selection');
  assert.ok(source.includes('@keyframes scChatMenuIn'), 'animate the menu entrance');
  assert.ok(source.includes('prefers-reduced-motion:reduce'), 'respect reduced-motion accessibility preferences');
  assert.ok(source.includes('onclick="_chatBackToMenu()"'), 'preserve the existing exit/sidebar navigation entry point');
  assert.ok(source.includes('sc-chat-workspace-content'), 'keep the full-screen conversation area scrollable');
});
