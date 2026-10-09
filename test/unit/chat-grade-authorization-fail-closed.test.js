const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('grade chat fails closed when a conversation is unauthorized', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat_grade.js'), 'utf8');
  assert.ok(source.includes('API.openGradeChat(requestedGrade)'), 'authorize requested grade before selecting it');
  assert.ok(source.includes('const requestToken=++_gradeOpenRequest'), 'track the latest selected grade request');
  assert.ok(source.includes('if(requestToken!==_gradeOpenRequest)return'), 'ignore stale authorization responses from earlier selections');
  assert.ok(source.includes('_gradeName=null;_setGradeMobileView(false)'), 'clear selected grade on failure');
  assert.ok(source.includes('root.innerHTML=') && source.includes("t('chat.selectGrade')"), 'replace stale messages with neutral empty state');
  assert.ok(source.includes("showToast(t('chat.gradeUnauthorized'))"), 'explain denied access to the user');
  assert.match(source, /class="smart-chat-refresh-btn"[^>]*aria-label=/, 'grade refresh control must expose an accessible name');
});
