const { test, expect } = require('@playwright/test');

async function waitCore(page){
  await page.goto('/');
  await expect.poll(()=>page.evaluate(()=>document.body.dataset.coreReady==='1' && app.questions.length>0),{timeout:15000}).toBe(true);
}

async function loadRevisionUi(page){
  await waitCore(page);
  await page.addStyleTag({url:'/assets/ui-v4.css'});
  await page.addScriptTag({url:'/assets/ui-v4.js'});
  await expect(page.locator('body')).toHaveAttribute('data-v4ready','1');
}

test('answering schedules SRS immediately and manual rating overrides from the pre-answer base', async ({page})=>{
  await waitCore(page);
  await page.evaluate(()=>{
    const q=app.questions[0];
    buildSession([q],{...builtInPreset('rapid'),count:1,feedback:'instant',timer:'off',shuffle:false});
  });
  const correct=await page.evaluate(()=>currentQ().options.find(o=>o.is_correct).label);
  await page.locator(`#qOptions .option[data-label="${correct}"]`).click();
  await page.click('#qSubmit');
  await expect(page.locator('#qFeedback')).toBeVisible();

  const automatic=await page.evaluate(()=>{
    const s=stateFor(currentQ().external_id);
    return {dueAt:Number(s.dueAt),interval:Number(s.intervalDays),ease:Number(s.ease)};
  });
  expect(automatic.dueAt).toBeGreaterThan(Date.now());
  expect(automatic.interval).toBe(1);

  await page.locator('[data-rating="easy"]').click();
  const manual=await page.evaluate(()=>{
    const s=stateFor(currentQ().external_id);
    return {interval:Number(s.intervalDays),ease:Number(s.ease),dueAt:Number(s.dueAt)};
  });
  expect(manual.interval).toBe(3);
  expect(manual.ease).toBeGreaterThan(automatic.ease);
  expect(manual.dueAt).toBeGreaterThan(Date.now()+2*86400000);
});

test('exam-mode answers enter the future review queue without requiring rating buttons', async ({page})=>{
  await waitCore(page);
  await page.evaluate(()=>{
    const q=app.questions[1];
    buildSession([q],{...builtInPreset('rapid'),count:1,feedback:'exam',timer:'off',shuffle:false});
  });
  const qid=await page.evaluate(()=>currentQ().external_id);
  const correct=await page.evaluate(()=>currentQ().options.find(o=>o.is_correct).label);
  await page.locator(`#qOptions .option[data-label="${correct}"]`).click();
  await page.click('#qSubmit');
  await expect(page.locator('#sessionSummary')).toBeVisible();
  const scheduled=await page.evaluate(qid=>{
    const s=stateFor(qid);
    return {dueAt:Number(s.dueAt),interval:Number(s.intervalDays),lastCorrect:s.lastCorrect};
  },qid);
  expect(scheduled.lastCorrect).toBe(true);
  expect(scheduled.interval).toBeGreaterThanOrEqual(1);
  expect(scheduled.dueAt).toBeGreaterThan(Date.now());
});

