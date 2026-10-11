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
  const isMobile = await page.evaluate(() => window.matchMedia('(max-width: 760px)').matches);
  if (isMobile) {
    await expect(page.locator('.sc-chat-topbar')).toBeVisible();
  } else {
    await expect(page.locator('.sc-chat-topbar')).toBeHidden();
    await expect(page.locator('.smart-chat-hero')).toBeVisible();
    await expect(page.locator('.smart-chat-mode-switch')).toBeVisible();
  }
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

  test('mode pill switches directly to AI Chat and persists after re-entry without a dropdown', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);
    await page.locator('.sc-chat-mode-pill').click();
    await expect(page.locator('.sc-chat-mode-pill')).toContainText(/AI Chat|AI Assistant/i);
    await expect(page.locator('#scChatTypeMenu')).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('scms_chat_mode'))).toBe('ai');
    await page.locator('.sc-chat-topbar .sc-chat-top-action').first().click();
    await expect(page.locator('.sc-chat-topbar')).toBeHidden();
    await page.getByTestId('nav-chat').click();
    await expect(page.locator('.sc-chat-mode-pill')).toContainText(/AI Chat|AI Assistant/i);
  });

  test('mobile hidden chat types navigate without re-enabling; plus control restores the tab', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);
    await page.locator('[data-chat-quick-channel="direct"]').locator('xpath=..').locator('.smart-chat-quick-channel-hide').click();
    await expect(page.locator('[data-chat-quick-channel="direct"]')).toHaveCount(0);
    await page.locator('.sc-chat-topbar .sc-chat-top-action').nth(1).click();
    const hiddenType = page.locator('#scChatTypeMenu .sc-chat-type-option').filter({ hasText: 'Direct Messages' });
    await expect(hiddenType).toBeVisible();
    await hiddenType.click();
    await expect(page.locator('.smart-chat-direct-shell')).toBeVisible();
    await expect(page.locator('[data-chat-quick-channel="direct"]')).toHaveCount(0);
    await page.locator('.sc-chat-topbar .sc-chat-top-action').nth(1).click();
    await page.locator('#scChatTypeMenu .sc-chat-type-enable[aria-label*="Direct Messages"]').click();
    await expect(page.locator('[data-chat-quick-channel="direct"]')).toBeVisible();
  });

  test('desktop tabs fill the row, have no mobile hide controls, and keep All Staff wide', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAndOpenChat(page);
    await expect(page.locator('.smart-chat-identity')).toHaveCount(0);
    await expect(page.locator('.smart-chat-mode-switch')).toBeVisible();
    await expect(page.locator('.smart-chat-quick-channel-hide:visible')).toHaveCount(0);
    const layout = await page.evaluate(() => {
      const track = document.querySelector('.smart-chat-quick-nav-track') as HTMLElement | null;
      const conversation = document.querySelector('.smart-chat-conversation') as HTMLElement | null;
      const channelList = document.querySelector('.smart-chat-channel-list') as HTMLElement | null;
      const body = document.querySelector('#smartChatModeBody') as HTMLElement | null;
      return {
        columns: track ? getComputedStyle(track).gridTemplateColumns : '',
        trackWidth: track?.getBoundingClientRect().width ?? 0,
        bodyWidth: body?.getBoundingClientRect().width ?? 0,
        conversationWidth: conversation?.getBoundingClientRect().width ?? 0,
        channelListWidth: channelList?.getBoundingClientRect().width ?? 0,
        overflowWidth: track ? track.scrollWidth - track.clientWidth : 0
      };
    });
    expect(layout.columns.split(' ').length).toBe(6);
    expect(layout.trackWidth).toBeGreaterThan(700);
    expect(layout.bodyWidth).toBeGreaterThan(800);
    expect(layout.conversationWidth).toBeGreaterThan(layout.channelListWidth * 2);
    expect(layout.overflowWidth).toBeLessThanOrEqual(1);
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

  test('mobile arrow toggles between fullscreen Chat and the normal Chat page without losing context', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAndOpenChat(page);

    await page.locator('.sc-chat-topbar .sc-chat-top-action').first().click();
    await expect(page.locator('.sc-chat-topbar')).toBeHidden();
    await expect(page.locator('#page-chat')).toBeVisible();
    await expect(page.locator('#appHeader')).toBeVisible();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('.smart-chat-nav-back')).toBeVisible();
    await expect(page.locator('.smart-chat-nav-icon')).toHaveText('›');

    await page.locator('.smart-chat-nav-back').click();
    await expect(page.locator('html')).toHaveClass(/scms-chat-workspace/);
    await expect(page.locator('.sc-chat-topbar')).toBeVisible();
    await expect(page.locator('#appHeader')).toBeHidden();
    await expect(page.locator('.smart-chat-nav-icon')).toHaveText('‹');

    await page.locator('.sc-chat-topbar .sc-chat-top-action').first().click();
    await expect(page.locator('html')).not.toHaveClass(/scms-chat-workspace/);
    await expect(page.locator('#appHeader')).toBeVisible();
  });

  test('desktop keeps the original SCMS navigation and Chat header instead of mobile fullscreen chrome', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signInAndOpenChat(page);

    await expect(page.locator('#appHeader')).toBeVisible();
    await expect(page.locator('.smart-chat-hero')).toBeVisible();
    await expect(page.locator('.smart-chat-mode-switch')).toBeVisible();
    await expect(page.locator('.smart-chat-nav-back')).toBeHidden();
    await expect(page.locator('.sc-chat-topbar')).toBeHidden();
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