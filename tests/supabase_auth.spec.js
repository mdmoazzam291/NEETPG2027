const { test, expect } = require('@playwright/test');

test('Connected Supabase backend keeps guest mode usable and RLS protects private tables', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#statTotal')).toHaveText('405');

  await page.addScriptTag({ url: '/assets/supabase-config.js' });
  await page.addScriptTag({ url: '/assets/auth-sync.js' });
  await page.addScriptTag({ url: '/assets/auth-provider-guard.js' });
  await page.addScriptTag({ url: '/assets/auth-v2.js' });

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
  const googleEnabled = await page.evaluate(async () => {
    const cfg=window.NEETPG_SUPABASE;
    const res=await fetch(String(cfg.url).replace(/\/$/,'')+'/auth/v1/settings',{headers:{apikey:cfg.anonKey}});
    const settings=await res.json();
    return Boolean(settings?.external?.google);
  });
  await expect.poll(()=>page.locator('#authGoogle').isVisible()).toBe(googleEnabled);
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


test('signed-in account surface includes logout and provider avatar support', async ({ page }) => {
  await page.goto('/');
  const sources=await page.evaluate(async()=>({
    sync:await (await fetch('/assets/auth-sync.js')).text(),
    v2:await (await fetch('/assets/auth-v2.js')).text()
  }));
  expect(sources.sync).toContain("getElementById('accountBtn')?.addEventListener('click',openAuth)");
  expect(sources.sync).toContain("modal.dataset.mode='account'");
  expect(sources.v2).toContain("authPageSignOut");
  expect(sources.v2).toContain("client.auth.signOut()");
  expect(sources.v2).toContain("Local study data remains available on this device.");
  for(const source of [sources.sync,sources.v2]){
    expect(source).toContain("user?.user_metadata?.avatar_url");
    expect(source).toContain("user?.user_metadata?.picture");
    expect(source).toContain("identity_data");
    expect(source).toContain("referrerPolicy = 'no-referrer'");
    expect(source).toMatch(/url\.protocol\s*===\s*'https:'/);
  }
});


test('cloud sync deletes a finished active-session row instead of resurrecting it', async ({ page }) => {
  await page.goto('/');
  const source=await page.evaluate(async()=>await (await fetch('/assets/auth-sync.js')).text());
  expect(source).toContain("from('active_sessions').delete().eq('user_id',cloud.user.id).eq('session_id',clearIntent.sessionId)");
  expect(source).not.toContain("typeof cloud.clearActiveSession==='function'");
});


test('cloud sync pulls cross-device changes while idle and when returning to foreground', async ({ page }) => {
  await page.goto('/');
  const source=await page.evaluate(async()=>await (await fetch('/assets/auth-sync.js')).text());
  expect(source).toContain("document.visibilityState==='visible' && cloud.user && navigator.onLine");
  expect(source).not.toContain("cloud.dirty || app.session");
  expect(source).toContain("else if(navigator.onLine)syncNow()");
  expect(source).toContain("Offline · changes pending and will sync automatically when connection returns.");
});


test('cloud sync excludes Mock Exams attempts from SRS counters and repairs contaminated state', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#statTotal')).toHaveText('405');
  await page.addScriptTag({content:'window.NEETPG_SUPABASE={};'});
  await page.addScriptTag({url:'/assets/auth-sync.js'});
  await expect.poll(()=>page.evaluate(()=>typeof window.NEETPG_CLOUD?.syncNow==='function')).toBe(true);

  const result=await page.evaluate(async()=>{
    const uid='sync-user', qid=app.questions[0].external_id, old='2026-09-20T10:00:00.000Z';
    const remote={
      question_state:[{user_id:uid,qid,attempts:2,correct:1,incorrect:1,last_correct:true,bookmarked:true,flagged:false,note:'keep me',due_at:null,interval_days:3,ease:2.4,streak:1,updated_at:old}],
      attempts:[
        {user_id:uid,client_key:'practice:'+qid+':1000:A',qid,correct:false,selected:'A',confidence:null,mistake:'',note:'',skipped:false,happened_at:'1970-01-01T00:00:01.000Z',elapsed_seconds:1,session_id:'practice-1',subject:'Medicine',difficulty:2,updated_at:old},
        {user_id:uid,client_key:'mock:'+qid+':2000:B',qid,correct:true,selected:'B',confidence:null,mistake:'',note:'',skipped:false,happened_at:'1970-01-01T00:00:02.000Z',elapsed_seconds:1,session_id:'mock-1',subject:'Medicine',difficulty:2,updated_at:old}
      ],
      study_sessions:[
        {user_id:uid,session_id:'practice-1',started_at:'1970-01-01T00:00:00.000Z',ended_at:'1970-01-01T00:00:03.000Z',question_count:1,correct_count:0,accuracy:0,mode:'smart',feedback:'instant',subjects:['Medicine'],payload:{},updated_at:old},
        {user_id:uid,session_id:'mock-1',started_at:'1970-01-01T00:00:00.000Z',ended_at:'1970-01-01T00:00:04.000Z',question_count:1,correct_count:1,accuracy:100,mode:'Mock · full',feedback:'exam',subjects:['Medicine'],payload:{},updated_at:old}
      ],
      user_settings:[],active_sessions:[]
    };
    const rows=(table,filters)=>remote[table].filter(row=>filters.every(([k,v])=>row[k]===v));
    const client={from(table){
      let filters=[];
      const q={
        select(){return q;},
        eq(k,v){filters.push([k,v]);return q;},
        order(){return q;},
        range(){return Promise.resolve({data:rows(table,filters),error:null});},
        maybeSingle(){return Promise.resolve({data:rows(table,filters)[0]||null,error:null});},
        upsert(input){
          for(const row of (Array.isArray(input)?input:[input])){
            const keys=table==='question_state'?['user_id','qid']:table==='attempts'?['user_id','client_key']:table==='study_sessions'?['user_id','session_id']:['user_id'];
            const i=remote[table].findIndex(x=>keys.every(k=>x[k]===row[k]));
            if(i>=0)remote[table][i]={...remote[table][i],...row};else remote[table].push({...row});
          }
          return Promise.resolve({data:null,error:null});
        },
        delete(){return q;},
        then(resolve){resolve({data:null,error:null});}
      };
      return q;
    }};

    for(const store of ['qstate','attempts','sessions','runtime'])await dbClear(store);
    const contaminated={...stateFor(qid),qid,attempts:2,correct:1,incorrect:1,lastCorrect:true,bookmarked:true,note:'keep me',dueAt:null,intervalDays:3,ease:2.4,streak:1,updatedAt:new Date(old).getTime()};
    await dbPut('qstate',contaminated);
    app.states.set(qid,contaminated);app.attempts=[];app.sessions=[];app.session=null;app.savedSession=null;
    localStorage.removeItem('neetpg2027-cloud-active-clear');

    Object.assign(NEETPG_CLOUD,{user:{id:uid,email:'sync@example.test'},client,dirty:true,changeVersion:1,error:null});
    await NEETPG_CLOUD.syncNow();

    const repaired=stateFor(qid), cloudRow=remote.question_state.find(x=>x.qid===qid);
    return {
      local:{attempts:repaired.attempts,correct:repaired.correct,incorrect:repaired.incorrect,lastCorrect:repaired.lastCorrect,streak:repaired.streak,bookmarked:repaired.bookmarked,note:repaired.note,intervalDays:repaired.intervalDays,ease:repaired.ease},
      remote:{attempts:cloudRow.attempts,correct:cloudRow.correct,incorrect:cloudRow.incorrect,lastCorrect:cloudRow.last_correct,streak:cloudRow.streak,bookmarked:cloudRow.bookmarked,note:cloudRow.note,intervalDays:cloudRow.interval_days,ease:cloudRow.ease},
      lastSyncAt:NEETPG_CLOUD.lastSyncAt,error:NEETPG_CLOUD.error||null
    };
  });

  expect(result.local).toEqual({attempts:1,correct:0,incorrect:1,lastCorrect:false,streak:0,bookmarked:true,note:'keep me',intervalDays:3,ease:2.4});
  expect(result.remote).toEqual({attempts:1,correct:0,incorrect:1,lastCorrect:false,streak:0,bookmarked:true,note:'keep me',intervalDays:3,ease:2.4});
  expect(result.lastSyncAt).toBeTruthy();
  expect(result.error).toBeNull();
});


