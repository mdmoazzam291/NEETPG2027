const { test, expect } = require('@playwright/test');

async function loadPhase13(page){
  await page.addStyleTag({ url: '/assets/phase13.css' });
  await page.addScriptTag({ url: '/assets/phase13-hardening.js' });
}

async function openNavItem(page, view){
  const item=page.locator(`.nav button[data-view="${view}"]`);
  const inViewport=await item.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth});
  if(!inViewport){
    await page.click('#menuBtn');
    await expect(page.locator('#sidebar')).toHaveClass(/open/);
  }
  await item.evaluate(el=>el.click());
}

test('Phase 13 iPad layout has accessible navigation, focus controls and touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1194 });
  await page.goto('/');
  await loadPhase13(page);

  await expect(page.locator('#skipToContent')).toHaveCount(1);
  await expect(page.locator('#shortcutsBtn')).toHaveAttribute('aria-label', 'Keyboard shortcuts');
  await expect(page.locator('.nav button[data-view="dashboard"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#appUpdateBanner')).toHaveCount(1);

  await openNavItem(page, 'settings');
  const sw = page.locator('#sShuffle');
  await expect(sw).toHaveAttribute('role', 'switch');
  await sw.focus();
  const before = await sw.getAttribute('aria-checked');
  await page.keyboard.press('Space');
  await expect(sw).not.toHaveAttribute('aria-checked', before);

  const minHeight = await page.locator('.btn').first().evaluate(el => parseFloat(getComputedStyle(el).minHeight));
  expect(minHeight).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#menuBtn');
  await expect(page.locator('#menuBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);
});

test('Phase 13 backup export and import restore local study progress', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-view="practice"]');
  await page.selectOption('#pCount', '5');
  await page.click('#startCustom');
  await page.locator('#qOptions .option').first().click();
  await page.click('#qSubmit');
  await page.click('#qBookmark');

  await page.click('[data-view="settings"]');
  const downloadPromise = page.waitForEvent('download');
  await page.click('#exportBackup');
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  page.once('dialog', dialog => dialog.accept());
  await page.click('#resetAll');
  await expect(page.locator('#statAttempted')).toHaveText('0');

  await page.setInputFiles('#importBackup', backupPath);
  await expect.poll(async () => Number(await page.locator('#statAttempted').textContent())).toBeGreaterThan(0);
  await expect(page.locator('#statBookmarks')).not.toHaveText('0');
});

test('Phase 13 service worker keeps the bundled study app available offline and recovers online', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#statTotal')).toHaveText('100');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.reload();
  await expect.poll(async () => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 10000 }).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#statTotal')).toHaveText('100');
  await expect(page.locator('#offlineBadge')).toHaveText('Offline');

  await context.setOffline(false);
  await expect.poll(async () => page.evaluate(() => navigator.onLine), { timeout: 10000 }).toBe(true);
  await expect(page.locator('#offlineBadge')).toHaveText('Online');
});

test('Phase 13 prevents initial cloud sync from deleting a remote active session', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ url: '/assets/phase13-preauth.js' });

  const result = await page.evaluate(async () => {
    let deletes = 0;
    window.NEETPG_CLOUD = { client: null, user: { id: 'user-1' }, resumePayload: { qids: ['hy100-001'] } };
    const fakeClient = {
      from(){
        return {
          delete(){
            return { eq: async () => { deletes += 1; return { data: null, error: null }; } };
          }
        };
      }
    };
    window.NEETPG_CLOUD.client = fakeClient;
    await window.NEETPG_CLOUD.client.from('active_sessions').delete().eq('user_id', 'user-1');
    const implicitDeletes = deletes;
    await window.NEETPG_CLOUD.clearActiveSession();
    return { implicitDeletes, explicitDeletes: deletes, resumePayload: window.NEETPG_CLOUD.resumePayload };
  });

  expect(result.implicitDeletes).toBe(0);
  expect(result.explicitDeletes).toBe(1);
  expect(result.resumePayload).toBeNull();
});

test('Phase 13 cloud conflict policy is deterministic and deletion is explicitly guarded', async ({ request }) => {
  const auth = await (await request.get('/assets/auth-sync.js')).text();
  const guard = await (await request.get('/assets/phase13-preauth.js')).text();

  expect(auth).toContain('ms(remote.updatedAt)>ms(local.updatedAt)');
  expect(auth).toContain('if(localKeys.has(key))continue');
  expect(auth).toContain("onConflict:'user_id,client_key'");
  expect(guard).toContain('__NEETPG_ALLOW_ACTIVE_SESSION_DELETE__');
  expect(guard).toContain('clearActiveSession');
});

test('Phase 13 manifest and service worker expose versioned install metadata', async ({ request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.id).toBe('./');
  expect(manifest.icons?.length).toBeGreaterThan(0);
  expect(manifest.icons[0].src).toContain('app-icon.svg');
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain("RELEASE='2026-09-15-phase13-1'");
  expect(sw).toContain("type==='SKIP_WAITING'");
});
