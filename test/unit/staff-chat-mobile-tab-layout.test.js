const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Staff Chat channel visibility is a mobile-only preference and hidden menu navigation does not re-enable a tab', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(source.includes("localStorage.getItem('scms_chat_visible_types'"), 'restore tab visibility preferences');
  assert.ok(source.includes("localStorage.setItem('scms_chat_visible_types'"), 'persist tab visibility preferences');
  assert.ok(source.includes("const visible = channels.filter(c => _chatVisibleTypes[c.id] !== false)"), 'only show enabled channel tabs');
  assert.ok(source.includes("function _chatTypeMenuMarkup()"), 'render a menu of hidden channel types');
  assert.ok(source.includes("window._hideChatType = function(id)"), 'provide a direct hide action on mobile tabs');
  assert.ok(!source.includes("visible.length <= 1"), 'allow every mobile tab to be hidden');
  assert.ok(source.includes("window._openHiddenChatType = function(id)"), 'navigate to a hidden chat type without enabling its tab');
  assert.ok(source.includes("window._showChatType = function(id)"), 're-enable a hidden tab only through the separate plus action');
  assert.ok(source.includes("onclick=" + '"switchChatMode(_chatMode === \'school\' ? \'ai\' : \'school\')"'), 'mobile mode pill switches School Chat and AI Assistant');
  assert.ok(source.includes("@media(min-width:761px)"), 'desktop has a separate layout policy');
  assert.ok(source.includes("grid-template-columns:repeat(6,minmax(0,1fr))"), 'desktop channel tabs fill the available width without horizontal scrolling');
  assert.ok(source.includes("#page-chat .smart-chat-quick-channel-hide{display:none!important}"), 'desktop does not expose mobile hide controls');
  assert.ok(!source.includes('<div class="smart-chat-identity">'), 'remove the current account profile from the Chat header');
  assert.ok(source.includes('class="smart-chat-mode-switch" role="tablist"'), 'place School Chat / AI Chat controls in the desktop header');
});

test('mobile All Staff conversation fills the workspace and the composer has rounded edges', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(source.includes('smart-chat-school-grid{height:100%;width:100%;flex:1 1 auto;min-height:0}'), 'let the All Staff conversation use the full remaining phone height');
  assert.ok(source.includes('flex:1 1 0;max-height:none;min-height:0;height:100%;overflow-x:hidden;overflow-y:auto'), 'keep the message stream independently scrollable');
  assert.ok(source.includes('border-radius:24px;background:var(--surface)'), 'round the outer mobile composer card');
  assert.ok(source.includes('border-radius:19px;background:var(--bg2)'), 'round the message input itself');
});

test('Direct Messages renders one de-duplicated, scrollable people list', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(source.includes('id="directConversationList" class="smart-chat-conversation-list smart-chat-direct-people"'), 'use a single list surface');
  assert.ok(!source.includes('id="directStaffDirectory"'), 'remove the second directory list');
  assert.ok(!source.includes("${t('chat.startNewConversation')}"), 'remove the redundant Start a New Conversation section');
  assert.ok(source.includes('const existingIds=new Set(_directConversations.map(c=>String(c.teacher_id)))'), 'avoid listing the same teacher twice');
  assert.ok(source.includes('smart-chat-direct-item smart-chat-directory-item'), 'use one consistent, visible row style for existing and new contacts');
  assert.ok(source.includes('smart-chat-direct-people{display:flex;flex:1 1 auto;flex-direction:column'), 'make the unified list independently scrollable');
});
