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
