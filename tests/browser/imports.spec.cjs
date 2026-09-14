const {test, expect} = require('@playwright/test');
const question = (id, stem='Synthetic browser question: select Alpha.') => ({external_id:id,stem,options:[{text:'Alpha',is_correct:true},{text:'Beta',is_correct:false}]});
async function source(page, name) {
  await page.locator('#source-details').evaluate(el => {el.open = true;});
  await page.getByLabel('Source name', {exact:true}).fill(name);
  await page.getByRole('button', {name:'Save source',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Source saved. Choose your question file.');
}
async function upload(page, rows, filename='browser-questions.json') {
  await page.locator('#file').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(rows))});
  await page.getByRole('button', {name:'Preview questions'}).click();
  await expect(page.getByRole('status')).toContainText('Preview saved.');
}
async function confirm(page) {
  await page.getByRole('button', {name:'Review import summary'}).click();
  await expect(page.getByRole('button',{name:'Confirm import',exact:true})).toBeDisabled();
  await page.getByLabel('I’ve checked this batch').check();
  await page.getByRole('button',{name:'Confirm import',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Batch complete:');
}

test('upload, validate, reject duplicate, confirm, resume, and render untrusted text safely', async ({page}) => {
  await page.goto('/');
  await source(page, 'Browser synthetic source');
  await upload(page, [question('one','<img src=x onerror=alert(1)> Synthetic question'), question('two','<img src=x onerror=alert(1)> Synthetic question'), {external_id:'broken',stem:'Missing options'}]);
  await expect(page.getByRole('button',{name:'Review import summary'})).toBeDisabled();
  await expect(page.locator('.row-card img')).toHaveCount(0);
  await expect(page.locator('.row-card')).toHaveCount(3);
  const duplicate = page.locator('.row-card').nth(1);
  await duplicate.getByLabel('Decision note').fill('Same synthetic question in this batch');
  await duplicate.getByRole('button',{name:'Reject row',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('decision saved');
  await page.getByLabel('Show rows').selectOption('rejected');
  await expect(page.locator('.row-card')).toHaveCount(2);
  await confirm(page);
  await expect(page.getByRole('status')).toContainText('1 rows imported, 2 rejected');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('already complete');
  await expect(page.getByRole('button',{name:'Import complete',exact:true})).toBeDisabled();
  await expect(page.locator('.row-card').first()).toContainText('Saved as question #');
  await expect(page.locator('.row-card img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/tablet-import-review.png',fullPage:true});
});

test('inspect exact match and link occurrence without creating a new canonical question', async ({page,request}) => {
  const original = await (await request.post('/api/sources',{data:{name:'Original browser dataset',external_namespace:'browser.original',source_type:'dataset'}})).json();
  const batch = await (await request.post('/api/imports/preview',{data:{source_id:original.id,input_format:'json',input_name:'seed.json',content:JSON.stringify([question('seed','Unique test for linking a canonical question.')])}})).json();
  const imported = await (await request.post(`/api/imports/${batch.id}/commit`,{data:{}})).json();
  const questionId = imported.rows[0].question_id;
  await page.goto('/'); await source(page,'Second browser dataset');
  await upload(page,[question('linked','Unique test for linking a canonical question.')]);
  await expect(page.getByText('Exact match',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Link to this question'})).toBeDisabled();
  await page.getByRole('button',{name:'Inspect existing question'}).click();
  await expect(page.getByRole('heading',{name:`Existing question #${questionId}`})).toBeVisible();
  await page.getByLabel('Decision note').fill('Confirmed same content and answer');
  await page.getByRole('button',{name:'Link to this question'}).click();
  await expect(page.getByRole('status')).toContainText('decision saved');
  await confirm(page);
  const stored = await (await request.get(`/api/questions/${questionId}`)).json();
  expect(stored.occurrences).toHaveLength(2);
  await expect(page.locator('.row-card')).toContainText(`Saved as question #${questionId}`);
});

test('CSV upload, source form, malformed file recovery and mobile layout', async ({page}) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await source(page,'Mobile CSV source');
  await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{broken')});
  await page.getByRole('button',{name:'Preview questions'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  const options=JSON.stringify(question('csv').options).replaceAll('"','""');
  await page.locator('#file').setInputFiles({name:'valid.csv',mimeType:'text/csv',buffer:Buffer.from(`external_id,stem,options\ncsv1,A very different CSV example,"${options}"\n`)});
  await page.getByRole('button',{name:'Preview questions'}).click();
  await expect(page.getByRole('status')).toContainText('Preview saved');
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByRole('button',{name:'Preview questions'})).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/mobile-import-preview.png',fullPage:true});
});

test('pagination and search keep large previews usable', async ({page,request}) => {
  const source = await (await request.post('/api/sources',{data:{name:'Paging synthetic source',external_namespace:'browser.paging',source_type:'dataset'}})).json();
  const batch = await (await request.post('/api/imports/preview',{data:{source_id:source.id,input_format:'json',input_name:'paging.json',content:JSON.stringify(Array.from({length:21},(_,i)=>question(`paging-${i}`,`Synthetic page item ${i}`)))}})).json();
  await page.goto(`/#batch=${batch.id}`);
  await expect(page.locator('.row-card')).toHaveCount(15);
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.row-card')).toHaveCount(6);
  await page.getByLabel('Find a question').fill('paging-20');
  await expect(page.locator('.row-card')).toHaveCount(1);
  await expect(page.locator('#page-info')).toContainText('Page 1 of 1');
});
