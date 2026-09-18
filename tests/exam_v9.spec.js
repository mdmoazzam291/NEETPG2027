const { test, expect } = require('@playwright/test');

async function loadExam(page){
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>typeof app!=='undefined' ? app.questions.length : 0)).toBeGreaterThan(0);
  await page.addStyleTag({url:'/assets/exam-v9.css'});
  await page.addScriptTag({url:'/assets/exam-v9.js'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NEETPG_EXAM9))).toBe(true);
}

test('available-bank simulator uses section-locked NEET-PG flow', async ({page})=>{
  await loadExam(page);
  await page.evaluate(()=>window.NEETPG_EXAM9.startAvailable());
  await expect(page.locator('#exam9Backdrop')).toHaveClass(/show/);
  const total=await page.evaluate(()=>app.questions.length);
  const sections=Math.ceil(total/40);
  await expect(page.locator('#exam9HeaderSub')).toContainText(`Section 1 of ${sections}`);
  await expect(page.locator('.exam9-q')).toHaveCount(40);
  await expect(page.locator('#exam9Clock')).toContainText(/41:|42:/);

  await page.locator('.exam9-option').first().click();
  await expect(page.locator('.exam9-option.selected')).toHaveCount(1);
  await page.click('#exam9Mark');
  await expect(page.locator('#exam9Body')).toContainText('Q 2/40');

  await page.click('#exam9SubmitSection');
  await expect(page.locator('#exam9HeaderSub')).toContainText(`Section 2 of ${sections}`);
  const state=await page.evaluate(()=>window.NEETPG_EXAM9.state);
  expect(state.sections[0].locked).toBe(true);
  expect(state.currentSection).toBe(1);
});

test('active exam survives reload and 200Q mode follows available content', async ({page})=>{
  await loadExam(page);
  await page.evaluate(()=>window.NEETPG_EXAM9.startAvailable());
  await page.locator('.exam9-option').nth(1).click();
  const before=await page.evaluate(()=>window.NEETPG_EXAM9.state.id);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>typeof app!=='undefined' ? app.questions.length : 0)).toBeGreaterThan(0);
  await page.addScriptTag({url:'/assets/exam-v9.js'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NEETPG_EXAM9))).toBe(true);
  await page.evaluate(()=>window.NEETPG_EXAM9.open());
  await expect(page.locator('#exam9Resume')).toBeVisible();
  await page.click('#exam9Resume');
  const after=await page.evaluate(()=>window.NEETPG_EXAM9.state.id);
  expect(after).toBe(before);

  await page.click('#exam9Close');
  await page.evaluate(()=>localStorage.removeItem('neetpg2027-exam-v9-active'));
  await page.evaluate(()=>window.NEETPG_EXAM9.open());
  const n=await page.evaluate(()=>app.questions.length);
  if(n<200){
    await expect(page.locator('#exam9Full')).toBeDisabled();
    await expect(page.locator('#exam9Body')).toContainText(`Current bank: ${n}`);
  }else{
    await expect(page.locator('#exam9Full')).toBeEnabled();
    await expect(page.locator('#exam9Body')).toContainText(`${n} questions available`);
  }
});
