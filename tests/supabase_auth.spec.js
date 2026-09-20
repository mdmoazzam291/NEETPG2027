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


test('cloud sync does not re-upload unchanged local rows after a successful push', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async()=>{
    const now=Date.now();
    const s=stateFor(app.questions[0].id);
    const next={...s,attempts:1,correct:1,incorrect:0,lastCorrect:true,updatedAt:now};
    await dbPut('qstate',next);app.states.set(next.qid,next);
  });
  await page.addScriptTag({content: `
    window.__syncUpserts=[];
    const query=()=>{const q={select(){return q},eq(){return q},order(){return q},range(){return Promise.resolve({data:[],error:null})},maybeSingle(){return Promise.resolve({data:null,error:null})}};return q;};
    window.NEETPG_SUPABASE={url:'https://example.supabase.co',anonKey:'public-test-key',redirectUrl:location.href,googleEnabled:false};
    window.supabase={createClient:()=>({
      from:(table)=>({select(){return query()},upsert:async(rows)=>{window.__syncUpserts.push({table,count:Array.isArray(rows)?rows.length:1});return {error:null}},delete(){const q=query();q.eq=()=>Promise.resolve({error:null});return q}}),
      auth:{getSession:async()=>({data:{session:{user:{id:'sync-user',email:'sync@example.com'}}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({error:null})}
    })};
  `});
  await page.addScriptTag({ url: '/assets/auth-sync.js' });
  await expect.poll(()=>page.evaluate(()=>window.NEETPG_CLOUD?.lastSyncAt||0),{timeout:15000}).toBeGreaterThan(0);
  const first=await page.evaluate(()=>window.__syncUpserts.filter(x=>x.table==='question_state').reduce((n,x)=>n+x.count,0));
  expect(first).toBeGreaterThan(0);
  await page.click('#cloudSyncNow');
  await expect.poll(()=>page.evaluate(()=>window.NEETPG_CLOUD?.syncing===false)).toBe(true);
  await page.waitForTimeout(100);
  const second=await page.evaluate(()=>window.__syncUpserts.filter(x=>x.table==='question_state').reduce((n,x)=>n+x.count,0));
  expect(second).toBe(first);
});
