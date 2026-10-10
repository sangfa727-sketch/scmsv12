const { test, expect } = require('@playwright/test');

async function mountSmartChat(page, render = true) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof window.renderChat === 'function' &&
    typeof window.switchChatChannel === 'function' &&
    typeof window.switchChatMode === 'function' &&
    !!window.APP
  );

  await page.evaluate((shouldRender) => {
    window.APP.platform = 'native';
    window.APP.currentPage = 'chat';
    window.APP.teacher_id = 'teacher-1';
    window.APP.teacher_name = 'Test Teacher';
    window.APP.school_id = 'school-1';
    window.APP.is_admin = false;
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.getElementById('page-chat')?.classList.add('active');
    window.__chatTestCalls = [];

    const record = (name, ...args) => {
      window.__chatTestCalls.push({ name, args });
    };
    const now = '2026-10-10T08:00:00.000Z';
    window.API = {
      getChatMessages: async (...args) => {
        record('getChatMessages', ...args);
        return [{ id: 'msg-1', teacher_id: 'teacher-2', teacher_name: 'Other Teacher', text: 'Staff hello', created_at: now }];
      },
      sendChatMessage: async (...args) => {
        record('sendChatMessage', ...args);
        return { ok: true, message: { id: 'msg-2', teacher_id: 'teacher-1', teacher_name: 'Test Teacher', text: args[1], created_at: now } };
      },
      getDirectStaffDirectory: async (...args) => {
        record('getDirectStaffDirectory', ...args);
        return [{ teacher_id: 'teacher-2', teacher_name: 'Other Teacher', role: 'Teacher', status: 'active' }];
      },
      getDirectConversations: async (...args) => {
        record('getDirectConversations', ...args);
        return [{ conversation_id: 21, teacher_id: 'teacher-2', teacher_name: 'Other Teacher', role: 'Teacher', last_message: 'Private hello', unread_count: 1 }];
      },
      openDirectConversation: async (...args) => {
        record('openDirectConversation', ...args);
        return { ok: true, conversation_id: 21, peer: { teacher_id: 'teacher-2', teacher_name: 'Other Teacher', role: 'Teacher' } };
      },
      getDirectMessages: async (...args) => {
        record('getDirectMessages', ...args);
        return [{ id: 'dm-1', teacher_id: 'teacher-2', teacher_name: 'Other Teacher', text: 'Private hello', created_at: now }];
      },
      sendDirectMessage: async (...args) => {
        record('sendDirectMessage', ...args);
        return { ok: true };
      },
      markDirectRead: async (...args) => {
        record('markDirectRead', ...args);
        return { ok: true };
      },
      getStaffAnnouncements: async (...args) => {
        record('getStaffAnnouncements', ...args);
        return [{ id: '11111111-1111-4111-8111-111111111111', message_type: 'notice', reason: 'School update', body: 'Read this announcement', created_at: now }];
      },
      markStaffAnnouncementRead: async (...args) => {
        record('markStaffAnnouncementRead', ...args);
        return { ok: true };
      },
      getInquiryTickets: async (...args) => {
        record('getInquiryTickets', ...args);
        return [{ id: 41, subject: 'Parent request', status: 'OPEN', priority: 'NORMAL', created_at: now, unread_count: 0 }];
      },
      createInquiryTicket: async (...args) => {
        record('createInquiryTicket', ...args);
        return { ok: true, ticket: { id: 42 } };
      },
      openInquiryTicket: async (...args) => {
        record('openInquiryTicket', ...args);
        return { ok: true, ticket: { id: 41, subject: 'Parent request', status: 'OPEN', priority: 'NORMAL' }, messages: [] };
      },
      sendInquiryMessage: async (...args) => {
        record('sendInquiryMessage', ...args);
        return { ok: true };
      },
      markInquiryRead: async (...args) => {
        record('markInquiryRead', ...args);
        return { ok: true };
      },
      updateInquiryTicket: async (...args) => {
        record('updateInquiryTicket', ...args);
        return { ok: true };
      },
      getChatGroups: async (...args) => {
        record('getChatGroups', ...args);
        return [{ id: 31, name: 'Planning Group', group_type: 'PROJECT', status: 'ACTIVE', unread_count: 0 }];
      },
      createChatGroup: async (...args) => {
        record('createChatGroup', ...args);
        return { ok: true, group_id: 32 };
      },
      openChatGroup: async (...args) => {
        record('openChatGroup', ...args);
        return { ok: true, group: { id: 31, name: 'Planning Group', group_type: 'PROJECT', status: 'ACTIVE' }, messages: [] };
      },
      sendChatGroupMessage: async (...args) => {
        record('sendChatGroupMessage', ...args);
        return { ok: true };
      },
      markChatGroupRead: async (...args) => {
        record('markChatGroupRead', ...args);
        return { ok: true };
      },
      getDepartmentChats: async (...args) => {
        record('getDepartmentChats', ...args);
        return [{ id: 51, department_code: 'SCI', department_name: 'Science Department', is_active: true }];
      },
      adminUpsertDepartment: async (...args) => {
        record('adminUpsertDepartment', ...args);
        return { ok: true, department_id: 52 };
      },
      adminSetDepartmentMembers: async (...args) => {
        record('adminSetDepartmentMembers', ...args);
        return { ok: true, member_count: (args[1] || []).length };
      },
      openDepartmentChat: async (...args) => {
        record('openDepartmentChat', ...args);
        return { ok: true, department: { id: 51, department_code: 'SCI', department_name: 'Science Department' }, messages: [] };
      },
      sendDepartmentMessage: async (...args) => {
        record('sendDepartmentMessage', ...args);
        return { ok: true };
      },
      getChatGradeTargets: async (...args) => {
        record('getChatGradeTargets', ...args);
        return ['Grade 1'];
      },
      getChatRecipientPreview: async (...args) => {
        record('getChatRecipientPreview', ...args);
        return [{ teacher_id: 'teacher-2', teacher_name: 'Other Teacher', role: 'Teacher' }];
      },
      createStaffAnnouncement: async (...args) => {
        record('createStaffAnnouncement', ...args);
        return { ok: true, recipient_count: 1 };
      }
    };

    if (shouldRender) window.renderChat();
  }, render);
}


