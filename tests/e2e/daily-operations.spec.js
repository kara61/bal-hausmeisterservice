import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Daily Operations', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('loads the daily operations page', async ({ page }) => {
    await page.goto('/daily-operations');
    await expect(page).toHaveURL(/daily-operations/);
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });
  });

  test('shows the plan view area', async ({ page }) => {
    await page.goto('/daily-operations');
    // The page should render the daily plan container
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('main, [role="main"], #root > *')).toBeVisible({ timeout: 10000 });
  });
});
