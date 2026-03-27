import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="text"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('rejects wrong credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="text"]', 'wrong');
  await page.fill('input[type="password"]', 'wrong');
  await page.click('button[type="submit"]');
  // Should show error, not redirect
  await expect(page).toHaveURL(/login/);
});

test('redirects to login when not authenticated', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/login/);
});