test('Desktop Chat entry does not change the existing SCMS chrome visibility', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mountSmartChat(page, false);
  const selectors = ['#appHeader', '#sidebar', '#sidebarBackdrop', '#tabBar', '#fab'];
  const before = await page.evaluate((items) => Object.fromEntries(items.map((selector) => {
    const element = document.querySelector(selector);
    return [selector, element ? getComputedStyle(element).display : 'missing'];
  })), selectors);

  await page.evaluate(() => window.renderChat());

  const after = await page.evaluate((items) => Object.fromEntries(items.map((selector) => {
    const element = document.querySelector(selector);
    return [selector, element ? getComputedStyle(element).display : 'missing'];
  })), selectors);
  expect(after).toEqual(before);
  await expect(page.locator('#appHeader')).toBeVisible();
  await expect(page.locator('.smart-chat-hero')).toBeVisible();
  await expect(page.locator('.smart-chat-mode-switch')).toBeVisible();
  await expect(page.locator('.sc-chat-topbar')).toBeHidden();
});

test('Mobile Chat entry hides the global chrome and uses the mobile topbar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountSmartChat(page, false);
  await page.evaluate(() => window.renderChat());

  for (const selector of ['#appHeader', '#sidebar', '#sidebarBackdrop', '#tabBar', '#fab']) {
    const element = page.locator(selector);
    if (await element.count()) {
      await expect(element).toBeHidden();
    }
  }
  await expect(page.locator('.sc-chat-topbar')).toBeVisible();
});

async function calls(page, name) {
  return page.evaluate((target) => window.__chatTestCalls.filter(x => x.name === target), name);
}

test('Smart Chat loads All Staff messages through the API', async ({ page }) => {
  await mountSmartChat(page);
  await expect(page.locator('#chatStream')).toContainText('Staff hello');
  expect(await calls(page, 'getChatMessages')).toHaveLength(1);
});

