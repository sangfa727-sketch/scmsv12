import { test, expect } from '@playwright/test';

// ============================================================
// DELIBERATELY SMALL. Two flows only — the two that have already
// broken in production (modal-stacking / stuck-save, and the
// Parent Portal QR->login chain). Every selector below uses
// data-testid, NOT text or CSS class, specifically so a copy or
// style change doesn't break the test — only a structural change
// does, and a structural change is exactly what you want caught.
//
// If a data-testid used here doesn't exist in the HTML yet, add it
// once (it's a static attribute, costs nothing at runtime) rather
// than falling back to a text/class selector.
// ============================================================

const BASE_URL = process.env.SCMS_URL ?? 'http://localhost:5173';
const TEACHER_ID = process.env.SCMS_TEST_TEACHER ?? 'T-A1';
const TEACHER_PW = process.env.SCMS_TEST_PW ?? 'change-me';

test.describe('Admissions -> billing-gated enrollment (regression: modal-stacking bug)', () => {
  test('enroll, bill, pay, activate — without orphaning a modal layer', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page.getByTestId('login-password').fill(TEACHER_PW);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    await page.getByTestId('nav-admissions').click();
    await page.getByTestId('admission-card').first().click();
    await page.getByTestId('admission-enroll-btn').click();

    // The regression this guards: re-opening a stacked modal to
    // "refresh" used to orphan DOM layers. Assert only ONE detail
    // modal is present after the action completes.
    await expect(page.getByTestId('modal-layer')).toHaveCount(1);

    await page.getByTestId('create-registration-invoice-btn').click();
    await expect(page.getByTestId('modal-layer')).toHaveCount(1);
    await page.getByTestId('invoice-save-btn').click();

    await expect(page.getByTestId('toast-success')).toBeVisible();
    await expect(page.getByTestId('modal-layer')).toHaveCount(1);
  });
});

test.describe('Parent Portal (regression: QR scan silently failing to reach Supabase)', () => {
  test('resolving a QR token reaches the server and reaches the sign-in screen', async ({ page }) => {
    // Requires a seeded test student's qr_token — set via env so this
    // doesn't depend on whatever's currently in the dev database.
    const qrToken = process.env.SCMS_TEST_QR_TOKEN;
    test.skip(!qrToken, 'SCMS_TEST_QR_TOKEN not set — seed a test student and set it to run this test');

    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('rpc_qr_resolve')) requests.push(req.url());
    });

    await page.goto(`${BASE_URL}/parent.html?t=${qrToken}`);

    // The real bug found in prod: the request never left the client.
    // Assert it was actually sent, not just that something rendered.
    await expect.poll(() => requests.length, { timeout: 5000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('google-signin-button')).toBeVisible();
  });
});


test.describe('Staff Chat entry (authenticated shell)', () => {
  test('opens the Chat workspace from the authenticated navigation', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page.getByTestId('login-password').fill(TEACHER_PW);
    await page.getByTestId('login-submit').click();

    await expect(page.getByTestId('sidebar')).toBeVisible();
    await page.getByTestId('nav-chat').click();
    await expect(page.locator('#page-chat')).toBeVisible();
    await expect(page.locator('#chatRoot')).toBeVisible();
    await expect(page.locator('#chatRoot')).toContainText('COMMUNICATION CENTER');
  });
});


test.describe('Department Chat (authenticated staging)', () => {
  test('opens an authorized department conversation from Chat', async ({ page }) => {
    test.skip(process.env.SCMS_REQUIRE_STAGING !== '1', 'Department Chat E2E requires the staging/manual E2E run');
    await page.goto(BASE_URL);
    await page.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page.getByTestId('login-password').fill(TEACHER_PW);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    await page.getByTestId('nav-chat').click();
    await page.getByTestId('chat-channel-departments').click();
    await expect(page.locator('#departmentList')).toBeVisible();
    await expect(page.locator('[data-testid^="department-row-"]').first()).toBeVisible();

    await page.locator('[data-testid^="department-row-"]').first().click();
    await expect(page.locator('#departmentMessageStream')).toBeVisible();
    await expect(page.locator('#departmentChatInput')).toBeEnabled();
  });
});


test.describe('Department Chat authorization isolation (two-account staging)', () => {
  test('an authorized staff member sees the target department while a non-member does not', async ({ browser }) => {
    const teacher2 = process.env.SCMS_TEST_TEACHER_2;
    const pw2 = process.env.SCMS_TEST_PW_2;
    const departmentId = process.env.SCMS_TEST_DEPARTMENT_ID;
    test.skip(
      process.env.SCMS_REQUIRE_STAGING !== '1' || !teacher2 || !pw2 || !departmentId,
      'Requires manual staging E2E plus a second staff account and an explicitly configured department ID'
    );

    const authorized = await browser.newContext();
    const page1 = await authorized.newPage();
    await page1.goto(BASE_URL);
    await page1.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page1.getByTestId('login-password').fill(TEACHER_PW);
    await page1.getByTestId('login-submit').click();
    await expect(page1.getByTestId('sidebar')).toBeVisible();
    await page1.getByTestId('nav-chat').click();
    await page1.getByTestId('chat-channel-departments').click();
    await expect(page1.locator(`[data-testid="department-row-${departmentId}"]`)).toBeVisible();

    const nonMember = await browser.newContext();
    const page2 = await nonMember.newPage();
    await page2.goto(BASE_URL);
    await page2.getByTestId('login-teacher-id').fill(teacher2);
    await page2.getByTestId('login-password').fill(pw2);
    await page2.getByTestId('login-submit').click();
    await expect(page2.getByTestId('sidebar')).toBeVisible();
    await page2.getByTestId('nav-chat').click();
    await page2.getByTestId('chat-channel-departments').click();
    await expect(page2.locator(`[data-testid="department-row-${departmentId}"]`)).toHaveCount(0);

    await authorized.close();
    await nonMember.close();
  });
});


