import { test, expect } from '@playwright/test';

test.describe('SCMS application shell', () => {
  test('loads the core application shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveTitle(/SCMS/i);
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#pages')).toBeAttached();
    await expect(page.locator('#tabBar')).toBeAttached();
    await expect(page.locator('#fab')).toBeAttached();
  });

  test('keeps the core page sections mounted', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const pageIds = [
      'page-dashboard', 'page-students', 'page-attend', 'page-daily',
      'page-hw', 'page-grades', 'page-billing', 'page-admissions',
      'page-library', 'page-transport', 'page-parents', 'page-incidents',
      'page-timetable', 'page-summary', 'page-more'
    ];

    for (const id of pageIds) {
      await expect(page.locator('#' + id)).toBeAttached();
    }
  });

  test('does not create horizontal overflow on compact mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth
    }));

    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
  });
});
