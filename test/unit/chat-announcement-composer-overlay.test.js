const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

test('Official Announcements composer opens as a modal overlay without creating a second layout row', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js', '16_chat.js'), 'utf8');
  const renderStart = source.indexOf('function _renderAnnouncementWorkspace()');
  const renderEnd = source.indexOf('async function _loadAnnouncementWorkspace', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, 'find the announcement workspace renderer');
  const renderer = source.slice(renderStart, renderEnd);
  assert.ok(renderer.includes('class="smart-chat-composer-drawer${_announcementComposerOpen?'), 'composer visibility is driven by modal state');
  assert.ok(renderer.includes("_announcementComposerOpen?' is-open':''"), 'open class follows modal state');
  assert.ok(renderer.includes('aria-controls="announcementComposer"'), 'plus control targets the overlay');
  assert.ok(source.includes('position:fixed;inset:0;z-index:12000'), 'overlay is fixed to viewport, not normal document flow');
  assert.ok(source.includes('.smart-chat-composer-drawer.is-open{display:flex}'), 'open state centers the form as an overlay');
  assert.ok(source.includes('max-height:calc(100dvh - 20px)'), 'mobile form stays within viewport and scrolls internally');
  assert.ok(source.includes('event.target===card)window._toggleAnnouncementComposer(false)'), 'backdrop click closes the modal');
  assert.ok(source.includes("event.key==='Escape'&&_announcementComposerOpen"), 'Escape closes the modal');
  assert.ok(source.includes('scms-announcement-composer-open'), 'background scroll is locked while modal is open');
});

test('Official Announcements list and detail remain behind the overlay instead of becoming a second row', () => {
  const source = fs.readFileSync(path.join(ROOT, 'js', '16_chat.js'), 'utf8');
  const renderStart = source.indexOf('function _renderAnnouncementWorkspace()');
  const renderEnd = source.indexOf('async function _loadAnnouncementWorkspace', renderStart);
  const renderer = source.slice(renderStart, renderEnd);
  assert.ok(renderer.includes('smart-chat-direct-shell smart-chat-announcement-shell'), 'announcement workspace remains rendered');
  assert.ok(renderer.includes('id="announcementList"'), 'announcement list remains in the workspace');
  assert.ok(renderer.includes('id="announcementStream"'), 'announcement detail remains in the workspace');
});
