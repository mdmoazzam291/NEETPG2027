const { test, expect } = require('@playwright/test');

test('Connected Supabase backend keeps guest mode usable and RLS protects private tables', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#statTotal')).toHaveText('405');

  await page.addScriptTag({ url: '/assets/supabase-config.js' });
  await page.addScriptTag({ url: '/assets/auth-sync.js' });
  await page.addScriptTag({ url: '/assets/auth-provider-guard.js' });

  await expect(page.locator('#accountBtn')).toBeVisible();
  await expect(page.locator('#accountLabel')).toHaveText('Sign in');
  await expect(page.locator('#cloudAccountCard')).toHaveCount(1);

  await expect.poll(async () => page.evaluate(() => Boolean(window.NEETPG_CLOUD?.client)), {timeout: 15000}).toBe(true);
  const backend = await page.evaluate(async () => {
    const c=window.NEETPG_CLOUD.client;
    const session=await c.auth.getSession();
    const rows=await c.from('profiles').select('id').limit(1);
    return {
      configured: window.NEETPG_CLOUD.configured,
      session: session.data.session,
      authError: session.error?.message || null,
      rows: rows.data,
      rowsError: rows.error?.message || null,
      hasPrivilegedKey: Object.keys(window.NEETPG_SUPABASE||{}).some(k=>/service.?role/i.test(k))
    };
  });
  expect(backend.configured).toBe(true);
  expect(backend.session).toBeNull();
  expect(backend.authError).toBeNull();
  expect(backend.rowsError).toBeNull();
  expect(backend.rows).toEqual([]);
  expect(backend.hasPrivilegedKey).toBe(false);

  await page.click('#accountBtn');
  await expect(page.locator('#authModal')).toHaveClass(/show/);
  await expect(page.locator('#authSubmit')).toHaveText('Sign in');
  await expect(page.locator('#authGoogle')).toBeHidden();
  await page.click('#authClose');

  await page.click('[data-view="practice"]');
  await page.selectOption('#pCount', '5');
  await page.click('#startCustom');
  await expect(page.locator('#practiceShell')).not.toHaveClass(/hidden/);
  await expect(page.locator('#qStem')).not.toBeEmpty();
});

test('Auth UI supports email sign-in and account creation modes without privileged browser credentials', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({content: `window.NEETPG_SUPABASE={url:'https://example.supabase.co',anonKey:'public-test-key',redirectUrl:location.href,googleEnabled:false};window.supabase={createClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})}),auth:{getSession:async()=>({data:{session:null},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithPassword:async()=>({error:null}),signUp:async()=>({data:{session:null},error:null}),signInWithOAuth:async()=>({error:null}),signOut:async()=>({error:null})}})};`});
  await page.addScriptTag({ url: '/assets/auth-sync.js' });
  await page.addScriptTag({ url: '/assets/auth-provider-guard.js' });

  await page.click('#accountBtn');
  await expect(page.locator('#authSubmit')).toHaveText('Sign in');
  await page.click('[data-auth-tab="signup"]');
  await expect(page.locator('#authSubmit')).toHaveText('Create account');
  await expect(page.locator('#authNameField')).toBeVisible();
  await expect(page.locator('#authGoogle')).toBeHidden();

  const config = await page.evaluate(() => window.NEETPG_SUPABASE);
  expect(config).not.toHaveProperty('serviceRoleKey');
  expect(config).not.toHaveProperty('service_role');
});


