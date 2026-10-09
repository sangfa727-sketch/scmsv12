const { test, expect } = require('@playwright/test');

async function mountSmartChat(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    typeof window.renderChat === 'function' &&
    typeof window.switchChatChannel === 'function' &&
    typeof window.switchChatMode === 'function' &&
    !!window.APP
  );

  await page.evaluate(() => {
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
        return { ok: true, ticket_id: 42 };
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

    window.renderChat();
  });
}

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
