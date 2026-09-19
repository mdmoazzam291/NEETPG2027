const {test,expect}=require('@playwright/test');

async function loadPhase12(page){
  await page.goto('/');
  await page.addScriptTag({url:'/assets/phase10-taxonomy.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE10,{timeout:15000});
  await page.addScriptTag({url:'/assets/phase11-analytics.js'});
  await page.waitForFunction(()=>window.NEETPG_PHASE11,{timeout:15000});
  await page.addStyleTag({url:'/assets/ui-v4.css'});
  await page.addScriptTag({url:'/assets/ui-v4.js'});
  await page.waitForFunction(()=>document.body.dataset.v4ready==='1',{timeout:15000});
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

test('Phase 12 rolling study plan remains independent of the dedicated exam countdown',async({page})=>{
  await loadPhase12(page);
  const r=await page.evaluate(()=>{
    NEETPG_PHASE12.setDailyGoal(25);
    return{
      rolling:NEETPG_PHASE12.rollingPlan(7),
      hasExamApi:'setExamDate' in NEETPG_PHASE12 || 'examCountdown' in NEETPG_PHASE12
    };
  });
  expect(r.hasExamApi).toBe(false);
  expect(r.rolling).toHaveLength(7);
  expect(r.rolling[0]).toHaveProperty('srsTarget');
  expect(r.rolling[0]).toHaveProperty('adaptiveTarget');
});

test('Phase 12 dashboard planner renders 15/30/60-minute and micro-session controls and can launch practice',async({page})=>{
  await loadPhase12(page);
  await page.evaluate(()=>NEETPG_PHASE12.panel());
  const host=page.locator('#v12Planner');
  await expect(host).toContainText('Planning & adaptive revision v2');
  await expect(page.locator('.v4-dashboard > *').nth(0)).toHaveAttribute('id','v4ExamCountdown');
  await expect(page.locator('.v4-dashboard > *').nth(1)).toHaveAttribute('id','v12Planner');
  await expect(page.locator('#v12Planner')).toHaveAttribute('data-dashboard-slot','planner');
  await expect(host).toContainText('Daily');
  await expect(host).toContainText('Weekly');
  await expect(host).toContainText('SRS workload');
  await expect(host).toContainText('15 min');
  await expect(host).toContainText('30 min');
  await expect(host).toContainText('60 min');
  await expect(host).toContainText('5-min micro');
  await page.evaluate(()=>NEETPG_PHASE12.startPlan(15));
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qProgress')).toContainText(/^1 \/ \d+$/);
});


test('Phase 12 planner no longer renders exam countdown or exam-date controls',async({page})=>{
  await loadPhase12(page);
  await page.evaluate(()=>NEETPG_PHASE12.panel());

  const host=page.locator('#v12Planner');
  await expect(host).not.toContainText('Exam countdown');
  await expect(page.locator('#p12ExamDate')).toHaveCount(0);
  await expect(page.locator('#p12CountdownDays')).toHaveCount(0);
  await expect(page.locator('#p12CountdownStatus')).toHaveCount(0);

  await page.fill('#p12DailyGoal','35');
  await page.click('#p12Save');
  await expect(page.locator('#p12DailyGoal')).toHaveValue('35');

  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('neetpg2027-phase12-planner')));
  expect(prefs.dailyGoal).toBe(35);
  expect(prefs.examDate).toBeUndefined();
});
