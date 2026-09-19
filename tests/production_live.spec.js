const { test, expect } = require('@playwright/test');

const LIVE = process.env.NEETPG2027_LIVE_URL || 'https://mdmoazzam291.github.io/NEETPG2027/';

test('live GitHub Pages build serves the validated Phase 13 study shell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${LIVE}?phase13-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('#statTotal')).toHaveText('405', { timeout: 15000 });
  await expect(page.locator('#v4Greeting')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#v4Search')).toBeVisible();
  await expect(page.locator('.v4-nav[data-v4-label="NeuralVault"]')).toBeVisible();
  await expect(page.locator('#offlineBadge')).toHaveText(/Online|Offline/);
  await expect(page.locator('.exam9-launch')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#skipToContent')).toHaveCount(1, { timeout: 15000 });
  const uiScript = await page.locator('script[src*="assets/ui-v4.js"]').getAttribute('src');
  const plannerScript = await page.locator('script[src*="assets/phase12-planning.js"]').getAttribute('src');
  const uiCss = await page.locator('link[href*="assets/ui-v4.css"]').getAttribute('href');
  expect(uiScript).toMatch(/ui-v4\.js\?v=[0-9a-f]{12}$/);
  expect(plannerScript).toMatch(/phase12-planning\.js\?v=[0-9a-f]{12}$/);
  expect(uiCss).toMatch(/ui-v4\.css\?v=[0-9a-f]{12}$/);

  await page.locator('.v4-nav[data-v4-label="Settings"]').evaluate(el => el.click());
  await expect(page.getByText('Offline & app install')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#cloudAccountCard')).toHaveCount(1, { timeout: 10000 });

  const pwa = await page.evaluate(async () => {
    const manifest = await fetch('manifest.webmanifest', { cache: 'no-store' }).then(r => r.json());
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

test('live GitHub Pages build serves NeuralVault Brain V2', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${LIVE}neuralvault/?brain-v2-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('[data-view="brain"]')).toBeVisible({ timeout: 15000 });
  await page.locator('[data-view="brain"]').click();

  await expect(page.locator('#view-brain')).toHaveClass(/active/);
  await expect(page.locator('#brainProvider')).toBeVisible();
  await expect(page.locator('#brainProviderBtn')).toBeVisible();
  await expect(page.locator('#brainSuggestions')).toContainText('Cross-subject links');
  await expect(page.locator('#brainSuggestions')).toContainText('Recall cards');
  await expect(page.locator('#brainSuggestions')).toContainText('Safe note patch');

  const runtime = await page.evaluate(async () => {
    const [brain, provider, sw] = await Promise.all([
      fetch('brain.js', { cache: 'no-store' }),
      fetch('provider.js', { cache: 'no-store' }),
      fetch('../sw.js', { cache: 'no-store' })
    ]);
    const [brainText, providerText, swText] = await Promise.all([brain.text(), provider.text(), sw.text()]);
    return {
      brainStatus: brain.status,
      providerStatus: provider.status,
      hasBrain: Boolean(window.NeuralVaultBrain),
      hasProvider: Boolean(window.NeuralVaultProvider),
      hasHybrid: Boolean(window.NeuralVaultIntelligence && window.NeuralVaultIntelligence.relatedAcrossSubjects),
      hasSafePatch: Boolean(window.NeuralVaultIntelligence && window.NeuralVaultIntelligence.proposeSafePatch),
      brainV2Source: brainText.includes('crossSubjectAnswer') && brainText.includes('patchAnswer'),
      providerSource: providerText.includes('X-NeuralVault-Token') && providerText.includes('sessionStorage'),
      swCachesProvider: swText.includes('./neuralvault/provider.js')
    };
  });

  expect(runtime.brainStatus).toBe(200);
  expect(runtime.providerStatus).toBe(200);
  expect(runtime.hasBrain).toBe(true);
  expect(runtime.hasProvider).toBe(true);
  expect(runtime.hasHybrid).toBe(true);
  expect(runtime.hasSafePatch).toBe(true);
  expect(runtime.brainV2Source).toBe(true);
  expect(runtime.providerSource).toBe(true);
  expect(runtime.swCachesProvider).toBe(true);

  await page.locator('#brainProviderBtn').click();
  await expect(page.locator('#brainSettingsBackdrop')).toBeVisible();
  await expect(page.locator('#brainGatewayToken')).toBeVisible();
  await expect(page.locator('#brainSettingsBackdrop')).not.toContainText('OPENAI_API_KEY');
});


test('live main app visibly links to NeuralVault', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`${LIVE}?vault-nav-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded' });

  const vault = page.locator('.v4-nav[data-v4-label="NeuralVault"]');
  await expect(vault).toBeVisible({ timeout: 15000 });
  await vault.click();

  await expect(page).toHaveURL(/\/NEETPG2027\/neuralvault\/?$/);
  await expect(page.locator('#fileTree')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-view="brain"]')).toBeVisible();
});


test('live dashboard shows dedicated continuous countdown to 29 Aug 2027', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${LIVE}?countdown-v2-smoke=${Date.now()}`, { waitUntil: 'domcontentloaded' });

  const countdown = page.locator('#v4ExamCountdown');
  await expect(countdown).toBeVisible({ timeout: 15000 });
  await expect(countdown).toHaveAttribute('data-target','2027-08-29');
  await expect(countdown).toContainText('29 Aug 2027');
  await expect(page.locator('.v4-dashboard > *').first()).toHaveAttribute('id','v4ExamCountdown');

  const before = await page.locator('#v4ExamSeconds').textContent();
  await page.waitForTimeout(1200);
  const after = await page.locator('#v4ExamSeconds').textContent();
  expect(after).not.toBe(before);

  await expect(page.locator('#v12Planner')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#v12Planner')).not.toContainText('Exam countdown');
  await expect(page.locator('#p12ExamDate')).toHaveCount(0);
  await expect(page.locator('#p12CountdownDays')).toHaveCount(0);
});
