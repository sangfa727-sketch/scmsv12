import { test, expect } from '@playwright/test';

const BASE_URL = process.env.SCMS_URL ?? 'http://localhost:5173';
const TEACHER_ID = process.env.SCMS_TEST_TEACHER;
const TEACHER_PW = process.env.SCMS_TEST_PW;

async function signInAndOpenChat(
  page: import('@playwright/test').Page,
  teacherId = TEACHER_ID,
  teacherPw = TEACHER_PW
) {
  test.skip(
    process.env.SCMS_REQUIRE_STAGING !== '1' || !teacherId || !teacherPw,
    'Staff Chat browser tests require staging mode plus the configured test-account credentials'
  );
  await page.goto(BASE_URL);
  await page.locator('.landing-btn-secondary').click();
  await page.locator('#webLoginIdentity').fill(teacherId!);
  await page.locator('#webLoginPin').fill(teacherPw!);
  await page.locator('#webLoginBtn').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.getByTestId('nav-chat').click();
  await expect(page.locator('#page-chat')).toBeVisible();
  await expect(page.locator('.sc-chat-topbar')).toBeVisible();
}

test.describe('Staff Chat full-screen browser regression', () => {
  test('topbar renders one active chat type control and no duplicate mobile channel rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);

    await expect(page.locator('.sc-chat-mode-pill')).toBeVisible();
    await expect(page.locator('.sc-chat-top-action')).toHaveCount(2);
    await expect(page.locator('.smart-chat-channel-list')).toBeHidden();
    await expect(page.locator('#scChatTypeMenu')).toBeHidden();
  });

  test('chat type menu opens, selects AI Chat, updates the active pill, and persists after re-entry', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);

    await page.locator('.sc-chat-mode-pill').click();
    await expect(page.locator('#scChatTypeMenu')).toBeVisible();
    await expect(page.locator('#scChatTypeMenu [role="menuitemradio"]')).toHaveCount(2);

    await page.locator('#scChatTypeMenu [role="menuitemradio"]').nth(1).click();
    await expect(page.locator('.sc-chat-mode-pill')).toContainText(/AI Chat|AI Assistant/i);
    await expect(page.locator('#scChatTypeMenu')).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('scms_chat_mode'))).toBe('ai');

    await page.locator('.sc-chat-topbar .sc-chat-top-action').first().click();
    await expect(page.locator('.sc-chat-topbar')).toBeHidden();
    await page.getByTestId('nav-chat').click();
    await expect(page.locator('.sc-chat-mode-pill')).toContainText(/AI Chat|AI Assistant/i);
  });

  test('School Chat can be restored through the type menu and keeps a single menu instance', async ({ page }) => {
    await signInAndOpenChat(page);
    await page.locator('.sc-chat-mode-pill').click();
    await page.locator('#scChatTypeMenu [role="menuitemradio"]').first().click();

    await expect(page.locator('.sc-chat-mode-pill')).toContainText(/School Chat/i);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('scms_chat_mode'))).toBe('school');
    await expect(page.locator('#scChatTypeMenu')).toHaveCount(1);
  });

  test('workspace is vertically scrollable and has no horizontal overflow on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await signInAndOpenChat(page);

    const metrics = await page.evaluate(() => {
      const workspace = document.querySelector('.sc-chat-workspace-content') as HTMLElement | null;
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        workspaceOverflowY: workspace ? getComputedStyle(workspace).overflowY : '',
        workspaceClientHeight: workspace?.clientHeight ?? 0,
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.workspaceOverflowY).toMatch(/auto|scroll/);
    expect(metrics.workspaceClientHeight).toBeGreaterThan(0);
  });

  test('exit control returns to the previous app workspace without leaving a duplicate chat header', async ({ page }) => {
    await signInAndOpenChat(page);
    await page.locator('.sc-chat-topbar .sc-chat-top-action').first().click();

    await expect(page.locator('.sc-chat-topbar')).toBeHidden();
    await expect(page.locator('#page-chat')).toBeHidden();
    await expect(page.locator('#sidebar')).toBeVisible();
  });

  test('chat channel entry points remain present for core staff modules', async ({ page }) => {
    await signInAndOpenChat(page);
    const channelIds = ['staff', 'announcements', 'direct', 'departments', 'tickets', 'events'];
    for (const channelId of channelIds) {
      await expect(page.locator('[data-chat-quick-channel="' + channelId + '"]')).toBeAttached();
    }
  });

  
  test('AI Chat clearly identifies its disconnected shell and does not imply live AI execution', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);
    await page.locator('.sc-chat-mode-pill').click();
    await page.locator('#scChatTypeMenu [role="menuitemradio"]').nth(1).click();

    await expect(page.locator('.smart-chat-ai-card')).toBeVisible();
    await expect(page.locator('.smart-chat-ai-note')).toBeVisible();
    await expect(page.locator('.smart-chat-ai-note')).toContainText(/shell|not connected|မချိတ်ဆက်/i);
    await expect(page.locator('#aiChatInput')).toBeVisible();
  });

  test('Direct, Announcements, and Inquiry channels render their own workspace and return to School Chat', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);

    await page.locator('[data-chat-quick-channel="direct"]').click();
    await expect(page.locator('.smart-chat-direct-shell')).toBeVisible();
    await expect(page.locator('#directStaffSearch')).toBeVisible();
    await page.locator('.smart-chat-channel-back').click();
    await expect(page.locator('[data-chat-quick-channel="staff"]')).toBeVisible();

    await page.locator('[data-chat-quick-channel="announcements"]').click();
    await expect(page.locator('.smart-chat-announcement-shell')).toBeVisible();
    await expect(page.locator('#announcementList')).toBeVisible();
    await page.locator('.smart-chat-channel-back').click();
    await expect(page.locator('[data-chat-quick-channel="staff"]')).toBeVisible();

    await page.locator('[data-chat-quick-channel="tickets"]').click();
    await expect(page.locator('.smart-chat-inquiry-shell')).toBeVisible();
    await expect(page.locator('#inquiryTicketList')).toBeVisible();
    await page.locator('.smart-chat-channel-back').click();
    await expect(page.locator('[data-chat-quick-channel="staff"]')).toBeVisible();
  });
  test('Direct Chat sends a unique message and reloads it from the server', async ({ page }) => {
    test.skip(
      process.env.SCMS_REQUIRE_STAGING !== '1',
      'Message-send E2E must run against an isolated staging environment'
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);
    await page.locator('[data-chat-quick-channel="direct"]').click();

    const recipient = page.locator('.smart-chat-directory-item').first();
    await expect(recipient, 'staging must have at least one active staff recipient').toBeVisible();
    const recipientName = (await recipient.locator('strong').innerText()).trim();
    await recipient.click();
    const input = page.locator('#directChatInput');
    const send = page.locator('#directChatSendBtn');
    await expect(input).toBeEnabled();

    const message = 'SCMS Playwright send-check ' + Date.now();
    await input.fill(message);
    await send.click();
    await expect(page.locator('#directMessageStream')).toContainText(message, { timeout: 15000 });

    // Re-enter the conversation so the assertion is backed by a fresh server read,
    // not only an optimistic/local UI update.
    await page.reload();
    await expect(page.locator('#sidebar')).toBeVisible();
    await page.getByTestId('nav-chat').click();
    await expect(page.locator('#page-chat')).toBeVisible();
    await page.locator('[data-chat-quick-channel="direct"]').click();
    const conversation = page.locator('.smart-chat-direct-item').filter({ hasText: recipientName });
    await expect(conversation, 'the recipient conversation should be listed after a fresh server read').toBeVisible();
    await conversation.click();
    await expect(page.locator('#directMessageStream')).toContainText(message, { timeout: 15000 });
  });


  test('Direct Chat delivers a sent message to a second authenticated staff account', async ({ browser }) => {
    test.skip(
      process.env.SCMS_REQUIRE_STAGING !== '1' ||
      !TEACHER_ID || !TEACHER_PW ||
      !process.env.SCMS_TEST_TEACHER_2 || !process.env.SCMS_TEST_PW_2,
      'Recipient-delivery E2E requires two isolated staging staff accounts'
    );

    const senderContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const receiverContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const sender = await senderContext.newPage();
      const receiver = await receiverContext.newPage();
      await signInAndOpenChat(sender, TEACHER_ID, TEACHER_PW);
      await signInAndOpenChat(receiver, process.env.SCMS_TEST_TEACHER_2, process.env.SCMS_TEST_PW_2);

      const senderName = String(await sender.evaluate(() => window.APP?.teacher_name || '')).trim();
      const receiverName = String(await receiver.evaluate(() => window.APP?.teacher_name || '')).trim();
      expect(senderName).not.toBe('');
      expect(receiverName).not.toBe('');
      expect(senderName).not.toBe(receiverName);

      await sender.locator('[data-chat-quick-channel="direct"]').click();
      const receiverEntry = sender.locator('.smart-chat-directory-item').filter({ hasText: receiverName });
      await expect(receiverEntry, 'sender must be authorized to find the second staging staff account').toBeVisible();
      await receiverEntry.click();

      const message = 'SCMS recipient-delivery check ' + Date.now();
      await sender.locator('#directChatInput').fill(message);
      await sender.locator('#directChatSendBtn').click();
      await expect(sender.locator('#directMessageStream')).toContainText(message, { timeout: 15000 });

      // Receiver must independently fetch the conversation and message after send.
      await receiver.reload();
      await expect(receiver.locator('#sidebar')).toBeVisible();
      await receiver.getByTestId('nav-chat').click();
      await expect(receiver.locator('#page-chat')).toBeVisible();
      await receiver.locator('[data-chat-quick-channel="direct"]').click();
      const senderConversation = receiver.locator('.smart-chat-direct-item').filter({ hasText: senderName });
      await expect(senderConversation, 'receiver must see the sender conversation after a fresh server read').toBeVisible({ timeout: 15000 });
      await senderConversation.click();
      await expect(receiver.locator('#directMessageStream')).toContainText(message, { timeout: 15000 });
    } finally {
      await senderContext.close();
      await receiverContext.close();
    }
  });

});