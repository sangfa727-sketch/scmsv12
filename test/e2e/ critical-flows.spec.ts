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
