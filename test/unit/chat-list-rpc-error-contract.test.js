const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '../../js/02L_api_chat.js'), 'utf8');

function loadChatApi(rpcResponse) {
  const window = { API: {} };
  const context = {
    window,
    _webSessionToken: () => 'test-session',
    _webRpc: async () => rpcResponse,
  };
  vm.runInNewContext(SOURCE, context, { filename: '02L_api_chat.js' });
  return window.API;
}

test('department list RPC errors are not converted into an empty department list', async () => {
  const api = loadChatApi({ ok: false, error: 'invalid_session' });
  await assert.rejects(api.getDepartmentChats(), /invalid_session/);
});

test('grade list RPC errors are not converted into an empty grade list', async () => {
  const api = loadChatApi({ ok: false, error: 'forbidden' });
  await assert.rejects(api.getGradeChats(), /forbidden/);
});

test('successful empty department and grade lists remain valid empty states', async () => {
  const api = loadChatApi({ ok: true, rows: [] });
  assert.deepEqual(await api.getDepartmentChats(), []);
  assert.deepEqual(await api.getGradeChats(), []);
});
