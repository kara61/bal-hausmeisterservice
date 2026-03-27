import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Extra Jobs', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('loads the extra jobs page', async ({ page }) => {
    await page.goto('/extra-jobs');
    await expect(page).toHaveURL(/extra-jobs/);
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });
  });

  test('shows the jobs list area', async ({ page }) => {
    await page.goto('/extra-jobs');
    // The page should render the extra jobs list container
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('main, [role="main"], #root > *')).toBeVisible({ timeout: 10000 });
  });
});