test('All Staff composer sends a message and restores its controls', async ({ page }) => {
  await mountSmartChat(page);
  await page.locator('#chatInput').fill('Functional test message');
  await page.locator('#chatSendBtn').click();
  await expect.poll(async () => (await calls(page, 'sendChatMessage')).length).toBe(1);
  expect((await calls(page, 'sendChatMessage'))[0].args).toEqual(['staff', 'Functional test message']);
  await expect(page.locator('#chatInput')).toBeEnabled();
  await expect(page.locator('#chatStream')).toContainText('Functional test message');
});

test('Direct Chat loads the staff directory and opens a private conversation', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('direct'));
  await expect.poll(async () => (await calls(page, 'getDirectStaffDirectory')).length).toBeGreaterThan(0);
  await expect(page.locator('#directStaffDirectory')).toContainText('Other Teacher');
  await page.evaluate(() => window.openDirectChat('teacher-2'));
  await expect.poll(async () => (await calls(page, 'getDirectMessages')).length).toBeGreaterThan(0);
  await expect(page.locator('#directMessageStream')).toContainText('Private hello');
});

test('Official Announcements loads and marks the selected UUID announcement read', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('announcements'));
  await expect.poll(async () => (await calls(page, 'getStaffAnnouncements')).length).toBeGreaterThan(0);
  await expect(page.locator('#announcementList')).toContainText('Read this announcement');
  await page.evaluate(() => window._openAnnouncement('11111111-1111-4111-8111-111111111111'));
  await expect(page.locator('#announcementStream')).toContainText('Read this announcement');
  await expect.poll(async () => (await calls(page, 'markStaffAnnouncementRead')).length).toBeGreaterThan(0);
});

test('Inquiry workspace loads its ticket list', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('tickets'));
  await expect.poll(async () => (await calls(page, 'getInquiryTickets')).length).toBeGreaterThan(0);
  await expect(page.locator('#inquiryTicketList')).toContainText('Parent request');
});

test('Project and event workspace loads the group list', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('events'));
  await expect.poll(async () => (await calls(page, 'getChatGroups')).length).toBeGreaterThan(0);
  await expect(page.locator('#chatGroupList')).toContainText('Planning Group');
});

test('Department workspace requests department channels', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('departments'));
  await expect.poll(async () => (await calls(page, 'getDepartmentChats')).length).toBeGreaterThan(0);
  await expect(page.locator('#smartChatModeBody')).toContainText('Science Department');
});

test('AI Assistant remains clearly labelled as a preview, not a connected chat', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatMode('ai'));
  await expect(page.locator('.smart-chat-ai-card')).toContainText(/not connected|UI shell only/i);
  await expect(page.locator('#aiChatInput')).toBeVisible();
});

test('mobile full-screen chat uses one topbar and persists chat type selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountSmartChat(page);
  await expect(page.locator('.sc-chat-topbar')).toBeVisible();
  await expect(page.locator('#chatComposer')).toBeVisible();
  await expect.poll(() => page.locator('#chatComposer').evaluate(el => getComputedStyle(el).position)).toBe('sticky');
  await expect(page.locator('.smart-chat-hero')).toBeHidden();
  await expect(page.locator('.smart-chat-mode-switch')).toBeHidden();
  await expect(page.locator('.sc-chat-mode-pill')).toContainText(/School Chat/i);
  await page.locator('.sc-chat-mode-pill').click();
  await expect(page.locator('#scChatTypeMenu')).toBeVisible();
  await page.locator('.sc-chat-type-option').filter({ hasText: /AI Assistant|AI Chat/i }).click();
  await expect(page.locator('.sc-chat-mode-pill')).toContainText(/AI Assistant|AI Chat/i);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('scms_chat_mode'))).toBe('ai');
  await expect(page.locator('.sc-chat-type-option.active')).toHaveCount(1);
  await page.locator('.sc-chat-topbar .sc-chat-top-action').first().click();
  await expect(page.locator('html')).not.toHaveClass(/scms-chat-workspace/);
  await expect(page.locator('#page-chat')).toBeVisible();
  await expect(page.locator('#appHeader')).toBeVisible();
  await expect(page.locator('#sidebar')).toBeVisible();
});

