const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Staff Chat channel tabs can be hidden and restored from the three-dot menu', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(source.includes("localStorage.getItem('scms_chat_visible_types')"), 'restore tab visibility preferences');
  assert.ok(source.includes("localStorage.setItem('scms_chat_visible_types'"), 'persist tab visibility preferences');
  assert.ok(source.includes("const visible = channels.filter(c => _chatVisibleTypes[c.id] !== false)"), 'only show enabled channel tabs');
  assert.ok(source.includes("function _chatTypeMenuMarkup()"), 'render a menu of hidden channel types only');
  assert.ok(source.includes("window._hideChatType = function(id)"), 'provide a direct hide action on visible tabs');
  assert.ok(source.includes("window._showChatType = function(id)"), 'provide a menu action to restore hidden tabs');
  assert.ok(source.includes("onclick=\"switchChatMode(_chatMode === 'school' ? 'ai' : 'school')\""), 'switch School Chat and AI directly without the old mode dropdown');
  assert.ok(!source.includes('role="menuitemradio"'), 'the three-dot menu no longer uses the old School/AI radio dropdown');
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
  assert.ok(!source.includes('${t(\'chat.startNewConversation\')}'), 'remove the redundant Start a New Conversation section');
  assert.ok(source.includes('const existingIds=new Set(_directConversations.map(c=>String(c.teacher_id)))'), 'avoid listing the same teacher twice');
  assert.ok(source.includes('smart-chat-direct-item smart-chat-directory-item'), 'use one consistent, visible row style for existing and new contacts');
  assert.ok(source.includes('smart-chat-direct-people{display:flex;flex:1 1 auto;flex-direction:column'), 'make the unified list independently scrollable');
});
