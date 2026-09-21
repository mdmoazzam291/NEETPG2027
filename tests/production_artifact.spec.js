const {test,expect}=require('@playwright/test');

async function openGuest(page,path='/'){
  await page.goto(path);
  if(path.startsWith('/neuralvault'))return;
  await expect(page.locator('#authContinueOffline')).toBeVisible({timeout:20000});
  await page.locator('#authContinueOffline').click();
  await expect(page.locator('html')).toHaveAttribute('data-auth-launch','guest');
}

test('production launch is auth-first and Continue offline unlocks a session-scoped guest workspace',async({page})=>{
  await openGuest(page);
  await expect(page.locator('#authContinueOffline')).toBeVisible({timeout:20000});
  await expect(page.locator('.app')).not.toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-auth-launch','signed-out');
  await page.locator('#authContinueOffline').click();
  await expect(page.locator('.app')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-auth-launch','guest');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-auth-launch','guest',{timeout:20000});
  await expect(page.locator('.app')).toBeVisible();
});

test('production shell loads all scripts, preserves answers after reload and paginates',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await openGuest(page);await expect(page.locator('body')).toHaveAttribute('data-v4ready','1');
  await expect(page.locator('.study-grid > section')).toHaveCount(4);
  await page.click('#continueLearning');await page.locator('#qOptions .option').first().click();
  const selected=await page.locator('#qOptions .selected').getAttribute('data-label');
  await page.click('#qBookmark');await expect(page.locator('#qOptions .selected')).toHaveAttribute('data-label',selected);
  await expect.poll(()=>page.evaluate(async()=>(await dbAll('runtime'))[0]?.payload?.selected)).toBe(selected);
  await page.reload();await expect(page.locator('#continueLearning')).toHaveText('Resume session');await page.click('#continueLearning');
  await expect(page.locator('#qOptions .selected')).toHaveAttribute('data-label',selected);
  await page.click('#qSubmit');await expect(page.locator('#qFeedback')).toBeVisible();
  await page.reload();await page.click('#continueLearning');await expect(page.locator('#qSubmit')).toBeDisabled();await expect(page.locator('#qFeedback')).toBeVisible();
  await page.evaluate(()=>navigate('bank'));await expect(page.locator('#bankBody tr')).toHaveCount(50);await page.locator('#bankPager [data-page="1"]').click();await expect(page.locator('#bankPager')).toContainText('Page 2');
  expect(errors).toEqual([]);
});
test('attempt annotations get a durable edit timestamp for cloud conflict resolution',async({page})=>{
  await openGuest(page);await expect(page.locator('#continueLearning')).toBeVisible();
  await page.click('#continueLearning');await page.locator('#qOptions .option').first().click();await page.click('#qSubmit');await expect(page.locator('#qFeedback')).toBeVisible();
  const before=await page.evaluate(()=>app.session.lastAttempt.updatedAt||app.session.lastAttempt.ts);
  await page.waitForTimeout(5);await page.fill('#attemptNote','sync edit survives reload');await page.locator('#attemptNote').dispatchEvent('change');
  const edited=await page.evaluate(()=>({id:app.session.lastAttempt.id,updatedAt:app.session.lastAttempt.updatedAt,note:app.session.lastAttempt.note}));
  expect(edited.updatedAt).toBeGreaterThan(before);expect(edited.note).toBe('sync edit survives reload');
  await page.reload();await expect.poll(()=>page.evaluate(()=>app.attempts.some(a=>a.note==='sync edit survives reload'&&Number(a.updatedAt)>Number(a.ts)))).toBe(true);
});
test('target-date edits update immediately and are marked for cloud settings sync',async({page})=>{
  await openGuest(page);await expect(page.locator('#v4ExamCountdown')).toBeVisible();
  const before=await page.evaluate(()=>Number(localStorage.getItem('neetpg2027-v2-settings-updated')||0));
  await page.click('#editTarget');await page.fill('#targetDate','2027-09-01');await page.locator('#targetForm button').click();
  await expect(page.locator('#v4ExamCountdown')).toHaveAttribute('data-target','2027-09-01');
  await expect(page.locator('#targetDateLabel')).toHaveText(/1 Sep(t)? 2027/);
  const state=await page.evaluate(()=>({
    target:localStorage.getItem('neetpg2027-exam-target'),
    updated:Number(localStorage.getItem('neetpg2027-v2-settings-updated')||0)
  }));
  expect(state.target).toBe('2027-09-01');expect(state.updated).toBeGreaterThan(before);
});
test('production mobile themes have no horizontal overflow and target date persists',async({page})=>{
  await page.setViewportSize({width:390,height:844});await openGuest(page);await expect(page.locator('#continueLearning')).toBeVisible();
  await expect(page.locator('.mobile-bottom button')).toHaveCount(5);
  for(let n=0;n<2;n++){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.click('#themeToggle')}
  await page.click('#editTarget');await page.fill('#targetDate','2027-09-01');await page.locator('#targetForm button').click();await page.reload();await expect(page.locator('#v4ExamCountdown')).toHaveAttribute('data-target','2027-09-01');
});
test('reimporting a backup does not duplicate attempts',async({page})=>{
  await openGuest(page);await expect(page.locator('#continueLearning')).toBeVisible();
  const counts=await page.evaluate(async()=>{const data={qstate:[],attempts:[{qid:app.questions[0].external_id,sessionId:'backup-test',ts:123456,selected:'A',correct:false}],sessions:[],custom:[]};const f=new File([JSON.stringify(data)],'backup.json');await importBackupFile(f);const before=app.attempts.length;await importBackupFile(f);return [before,app.attempts.length]});expect(counts).toEqual([1,1]);
});
test('Vault commits survive a failed localStorage cache write',async({page})=>{
  await page.goto('/neuralvault/');await expect(page.locator('#editor')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NeuralVaultDB))).toBe(true);
  await page.evaluate(async()=>{await NeuralVaultDB.open();await new Promise(resolve=>setTimeout(resolve,150));});
  const saved=await page.evaluate(async()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError')};try{await NeuralVaultDB.saveState({notes:[{id:'durable-test',title:'Durable',content:'Retained without cache',updatedAt:Date.now()}],currentId:'durable-test'});return (await NeuralVaultDB.loadState()).notes.find(n=>n.id==='durable-test')?.content}finally{Storage.prototype.setItem=original}});expect(saved).toBe('Retained without cache');
});
test('a missing question bundle keeps the available bank usable',async({page})=>{
  await page.route('**/data/pyq/2021_2026/2024-expansion-a.json',route=>route.abort());
  await openGuest(page);await expect(page.locator('body')).toHaveAttribute('data-core-ready','1');
  await expect(page.locator('#bundleStatus')).toContainText('1 question bundles unavailable');
  await page.click('#continueLearning');await expect(page.locator('#qStem')).not.toBeEmpty();
});

