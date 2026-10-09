const { test, expect } = require('@playwright/test');

test('SCMS homepage serves successfully in CI', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

  expect(response, 'homepage should return an HTTP response').not.toBeNull();
  expect(response.status(), 'homepage should not return an HTTP error').toBeLessThan(400);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('SCMS core module page shells are present in the app document', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const corePages = [
    '#page-dashboard',
    '#page-students',
    '#page-attend',
    '#page-daily',
    '#page-hw',
    '#page-grades',
    '#page-billing',
    '#page-admissions',
    '#page-library',
    '#page-transport',
    '#page-parents',
    '#page-timetable',
    '#page-chat',
  ];

  for (const selector of corePages) {
    await expect(page.locator(selector), `core page shell ${selector} should exist`).toHaveCount(1);
  }
});

test('SCMS navigation activates the selected module page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Use a local, non-authenticated test context; this exercises client-side
  // navigation only and does not claim to verify backend permissions or data.
  await page.evaluate(() => {
    window.APP.platform = 'native';
    window.APP.is_admin = true;
    window.APP.currentPage = 'dashboard';
    window.renderSidebar();
  });

  const studentsNav = page.locator('#sidebar .sidebar-item[data-page="students"]');
  await expect(studentsNav).toHaveCount(1);
  await studentsNav.click();

  await expect(page.locator('#page-students')).toHaveClass(/active/, { timeout: 5_000 });
  await expect(page.locator('#sidebar .sidebar-item[data-page="students"]')).toHaveClass(/active/, { timeout: 5_000 });
});
