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


test('cloud sync does not loop when pull reconciliation changes local state', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({content: `
    (() => {
      const now=new Date().toISOString();
      const user={id:'sync-user',email:'sync@example.test',user_metadata:{}};
      const tables={
        profiles:[{id:user.id,display_name:'Sync Test',target_exam:'NEET-PG 2027',daily_goal:50,updated_at:now}],
        question_state:[],
        attempts:[{user_id:user.id,client_key:'remote:sync-q:1000:A',qid:'sync-q',correct:true,selected:'A',confidence:null,mistake:'',note:'',skipped:false,happened_at:new Date(1000).toISOString(),elapsed_seconds:5,session_id:'remote',subject:'Medicine',difficulty:2,updated_at:now}],
        study_sessions:[],user_settings:[],active_sessions:[]
      };
      function builder(table){
        let filters={};
        const api={
          select(){return api;},eq(k,v){filters[k]=v;return api;},order(){return api;},range(from,to){const rows=(tables[table]||[]).filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v));return Promise.resolve({data:rows.slice(from,to+1),error:null});},
          maybeSingle(){const rows=(tables[table]||[]).filter(r=>Object.entries(filters).every(([k,v])=>r[k]===v));return Promise.resolve({data:rows[0]||null,error:null});},
          upsert(rows){window.__syncWrites=(window.__syncWrites||0)+1;return Promise.resolve({data:Array.isArray(rows)?rows:[rows],error:null});},
          delete(){return {eq:async()=>({error:null})}}
        };return api;
      }
      window.__syncWrites=0;
      window.NEETPG_SUPABASE={url:'https://example.supabase.co',anonKey:'public-test-key',redirectUrl:location.href,googleEnabled:false};
      window.supabase={createClient:()=>({from:builder,auth:{getSession:async()=>({data:{session:{user}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}})};
    })();
  `});
  await page.addScriptTag({url:'/assets/auth-sync.js'});
  await expect.poll(()=>page.evaluate(()=>window.NEETPG_CLOUD?.lastSyncAt||0),{timeout:10000}).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>app.attempts.some(a=>a.qid==='sync-q')),{timeout:5000}).toBe(true);
  await page.waitForTimeout(1200);
  const state=await page.evaluate(()=>({dirty:NEETPG_CLOUD.dirty,syncing:NEETPG_CLOUD.syncing,writes:window.__syncWrites,lastSyncAt:NEETPG_CLOUD.lastSyncAt}));
  expect(state.dirty).toBe(false);
  expect(state.syncing).toBe(false);
  expect(state.writes).toBeLessThan(8);
  expect(state.lastSyncAt).toBeGreaterThan(0);
});