test('desktop Chat keeps the original hero and mode tabs without mobile topbar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mountSmartChat(page);
  await expect(page.locator('.sc-chat-topbar')).toBeHidden();
  await expect(page.locator('.smart-chat-hero')).toBeVisible();
  await expect(page.locator('.smart-chat-mode-switch')).toBeVisible();
});


test('Direct Chat composer sends through the API and refreshes the conversation', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('direct'));
  await page.evaluate(() => window.openDirectChat('teacher-2'));
  const input = page.locator('#directChatInput');
  await expect(input).toBeEnabled();
  await input.fill('Direct send functional check');
  await page.locator('#directChatSendBtn').click();
  await expect.poll(async () => (await calls(page, 'sendDirectMessage')).length).toBe(1);
  expect((await calls(page, 'sendDirectMessage'))[0].args).toEqual([21, 'Direct send functional check']);
  await expect(input).toBeEnabled();
});

test('Inquiry ticket composer sends a message through the API', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('tickets'));
  await page.evaluate(() => window._openInquiryTicket(41));
  const input = page.locator('#inquiryChatInput');
  await expect(input).toBeEnabled();
  await input.fill('Inquiry send functional check');
  await page.locator('#inquirySendBtn').click();
  await expect.poll(async () => (await calls(page, 'sendInquiryMessage')).length).toBe(1);
  expect((await calls(page, 'sendInquiryMessage'))[0].args).toEqual([41, 'Inquiry send functional check']);
  await expect(input).toBeEnabled();
});


test('Inquiry workspace creates a ticket and refreshes the list', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('tickets'));
  await page.getByRole('button', { name: /new ticket/i }).click();
  await expect(page.locator('#inquiryDraftOverlay')).toBeVisible();
  await expect(page.locator('#inquiryTicketList')).toContainText('Parent request');
  await page.locator('#inquiryDraftSubject').fill('Functional test ticket');
  await page.locator('#inquiryDraftBody').fill('Ticket creation should call the API and refresh the list.');
  await page.locator('#inquiryDraftPriority').selectOption('NORMAL');
  await page.locator('#inquiryDraftSubmitBtn').click();
  await expect.poll(async () => (await calls(page, 'createInquiryTicket')).length).toBe(1);
  expect((await calls(page, 'createInquiryTicket'))[0].args).toEqual([
    'Functional test ticket',
    'Ticket creation should call the API and refresh the list.',
    null,
    'NORMAL'
  ]);
  await expect(page.locator('#inquiryTicketList')).toContainText('Parent request');
});

test('Direct Chat composer recovers when the send API rejects the message', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => {
    window.API.sendDirectMessage = async () => ({ ok: false, error: 'test_rejected' });
    window.switchChatChannel('direct');
  });
  await page.evaluate(() => window.openDirectChat('teacher-2'));
  const input = page.locator('#directChatInput');
  await expect(input).toBeEnabled();
  await input.fill('Rejected direct message');
  await page.locator('#directChatSendBtn').click();
  await expect(input).toBeEnabled();
  await expect(page.locator('#directChatSendBtn')).toBeEnabled();
});

