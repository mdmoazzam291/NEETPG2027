const { test, expect } = require('@playwright/test');

async function loadV4(page, {timer=false}={}) {
  await page.addStyleTag({ url: '/assets/ui-v4.css' });
  if(timer) await page.addScriptTag({ url: '/assets/neetpg-timer.js' });
  await page.addScriptTag({ url: '/assets/ui-v4.js' });
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
  await expect(page.locator('#v4CoreCompat')).toHaveCount(0);
  await expect(page.locator('.v4-legacy')).toHaveCount(0);
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

test('revision exposes real Quick Revise, Bookmarks and Notes subviews', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);
  await page.locator('.v4-nav[data-v4-label="Revision"]').click();

  await expect(page.locator('[data-review-tab]')).toHaveCount(3);
  await expect(page.locator('[data-review-panel="quick"]')).toBeVisible();
  await page.locator('[data-review-tab="bookmarks"]').click();
  await expect(page.locator('[data-review-panel="bookmarks"]')).toBeVisible();
  await expect(page.locator('[data-review-panel="quick"]')).toBeHidden();
  await page.locator('[data-review-tab="notes"]').click();
  await expect(page.locator('[data-review-panel="notes"]')).toBeVisible();
  await expect(page.locator('[data-review-tab="notes"]')).toHaveAttribute('aria-selected','true');
});


test('exam countdown is pinned to IST and pauses outside dashboard', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);

  const target = await page.evaluate(() => Date.parse('2027-08-29T00:00:00+05:30'));
  const dataTarget = await page.locator('#v4ExamCountdown').getAttribute('data-target');
  expect(dataTarget).toBe('2027-08-29');
  expect(target).toBe(1819477800000);

  await page.locator('.v4-nav[data-v4-label="Practice"]').click();
  await expect(page.locator('#view-practice')).toHaveClass(/active/);
  const before = await page.locator('#v4ExamSeconds').textContent();
  await page.waitForTimeout(1200);
  const after = await page.locator('#v4ExamSeconds').textContent();
  expect(after).toBe(before);

  await page.locator('.v4-nav[data-v4-label="Dashboard"]').click();
  const resumed = await page.locator('#v4ExamSeconds').textContent();
  await page.waitForTimeout(1200);
  expect(await page.locator('#v4ExamSeconds').textContent()).not.toBe(resumed);
});


test('global search exposes topic results and routes them into the filtered QBank', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);

  const target=await page.evaluate(()=>{
    const q=app.questions.find(x=>String(x.topic||'').trim().length>=3);
    return {topic:q.topic,subject:q.subject};
  });
  await page.fill('#v4SearchInput',target.topic);
  const topic=page.locator('.v4-search-result[data-kind="topic"]').first();
  await expect(topic).toBeVisible();
  await topic.click();

  await expect(page.locator('#view-bank')).toHaveClass(/active/);
  await expect(page.locator('#bankSearch')).toHaveValue(target.topic);
});

test('global search opens an exact question directly', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);

  const qid=await page.evaluate(()=>app.questions[0].external_id);
  await page.fill('#v4SearchInput',qid);
  const result=page.locator(`.v4-search-result[data-kind="question"][data-id="${qid}"]`);
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.locator('#view-practice')).toHaveClass(/active/);
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qProgress')).toContainText('1 / 1');
});

test('global search finds local NeuralVault notes and opens the exact note', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(()=>{
    const now=new Date().toISOString();
    localStorage.setItem('neuralvault:v1',JSON.stringify({
      version:2,
      currentId:'search-note',
      savedAt:Date.now(),
      notes:[{
        id:'search-note',
        title:'Mitral Stenosis',
        path:'Medicine/Cardiology/Mitral Stenosis.md',
        createdAt:now,
        updatedAt:now,
        content:'# Mitral Stenosis\n\nValve disease revision note.'
      }]
    }));
  });
  await loadV4(page);

  await page.fill('#v4SearchInput','mitral');
  await expect(page.locator('#v4SearchResults')).toContainText('NeuralVault notes');
  const note=page.locator('.v4-search-result[data-kind="note"][data-id="search-note"]');
  await expect(note).toContainText('Mitral Stenosis');
  await note.click();

  await expect(page).toHaveURL(/\/neuralvault\/\?note=search-note$/);
  await expect(page.locator('#titleInput')).toHaveValue('Mitral Stenosis',{timeout:15000});
});

test('theme toggle persists and does not reset an active answer', async ({ page }) => {
  await page.goto('/');
  await loadV4(page);
  await page.click('[data-v4-quick="rapid"]');
  await page.locator('.option').first().click();
  const selected = await page.locator('.option.selected').textContent();
  const previous = await page.locator('body').getAttribute('data-theme');
  await page.locator('#themeToggle').click();
  const next = previous === 'dark' ? 'light' : 'dark';
  await expect(page.locator('body')).toHaveAttribute('data-theme', next);
  await expect(page.locator('.option.selected')).toHaveText(selected);
  await expect(page.locator('#sTheme')).toHaveValue(next);
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-theme', next);
  await expect(page.locator('#themeToggle')).toHaveAttribute('aria-pressed', String(next === 'dark'));
});

for (const width of [375, 834, 1194]) {
  test(`reference themes fit at ${width}px with readable countdown`, async ({ page }) => {
    await page.setViewportSize({width, height:900});
    await page.goto('/');
    await loadV4(page);
    for(let i=0;i<2;i++) {
      await expect(page.locator('#themeToggle')).toBeInViewport();
      const styles = await page.evaluate(() => {
        const clock = document.querySelector('#v4ExamCountdown');
        const toggle = document.querySelector('#themeToggle');
        const css = getComputedStyle(clock);
        return {text:css.color, background:css.backgroundColor, height:toggle.getBoundingClientRect().height,
          overflow:document.documentElement.scrollWidth > innerWidth,
          offenders:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&e.getBoundingClientRect().width>0).slice(0,12).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right})),
          bg:getComputedStyle(document.body).getPropertyValue('--bg').trim(),
          dark:document.body.dataset.theme === 'dark'};
      });
      expect(styles.height).toBeGreaterThanOrEqual(44);
      expect(styles.overflow, JSON.stringify(styles.offenders)).toBe(false);
      expect(styles.text).toBe(styles.dark ? 'rgb(239, 237, 245)' : 'rgb(25, 39, 36)');
      expect(styles.background).toBe(styles.dark ? 'rgb(50, 42, 71)' : 'rgb(225, 241, 237)');
      expect(styles.bg).toBe(styles.dark ? '#141418' : '#f7f8f7');
      await page.locator('#themeToggle').click();
    }
  });
}
