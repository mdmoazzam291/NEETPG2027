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


test('cloud sync deletes a finished active session instead of resurrecting it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#statTotal')).toHaveText('405');

  const remoteUpdated=new Date(Date.now()-5000).toISOString();
  await page.addScriptTag({content: `
    window.__syncDeletes=[];
    window.__remoteActive={session_id:'finished-session',payload:{sessionId:'finished-session',qids:['q1'],pos:0,savedAt:${Date.now()-5000}},updated_at:'${remoteUpdated}'};
    const emptyRows=()=>({range:async()=>({data:[],error:null})});
    const table=name=>({
      select(){
        if(name==='profiles')return {eq:()=>({maybeSingle:async()=>({data:{display_name:'Tester',daily_goal:50,updated_at:new Date().toISOString()},error:null})})};
        if(name==='question_state'||name==='attempts'||name==='study_sessions')return {eq:()=>({order:()=>emptyRows()})};
        if(name==='user_settings')return {eq:()=>({maybeSingle:async()=>({data:null,error:null})})};
        if(name==='active_sessions')return {eq:()=>({maybeSingle:async()=>({data:window.__remoteActive,error:null})})};
      },
      upsert:async()=>({error:null}),
      delete(){
        const filters={};
        return {eq(key,value){filters[key]=value;return {eq:async(key2,value2)=>{filters[key2]=value2;window.__syncDeletes.push(filters);window.__remoteActive=null;return {error:null};}}}};
      }
    });
    window.NEETPG_SUPABASE={url:'https://example.supabase.co',anonKey:'public-test-key',redirectUrl:location.href,googleEnabled:false};
    window.supabase={createClient:()=>({from:table,auth:{
      getSession:async()=>({data:{session:{user:{id:'sync-user',email:'sync@example.com'}}},error:null}),
      onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signOut:async()=>({error:null})
    }})};
  `});
  await page.addScriptTag({ url: '/assets/auth-sync.js' });

  await expect.poll(()=>page.evaluate(()=>window.NEETPG_CLOUD?.lastSyncAt||0),{timeout:10000}).toBeGreaterThan(0);
  await page.evaluate(() => {
    localStorage.setItem('neetpg2027-cloud-active-clear',JSON.stringify({sessionId:'finished-session',finishedAt:Date.now()}));
    window.dispatchEvent(new CustomEvent('neetpg:progress-saved'));
  });
  await page.click('[data-view="settings"]');
  await page.click('#cloudSyncNow');

  await expect.poll(()=>page.evaluate(()=>window.__syncDeletes.length),{timeout:10000}).toBe(1);
  const deleted=await page.evaluate(()=>window.__syncDeletes[0]);
  expect(deleted).toEqual({user_id:'sync-user',session_id:'finished-session'});
  expect(await page.evaluate(()=>localStorage.getItem('neetpg2027-cloud-active-clear'))).toBeNull();
  expect(await page.evaluate(()=>window.__remoteActive)).toBeNull();
});