test('Cloud sync removes finished active sessions and excludes mock attempts from SRS counters', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#statTotal')).toHaveText('405');
  await page.addScriptTag({ content: `window.NEETPG_SUPABASE={};` });
  await page.addScriptTag({ url: '/assets/auth-sync.js' });
  await expect.poll(()=>page.evaluate(()=>Boolean(window.NEETPG_CLOUD?.syncNow))).toBe(true);

  const result = await page.evaluate(async () => {
    const uid='sync-user', qid=app.questions[0].external_id;
    const old='2026-09-20T10:00:00.000Z';
    const remote={
      question_state:[{user_id:uid,qid,attempts:2,correct:1,incorrect:1,last_correct:true,bookmarked:true,flagged:false,note:'keep me',due_at:null,interval_days:0,ease:2.5,streak:1,updated_at:old}],
      attempts:[
        {user_id:uid,client_key:'s-practice:'+qid+':1000:A',qid,correct:false,selected:'A',confidence:null,mistake:'',note:'',skipped:false,happened_at:'1970-01-01T00:00:01.000Z',elapsed_seconds:1,session_id:'s-practice',subject:'Medicine',difficulty:2,updated_at:old},
        {user_id:uid,client_key:'mock-1:'+qid+':2000:B',qid,correct:true,selected:'B',confidence:null,mistake:'',note:'',skipped:false,happened_at:'1970-01-01T00:00:02.000Z',elapsed_seconds:1,session_id:'mock-1',subject:'Medicine',difficulty:2,updated_at:old}
      ],
      study_sessions:[
        {user_id:uid,session_id:'s-practice',started_at:'1970-01-01T00:00:00.000Z',ended_at:'1970-01-01T00:00:03.000Z',question_count:1,correct_count:0,accuracy:0,mode:'smart',feedback:'instant',subjects:['Medicine'],payload:{},updated_at:old},
        {user_id:uid,session_id:'mock-1',started_at:'1970-01-01T00:00:00.000Z',ended_at:'1970-01-01T00:00:04.000Z',question_count:1,correct_count:1,accuracy:100,mode:'Mock · full',feedback:'exam',subjects:['Medicine'],payload:{},updated_at:old}
      ],
      user_settings:[],
      active_sessions:[{user_id:uid,session_id:'s-finished',payload:{sessionId:'s-finished',qids:[qid],pos:0,savedAt:1000},updated_at:'1970-01-01T00:00:01.000Z'}],
      profiles:[]
    };
    const filtered=(table,filters)=>remote[table].filter(row=>filters.every(([k,v])=>row[k]===v));
    const client={from(table){
      let filters=[], mode='select';
      const q={
        select(){mode='select';return q;},
        eq(k,v){filters.push([k,v]);return q;},
        order(){return q;},
        range(){return Promise.resolve({data:filtered(table,filters),error:null});},
        maybeSingle(){const rows=filtered(table,filters);return Promise.resolve({data:rows[0]||null,error:null});},
        upsert(rows){for(const row of (Array.isArray(rows)?rows:[rows])){const keys=table==='question_state'?['user_id','qid']:table==='attempts'?['user_id','client_key']:table==='study_sessions'?['user_id','session_id']:['user_id'];const i=remote[table].findIndex(x=>keys.every(k=>x[k]===row[k]));if(i>=0)remote[table][i]={...remote[table][i],...row};else remote[table].push({...row});}return Promise.resolve({data:null,error:null});},
        delete(){mode='delete';return q;},
        then(resolve,reject){try{if(mode==='delete')remote[table]=remote[table].filter(row=>!filters.every(([k,v])=>row[k]===v));resolve({data:null,error:null});}catch(e){reject(e);}}
      };
      return q;
    }};

    for(const store of ['qstate','attempts','sessions','runtime'])await dbClear(store);
    const contaminated={...stateFor(qid),qid,attempts:2,correct:1,incorrect:1,lastCorrect:true,bookmarked:true,note:'keep me',streak:1,updatedAt:new Date(old).getTime()};
    await dbPut('qstate',contaminated);app.states.set(qid,contaminated);
    app.attempts=[];app.sessions=[];app.session=null;app.savedSession=null;
    localStorage.setItem('neetpg2027-cloud-active-clear',JSON.stringify({sessionId:'s-finished',finishedAt:5000}));

    Object.assign(NEETPG_CLOUD,{user:{id:uid,email:'sync@example.test'},client,dirty:true,changeVersion:1});
    await NEETPG_CLOUD.syncNow();

    const repaired=stateFor(qid), cloudRow=remote.question_state.find(x=>x.qid===qid);
    return {
      localAttempts:repaired.attempts,localCorrect:repaired.correct,localIncorrect:repaired.incorrect,
      localLastCorrect:repaired.lastCorrect,localStreak:repaired.streak,bookmark:repaired.bookmarked,note:repaired.note,
      cloudAttempts:cloudRow.attempts,cloudIncorrect:cloudRow.incorrect,
      activeRows:remote.active_sessions.length,lastSyncAt:NEETPG_CLOUD.lastSyncAt,error:NEETPG_CLOUD.error||null,
      clearIntent:localStorage.getItem('neetpg2027-cloud-active-clear')
    };
  });

  expect(result.localAttempts).toBe(1);
  expect(result.localCorrect).toBe(0);
  expect(result.localIncorrect).toBe(1);
  expect(result.localLastCorrect).toBe(false);
  expect(result.localStreak).toBe(0);
  expect(result.bookmark).toBe(true);
  expect(result.note).toBe('keep me');
  expect(result.cloudAttempts).toBe(1);
  expect(result.cloudIncorrect).toBe(1);
  expect(result.activeRows).toBe(0);
  expect(result.clearIntent).toBeNull();
  expect(result.lastSyncAt).toBeTruthy();
  expect(result.error).toBeNull();
});
