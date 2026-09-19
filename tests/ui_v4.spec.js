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
  await expect(page.locator('.v4-nav')).toHaveCount(7);
  await expect(page.locator('.v4-nav[data-v4-label="NeuralVault"]')).toBeVisible();
  await expect(page.locator('#v4Greeting')).toContainText('Doctor');
  await expect(page.locator('.v4-dashboard > *').first()).toHaveAttribute('id','v4ExamCountdown');
  await expect(page.locator('#v4ExamCountdown')).toHaveAttribute('data-target','2027-08-29');
  await expect(page.locator('#v4ExamCountdown')).toContainText('29 Aug 2027');
  await expect(page.locator('#v4ExamDays')).toBeVisible();
  await expect(page.locator('#v4ExamHours')).toBeVisible();
  await expect(page.locator('#v4ExamMinutes')).toBeVisible();
  await expect(page.locator('#v4ExamSeconds')).toBeVisible();
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


test('dedicated exam countdown ticks continuously toward 29 Aug 2027', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);

  const seconds = page.locator('#v4ExamSeconds');
  const before = await seconds.textContent();
  await page.waitForTimeout(1200);
  const after = await seconds.textContent();

  expect(after).not.toBe(before);
  await expect(page.locator('#v4ExamCountdown')).toHaveAttribute('data-target','2027-08-29');
  await expect(page.locator('#v4ExamCountdownStatus')).toContainText(/Counting down continuously|Target date reached/);
});


test('desktop shell uses one sidebar width without phantom main offset', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await loadV4(page);

  const geometry = await page.evaluate(() => {
    const sidebar = document.querySelector('#sidebar').getBoundingClientRect();
    const main = document.querySelector('.main').getBoundingClientRect();
    const app = getComputedStyle(document.querySelector('.app'));
    return { sidebarRight: sidebar.right, mainLeft: main.left, grid: app.gridTemplateColumns };
  });
  expect(Math.abs(geometry.mainLeft - geometry.sidebarRight)).toBeLessThanOrEqual(1);
  expect(geometry.grid).toContain('232px');
});

test('mobile sidebar scrolls to every navigation item', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await loadV4(page);

  await page.click('#menuBtn');
  await expect(page.locator('#sidebar')).toHaveClass(/open/);

  const state = await page.locator('#sidebar').evaluate(el => ({
    overflowY: getComputedStyle(el).overflowY,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight
  }));
  expect(['auto','scroll']).toContain(state.overflowY);
  const settings = page.locator('.v4-nav[data-v4-label="Settings"]');
  await settings.evaluate(el => el.scrollIntoView({block:'center'}));
  await expect(settings).toBeVisible();
});


test('primary navigation contains only truthful destinations and highlights the current view', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);

  await expect(page.locator('.v4-nav')).toHaveCount(7);
  await expect(page.locator('.v4-nav')).toHaveCount(7);
  const labels = await page.locator('.v4-nav').evaluateAll(nodes => nodes.map(n => n.dataset.v4Label));
  expect(labels).toEqual(['Dashboard','Practice','Question Bank','Revision','NeuralVault','Analytics','Settings']);

  for (const [label, view] of [
    ['Practice','practice'],
    ['Question Bank','bank'],
    ['Revision','review'],
    ['Analytics','analytics'],
    ['Settings','settings']
  ]) {
    const item=page.locator(`.v4-nav[data-v4-label="${label}"]`);
    await item.click();
    await expect(page.locator(`#view-${view}`)).toHaveClass(/active/);
    await expect(item).toHaveClass(/active/);
    await expect(page.locator('.v4-nav.active')).toHaveCount(1);
  }

  await expect(page.locator('.v4-nav[data-v4-label="Community"]')).toHaveCount(0);
  await expect(page.locator('.v4-nav[data-v4-label="Resources"]')).toHaveCount(0);
  await expect(page.locator('.v4-nav[data-v4-label="Notes"]')).toHaveCount(0);
  await expect(page.locator('.v4-nav[data-v4-label="Bookmarks"]')).toHaveCount(0);
});
