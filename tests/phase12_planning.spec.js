const {test,expect}=require('@playwright/test');

async function loadPhase12(page){
  await page.goto('/');
  await page.addScriptTag({url:'/assets/phase10-taxonomy.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE10,{timeout:15000});
  await page.addScriptTag({url:'/assets/phase11-analytics.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE11,{timeout:15000});
  await page.addScriptTag({url:'/assets/phase12-planning.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE12,{timeout:15000});
}

test('Phase 12 builds profile-linked goals, balanced SRS workload and unique adaptive daily mixes',async({page})=>{
  await loadPhase12(page);
  const r=await page.evaluate(()=>{
    NEETPG_PHASE12.setDailyGoal(20);
    const goal=NEETPG_PHASE12.goalProgress();
    const mix=NEETPG_PHASE12.dailyMix(15);
    const srs=NEETPG_PHASE12.balanceSrs(7);
    const p15=NEETPG_PHASE12.studyPlan(15),p30=NEETPG_PHASE12.studyPlan(30),p60=NEETPG_PHASE12.studyPlan(60);
    const micro=NEETPG_PHASE12.microSession(5);
    const rem=NEETPG_PHASE12.reminderEligibility();
    return{
      goal,
      mix:{n:mix.questions.length,unique:new Set(mix.questions.map(q=>q.external_id)).size,composition:mix.composition,formula:mix.formula},
      srs,
      plans:[p15.targetQuestions,p30.targetQuestions,p60.targetQuestions],
      micro:micro.targetQuestions,
      rem
    };
  });
  expect(r.goal.dailyGoal).toBe(20);
  expect(r.goal.weeklyGoal).toBe(140);
  expect(r.mix.n).toBe(15);
  expect(r.mix.unique).toBe(15);
  expect(r.mix.formula).toContain('Due first');
  expect(r.srs.rows).toHaveLength(7);
  expect(r.srs.reviewCap).toBeGreaterThanOrEqual(5);
  expect(r.plans).toEqual([12,24,48]);
  expect(r.micro).toBe(4);
  expect(typeof r.rem.eligible).toBe('boolean');
  expect(r.rem.enabled).toBe(false);
});

test('Phase 12 countdown and rolling study plan use an explicit exam date rather than inventing one',async({page})=>{
  await loadPhase12(page);
  const r=await page.evaluate(()=>{
    const future=new Date(Date.now()+20*86400000);const date=`${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`;
    NEETPG_PHASE12.setDailyGoal(25);
    NEETPG_PHASE12.setExamDate(date);
    return{countdown:NEETPG_PHASE12.examCountdown(),rolling:NEETPG_PHASE12.rollingPlan(7)};
  });
  expect(r.countdown.date).toBeTruthy();
  expect(r.countdown.days).toBeGreaterThanOrEqual(19);
  expect(r.countdown.days).toBeLessThanOrEqual(20);
  expect(r.rolling).toHaveLength(7);
  expect(r.rolling[0]).toHaveProperty('srsTarget');
  expect(r.rolling[0]).toHaveProperty('adaptiveTarget');
});

test('Phase 12 dashboard planner renders 15/30/60-minute and micro-session controls and can launch practice',async({page})=>{
  await loadPhase12(page);
  await page.evaluate(()=>NEETPG_PHASE12.panel());
  const host=page.locator('#v12Planner');
  await expect(host).toContainText('Planning & adaptive revision v2');
  await expect(host).toContainText('Daily');
  await expect(host).toContainText('Weekly');
  await expect(host).toContainText('SRS workload');
  await expect(host).toContainText('15 min');
  await expect(host).toContainText('30 min');
  await expect(host).toContainText('60 min');
  await expect(host).toContainText('5-min micro');
  await page.evaluate(()=>NEETPG_PHASE12.startPlan(15));
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qProgress')).toContainText('1 / 12');
});


test('Phase 12 Save plan persists the typed exam date and updates countdown immediately',async({page})=>{
  await loadPhase12(page);
  await page.evaluate(()=>NEETPG_PHASE12.panel());

  const date=await page.evaluate(()=>{
    const future=new Date();
    future.setDate(future.getDate()+30);
    return `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`;
  });

  await page.fill('#p12DailyGoal','35');
  await page.fill('#p12ExamDate',date);
  await page.click('#p12Save');

  await expect(page.locator('#p12ExamDate')).toHaveValue(date);
  await expect(page.locator('#p12CountdownStatus')).toContainText('remaining');
  const days=Number(await page.locator('#p12CountdownDays').textContent());
  expect(days).toBeGreaterThanOrEqual(29);
  expect(days).toBeLessThanOrEqual(30);

  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('neetpg2027-phase12-planner')));
  expect(prefs.examDate).toBe(date);
  expect(prefs.dailyGoal).toBe(35);

  await page.reload();
  await page.addScriptTag({url:'/assets/phase10-taxonomy.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE10,{timeout:15000});
  await page.addScriptTag({url:'/assets/phase11-analytics.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE11,{timeout:15000});
  await page.addScriptTag({url:'/assets/phase12-planning.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE12,{timeout:15000});
  await page.evaluate(()=>NEETPG_PHASE12.panel());

  await expect(page.locator('#p12ExamDate')).toHaveValue(date);
  await expect(page.locator('#p12CountdownStatus')).toContainText('remaining');
});
