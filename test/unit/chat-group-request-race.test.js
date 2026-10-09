const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = path.resolve(__dirname, '../../js/16_chat_groups.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function loadGroupChat(api) {
  const root = { innerHTML: '' };
  const list = { innerHTML: '' };
  const shell = { classList: { toggle() {} } };
  const document = {
    getElementById(id) {
      if (id === 'chatGroupConversation') return root;
      if (id === 'chatGroupList') return list;
      return null;
    },
    querySelector(selector) {
      return selector === '.smart-chat-group-shell' ? shell : null;
    },
  };
  const window = { APP: { teacher_id: 'staff-1' } };
  const context = {
    window,
    document,
    API: api,
    t: key => key,
    esc: value => String(value ?? ''),
    _chatChannelBack: () => '',
    _chatIcon: () => '',
    _autoGrowChatInput() {},
    _setChatGroupMobileView() {},
    skeletonCards: () => 'loading',
    showToast() {},
    console,
  };
  vm.runInNewContext(fs.readFileSync(SOURCE, 'utf8'), context, { filename: SOURCE });
  return { window, root };
}

test('group chat ignores an older open response after a newer group is selected', async () => {
  const first = deferred();
  const second = deferred();
  const api = {
    openChatGroup(id) {
      return id === 1 ? first.promise : second.promise;
    },
    markChatGroupRead: async () => ({ ok: true }),
  };
  const { window, root } = loadGroupChat(api);

  const firstOpen = window._openChatGroup(1);
  const secondOpen = window._openChatGroup(2);

  second.resolve({
    ok: true,
    group: { id: 2, name: 'Group Two', group_type: 'PROJECT', status: 'ACTIVE' },
    messages: [],
  });
  assert.equal(await secondOpen, true);
  assert.match(root.innerHTML, /Group Two/);

  first.resolve({
    ok: true,
    group: { id: 1, name: 'Group One', group_type: 'PROJECT', status: 'ACTIVE' },
    messages: [],
  });
  assert.equal(await firstOpen, false);
  assert.match(root.innerHTML, /Group Two/);
  assert.doesNotMatch(root.innerHTML, /Group One/);
});

test('group chat ignores a stale authorization failure after a newer group is selected', async () => {
  const first = deferred();
  const second = deferred();
  const api = {
    openChatGroup(id) {
      return id === 1 ? first.promise : second.promise;
    },
    markChatGroupRead: async () => ({ ok: true }),
  };
  const { window, root } = loadGroupChat(api);

  const firstOpen = window._openChatGroup(1);
  const secondOpen = window._openChatGroup(2);
  second.resolve({
    ok: true,
    group: { id: 2, name: 'Authorized Group', group_type: 'EVENT', status: 'ACTIVE' },
    messages: [],
  });
  await secondOpen;

  first.resolve({ ok: false, error: 'unauthorized' });
  assert.equal(await firstOpen, false);
  assert.match(root.innerHTML, /Authorized Group/);
  assert.doesNotMatch(root.innerHTML, /chat-error/);
});

test('group chat refresh and composer controls expose accessible names', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');
  assert.match(source, /class="smart-chat-refresh-btn"[^>]*aria-label="\$\{t\('chat\.refresh'\)\}"/);
  assert.match(source, /<textarea id="chatGroupInput"[^>]*aria-label="\$\{t\('chat\.writeMessage'\)\}"/);
  assert.match(source, /<button class="chat-send-btn" type="submit" aria-label="\$\{t\('chat\.sendMessageLabel'\)\}">/);
});

test('group chat mobile layout keeps the nested conversation wrapper shrinkable', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  const groupMobileRule = css.match(/@media\s*\(max-width:\s*760px\)\s*\{\s*#page-chat\s+#chatGroupConversation\s*>\s*\.smart-chat-conversation-head\s*\{([^}]*)\}/);
  assert.ok(groupMobileRule, 'group wrapper override must be scoped to the mobile breakpoint');
  assert.match(groupMobileRule[1], /display\s*:\s*flex/);
  assert.match(groupMobileRule[1], /flex-direction\s*:\s*column/);
  assert.match(groupMobileRule[1], /min-height\s*:\s*0/);
  assert.match(groupMobileRule[1], /overflow\s*:\s*hidden/);
  assert.match(
    css,
    /#page-chat \.smart-chat-direct-list-head button,\s*#page-chat \.smart-chat-list-actions>button,\s*#page-chat \.smart-chat-mobile-back\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/
  );
});

test('chat channel rail prioritizes daily conversations and shows only data-backed unread badges', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  const staff = js.indexOf("{ id:'staff', name:t('chat.allStaff')");
  const direct = js.indexOf("{ id:'direct', name:t('chat.directMessages')");
  const departments = js.indexOf("{ id:'departments', name:t('chat.departmentGrade')");
  const announcements = js.indexOf("{ id:'announcements', name:t('chat.officialAnnouncements')");
  assert.ok(staff >= 0 && direct > staff && departments > direct && announcements > departments,
    'All Staff, Direct Messages, and Departments should appear first in the daily-use rail');
  assert.match(js, /function _chatUnreadCount\(channel\)/);
  assert.match(js, /getDirectConversations/);
  assert.match(js, /getInquiryTickets/);
  assert.match(js, /getStaffAnnouncements/);
  assert.match(js, /getChatGroups/);
  assert.match(js, /data-chat-unread-for=/);
  assert.match(css, /\.smart-chat-channel-trailing\.has-unread\s*\{/);
});

test('group send accessible label is translated for every supported chat locale', () => {
  const locales = fs.readFileSync(path.resolve(__dirname, '../../js/00f_chat_locales.js'), 'utf8');
  const section = locales.match(/const groupSendAccessibleLocaleFix = \{([\s\S]*?)\n  \};/);
  assert.ok(section, 'group send accessible locale map must exist');
  for (const code of ['en', 'my', 'th', 'jp', 'ms', 'km', 'zh']) {
    assert.match(
      section[1],
      new RegExp(code + ': \\{[^}]*chat\\.sendMessageLabel'),
      `missing chat.sendMessageLabel translation for locale ${code}`
    );
  }
});

test('ticket form labels and priority options are localized instead of exposing keys or raw enum values', () => {
  const locales = fs.readFileSync(path.resolve(__dirname, '../../js/00f_chat_locales.js'), 'utf8');
  const chat = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  for (const key of ['chat.subject', 'chat.studentId', 'chat.optionalSameSchool', 'chat.whatNeedsAttention', 'chat.describeIssue']) {
    assert.ok(locales.includes("'" + key + "':"), 'missing ticket translation key ' + key);
  }
  for (const key of ['chat.priorityNormal', 'chat.priorityLow', 'chat.priorityHigh', 'chat.priorityUrgent']) {
    assert.ok(locales.includes("'" + key + "':"), 'missing priority translation key ' + key);
    assert.ok(chat.includes("t('" + key + "')"), 'priority label should use translation key ' + key);
  }
  assert.ok(!chat.includes('<option>NORMAL</option><option>LOW</option>'));
});

test('global toast colors use theme surfaces instead of inverted text/background colors', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  const start = css.indexOf('.toast {');
  const end = css.indexOf('}', start);
  const toast = css.slice(start, end);
  assert.ok(start >= 0, 'global toast rule should exist');
  assert.ok(toast.includes('background: var(--surface2);'));
  assert.ok(toast.includes('color: var(--text);'));
  assert.ok(toast.includes('border: 1px solid var(--border2);'));
});