test('admin official announcement uses verified recipients and sends through the API', async ({ page }) => {
  await mountSmartChat(page, false);
  await page.evaluate(() => {
    window.APP.is_admin = true;
    window.renderChat();
    window.switchChatChannel('announcements');
  });

  // The native select is intentionally hidden by SCMS's custom-select enhancement.
  // Set its backing value and dispatch change to exercise the preview handler.
  await expect(page.locator('#adminMsgRecipientType')).toHaveCount(1);
  await page.locator('#adminMsgRecipientType').evaluate((select) => {
    select.value = 'all_staff';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => (await calls(page, 'getChatRecipientPreview')).length).toBeGreaterThan(0);
  await expect(page.locator('#adminMsgRoutingStatus')).toHaveClass(/verified/);

  // Admin composer is intentionally collapsed in the announcement workspace.
  await page.locator('#announcementComposerToggle').click();
  await expect(page.locator('#adminMsgReason')).toBeVisible();
  await page.locator('#adminMsgReason').fill('Staff operations update');
  await page.locator('#adminMsgBody').fill('Please review the updated duty schedule.');
  await expect(page.locator('#adminMsgSendBtn')).toBeEnabled();
  await page.locator('#adminMsgSendBtn').click();

  await expect.poll(async () => (await calls(page, 'createStaffAnnouncement')).length).toBe(1);
  expect((await calls(page, 'createStaffAnnouncement'))[0].args).toEqual([
    'all_staff',
    null,
    'announcement',
    'Staff operations update',
    'Please review the updated duty schedule.'
  ]);
});

test('channel workspaces rely on the persistent channel tabs instead of a duplicate Back button', async ({ page }) => {
  await mountSmartChat(page);
  for (const channel of ['announcements', 'tickets', 'events', 'departments']) {
    await page.evaluate((id) => window.switchChatChannel(id), channel);
    await expect(page.locator('.smart-chat-channel-back')).toHaveCount(0);
    await expect(page.locator('#smartChatQuickNav .smart-chat-quick-channel.active')).toHaveAttribute('data-chat-quick-channel', channel);
  }
});

test('sent and received Staff Chat messages use distinct readable bubble surfaces', async ({ page }) => {
  await mountSmartChat(page);
  await page.locator('#chatInput').fill('Outgoing contrast regression');
  await page.locator('#chatSendBtn').click();
  const received = page.locator('#chatStream .chat-bubble-row.theirs .chat-bubble').first();
  const sent = page.locator('#chatStream .chat-bubble-row.mine .chat-bubble').last();
  await expect(received).toContainText('Staff hello');
  await expect(sent).toContainText('Outgoing contrast regression');
  const surfaces = await page.evaluate(() => {
    const receivedBubble = document.querySelector('#chatStream .chat-bubble-row.theirs .chat-bubble');
    const sentBubble = [...document.querySelectorAll('#chatStream .chat-bubble-row.mine .chat-bubble')].at(-1);
    return {
      received: receivedBubble ? getComputedStyle(receivedBubble).backgroundColor : null,
      sent: sentBubble ? getComputedStyle(sentBubble).backgroundColor : null
    };
  });
  expect(surfaces.received).toBeTruthy();
  expect(surfaces.sent).toBeTruthy();
  expect(surfaces.sent).not.toBe(surfaces.received);
});


test('mobile Staff Chat list panes remain independently scrollable when populated', async ({ page }) => {
  await mountSmartChat(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.evaluate(() => {
    window.API.getDirectStaffDirectory = async () => Array.from({ length: 28 }, (_, i) => ({
      teacher_id: `teacher-${i + 1}`,
      teacher_name: `Staff Member ${i + 1}`,
      role: 'Teacher',
      status: 'active'
    }));
    window.API.getDirectConversations = async () => [];
  });
  await page.evaluate(() => window.switchChatChannel('direct'));
  const directory = page.locator('#directStaffDirectory');
  await expect(directory.locator('.smart-chat-directory-item')).toHaveCount(28);
  const directoryScroll = await directory.evaluate((el) => {
    const before = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    return { overflowY: getComputedStyle(el).overflowY, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, moved: el.scrollTop > before };
  });
  expect(directoryScroll.overflowY).toBe('auto');
  expect(directoryScroll.clientHeight).toBeGreaterThan(0);
  expect(directoryScroll.scrollHeight).toBeGreaterThan(directoryScroll.clientHeight);
  expect(directoryScroll.moved).toBe(true);

  await page.evaluate(() => {
    window.API.getStaffAnnouncements = async () => Array.from({ length: 24 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      message_type: 'notice',
      reason: `School update ${i + 1}`,
      body: `Announcement body ${i + 1}`,
      created_at: '2026-10-10T08:00:00.000Z'
    }));
    window.switchChatChannel('announcements');
  });
  const announcements = page.locator('#announcementList');
  await expect(announcements.locator('.smart-chat-announcement-card')).toHaveCount(24);
  // Mobile opens the first announcement automatically; return to the list pane before testing its scroll area.
  await page.evaluate(() => window._clearAnnouncementSelection());
  const announcementScroll = await announcements.evaluate((el) => {
    const before = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    return { overflowY: getComputedStyle(el).overflowY, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, moved: el.scrollTop > before };
  });
  expect(announcementScroll.overflowY).toBe('auto');
  expect(announcementScroll.clientHeight).toBeGreaterThan(0);
  expect(announcementScroll.scrollHeight).toBeGreaterThan(announcementScroll.clientHeight);
  expect(announcementScroll.moved).toBe(true);

  await page.evaluate(() => {
    window.API.getInquiryTickets = async () => Array.from({ length: 24 }, (_, i) => ({
      id: i + 100,
      subject: `Parent request ${i + 1}`,
      status: 'OPEN',
      priority: 'NORMAL',
      created_at: '2026-10-10T08:00:00.000Z',
      unread_count: 0
    }));
    window.switchChatChannel('tickets');
  });
  const tickets = page.locator('#inquiryTicketList');
  await expect(tickets.locator('.smart-chat-channel-card')).toHaveCount(24);
  const ticketScroll = await tickets.evaluate((el) => {
    const before = el.scrollTop;
    el.scrollTop = el.scrollHeight;
    return { overflowY: getComputedStyle(el).overflowY, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, moved: el.scrollTop > before };
  });
  expect(ticketScroll.overflowY).toBe('auto');
  expect(ticketScroll.clientHeight).toBeGreaterThan(0);
  expect(ticketScroll.scrollHeight).toBeGreaterThan(ticketScroll.clientHeight);
  expect(ticketScroll.moved).toBe(true);
});



test('mobile one-to-one chat keeps message stream scrollable and composer visible', async ({ page }) => {
  await mountSmartChat(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.API.getDirectStaffDirectory = async () => [
      { teacher_id: 'teacher-2', teacher_name: 'Other Teacher', role: 'Teacher', status: 'active', photo_url: null }
    ];
    window.API.getDirectConversations = async () => [];
    window.API.openDirectConversation = async (teacherId) => ({
      ok: true,
      conversation_id: 42,
      peer: { teacher_id: teacherId, teacher_name: 'Other Teacher', role: 'Teacher', photo_url: null }
    });
    window.API.getDirectMessages = async () => Array.from({ length: 35 }, (_, i) => ({
      id: i + 1,
      conversation_id: 42,
      sender_teacher_id: i % 2 ? 'teacher-2' : (window.APP?.teacher_id || 'current-user'),
      text: `Private message ${i + 1} — mobile scroll regression fixture`,
      created_at: new Date(Date.now() - (35 - i) * 60000).toISOString()
    }));
    window.API.markDirectRead = async () => ({ ok: true });
  });
  await page.evaluate(() => window.switchChatChannel('direct'));
  await page.locator('#directStaffDirectory .smart-chat-directory-item').first().waitFor();
  await page.evaluate(() => window.openDirectChat('teacher-2'));

  const shell = page.locator('#page-chat .smart-chat-direct-shell');
  await expect(shell).toHaveClass(/has-selection/);
  await expect(page.locator('#page-chat .smart-chat-direct-list')).toBeHidden();
  const conversation = page.locator('#page-chat .smart-chat-direct-conversation');
  const stream = page.locator('#directMessageStream');
  const composer = page.locator('#page-chat .smart-chat-direct-composer');
  await expect(page.locator('#directConversationHead')).toContainText('Other Teacher');
  await expect(stream.locator('.chat-bubble-row')).toHaveCount(35);
  await expect(composer).toBeVisible();
  await expect(page.locator('#directChatInput')).toBeEnabled();
  await expect(page.locator('#directChatSendBtn')).toBeEnabled();

  const geometry = await page.evaluate(() => {
    const shellEl = document.querySelector('#page-chat .smart-chat-direct-shell');
    const conversationEl = document.querySelector('#page-chat .smart-chat-direct-conversation');
    const streamEl = document.querySelector('#directMessageStream');
    const composerEl = document.querySelector('#page-chat .smart-chat-direct-composer');
    const rect = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; };
    const before = streamEl.scrollTop;
    streamEl.scrollTop = 0;
    const scrollable = streamEl.scrollHeight > streamEl.clientHeight && streamEl.scrollTop < before;
    return {
      shell: rect(shellEl), conversation: rect(conversationEl), stream: rect(streamEl), composer: rect(composerEl),
      streamOverflowY: getComputedStyle(streamEl).overflowY,
      streamScrollHeight: streamEl.scrollHeight, streamClientHeight: streamEl.clientHeight,
      scrollable,
      viewportHeight: window.innerHeight
    };
  });
  expect(geometry.conversation.height).toBeGreaterThan(0);
  expect(geometry.composer.height).toBeGreaterThan(0);
  expect(geometry.composer.bottom).toBeLessThanOrEqual(geometry.viewportHeight + 2);
  expect(geometry.streamOverflowY).toBe('auto');
  expect(geometry.streamScrollHeight).toBeGreaterThan(geometry.streamClientHeight);
  expect(geometry.scrollable).toBe(true);
});

