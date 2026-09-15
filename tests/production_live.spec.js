const { test, expect } = require('@playwright/test');

const LIVE = process.env.NEETPG2027_LIVE_URL || 'https://mdmoazzam291.github.io/NEETPG2027/';

test('live GitHub Pages build serves the validated Phase 13 study shell', async ({ page }) => {
  await page.goto(LIVE, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statTotal')).toHaveText('100', { timeout: 15000 });
  await expect(page.getByText('Study cockpit')).toBeVisible();
  await expect(page.locator('#offlineBadge')).toBeVisible();
  await expect(page.locator('.exam9-launch')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#skipToContent')).toHaveCount(1);

  await page.click('[data-view="settings"]');
  await expect(page.getByText('Offline & app install')).toBeVisible();
  await expect(page.locator('#cloudAccountCard')).toHaveCount(1, { timeout: 10000 });

  const pwa = await page.evaluate(async () => {
    const manifest = await fetch('manifest.webmanifest').then(r => r.json());
    const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
    return {
      manifestId: manifest.id,
      icon: manifest.icons?.[0]?.src || '',
      swScope: registration?.scope || ''
    };
  });
  expect(pwa.manifestId).toBe('./');
  expect(pwa.icon).toContain('app-icon.svg');
  expect(pwa.swScope).toContain('/NEETPG2027/');
});
