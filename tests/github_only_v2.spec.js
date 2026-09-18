const { test, expect } = require('@playwright/test');

test('GitHub-only v2 loads dashboard and supports a study attempt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Study cockpit')).toBeVisible();
  await expect(page.locator('#statTotal')).toHaveText(/405/);
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
  await expect(page.locator('#bankCount')).toContainText('405');
  await page.locator('#bankSearch').fill('scapholunate');
  await expect(page.locator('#bankCount')).toContainText('1 of 405');
  await page.getByRole('button',{name:/Analytics/}).click();
  await expect(page.getByText('Accuracy by subject')).toBeVisible();
  await page.getByRole('button',{name:/Settings/}).click();
  await expect(page.getByText('Data backup')).toBeVisible();
});

test('Review answers is read-only and does not create new attempts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:/Practice/}).first().click();
  await page.locator('#pCount').selectOption('5');
  await page.locator('#pMode').selectOption('unseen');
  await page.locator('#startCustom').click();

  for (let i=0;i<5;i++) {
    await page.locator('#qOptions .option').first().click();
    await page.locator('#qSubmit').click();
    await expect(page.locator('#qFeedback')).toBeVisible();
    await page.locator('#qNext').click();
  }
  await expect(page.locator('#sessionSummary')).toBeVisible();

  const countAttempts = () => page.evaluate(() => new Promise((resolve,reject) => {
    const req=indexedDB.open('neetpg2027-static-v2',1);
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{
      const c=req.result.transaction('attempts','readonly').objectStore('attempts').count();
      c.onerror=()=>reject(c.error);
      c.onsuccess=()=>resolve(c.result);
    };
  }));

  const before=await countAttempts();
  await page.locator('#reviewSession').click();
  await expect(page.locator('#qProgress')).toContainText('1 / 5');
  await expect(page.locator('#qFeedback')).toBeVisible();
  await expect(page.locator('#qSubmit')).toBeHidden();
  await expect(page.locator('#qOptions .option').first()).toBeDisabled();

  for (let i=0;i<5;i++) await page.locator('#qNext').click();
  await expect(page.locator('#sessionSummary')).toBeVisible();
  expect(await countAttempts()).toBe(before);
});


test('2021-2026 PYQ seed has taxonomy, year and repeat metadata', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const years = [2021,2022,2023,2024,2025,2026];
    const files = [
      '2021.json','2022.json','2023.json',
      '2024.json','2024-expansion-a.json','2024-expansion-b.json','2024-expansion-c.json','2024-expansion-d.json',
      '2025.json','2025-expansion-a.json','2025-expansion-b.json','2025-expansion-c.json',
      '2026.json'
    ];
    const groups = await Promise.all(files.map(name => fetch(`data/pyq/2021_2026/${name}`).then(r => r.json())));
    const items = groups.flat();
    const repeatYears = new Map();
    for (const q of items) {
      if (!q.repeat_key) continue;
      if (!repeatYears.has(q.repeat_key)) repeatYears.set(q.repeat_key, new Set());
      repeatYears.get(q.repeat_key).add(q.exam_year);
    }
    return {
      count: items.length,
      years: [...new Set(items.map(q => q.exam_year))].sort(),
      taxonomyComplete: items.every(q => q.subject && q.system && q.topic && q.subtopic),
      provenanceComplete: items.every(q => ['memory_based_recall','memory_based_topic_reconstruction'].includes(q.pyq_status) && q.verification_status === 'unverified' && q.provenance?.source_url && q.provenance?.content_version),
      repeated: [...repeatYears.entries()].filter(([,ys]) => ys.size >= 2).map(([key,ys]) => [key, [...ys].sort()])
    };
  });

  expect(result.count).toBe(405);
  expect(result.years).toEqual([2021,2022,2023,2024,2025,2026]);
  expect(result.taxonomyComplete).toBeTruthy();
  expect(result.provenanceComplete).toBeTruthy();
  expect(result.repeated).toEqual(expect.arrayContaining([
    ['marfan-fbn1',[2025,2026]],
    ['opioid-toxicity-naloxone',[2022,2026]]
  ]));
});

test('original hy100 bank is no longer loaded', async ({ page }) => {
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>typeof app!=='undefined'?app.questions.length:0)).toBe(405);
  const result=await page.evaluate(()=>({
    total:app.questions.length,
    legacy:app.questions.filter(q=>String(q.external_id||'').startsWith('hy100-')).length,
    pyq:app.questions.filter(q=>q.exam_year>=2021&&q.exam_year<=2026).length
  }));
  expect(result).toEqual({total:405,legacy:0,pyq:405});
});
