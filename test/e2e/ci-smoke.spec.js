const { test, expect } = require('@playwright/test');

test('SCMS homepage serves successfully in CI', async ({ page }) => {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });

  expect(response, 'homepage should return an HTTP response').not.toBeNull();
  expect(response.status(), 'homepage should not return an HTTP error').toBeLessThan(400);
  await expect(page.locator('body')).not.toBeEmpty();
});
