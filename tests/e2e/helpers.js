export async function login(page) {
  await page.goto('/login');
  await page.fill('input[type="text"]', process.env.TEST_ADMIN_USER || 'halil');
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASS || 'test-password');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 10000 });
}
