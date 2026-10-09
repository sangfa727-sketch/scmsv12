const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('department chat clears selected conversation and stale messages after authorization failure', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat_department.js'), 'utf8');
  assert.ok(source.includes('API.openDepartmentChat(nextId).catch(()=>null)'), 'handle rejected authorization requests fail closed');
  assert.ok(source.includes('_departmentId=null;_departmentMessages=[]'), 'clear selected department and cached messages');
  assert.ok(source.includes("t('chat.selectDepartmentBelong')"), 'replace stale conversation with neutral empty state');
  assert.ok(source.includes("showToast(t('chat.departmentUnauthorized'))"), 'explain denied access to the user');
});
