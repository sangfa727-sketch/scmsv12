const { test, expect } = require('@playwright/test');

test('School Website Studio edits, saves, restores sections, previews templates and explains domain blocking', async ({ page }) => {
  const savedDrafts = [];
  let version = 0;

  await page.addInitScript(() => {
    localStorage.setItem('scms_web_session', JSON.stringify({ session_token: 'e2e-studio-session' }));
    window.SCMS_ENV = { mode: 'staging', isDevelopment: false, isStaging: true, isProduction: false };
    window.__SCMS_STAGING_CONFIG__ = {
      SUPABASE_URL: 'https://scms-test.supabase.local',
      SUPABASE_ANON: 'scms-e2e-anon-key',
      N8N_WEBHOOK: 'https://scms-test.example/webhook',
      N8N_BOOTSTRAP: 'https://scms-test.example/bootstrap',
      GOOGLE_LOGIN_URL: 'https://scms-test.example/login',
      GOOGLE_CLIENT_ID: 'scms-e2e-client',
      BOT_USERNAME: 'scms-e2e'
    };
  });

  await page.route('https://scms-test.supabase.local/rest/v1/rpc/**', async route => {
    const rpc = new URL(route.request().url()).pathname.split('/').pop();
    const body = route.request().postDataJSON() || {};
    let result;

    if (rpc === 'rpc_school_website_authorize') {
      result = { ok: true, authorized: true, school_id: 'e2e-school', role: 'school_admin', admissions_authorized: true, publish_authorized: false };
    } else if (rpc === 'rpc_school_website_load_draft') {
      result = { ok: true, found: version > 0, version, status: 'draft', content: savedDrafts.at(-1) || null };
    } else if (rpc === 'rpc_school_website_save_draft') {
      savedDrafts.push(body.p_content);
      version += 1;
      result = { ok: true, version, status: 'draft' };
    } else if (rpc === 'rpc_school_website_get_site') {
      result = { ok: true, platform_domain_configured: false, base_domain: '', site: null, has_publication: false };
    } else {
      result = { ok: false, error: 'backend_unavailable' };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
  });

  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/school-website/create.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#accessGate')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Start with a professional template.' })).toBeVisible();

  await page.locator('[data-field="schoolName"]').click();
  await page.locator('#dialogInput').fill('Bright Future School');
  await page.locator('#dialogSave').click();
  await expect(page.locator('#previewCanvas .mini-hero h1')).toHaveText('Bright Future School');

  await page.locator('#changeTemplate').click();
  await expect(page.locator('[data-template="classic"]')).toBeVisible();
  await page.locator('[data-template="classic"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-template', 'classic');
  await expect(page.locator('#previewCanvas')).toHaveAttribute('data-template', 'classic');

  await page.locator('[data-section-action="hide"][data-section-id="about"]').click();
  await expect(page.locator('#about')).toBeHidden();
  await page.locator('[data-section-action="show"][data-section-id="about"]').click();
  await expect(page.locator('#about')).toBeVisible();

  await expect.poll(() => savedDrafts.length).toBeGreaterThan(0);
  await expect.poll(() => savedDrafts.at(-1)?.template).toBe('classic');
  await expect.poll(() => savedDrafts.at(-1)?.schoolName).toBe('Bright Future School');
  await expect.poll(() => savedDrafts.at(-1)?.sections?.find(section => section.id === 'about')?.visible).toBe(true);

  await page.locator('#siteAddressButton').click();
  await expect(page.locator('#siteAddressDialog')).toBeVisible();
  await expect(page.locator('#siteAddressStatus')).toContainText('platform root domain is not configured');
  await expect(page.locator('#reserveSiteAddress')).toBeDisabled();
  expect(pageErrors, 'Studio should initialize and run without uncaught browser errors').toEqual([]);
});
