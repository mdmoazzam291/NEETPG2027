const { test, expect } = require('@playwright/test');

test('NEET-PG timer uses 63-second pace without hard auto-submit', async ({ page }) => {
  await page.goto('/');
  if(await page.evaluate(()=>Boolean(window.NEETPG_AUTH_LAUNCH))){
    await expect(page.locator('#authContinueOffline')).toBeVisible({timeout:20000});
    await page.locator('#authContinueOffline').click();
    await expect(page.locator('html')).toHaveAttribute('data-auth-launch','guest');
  }
  await expect(page.locator('#statTotal')).toHaveText('100');

  // The live deployment injects this enhancement after the core app script.
  await page.addScriptTag({ url: '/assets/neetpg-timer.js' });
  await page.click('button[data-view="practice"]');

  await expect(page.locator('#pTimer option[value="neetpg"]')).toHaveCount(1);
  await page.selectOption('#pTimer', 'neetpg');
  await expect(page.locator('#pSeconds')).toHaveValue('63');
  await expect(page.locator('#pSeconds')).toBeDisabled();

  await page.selectOption('#pCount', '5');
  await page.click('#startCustom');
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qTimer')).toContainText('/ 01:03');
  await expect(page.locator('#qSectionTimer')).toContainText('Section A');
  await expect(page.locator('#qSectionTimer')).toContainText('/ 42:00');

  await page.evaluate(() => {
    app.session.currentStart = Date.now() - 64000;
    updateTimerLabel();
  });
  await expect(page.locator('#qTimer')).toHaveClass(/bad/);
  await expect(page.locator('#qPaceStatus')).toContainText('over pace');
  await expect(page.locator('#qSubmit')).toBeEnabled();
});