test('production Revision schedules answers immediately and keeps the sidebar queue coherent',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await openGuest(page);await expect(page.locator('body')).toHaveAttribute('data-v4ready','1');
  await page.evaluate(()=>{const q=app.questions[20];buildSession([q],{...builtInPreset('rapid'),count:1,feedback:'instant',timer:'off',shuffle:false})});
  const qid=await page.evaluate(()=>currentQ().external_id);
  const correct=await page.evaluate(()=>currentQ().options.find(o=>o.is_correct).label);
  await page.locator(`#qOptions .option[data-label="${correct}"]`).click();await page.click('#qSubmit');await expect(page.locator('#qFeedback')).toBeVisible();
  const s=await page.evaluate(qid=>{const x=stateFor(qid);return{dueAt:Number(x.dueAt),interval:Number(x.intervalDays)}},qid);
  expect(s.dueAt).toBeGreaterThan(Date.now());expect(s.interval).toBe(1);
  await page.evaluate(async()=>{
    const q=app.questions[21],x={...stateFor(q.external_id),qid:q.external_id,attempts:1,incorrect:1,lastCorrect:false,streak:0,dueAt:Date.now()-5000,updatedAt:Date.now()};
    app.states.set(q.external_id,x);await dbPut('qstate',x);renderAll();navigate('review');refreshRevisionClock(true);
  });
  await expect(page.locator('#v4NavDue')).toHaveText('1');
  await expect(page.locator('#startDue')).toHaveText('Start due review');
  await expect(page.locator('#dueList [data-practice-q]')).toHaveCount(1);
  const geometry=await page.evaluate(()=>({
    width:innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    offenders:[...document.querySelectorAll('body *')].map(el=>{const r=el.getBoundingClientRect();return{tag:el.tagName,id:el.id,cls:String(el.className||''),left:r.left,right:r.right,width:r.width,scrollWidth:el.scrollWidth}}).filter(x=>x.width>0&&x.right>innerWidth+2).sort((a,b)=>b.right-a.right).slice(0,20)
  }));
  expect(geometry.scrollWidth<=geometry.width+2,JSON.stringify(geometry)).toBe(true);
});

