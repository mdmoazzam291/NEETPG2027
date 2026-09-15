const { test, expect } = require('@playwright/test');

test('browser-only study prototype loads and records an attempt', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.getByText('NEETPG2027 · GitHub-only prototype')).toBeVisible();
  await expect(page.locator('.stat').first()).toContainText('100');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.locator('#stem')).not.toHaveText('');
  await page.locator('.option').first().click();
  await page.getByRole('button', { name: 'Lock answer' }).click();
  await expect(page.locator('#result')).toBeVisible();
  const attempted = await page.evaluate(() => JSON.parse(localStorage.getItem('neetpg2027-static-progress-v1')).attempts);
  expect(Object.keys(attempted).length).toBe(1);
});
