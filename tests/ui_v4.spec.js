const { test, expect } = require('@playwright/test');

test('premium dashboard renders reference-inspired study UI', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ url: '/assets/ui-v4.css' });
  await page.addScriptTag({ url: '/assets/ui-v4.js' });

  await expect(page.locator('.v4-brand-row')).toContainText('NEETPG2027');
  await expect(page.locator('.v4-nav')).toHaveCount(14);
  await expect(page.locator('#v4Greeting')).toContainText('Doctor');
  await expect(page.locator('.v4-kpi')).toHaveCount(4);
  await expect(page.locator('.v4-heat-cell')).toHaveCount(84);
  await expect(page.locator('[data-v4-quick]')).toHaveCount(4);
  await expect(page.locator('#v4ReviewQueue, #v4StartReview')).toHaveCount(1);
});

test('global search opens the question bank and applies the query', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ url: '/assets/ui-v4.css' });
  await page.addScriptTag({ url: '/assets/ui-v4.js' });
  await page.fill('#v4SearchInput', 'myocardial');
  await page.press('#v4SearchInput', 'Enter');
  await expect(page.locator('#view-bank')).toHaveClass(/active/);
  await expect(page.locator('#bankSearch')).toHaveValue('myocardial');
});

test('rapid 15 quick start launches a practice session', async ({ page }) => {
  await page.goto('/');
  await page.addStyleTag({ url: '/assets/ui-v4.css' });
  await page.addScriptTag({ url: '/assets/neetpg-timer.js' });
  await page.addScriptTag({ url: '/assets/ui-v4.js' });
  await page.click('[data-v4-quick="rapid"]');
  await expect(page.locator('#view-practice')).toHaveClass(/active/);
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qStem')).not.toBeEmpty();
});