test('Direct Chat uses existing teacher profile photos with a safe initials fallback', async ({ page }) => {
  await mountSmartChat(page);
  const photoUrl = 'https://profiles.example.test/other-teacher.svg';
  await page.route('https://profiles.example.test/**', (route) => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#777"/></svg>'
  }));
  await page.evaluate((url) => {
    window.API.getDirectStaffDirectory = async () => [
      { teacher_id: 'teacher-2', teacher_name: 'Other Teacher', role: 'Teacher', photo_url: url },
      { teacher_id: 'teacher-3', teacher_name: 'No Photo', role: 'Teacher', photo_url: 'javascript:alert(1)' }
    ];
    window.API.getDirectConversations = async () => [{
      conversation_id: 21, teacher_id: 'teacher-2', teacher_name: 'Other Teacher',
      role: 'Teacher', photo_url: url, last_message: 'Private hello', unread_count: 0
    }];
    window.API.openDirectConversation = async (teacherId) => ({
      ok: true,
      conversation_id: 21,
      peer: { teacher_id: teacherId, teacher_name: 'Other Teacher', role: 'Teacher', photo_url: url }
    });
  }, photoUrl);
  await page.evaluate(() => window.switchChatChannel('direct'));

  const contact = page.locator('#directStaffDirectory .smart-chat-directory-item').first();
  await expect(contact.locator('.smart-chat-profile-photo')).toHaveAttribute('src', photoUrl);
  const fallbackContact = page.locator('#directStaffDirectory .smart-chat-directory-item').nth(1);
  await expect(fallbackContact.locator('.smart-chat-avatar-initial')).toHaveText('N');
  await expect(fallbackContact.locator('.smart-chat-profile-photo')).toHaveCount(0);

  await expect(page.locator('#directConversationList .smart-chat-profile-photo')).toHaveAttribute('src', photoUrl);
  await page.evaluate(() => window.openDirectChat('teacher-2'));
  await expect(page.locator('#directConversationHead .smart-chat-profile-photo')).toHaveAttribute('src', photoUrl);
});



