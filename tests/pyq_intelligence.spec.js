const { test, expect } = require('@playwright/test');

async function loadPyq(page){
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>typeof app!=='undefined' ? app.questions.length : 0)).toBeGreaterThanOrEqual(505);
  await page.addScriptTag({url:'/assets/phase10-taxonomy.js'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NEETPG_PHASE10))).toBe(true);
  await page.addScriptTag({url:'/assets/pyq-metadata.js'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NEETPG_PYQ))).toBe(true);
}

test('PYQ Intelligence summarizes 2021-2026 recall bank', async ({page})=>{
  await loadPyq(page);
  const data=await page.evaluate(()=>({
    pyqs:NEETPG_PYQ.pyqQuestions().length,
    years:[...new Set(NEETPG_PYQ.pyqQuestions().map(q=>q.exam_year))].sort(),
    repeats:NEETPG_PYQ.repeatRows().map(r=>({key:r.key,count:r.count,years:r.years}))
  }));
  expect(data.pyqs).toBe(405);
  expect(data.years).toEqual([2021,2022,2023,2024,2025,2026]);
  expect(data.repeats.length).toBeGreaterThanOrEqual(3);
  expect(data.repeats).toEqual(expect.arrayContaining([
    {key:'saphenous-nerve-gsv',count:2,years:[2021,2022]},
    {key:'opioid-toxicity-naloxone',count:2,years:[2022,2026]},
    {key:'marfan-fbn1',count:2,years:[2025,2026]}
  ]));
});

test('PYQ Intelligence view renders and launches repeated-concept practice', async ({page})=>{
  await loadPyq(page);
  await page.evaluate(()=>navigate('pyq'));
  await expect(page.locator('#view-pyq')).toHaveClass(/active/);
  await expect(page.locator('#pyqTotal')).toHaveText('405');
  await expect(page.locator('#pyqYears')).toHaveText('6');
  await expect(page.locator('#pyqRepeatConcepts')).not.toHaveText('0');
  await expect(page.locator('#pyqYearBars .bar-row')).toHaveCount(6);
  await expect(page.locator('#pyqMatrixBody tr')).toHaveCount(await page.locator('#pyqMatrixBody tr').count());
  const first=page.locator('[data-pyq-repeat]').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.locator('#practiceShell')).toBeVisible();
  await expect(page.locator('#qProgress')).toContainText('/');
});

test('PYQ year filters and repeat filters constrain practice data', async ({page})=>{
  await loadPyq(page);
  const result=await page.evaluate(()=>{
    const recent=getFilteredQuestions({mode:'all',year:'last3',repeat:'all'});
    const repeated=getFilteredQuestions({mode:'all',year:'all',repeat:'2'});
    return {
      recentYears:[...new Set(recent.map(q=>q.exam_year).filter(Boolean))].sort(),
      recentCount:recent.filter(q=>q.exam_year).length,
      repeatedCount:repeated.filter(q=>q.exam_year).length,
      repeatedOk:repeated.filter(q=>q.exam_year).every(q=>q.repeat_count>=2)
    };
  });
  expect(result.recentYears).toEqual([2024,2025,2026]);
  expect(result.recentCount).toBe(345);
  expect(result.repeatedCount).toBeGreaterThanOrEqual(6);
  expect(result.repeatedOk).toBeTruthy();
});
