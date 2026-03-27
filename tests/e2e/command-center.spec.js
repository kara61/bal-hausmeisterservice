import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test.describe('Command Center', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('loads the command center dashboard', async ({ page }) => {
    await expect(page).toHaveURL(/\//);
    await expect(page.locator('h1, h2')).toBeVisible({ timeout: 10000 });
  });

  test('shows key dashboard elements', async ({ page }) => {
    // The page should have rendered some content after login
    await expect(page.locator('body')).not.toBeEmpty();
    // Verify main content area is present
    await expect(page.locator('main, [role="main"], #root > *')).toBeVisible({ timeout: 10000 });
  });
});
