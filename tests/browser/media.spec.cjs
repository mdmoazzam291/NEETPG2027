const {test, expect} = require('@playwright/test');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n1cAAAAASUVORK5CYII=';

async function createQuestion(request) {
  const sourceResponse = await request.post('/api/sources', {data:{name:'Browser media source', external_namespace:'browser.media', source_type:'dataset'}});
  expect(sourceResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();
  const rows = [{external_id:'browser-media-001', stem:'Synthetic browser media question: select Alpha.',
    options:[{label:'A', text:'Alpha', is_correct:true}, {label:'B', text:'Beta', is_correct:false}]}];
  const previewResponse = await request.post('/api/imports/preview', {data:{source_id:source.id, input_format:'json', input_name:'browser-media.json', content:JSON.stringify(rows)}});
  expect(previewResponse.ok()).toBeTruthy();
  const preview = await previewResponse.json();
  const commitResponse = await request.post(`/api/imports/${preview.id}/commit`);
  expect(commitResponse.ok()).toBeTruthy();
  const committed = await commitResponse.json();
  return committed.rows[0].question_id;
}

test('attach a validated image to a question option and display it on tablet', async ({page, request}) => {
  const questionId = await createQuestion(request);
  await page.goto(`/media?question=${questionId}`);
  await expect(page.getByRole('heading', {name:'Question media'})).toBeVisible();
  await expect(page.locator('#question-stem')).toContainText('Synthetic browser media question');

  await page.locator('#media-file').setInputFiles({name:'pixel.png', mimeType:'image/png', buffer:Buffer.from(PNG, 'base64')});
  await page.locator('#media-type').selectOption('diagram');
  await page.locator('#media-target').selectOption({index:1});
  await page.locator('#media-alt').fill('Synthetic one-pixel diagnostic diagram');
  await page.locator('#media-caption').fill('Browser regression asset');
  await page.getByRole('button', {name:'Attach image'}).click();

  await expect(page.getByRole('status')).toHaveText('Image attached to question.');
  await expect(page.locator('.media-card')).toHaveCount(1);
  await expect(page.locator('.media-card img')).toHaveAttribute('alt', 'Synthetic one-pixel diagnostic diagram');
  await expect(page.locator('.media-card')).toContainText('option A');

  const stored = await (await request.get(`/api/questions/${questionId}/media`)).json();
  expect(stored).toHaveLength(1);
  expect(stored[0].media_type).toBe('diagram');
  expect(stored[0].question_option_id).not.toBeNull();
  const content = await request.get(stored[0].content_url);
  expect(content.ok()).toBeTruthy();
  expect(content.headers()['content-type']).toContain('image/png');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/tablet-question-media.png', fullPage:true});
});

test('question media workspace fits mobile', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await page.goto('/media');
  await expect(page.getByRole('heading', {name:'Question media'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
