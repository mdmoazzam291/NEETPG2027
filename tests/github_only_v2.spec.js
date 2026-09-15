const { test, expect } = require('@playwright/test');

test('GitHub-only v2 loads dashboard and supports a study attempt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Study cockpit')).toBeVisible();
  await expect(page.locator('#statTotal')).toHaveText(/100/);
  await page.getByRole('button',{name:/Practice/}).first().click();
  await expect(page.getByText('Session builder')).toBeVisible();
  await page.locator('#pCount').selectOption('5');
  await page.locator('#pMode').selectOption('unseen');
  await page.locator('#startCustom').click();
  await expect(page.locator('#qStem')).not.toHaveText('');
  await page.locator('#qOptions .option').first().click();
  await page.locator('#qSubmit').click();
  await expect(page.locator('#qFeedback')).toBeVisible();
  await page.locator('[data-rating="good"]').click();
  await page.locator('#qNext').click();
  await expect(page.locator('#qProgress')).toContainText('2 / 5');
});

test('Question bank, analytics and settings render', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:/Question Bank/}).click();
  await expect(page.locator('#bankCount')).toContainText('100');
  await page.locator('#bankSearch').fill('cavernous');
  await expect(page.locator('#bankCount')).toContainText('1 of 100');
  await page.getByRole('button',{name:/Analytics/}).click();
  await expect(page.getByText('Accuracy by subject')).toBeVisible();
  await page.getByRole('button',{name:/Settings/}).click();
  await expect(page.getByText('Data backup')).toBeVisible();
});