test('due reviews are deterministic and persistent errors require demonstrated recovery', async ({page})=>{
  await waitCore(page);
  const result=await page.evaluate(()=>{
    const [a,b,c]=app.questions.slice(0,3);
    const t=Date.now();
    app.states.set(a.external_id,{...stateFor(a.external_id),qid:a.external_id,attempts:3,correct:1,incorrect:2,lastCorrect:true,streak:1,dueAt:t-1000});
    app.states.set(b.external_id,{...stateFor(b.external_id),qid:b.external_id,attempts:1,correct:0,incorrect:1,lastCorrect:false,streak:0,dueAt:t-5000});
    app.states.set(c.external_id,{...stateFor(c.external_id),qid:c.external_id,attempts:2,correct:2,incorrect:0,lastCorrect:true,streak:2,dueAt:t+50000});
    app.attempts=[
      ...app.attempts.filter(x=>![a.external_id,b.external_id].includes(x.qid)),
      {qid:a.external_id,correct:false,ts:t-9000},
      {qid:a.external_id,correct:false,ts:t-6000},
      {qid:a.external_id,correct:true,ts:t-3000},
      {qid:b.external_id,correct:false,ts:t-1000}
    ].sort((x,y)=>x.ts-y.ts);
    const due=dueQuestions().slice(0,2).map(q=>q.external_id);
    const incorrect=incorrectQuestions().slice(0,3).map(q=>q.external_id);
    const persistsBefore=incorrect.includes(a.external_id);
    const recovered={...stateFor(a.external_id),streak:2,lastCorrect:true};
    app.states.set(a.external_id,recovered);
    const persistsAfter=incorrectQuestions().some(q=>q.external_id===a.external_id);
    return {a:a.external_id,b:b.external_id,due,incorrect,persistsBefore,persistsAfter};
  });
  expect(result.due).toEqual([result.b,result.a]);
  expect(result.incorrect[0]).toBe(result.b);
  expect(result.persistsBefore).toBe(true);
  expect(result.persistsAfter).toBe(false);
});

test('Revision sidebar badge, CTA, time crossing, and tabs stay in sync', async ({page})=>{
  await loadRevisionUi(page);
  const ids=await page.evaluate(async()=>{
    const [dueQ,bookmarkQ,noteQ]=app.questions.slice(3,6);
    const future=Date.now()+250;
    for(const [q,patch] of [
      [dueQ,{dueAt:future,attempts:1,incorrect:1,lastCorrect:false,streak:0}],
      [bookmarkQ,{bookmarked:true}],
      [noteQ,{note:'Recall clue'}]
    ]){
      const s={...stateFor(q.external_id),qid:q.external_id,...patch,updatedAt:Date.now()};
      app.states.set(q.external_id,s);await dbPut('qstate',s);
    }
    renderAll();navigate('review');
    return {due:dueQ.external_id,bookmark:bookmarkQ.external_id,note:noteQ.external_id};
  });
  await expect(page.locator('#v4NavDue')).toBeHidden();
  await page.waitForTimeout(350);
  await page.evaluate(()=>refreshRevisionClock(true));
  await expect(page.locator('#v4NavDue')).toHaveText('1');
  await expect(page.locator('#v4NavDue')).toBeVisible();
  await expect(page.locator('#startDue')).toHaveText('Start due review');
  await expect(page.locator('#startDue')).toBeEnabled();
  await expect(page.locator('#dueList [data-practice-q]').first()).toHaveAttribute('data-practice-q',ids.due);

  const quick=page.locator('[data-review-tab="quick"]');
  await quick.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-review-tab="bookmarks"]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-review-tab="bookmarks"]')).toBeFocused();
  await expect(page.locator('#reviewPanelBookmarks')).toBeVisible();
  await expect(page.locator('#startDue')).toHaveText('Practice bookmarks');

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-review-tab="notes"]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#reviewPanelNotes')).toBeVisible();
  await expect(page.locator('#startDue')).toHaveText('Practice noted questions');
});

test('Revision renders imported question ids as inert data attributes', async ({page})=>{
  await waitCore(page);
  const result=await page.evaluate(()=>{
    const id='custom-" onclick="window.__REVISION_XSS=1';
    const html=listQuestions([{external_id:id,subject:'Custom',topic:'Safety',stem:'Safe rendering'}],'none');
    const host=document.createElement('div');host.innerHTML=html;
    const button=host.querySelector('[data-practice-q]');
    return {value:button?.getAttribute('data-practice-q'),onclick:button?.getAttribute('onclick'),triggered:window.__REVISION_XSS||0};
  });
  expect(result.value).toBe('custom-" onclick="window.__REVISION_XSS=1');
  expect(result.onclick).toBeNull();
  expect(result.triggered).toBe(0);
});
