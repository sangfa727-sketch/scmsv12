/**
 * Staff Chat function audit contracts.
 *
 * This suite inventories the chat page's callable functions and protects the
 * most important user-visible action contracts. These are source-level
 * regression checks; they do not replace authenticated browser/backend E2E.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, '../../', relative), 'utf8');
const core = read('js/16_chat.js');
const groups = read('js/16_chat_groups.js');
const departments = read('js/16_chat_department.js');
const grades = read('js/16_chat_grade.js');

const inventory = {
  'js/16_chat.js': [
    '_chatIcon', '_verifiedStaffList', '_gradeRecipientPreview', '_adminRecipientRows',
    '_renderAdminComposer', '_loadAdminRecipientPreview', '_showChatSuccessFeedback',
    'sendOfficialAnnouncement', '_refreshAdminComposerPreview', '_installSmartChatUxPatch',
    '_enterChatWorkspace', '_exitChatWorkspace', 'renderChat', '_chatBackToMenu',
    'switchChatMode', '_toggleChatTypeMenu', '_chooseChatType', '_chatQuickNavChannels',
    '_renderChatQuickNav', '_chatUnreadCount', '_renderChatChannelUnreadBadges',
    '_renderChatTabUnreadBadge', '_refreshChatChannelUnreadCounts', '_renderChatMode',
    '_renderInquiryWorkspace', '_renderInquiryTicketList', '_loadInquiryTickets',
    '_openInquiryTicket', '_clearInquirySelection', '_updateInquiryTicket',
    '_sendInquiryFromComposer', '_inquiryKeydown', '_closeInquiryDraft', '_renderInquiryDraft',
    '_newInquiryTicket', '_submitInquiryDraft', '_toggleAnnouncementComposer',
    '_announcementExcerpt', '_formatAnnouncementDate', '_renderAnnouncementList',
    '_renderAnnouncementWorkspace', '_loadAnnouncementWorkspace', '_openAnnouncement',
    '_clearAnnouncementSelection', '_renderDirectWorkspace', '_loadDirectWorkspace',
    '_renderDirectConversationList', '_renderDirectDirectory', 'openDirectChat',
    '_renderDirectHeader', '_setDirectMobileView', '_setDirectComposer',
    '_clearDirectSelection', '_loadDirectMessages', '_renderDirectMessages', 'sendDirectChat',
    '_directKeydown', '_showSchoolChatChannels', '_chatChannelBack', 'switchChatChannel',
    '_loadChatMessages', '_renderChatStream', '_humanDay', 'sendChat', '_aiPrompt',
    'startChatPolling', 'stopChatPolling', '_autoGrowChatInput', '_chatKeydown'
  ],
  'js/16_chat_groups.js': [
    '_renderGroupWorkspace', '_loadChatGroups', '_newChatGroup', '_createChatGroup',
    '_openChatGroup', '_renderChatGroupListIfCurrent', '_setChatGroupMobileView',
    '_clearChatGroupSelection', '_sendChatGroup'
  ],
  'js/16_chat_department.js': [
    '_renderDepartmentWorkspace', '_toggleDepartmentComposer', 'adminCreateDepartment',
    '_renderDepartmentList', '_loadDepartmentWorkspace', '_startDepartmentPolling',
    '_openDepartmentChat', '_sendDepartmentFromComposer', '_setDepartmentMobileView',
    '_clearDepartmentSelection', '_invalidateDepartmentChatOpen'
  ],
  'js/16_chat_grade.js': [
    '_renderGradeWorkspace', '_loadGradeWorkspace', '_renderGradeList', '_openGradeChat',
    '_startGradePolling', '_sendGradeFromComposer', '_showGradeWorkspace',
    '_showDepartmentWorkspace', '_invalidateGradeChatOpen', '_setGradeMobileView',
    '_clearGradeSelection'
  ]
};

test('Staff Chat audit inventory: every declared page/workspace function remains present', () => {
  const sources = {
    'js/16_chat.js': core,
    'js/16_chat_groups.js': groups,
    'js/16_chat_department.js': departments,
    'js/16_chat_grade.js': grades
  };
  for (const [file, names] of Object.entries(inventory)) {
    for (const name of names) {
      const definition = new RegExp(
        '(?:function\\s+' + name + '\\s*\\(|(?:window\\.)?' + name +
        '\\s*=\\s*(?:async\\s*)?function\\b)'
      );
      assert.match(sources[file], definition, file + ' must define ' + name);
    }
  }
});

test('chat type menu and channel actions persist, validate, and re-render selection', () => {
  assert.match(core, /localStorage\.setItem\('scms_chat_mode', _chatMode\)/);
  assert.match(core, /window\._toggleChatTypeMenu\s*=\s*function[\s\S]*?_chatTypeMenuOpen = !_chatTypeMenuOpen/);
  assert.match(core, /window\._chooseChatType\s*=\s*function\(mode\)\s*\{\s*window\.switchChatMode\(mode\)/);
  assert.match(core, /window\.switchChatChannel\s*=\s*function\(channel\)[\s\S]*?if \(!allowed\) return;[\s\S]*?_renderChatQuickNav\(\);[\s\S]*?_renderChatMode\(\)/);
  assert.match(core, /window\._chatBackToMenu\s*=\s*function\(\)[\s\S]*?_exitChatWorkspace\(\)/);
});

test('mobile sidebar control stays on Chat while desktop navigation remains unchanged', () => {
  assert.match(core, /const isMobileWorkspace = typeof window\.matchMedia === 'function'[\s\S]*?window\.matchMedia\('\(max-width: 760px\)'\)\.matches/);
  assert.match(core, /if \(isMobileWorkspace\) \{[\s\S]*?if \(typeof openSidebar === 'function'\) openSidebar\(\);\s*return;/);
  assert.match(core, /Keep the existing desktop navigation behavior unchanged\.[\s\S]*?typeof isTWA === 'function' && !isTWA\(\) && typeof openSidebar === 'function'/);
});

test('all message-send paths validate input and provide failure handling', () => {
  const sendContracts = [
    [core, 'sendChat', 'API.sendChatMessage', 'chat.sendFailed'],
    [core, 'sendDirectChat', 'API.sendDirectMessage', 'chat.sendFailed'],
    [groups, '_sendChatGroup', 'API.sendChatGroupMessage', 'chat.messageSendFailed'],
    [departments, '_sendDepartmentFromComposer', 'API.sendDepartmentMessage', 'chat.departmentSendFailed'],
    [grades, '_sendGradeFromComposer', 'API.sendGradeMessage', 'chat.gradeSendFailed'],
    [core, '_submitInquiryDraft', 'API.createInquiryTicket', 'chat.ticketCreateFailed'],
    [core, 'sendOfficialAnnouncement', 'API.createStaffAnnouncement', 'chat.officialMessageFailed']
  ];
  for (const [source, name, api, errorKey] of sendContracts) {
    const definition = new RegExp(
      '(?:function\\s+' + name + '\\s*\\(|(?:window\\.)?' + name +
      '\\s*=\\s*(?:async\\s*)?function\\b)'
    );
    assert.match(source, definition);
    assert.ok(source.includes(api), name + ' must call ' + api);
    assert.ok(source.includes(errorKey), name + ' must expose a localized failure state');
  }
  assert.match(core, /if \(_chatChannel !== 'staff'\)\s*\{\s*showToast\(t\('chat\.channelPreviewOnly'\)\)/);
  assert.match(core, /if \(!recipients\.length \|\| \(recipientType === 'teacher' && !teacherId\)\)/);
  assert.match(core, /if \(!reason \|\| !body\)/);
});

test('message loading and workspace refresh paths expose retry states on failure', () => {
  const loadContracts = [
    [core, '_loadChatMessages', 'API.getChatMessages', 'chat.retry'],
    [core, '_loadDirectWorkspace', 'API.getDirectStaffDirectory', 'chat.unableLoadDirect'],
    [core, '_loadDirectMessages', 'API.getDirectMessages', 'chat.retry'],
    [core, '_loadInquiryTickets', 'API.getInquiryTickets', 'chat.retry'],
    [core, '_loadAnnouncementWorkspace', 'API.getStaffAnnouncements', 'chat.retry'],
    [groups, '_loadChatGroups', 'API.getChatGroups', 'chat.retry'],
    [departments, '_loadDepartmentWorkspace', 'API.getDepartmentChats', 'chat.retry'],
    [grades, '_loadGradeWorkspace', 'API.getGradeChats', 'chat.retry']
  ];
  for (const [source, name, api, retryKey] of loadContracts) {
    assert.ok(source.includes(api), name + ' must call ' + api);
    assert.ok(source.includes(retryKey), name + ' must render a retry affordance');
    assert.ok(source.includes('catch'), name + ' must handle rejected requests');
  }
});

test('department and grade authorization failures clear stale content and disable sending', () => {
  assert.match(departments, /if\(!r\?\.ok\)[\s\S]*?_departmentId=null;_departmentMessages=\[\]/);
  assert.match(departments, /if\(i\)i\.disabled=true;if\(b\)b\.disabled=true/);
  assert.match(departments, /t\('chat\.departmentUnauthorized'\)/);
  assert.match(grades, /catch\(e\)\{[\s\S]*?_gradeName=null;_setGradeMobileView\(false\)/);
  assert.match(grades, /t\('chat\.gradeUnauthorized'\)/);
});

test('conversation requests reject stale responses and polling has stop/replace guards', () => {
  assert.match(groups, /const requestToken=\+\+_chatGroupOpenRequest/);
  assert.match(groups, /if\(requestToken!==_chatGroupOpenRequest\)return false/);
  assert.match(departments, /const requestToken=\+\+_departmentOpenRequest/);
  assert.match(departments, /if\(requestToken!==_departmentOpenRequest\)return/);
  assert.match(grades, /const requestToken=\+\+_gradeOpenRequest/);
  assert.match(grades, /if\(requestToken!==_gradeOpenRequest\)return/);
  assert.match(core, /window\.stopChatPolling\s*=\s*function\(\)[\s\S]*?clearInterval\(_chatPollTimer\)/);
  assert.match(departments, /function _startDepartmentPolling\(\)\{if\(_departmentPollTimer\)clearInterval\(_departmentPollTimer\)/);
  assert.match(grades, /function _startGradePolling\(\)\{if\(_gradePollTimer\)clearInterval\(_gradePollTimer\)/);
});

test('inquiry ticket status updates fail gracefully for both rejected and unsuccessful RPC results', () => {
  const start = core.indexOf('async function _updateInquiryTicket()');
  const end = core.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, 'ticket update handler must exist');
  const body = core.slice(start, end + 2);
  assert.match(body, /window\.APP\?\.is_admin/);
  assert.match(body, /API\.updateInquiryTicket/);
  assert.match(body, /catch\(e\)/);
  assert.match(body, /showToast\(t\('chat\.ticketUpdateFailed'\)\)/);
});