test.describe('Department Chat mobile navigation', () => {
  test('returns from a selected department to the department list', async ({ page }) => {
    test.skip(process.env.SCMS_REQUIRE_STAGING !== '1', 'Department Chat mobile E2E requires the staging/manual E2E run');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);
    await page.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page.getByTestId('login-password').fill(TEACHER_PW);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('nav-chat').click();
    await page.getByTestId('chat-channel-departments').click();
    const row = page.locator('[data-testid^="department-row-"]').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('#departmentChatInput')).toBeEnabled();
    await page.getByRole('button', { name: 'Back to departments' }).click();
    await expect(page.locator('#departmentList')).toBeVisible();
  });
});


test.describe('Grade Staff Chat (authenticated staging)', () => {
  test('opens an authorized grade conversation from Department & Grade', async ({ page }) => {
    test.skip(process.env.SCMS_REQUIRE_STAGING !== '1', 'Grade Chat E2E requires the staging/manual E2E run');
    await page.goto(BASE_URL);
    await page.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page.getByTestId('login-password').fill(TEACHER_PW);
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('sidebar')).toBeVisible();

    await page.getByTestId('nav-chat').click();
    await page.getByTestId('chat-channel-departments').click();
    await page.getByRole('button', { name: 'Grade' }).click();
    await expect(page.locator('#gradeList')).toBeVisible();
    const row = page.locator('[data-testid^="grade-row-"]').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('#gradeMessageStream')).toBeVisible();
    await expect(page.locator('#gradeChatInput')).toBeEnabled();
  });
});

test.describe('Grade Staff Chat authorization isolation (two-account staging)', () => {
  test('a non-assigned staff member cannot see the authorized grade', async ({ browser }) => {
    const teacher2 = process.env.SCMS_TEST_TEACHER_2;
    const pw2 = process.env.SCMS_TEST_PW_2;
    const gradeName = process.env.SCMS_TEST_GRADE_NAME;
    test.skip(
      process.env.SCMS_REQUIRE_STAGING !== '1' || !teacher2 || !pw2 || !gradeName,
      'Requires manual staging E2E plus a second staff account and an explicitly configured grade name'
    );

    const authorized = await browser.newContext();
    const page1 = await authorized.newPage();
    await page1.goto(BASE_URL);
    await page1.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page1.getByTestId('login-password').fill(TEACHER_PW);
    await page1.getByTestId('login-submit').click();
    await expect(page1.getByTestId('sidebar')).toBeVisible();
    await page1.getByTestId('nav-chat').click();
    await page1.getByTestId('chat-channel-departments').click();
    await page1.getByRole('button', { name: 'Grade' }).click();
    await expect(page1.locator('[data-testid^="grade-row-"]')).toContainText(gradeName);

    const nonMember = await browser.newContext();
    const page2 = await nonMember.newPage();
    await page2.goto(BASE_URL);
    await page2.getByTestId('login-teacher-id').fill(teacher2);
    await page2.getByTestId('login-password').fill(pw2);
    await page2.getByTestId('login-submit').click();
    await expect(page2.getByTestId('sidebar')).toBeVisible();
    await page2.getByTestId('nav-chat').click();
    await page2.getByTestId('chat-channel-departments').click();
    await page2.getByRole('button', { name: 'Grade' }).click();
    await expect(page2.locator('[data-testid^="grade-row-"]')).not.toContainText(gradeName);

    await authorized.close();
    await nonMember.close();
  });
});

test.describe('Grade Staff Chat mobile navigation', () => {
  test('returns from a selected grade to the grade list', async ({ page }) => {
    test.skip(process.env.SCMS_REQUIRE_STAGING !== '1', 'Grade Chat mobile E2E requires the staging/manual E2E run');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE_URL);
    await page.getByTestId('login-teacher-id').fill(TEACHER_ID);
    await page.getByTestId('login-password').fill(TEACHER_PW);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('nav-chat').click();
    await page.getByTestId('chat-channel-departments').click();
    await page.getByRole('button', { name: 'Grade' }).click();
    const row = page.locator('[data-testid^="grade-row-"]').first();
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.locator('#gradeChatInput')).toBeEnabled();
    await page.getByRole('button', { name: 'Back to grades' }).click();
    await expect(page.locator('#gradeList')).toBeVisible();
  });
});
