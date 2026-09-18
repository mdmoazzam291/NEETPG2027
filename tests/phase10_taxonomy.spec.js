const { test, expect } = require('@playwright/test');

async function loadPhase10(page){
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>typeof app!=='undefined' ? app.questions.length : 0)).toBeGreaterThan(0);
  await page.addScriptTag({url:'/assets/phase10-taxonomy.js'});
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NEETPG_PHASE10))).toBe(true);
}

test('Phase 10 adds hierarchical metadata and system filters', async ({page})=>{
  await loadPhase10(page);
  await expect(page.locator('#pSystem')).toBeAttached();
  await expect(page.locator('#bankSystem')).toBeAttached();
  const metadata=await page.evaluate(()=>{
    const qs=window.NEETPG_PHASE10.allQuestions();
    return {count:qs.length,complete:qs.every(q=>q.subject&&q.system&&q.topic&&q.subtopic&&q.verification_status&&q.provenance?.content_version)};
  });
  expect(metadata.count).toBeGreaterThanOrEqual(505);
  expect(metadata.complete).toBe(true);
  const systems=await page.locator('#pSystem option').allTextContents();
  expect(systems.length).toBeGreaterThan(2);
});

test('practice system filter constrains the session queue', async ({page})=>{
  await loadPhase10(page);
  await page.evaluate(()=>navigate('practice'));
  const system=await page.locator('#pSystem option').nth(1).textContent();
  await page.selectOption('#pSystem',{label:system});
  await page.selectOption('#pMode','all');
  await page.selectOption('#pCount','5');
  await page.click('#startCustom');
  const result=await page.evaluate(()=>({system:document.querySelector('#pSystem')?.value,systems:[...new Set(app.session.questions.map(q=>q.system))]}));
  expect(result.system).toBe(system);
  expect(result.systems).toEqual([system]);
});

test('question-bank system filter and Practice filtered agree', async ({page})=>{
  await loadPhase10(page);
  await page.evaluate(()=>navigate('bank'));
  const system=await page.locator('#bankSystem option').nth(1).textContent();
  await page.selectOption('#bankSystem',{label:system});
  await expect.poll(()=>page.locator('#bankBody tr:not([hidden])').count()).toBeGreaterThan(0);
  await page.click('#practiceFiltered');
  const systems=await page.evaluate(()=>[...new Set(app.session.questions.map(q=>q.system))]);
  expect(systems).toEqual([system]);
});
