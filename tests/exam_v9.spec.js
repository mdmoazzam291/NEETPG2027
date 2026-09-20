const {test,expect}=require('@playwright/test');
const {fixture,connect,begin}=require('./helpers/exam_fixture.cjs');
test('strict full mock saves all five palette states and never exits early',async({context,page})=>{
 await fixture(context);await connect(page);await begin(page);
 await expect(page.locator('.exam9-q')).toHaveCount(36);await expect(page.locator('#exam9SubmitSection')).toHaveCount(0);await expect(page.locator('#exam9Previous')).toBeDisabled();
 await page.check('#exam9Option1');await expect(page.locator('.exam9-option.selected')).toHaveCount(1);await page.click('#exam9Mark');
 await expect(page.locator('#exam9QuestionTitle')).toHaveText('Question 2 of 36');await expect(page.locator('.exam9-q.answered-review')).toHaveCount(1);
 await page.click('#exam9Previous');await page.click('#exam9Clear');await expect(page.locator('.exam9-q.review')).toHaveCount(1);
 await page.locator('[data-pos="35"]').click();await page.click('#exam9Save');await expect(page.locator('#exam9QuestionTitle')).toHaveText('Question 36 of 36');await expect(page.locator('#exam9HeaderSub')).toContainText('SECTION A');
 await expect(page.locator('#exam9Body')).not.toContainText('Medicine');await expect(page.locator('#exam9Body')).not.toContainText('Test explanation');
});
test('refresh recovery, stale tab, offline failure and full 210-minute lifecycle',async({context,page})=>{
 const server=await fixture(context);await connect(page);await begin(page);await page.check('#exam9Option0');await expect.poll(()=>server.get().responses[0].selected).toBe('A');
 await page.click('#exam9Close');await page.getByRole('button',{name:'EXIT ANYWAY'}).click();await connect(page);await page.click('#exam9Resume');await expect(page.locator('#exam9Option0')).toBeChecked();
 server.offline(true);await page.check('#exam9Option1');await expect(page.locator('#exam9Notice')).toContainText('Save not confirmed');server.offline(false);await page.click('#exam9Retry');
 for(let section=1;section<=4;section++){server.advance(section*2520+1);await page.click('#exam9Retry');await expect(page.locator('#exam9HeaderSub')).toContainText(`SECTION ${String.fromCharCode(65+section)}`);await expect(page.locator('#exam9Previous')).toBeDisabled();}
 server.advance(12600);await page.click('#exam9Retry');await expect(page.locator('.exam9-score')).toContainText('4 / 720');await expect(page.locator('#exam9Analysis')).toContainText('Section-wise marks');
 await expect.poll(()=>page.evaluate(async()=>(await dbAll('sessions')).length)).toBe(1);await page.click('#exam9SyncResult');expect(await page.evaluate(async()=>(await dbAll('attempts')).length)).toBe(180);
 await page.locator('[data-review="unattempted"]').click();await page.click('#exam9AddRevision');await expect(page.locator('#exam9Notice')).toContainText('Saved');
});
test('failed saves never masquerade as confirmed responses',async({context,page})=>{
 const server=await fixture(context);await connect(page);await begin(page);
 await page.check('#exam9Option0');await expect.poll(()=>server.get().responses[0].selected).toBe('A');
 server.offline(true);await page.check('#exam9Option1');
 await expect(page.locator('#exam9SaveStatus')).toHaveText('Not confirmed');
 await expect(page.locator('#exam9Notice')).toContainText('Save not confirmed');
 await expect(page.locator('#exam9Option0')).toBeChecked();
 await expect(page.locator('#exam9Option1')).not.toBeChecked();
 server.offline(false);await page.click('#exam9Retry');await expect(page.locator('#exam9SaveStatus')).toHaveText('Saved');
 await page.locator('[data-pos="35"]').click();server.offline(true);await page.click('#exam9Save');
 await expect(page.locator('#exam9Notice')).toContainText('Save not confirmed');
 await expect(page.locator('#exam9Notice')).not.toContainText('last question');
 await expect(page.locator('#exam9SaveStatus')).toHaveText('Not confirmed');
});

test('two tabs reject stale versions and reconcile an 85-minute absence',async({context,page})=>{
 const server=await fixture(context);await connect(page);await begin(page);const second=await context.newPage();await connect(second);await second.click('#exam9Resume');
 await page.check('#exam9Option0');await expect.poll(()=>server.get().responses[0].selected).toBe('A');await second.click('#exam9Retry');await expect(second.locator('#exam9Option0')).toBeChecked();
 server.advance(5100);await second.click('#exam9Retry');await expect(second.locator('#exam9HeaderSub')).toContainText('SECTION C');await expect(second.locator('#exam9Clock')).toHaveText('41:00');
});
for(const [width,height] of [[360,740],[430,932],[768,1024],[1024,768],[1280,720],[1366,768],[1440,900],[1920,1080]])test(`exam layout ${width}x${height} in light and dark`,async({context,page})=>{
 await page.setViewportSize({width,height});await fixture(context);await connect(page);await begin(page);
 for(const theme of ['light','dark']){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  expect(await page.locator('#exam9Backdrop').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator('#exam9Save')).toBeInViewport();await expect(page.locator('#exam9Clock')).toBeInViewport();
  if(width<=768){await page.click('#exam9PaletteToggle');await expect(page.locator('#exam9Side')).toBeVisible();await page.click('#exam9PaletteClose');}
  await page.screenshot({path:test.info().outputPath(`exam-${theme}.png`)});
 }
});