test('Direct Chat header stays compact and renders only one peer identity', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('direct'));
  await page.evaluate(() => window.openDirectChat('teacher-2'));
  const head = page.locator('#directConversationHead');
  await expect(head.locator('.smart-chat-mobile-back')).toHaveCount(1);
  await expect(head.locator('.smart-chat-direct-avatar')).toHaveCount(1);
  await expect(head.locator('strong')).toHaveCount(1);
  await expect(head.locator('.smart-chat-verified-pill')).toHaveCount(0);
  const geometry = await head.evaluate(el => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width }));
  expect(geometry.height).toBeLessThanOrEqual(54);
  expect(geometry.width).toBeGreaterThan(0);
});


test('Department creation modal selects existing staff and assigns them to the new channel', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => {
    window.APP.is_admin = true;
    window.switchChatChannel('departments');
  });
  await expect(page.locator('#departmentList')).toContainText('Science Department');
  await page.locator('#departmentComposerToggle').click();
  const modal = page.locator('#departmentComposerOverlay');
  await expect(modal).toBeVisible();
  await expect(page.locator('#departmentList')).toContainText('Science Department');
  await modal.locator('#departmentAdminName').fill('Math Department');
  await expect(modal.locator('#departmentAdminCode')).toHaveValue('MATH_DEPARTMENT');
  await modal.locator('input[name="departmentMember"][value="teacher-2"]').check();
  await modal.locator('#departmentCreateSubmit').click();
  await expect.poll(async () => (await calls(page, 'adminUpsertDepartment')).length).toBe(1);
  await expect.poll(async () => (await calls(page, 'adminSetDepartmentMembers')).length).toBe(1);
  expect((await calls(page, 'adminUpsertDepartment'))[0].args).toEqual(['MATH_DEPARTMENT', 'Math Department', true]);
  expect((await calls(page, 'adminSetDepartmentMembers'))[0].args).toEqual([52, ['teacher-2']]);
  await expect(page.locator('#departmentComposerOverlay')).toHaveCount(0);
  await expect(page.locator('#departmentList')).toContainText('Science Department');
});



