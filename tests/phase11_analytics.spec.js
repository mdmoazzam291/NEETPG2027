const {test,expect}=require('@playwright/test');

async function waitForStudyEngine(page){
  await page.waitForFunction(()=>{
    try{
      return typeof app!=='undefined' &&
        app.db &&
        Array.isArray(app.questions) && app.questions.length>=505 &&
        Array.isArray(app.attempts) &&
        Number(document.querySelector('#statTotal')?.textContent||0)===app.questions.length;
    }catch{return false;}
  },{timeout:15000});
}

async function loadPhase11(page){
  await page.goto('/');
  await waitForStudyEngine(page);
  await page.addScriptTag({url:'/assets/phase10-taxonomy.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE10,{timeout:15000});
  await page.addScriptTag({url:'/assets/phase11-analytics.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE11,{timeout:15000});
}

test('Phase 11 analytics exposes transparent subject/system/topic weakness and pace metrics',async({page})=>{
  await loadPhase11(page);
  const r=await page.evaluate(()=>({
    pace:NEETPG_PHASE11.paceAnalysis(),
    ready:NEETPG_PHASE11.readiness(),
    levels:['subject','system','topic'].map(x=>Array.isArray(NEETPG_PHASE11.weaknessRows(x))),
    why:typeof NEETPG_PHASE11.whyQuestion(NEETPG_PHASE10.allQuestions()[0])==='string',
    sig:NEETPG_PHASE11.signatures()
  }));
  expect(r.pace.targetSeconds).toBe(63);
  expect(r.ready.formula).toContain('40% accuracy');
  expect(r.levels.every(Boolean)).toBeTruthy();
  expect(r.why).toBeTruthy();
  expect(typeof r.sig.overthinking).toBe('boolean');
});

test('analytics panel renders documented readiness, pace split and revision effectiveness',async({page})=>{
  await loadPhase11(page);
  await page.evaluate(()=>NEETPG_PHASE11.panel());
  await expect(page.locator('#v11Analytics')).toContainText('Analytics Engine v2');
  await expect(page.locator('#v11Analytics')).toContainText('≤63s');
  await expect(page.locator('#v11Analytics')).toContainText('Coverage');
  await expect(page.locator('#v11Analytics')).toContainText('Revision');
});

test('exam review receives timing confidence and error overlay without changing exam scoring',async({page})=>{
  await page.goto('/');
  await waitForStudyEngine(page);
  await page.evaluate(()=>{
    window.NEETPG_EXAM9={state:{id:'exam-test',sections:[{questions:['hy100-001']}]}};
    app.attempts.push({qid:'hy100-001',sessionId:'exam-test',correct:false,elapsed:74,confidence:4,ts:Date.now()});
    const host=document.createElement('div');host.id='exam9Body';
    host.innerHTML='<div class="exam9-review"><div class="exam9-review-card incorrect">Review</div></div>';
    document.body.appendChild(host);
  });
  await page.addScriptTag({url:'/assets/phase11-exam-overlay.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE11_EXAM);
  await page.evaluate(()=>NEETPG_PHASE11_EXAM.apply());
  await expect(page.locator('.phase11-exam-overlay')).toContainText('Incorrect');
  await expect(page.locator('.phase11-exam-overlay')).toContainText('74s');
  await expect(page.locator('.phase11-exam-overlay')).toContainText('confidence 4/5');
});
