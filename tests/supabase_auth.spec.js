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


test('cloud sync deletes a finished active-session row instead of resurrecting it', async ({ page }) => {
  await page.goto('/');
  const source=await page.evaluate(async()=>await (await fetch('/assets/auth-sync.js')).text());
  expect(source).toContain("from('active_sessions').delete().eq('user_id',cloud.user.id).eq('session_id',clearIntent.sessionId)");
  expect(source).not.toContain("typeof cloud.clearActiveSession==='function'");
});


test('cloud sync hardening prevents reconciliation retry loops and preserves mock metadata', async ({ page }) => {
  await page.goto('/');
  const source=await page.evaluate(async()=>await (await fetch('/assets/auth-sync.js')).text());
  expect(source).toContain("cloud.dirty=false;cloud.error=null;cloud.lastSyncAt=Date.now()");
  expect(source).toContain("cloud.remoteQUpdated.set(row.qid,ms(row.updated_at))");
  expect(source).toContain("cloud.remoteAttemptUpdated.set(row.client_key,ms(row.updated_at||row.happened_at))");
  expect(source).toContain("cloud.remoteSessionUpdated.set(row.session_id,ms(row.updated_at))");
  expect(source).toContain("cloud.remoteSettingsUpdated=localSettingsUpdated");
  expect(source).toContain("payload:{score:Number.isFinite(Number(s.score))?Number(s.score):null,source:s.mode?.startsWith('Mock · ')?'exam-simulator':'study'}");
  expect(source).toContain("score:Number.isFinite(Number(payload.score))?Number(payload.score):undefined");
});
