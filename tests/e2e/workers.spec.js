import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Workers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('loads the workers page', async ({ page }) => {
    await page.goto('/workers');
    await expect(page).toHaveURL(/workers/);
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });
  });

  test('shows workers list area', async ({ page }) => {
    await page.goto('/workers');
    // The page should render the workers list container
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.locator('main, [role="main"], #root > *')).toBeVisible({ timeout: 10000 });
  });
});
