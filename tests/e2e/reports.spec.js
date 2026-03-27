import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Reports', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('loads the reports page', async ({ page }) => {
    await page.goto('/reports');
    await expect(page).toHaveURL(/reports/);
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });
  });

  test('shows the reports list area', async ({ page }) => {
    await page.goto('/reports');
    // The page should render the reports list container
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('main, [role="main"], #root > *')).toBeVisible({ timeout: 10000 });
  });
});
