const {test,expect}=require('@playwright/test');
test('production shell loads all scripts, preserves answers after reload and paginates',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('body')).toHaveAttribute('data-v4ready','1');
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
test('production mobile themes have no horizontal overflow and target date persists',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#continueLearning')).toBeVisible();
  await expect(page.locator('.mobile-bottom button')).toHaveCount(5);
  for(let n=0;n<2;n++){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.click('#themeToggle')}
  await page.click('#editTarget');await page.fill('#targetDate','2027-09-01');await page.locator('#targetForm button').click();await page.reload();await expect(page.locator('#v4ExamCountdown')).toHaveAttribute('data-target','2027-09-01');
});
test('reimporting a backup does not duplicate attempts',async({page})=>{
  await page.goto('/');await expect(page.locator('#continueLearning')).toBeVisible();
  const counts=await page.evaluate(async()=>{const data={qstate:[],attempts:[{qid:app.questions[0].external_id,sessionId:'backup-test',ts:123456,selected:'A',correct:false}],sessions:[],custom:[]};const f=new File([JSON.stringify(data)],'backup.json');await importBackupFile(f);const before=app.attempts.length;await importBackupFile(f);return [before,app.attempts.length]});expect(counts).toEqual([1,1]);
});