test('starting Revision after answer review restores practice controls',async({page})=>{
 await openGuest(page);await expect(page.locator('#continueLearning')).toBeVisible();
 await page.evaluate(()=>buildSession([app.questions[0]],{...builtInPreset('rapid'),feedback:'instant',timer:'off'}));
 await page.locator('#qOptions .option').first().click();await page.click('#qSubmit');await page.click('#qNext');await page.click('#reviewSession');
 await expect(page.locator('#qSubmit')).toBeHidden();
 await page.evaluate(()=>{const q=app.questions[1];app.states.set(q.external_id,{...stateFor(q.external_id),bookmarked:true});navigate('review');activateReviewTab('bookmarks')});
 await page.click('#startDue');await expect(page.locator('#qSubmit')).toBeVisible();await expect(page.locator('#qSubmit')).toBeEnabled();
 await page.locator('#qOptions .option').first().click();await page.click('#qSubmit');await page.click('#qNext');await expect(page.locator('#sessionSummary')).toBeVisible();
});

test('Analytics includes saved mocks and unfinished sessions without duplicates and paginates',async({page})=>{
 await openGuest(page);await expect(page.locator('#continueLearning')).toBeVisible();
 await page.evaluate(async()=>{
  const sessions=Array.from({length:12},(_,i)=>({id:'complete-'+i,startedAt:Date.now()-i*1000,count:2,correct:1,mode:'Practice'}));
  for(const session of sessions)await dbPut('sessions',session);
  await loadState();
  localStorage.setItem('neetpg2027-exam-v9-history',JSON.stringify([{id:'complete-0',finishedAt:Date.now(),total:2,correct:1,mode:'available'},{id:'legacy-mock',finishedAt:Date.now(),total:4,correct:3,mode:'available'}]));
  app.savedSession={sessionId:'unfinished',qids:app.questions.slice(0,2).map(q=>q.external_id),answers:[],startedAt:Date.now()+100,cfg:{mode:'rapid'}};
  await dbPut('runtime',{id:'active',payload:app.savedSession});
  navigate('analytics');
 });
 await expect(page.locator('#sessionHistoryPager')).toContainText('14 sessions');await expect(page.locator('#sessionHistory')).toContainText('In progress');await expect(page.locator('#sessionHistory')).toContainText('Mock');
 await expect(page.locator('#sessionHistory .list-item')).toHaveCount(10);await page.locator('#sessionHistoryPager [data-page="1"]').click();await expect(page.locator('#sessionHistory .list-item')).toHaveCount(4);
});

test('production mock result persists once and selective revision remains independent',async({context,page})=>{
 const {fixture,connect,begin}=require('./helpers/exam_fixture.cjs');
 const server=await fixture(context);await connect(page,{built:true});await begin(page,true);
 await page.check('#exam9Option0');await expect.poll(()=>server.get().responses[0].selected).toBe('A');
 server.advance(2520);await page.click('#exam9Retry');await expect(page.locator('.exam9-score')).toContainText('4 / 144');
 await expect.poll(()=>page.evaluate(async()=>(await dbAll('sessions')).length)).toBe(1);
 await page.click('#exam9SyncResult');expect(await page.evaluate(async()=>(await dbAll('attempts')).length)).toBe(36);
 await page.click('#exam9Done');await page.evaluate(()=>navigate('analytics'));await expect(page.locator('#sessionHistory')).toContainText('Mock');
});
