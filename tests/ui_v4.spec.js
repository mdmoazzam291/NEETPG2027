const { test, expect } = require('@playwright/test');

async function loadV4(page, {timer=false}={}) {
  await page.addStyleTag({ url: '/assets/ui-v4.css' });
  await page.addScriptTag({ url: '/assets/ui-v4-core-compat.js' });
  if(timer) await page.addScriptTag({ url: '/assets/neetpg-timer.js' });
  await page.addScriptTag({ url: '/assets/ui-v4.js' });
  await page.addScriptTag({ url: '/assets/ui-v4-fixes.js' });
  await expect(page.locator('body')).toHaveAttribute('data-v4ready','1');
}

test('premium dashboard renders reference-inspired study UI', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);
  await expect(page.locator('.v4-brand-row')).toContainText('NEETPG2027');
  await expect(page.locator('.v4-nav')).toHaveCount(15);
  await expect(page.locator('.v4-nav[data-v4-label="NeuralVault"]')).toBeVisible();
  await expect(page.locator('#v4Greeting')).toContainText('Doctor');
  await expect(page.locator('.v4-kpi')).toHaveCount(4);
  await expect(page.locator('.v4-heat-cell')).toHaveCount(84);
  await expect(page.locator('[data-v4-quick]')).toHaveCount(4);
  await expect(page.locator('#v4StartReview')).toHaveCount(1);
});

test('global search opens the question bank and applies the query', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);
  await page.fill('#v4SearchInput', 'myocardial');
  await page.press('#v4SearchInput', 'Enter');
  await expect(page.locator('#view-bank')).toHaveClass(/active/);
  await expect(page.locator('#bankSearch')).toHaveValue('myocardial');
});

test('rapid 15 quick start launches a practice session', async ({ page }) => {
  await page.goto('/');
  await loadV4(page,{timer:true});
  await page.click('[data-v4-quick="rapid"]');
  await expect(page.locator('#view-practice')).toHaveClass(/active/);
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qStem')).not.toBeEmpty();
});


test('visible NeuralVault navigation opens the Obsidian-style knowledge vault', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);

  const vault = page.locator('.v4-nav[data-v4-label="NeuralVault"]');
  await expect(vault).toBeVisible();
  await vault.click();

  await expect(page).toHaveURL(/\/neuralvault\/?$/);
  await expect(page.locator('[data-view="brain"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#fileTree')).toBeVisible();
});
