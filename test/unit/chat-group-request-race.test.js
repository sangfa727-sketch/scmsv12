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
  assert.match(source, /<button class="chat-send-btn" type="submit" aria-label="Send message">/);
});