test('official message success feedback uses active theme tokens and avoids the global bright toast', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  assert.match(js, /_showChatSuccessFeedback\(t\('chat\.officialMessageSent'/);
  assert.match(js, /className = 'smart-chat-feedback smart-chat-feedback-success'/);
  assert.match(css, /#page-chat \.smart-chat-feedback\s*\{[^}]*background:\s*color-mix\([^;]*var\(--surface\)[^;]*\);[^}]*color:\s*var\(--text\);/);
  assert.match(css, /#page-chat \.smart-chat-feedback-success\s*\{[^}]*var\(--green\)/);
});

test('official-message feedback stays compact and blends with both active themes', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  const start = css.indexOf('#page-chat .smart-chat-feedback {');
  const end = css.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, 'chat feedback rule must exist');
  const rule = css.slice(start, end);
  assert.ok(rule.includes('max-width:min(calc(100vw - 32px), 380px)'));
  assert.ok(rule.includes('overflow-wrap:anywhere'));
  assert.ok(rule.includes('background:color-mix(in srgb, var(--surface) 94%, var(--text))'));
  assert.ok(css.includes('background:color-mix(in srgb, var(--green) 8%, var(--surface))'));
  assert.ok(css.includes('.smart-chat-mode-switch button:focus-visible'));
  assert.ok(css.includes('.smart-chat-mode-switch{width:100%;display:grid;grid-template-columns:1fr 1fr}'));
});

test('Chat navigation exposes an aggregate unread badge using theme-aware styling', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
  const css = fs.readFileSync(path.resolve(__dirname, '../../style.css'), 'utf8');
  const chat = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(html.includes('id="chatTabUnreadBadge"'), 'Chat tab must contain an unread badge');
  assert.ok(css.includes('.chat-tab-unread-badge'));
  assert.ok(css.includes('background:var(--accent)'));
  assert.ok(css.includes('border:2px solid var(--bg)'));
  assert.ok(chat.includes('function _renderChatTabUnreadBadge()'));
  assert.ok(chat.includes("t('chat.unreadMessages')"));
  assert.ok(chat.includes('unreadRefreshTick === 0'));
  assert.match(chat, /window\.switchChatMode = function\(mode\)\s*\{[\s\S]*?_renderChatMode\(\);\s*if \(_chatMode === 'school'\) _refreshChatChannelUnreadCounts\(\)/);
  assert.match(chat, /window\.switchChatChannel = function\(channel\)\s*\{[^}]*_refreshChatChannelUnreadCounts\(\)/);
  assert.match(chat, /function renderChat\(\)\s*\{[\s\S]*?_renderChatMode\(\);\s*if \(_chatMode === 'school'\) _refreshChatChannelUnreadCounts\(\)/);
});

test('official message and ticket labels have explicit translations for every supported locale', () => {
  const locales = fs.readFileSync(path.resolve(__dirname, '../../js/00f_chat_locales.js'), 'utf8');
  const start = locales.indexOf('const officialTicketLocaleParityFix = {');
  const end = locales.indexOf('\n  };', start);
  assert.ok(start >= 0 && end > start, 'official/ticket locale parity map must exist');
  const section = locales.slice(start, end);
  for (const code of ['en', 'my', 'th', 'jp', 'ms', 'km', 'zh']) {
    assert.ok(section.includes('\n    ' + code + ': {'), 'missing locale ' + code);
    for (const key of ['chat.authorizedTicketAccess', 'chat.backToInquiryTickets', 'chat.noInquiryTickets', 'chat.ticketClosed', 'chat.ticketUpdateFailed', 'chat.writeReply', 'chat.newOfficialMessage', 'chat.statusOpen']) {
      assert.ok(section.includes("'" + key + "'"), 'missing locale parity key ' + key);
    }
  }
});