test('initial cloud sync change counter is zero so a successful first sync settles cleanly', async ({ page }) => {
  await page.goto('/');
  const source=await page.evaluate(async()=>await (await fetch('/assets/auth-sync.js')).text());
  expect(source).toContain("dirty: false,\n    changeVersion: 0,\n    syncTimer: null,");
  expect(source).toContain("const pushVersion=cloud.changeVersion||0;");
  expect(source).toContain("cloud.dirty=cloud.changeVersion!==pushVersion");
});


test('cloud sync does not re-upload unchanged rows after an acknowledged push', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async()=>{
    const qid='sync-regression-question';
    const now=Date.now(),s=stateFor(qid),next={...s,qid,attempts:1,correct:1,incorrect:0,lastCorrect:true,updatedAt:now};
    await dbPut('qstate',next);app.states.set(qid,next);
  });
  await page.addScriptTag({content: `
    window.__syncUpserts=[];
    window.__syncRemote={profiles:[],question_state:[],attempts:[],study_sessions:[],user_settings:[],active_sessions:[]};
    const keysFor=table=>table==='question_state'?['user_id','qid']:table==='attempts'?['user_id','client_key']:table==='study_sessions'?['user_id','session_id']:table==='profiles'?['id']:['user_id'];
    const query=table=>{
      let filters=[];
      const rows=()=>window.__syncRemote[table].filter(row=>filters.every(([k,v])=>row[k]===v));
      const q={
        select(){return q},
        eq(k,v){filters.push([k,v]);return q},
        order(){return q},
        range(){return Promise.resolve({data:rows(),error:null})},
        maybeSingle(){return Promise.resolve({data:rows()[0]||null,error:null})}
      };
      return q;
    };
    window.NEETPG_SUPABASE={url:'https://example.supabase.co',anonKey:'public-test-key',redirectUrl:location.href,googleEnabled:false};
    window.supabase={createClient:()=>({
      from:(table)=>({
        select(){return query(table)},
        upsert:async(input)=>{
          const rows=Array.isArray(input)?input:[input];
          window.__syncUpserts.push({table,count:rows.length});
          const keys=keysFor(table);
          for(const row of rows){
            const i=window.__syncRemote[table].findIndex(x=>keys.every(k=>x[k]===row[k]));
            if(i>=0)window.__syncRemote[table][i]={...window.__syncRemote[table][i],...row};
            else window.__syncRemote[table].push({...row});
          }
          return {error:null};
        },
        delete(){const q=query(table);q.then=(resolve)=>resolve({error:null});return q}
      }),
      auth:{getSession:async()=>({data:{session:{user:{id:'sync-user',email:'sync@example.com'}}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}
    })};
  `});
  await page.addScriptTag({ url: '/assets/auth-sync.js' });
  await expect.poll(()=>page.evaluate(()=>window.NEETPG_CLOUD?.lastSyncAt||0),{timeout:15000}).toBeGreaterThan(0);
  const first=await page.evaluate(()=>window.__syncUpserts.filter(x=>x.table==='question_state').reduce((n,x)=>n+x.count,0));
  expect(first).toBeGreaterThan(0);
  const before=await page.evaluate(()=>window.NEETPG_CLOUD.lastSyncAt);
  await page.locator('#cloudSyncNow').evaluate(el=>el.click());
  await expect.poll(()=>page.evaluate(t=>window.NEETPG_CLOUD.lastSyncAt>t,before),{timeout:5000}).toBe(true);
  const second=await page.evaluate(()=>window.__syncUpserts.filter(x=>x.table==='question_state').reduce((n,x)=>n+x.count,0));
  expect(second).toBe(first);
});
