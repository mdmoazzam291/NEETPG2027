const {test, expect} = require('@playwright/test');

async function createStudyQuestion(request) {
  const sourceResponse = await request.post('/api/sources', {data:{name:'Browser study source', external_namespace:'browser.study', source_type:'dataset'}});
  expect(sourceResponse.ok()).toBeTruthy();
  const source = await sourceResponse.json();
  const rows = [{
    external_id:'browser-study-001',
    stem:'A fictional study compass points east. Which synthetic option is intentionally correct?',
    answer_explanation:'East is the intentional synthetic answer for this browser test.',
    reference_text:'Synthetic browser study fixture',
    options:[{label:'A', text:'East', is_correct:true}, {label:'B', text:'West', is_correct:false}]
  }];
  const previewResponse = await request.post('/api/imports/preview', {data:{source_id:source.id, input_format:'json', input_name:'browser-study.json', content:JSON.stringify(rows)}});
  expect(previewResponse.ok()).toBeTruthy();
  const preview = await previewResponse.json();
  const commitResponse = await request.post(`/api/imports/${preview.id}/commit`);
  expect(commitResponse.ok()).toBeTruthy();
  const committed = await commitResponse.json();
  return committed.rows[0].question_id;
}

test('solve without pre-answer leakage, reveal, classify miss, and record history', async ({page, request}) => {
  const questionId = await createStudyQuestion(request);
  const safe = await (await request.get(`/api/study/questions/${questionId}`)).json();
  expect(safe.options[0].is_correct).toBeUndefined();
  expect(safe.answer_explanation).toBeUndefined();
  const bookmark = await request.put(`/api/study/questions/${questionId}/bookmark`);
  expect(bookmark.ok()).toBeTruthy();

  await page.goto('/study');
  await expect(page.getByRole('heading', {name:'Study session'})).toBeVisible();
  await page.locator('#study-mode').selectOption('bookmarked');
  await page.locator('#session-size').selectOption('5');
  await page.getByRole('button', {name:'Start session'}).click();
  await expect(page.locator('#stem')).toContainText('fictional study compass');
  await expect(page.locator('.answer-option.correct-option')).toHaveCount(0);
  await expect(page.locator('#result')).toBeHidden();

  await page.locator('.answer-option').nth(1).click();
  await page.locator('input[name="confidence"][value="2"] + span').click();
  await page.getByRole('button', {name:'Lock answer'}).click();
  await expect(page.locator('#result-title')).toHaveText('Incorrect');
  await expect(page.locator('#explanation')).toContainText('East is the intentional synthetic answer');
  await expect(page.locator('.answer-option.correct-option')).toHaveCount(1);
  await expect(page.locator('.answer-option.selected-wrong')).toHaveCount(1);

  await page.locator('#mistake-category').selectOption('confused_options');
  await page.locator('#attempt-note').fill('Synthetic browser reflection');
  await page.getByRole('button', {name:'Save reflection'}).click();
  await expect(page.getByRole('status')).toHaveText('Reflection saved.');
  await expect(page.locator('#history .attempt-row').first()).toContainText('incorrect');

  const history = await (await request.get('/api/study/history?limit=5')).json();
  expect(history[0].question_id).toBe(questionId);
  expect(history[0].mistake_category).toBe('confused_options');
  expect(history[0].user_notes).toBe('Synthetic browser reflection');
  expect(history[0].confidence).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/tablet-study-session.png', fullPage:true});
});

test('study workspace fits mobile', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await page.goto('/study');
  await expect(page.getByRole('heading', {name:'Study session'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