test('Staff Chat preserves the last successful contact and announcement data on transient refresh errors', async ({ page }) => {
  await mountSmartChat(page);
  await page.evaluate(() => window.switchChatChannel('direct'));
  await expect(page.locator('#directStaffDirectory')).toContainText('Other Teacher');
  await page.evaluate(() => {
    window.API.getDirectStaffDirectory = async () => { throw new Error('temporary_directory_error'); };
    window._loadDirectWorkspace();
  });
  await expect(page.locator('#directStaffDirectory')).toContainText('Other Teacher');

  await page.evaluate(() => window.switchChatChannel('announcements'));
  await expect(page.locator('#announcementList')).toContainText('Read this announcement');
  await page.evaluate(() => {
    window.API.getStaffAnnouncements = async () => { throw new Error('temporary_announcement_error'); };
    window._loadAnnouncementWorkspace(false);
  });
  await expect(page.locator('#announcementList')).toContainText('Read this announcement');
});

test('cached Staff Chat lists remain visible while refresh requests are pending', async ({ page }) => {
  await mountSmartChat(page);

  await page.evaluate(() => window.switchChatChannel('announcements'));
  await expect(page.locator('#announcementList')).toContainText('notice');
  await page.evaluate(() => {
    window.API.getStaffAnnouncements = () => new Promise(() => {});
    window.switchChatChannel('staff');
    window.switchChatChannel('announcements');
  });
  await expect(page.locator('#announcementList')).toContainText('notice');

  await page.evaluate(() => window.switchChatChannel('departments'));
  await expect(page.locator('#departmentList')).toContainText('Science Department');
  await page.evaluate(() => {
    window.API.getDepartmentChats = () => new Promise(() => {});
    window.switchChatChannel('staff');
    window.switchChatChannel('departments');
  });
  await expect(page.locator('#departmentList')).toContainText('Science Department');

  await page.evaluate(() => window.switchChatChannel('tickets'));
  await expect(page.locator('#inquiryTicketList')).toContainText('Parent request');
  await page.evaluate(() => {
    window.API.getInquiryTickets = () => new Promise(() => {});
    window.switchChatChannel('staff');
    window.switchChatChannel('tickets');
  });
  await expect(page.locator('#inquiryTicketList')).toContainText('Parent request');

  await page.evaluate(() => window.switchChatChannel('events'));
  await expect(page.locator('#chatGroupList')).toContainText('Planning Group');
  await page.evaluate(() => {
    window.API.getChatGroups = () => new Promise(() => {});
    window.switchChatChannel('staff');
    window.switchChatChannel('events');
  });
  await expect(page.locator('#chatGroupList')).toContainText('Planning Group');
});

