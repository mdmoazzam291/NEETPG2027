const { test, expect } = require('@playwright/test');

async function loadPremiumPhase13(page){
  await page.addStyleTag({ url: '/assets/ui-v4.css' });
  await page.addStyleTag({ url: '/assets/phase13.css' });
  await page.addScriptTag({ url: '/assets/ui-v4-core-compat.js' });
  await page.addScriptTag({ url: '/assets/ui-v4.js' });
  await page.addScriptTag({ url: '/assets/ui-v4-fixes.js' });
  await page.addScriptTag({ url: '/assets/phase13-hardening.js' });
  await expect(page.locator('body')).toHaveAttribute('data-v4ready','1');
}

test('premium UI remains usable on iPad-sized WebKit with touch and accessibility semantics', async ({ page }) => {
  await page.goto('/');
  await loadPremiumPhase13(page);

  await expect(page.locator('.v4-nav')).toHaveCount(15);
  await expect(page.locator('.v4-nav[data-v4-label="NeuralVault"]')).toBeVisible();
  await expect(page.locator('.v4-nav[data-v4-label="Dashboard"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#v4SearchInput')).toHaveAttribute('aria-label','Search questions, topics and notes');
  await expect(page.locator('#skipToContent')).toHaveCount(1);

  const target = page.locator('.v4-nav[data-v4-label="Settings"]');
  await target.evaluate(el => el.click());
  await expect(page.locator('#view-settings')).toHaveClass(/active/);

  const buttonMinHeight = await page.locator('.btn').first().evaluate(el => parseFloat(getComputedStyle(el).minHeight));
  expect(buttonMinHeight).toBeGreaterThanOrEqual(44);

  const navMinHeight = await page.locator('.v4-nav').first().evaluate(el => parseFloat(getComputedStyle(el).minHeight));
  expect(navMinHeight).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
});
