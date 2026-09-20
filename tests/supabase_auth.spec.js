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


test('cloud sync polls remote changes while idle and deletes a finished active session', async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({content: `
    window.__syncCalls={selects:0,deletes:0};
    const chain=()=>({
      select(){window.__syncCalls.selects++;return this},eq(){return this},order(){return this},range:async()=>({data:[],error:null}),
      maybeSingle:async()=>({data:null,error:null}),upsert:async()=>({error:null}),
      delete(){window.__syncCalls.deletes++;return this},then(resolve){resolve({data:null,error:null})}
    });
    window.NEETPG_SUPABASE={url:'https://example.supabase.co',anonKey:'public-test-key',redirectUrl:location.href,googleEnabled:false};
    window.supabase={createClient:()=>({
      from:()=>chain(),
      auth:{
        getSession:async()=>({data:{session:{user:{id:'user-1',email:'sync@example.com'}}},error:null}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
      }
    })};
  `});
  await page.addScriptTag({ url: '/assets/auth-sync.js' });

  await expect.poll(()=>page.evaluate(()=>window.__syncCalls.selects),{timeout:5000}).toBeGreaterThan(0);
  const before=await page.evaluate(()=>window.__syncCalls.selects);
  await page.evaluate(()=>{
    window.NEETPG_CLOUD.dirty=false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(()=>page.evaluate(()=>window.__syncCalls.selects),{timeout:5000}).toBeGreaterThan(before);

  await page.evaluate(()=>{
    const now=Date.now();
    window.NEETPG_CLOUD.remoteActive={sessionId:'finished-session',payload:{qids:['q1']},updatedAt:new Date(now-1000).toISOString()};
    localStorage.setItem('neetpg2027-cloud-active-clear',JSON.stringify({sessionId:'finished-session',finishedAt:now}));
    window.dispatchEvent(new CustomEvent('neetpg:progress-saved'));
  });
  await expect.poll(()=>page.evaluate(()=>window.__syncCalls.deletes),{timeout:6000}).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('neetpg2027-cloud-active-clear')),{timeout:6000}).toBeNull();
});
