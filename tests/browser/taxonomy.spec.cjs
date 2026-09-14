const {test, expect} = require('@playwright/test');

test('create integrated taxonomy, edit topic links, archive safely, and fit tablet', async ({page, request}) => {
  await page.goto('/taxonomy');
  await expect(page.getByRole('heading', {name:'Taxonomy'})).toBeVisible();

  await page.getByLabel('Name', {exact:true}).first().fill('Browser Medicine');
  await page.getByLabel('Code').fill('BMED');
  await page.getByRole('button', {name:'Add subject'}).click();
  await expect(page.getByRole('status')).toHaveText('Subject saved.');

  await page.locator('#system-name').fill('Browser Cardiovascular');
  await page.getByRole('button', {name:'Add system'}).click();
  await expect(page.getByRole('status')).toHaveText('System saved.');

  await page.locator('#link-subject').selectOption({index:1});
  await page.locator('#link-system').selectOption({index:1});
  await page.getByRole('button', {name:'Link subject & system'}).click();
  await expect(page.getByRole('status')).toHaveText('Subject and system linked.');

  await page.locator('#topic-name').fill('Browser acute coronary syndrome');
  await page.getByLabel('Browser Medicine').check();
  await page.getByLabel('Browser Cardiovascular').check();
  await page.getByRole('button', {name:'Add topic'}).click();
  await expect(page.getByRole('status')).toHaveText('Topic saved.');

  await page.locator('#subtopic-topic').selectOption({index:1});
  await page.locator('#subtopic-name').fill('Browser STEMI reperfusion');
  await page.getByRole('button', {name:'Add subtopic'}).click();
  await expect(page.getByRole('status')).toHaveText('Subtopic saved.');
  await expect(page.locator('#catalogue')).toContainText('Browser STEMI reperfusion');

  const topicCard = page.locator('.topic-card').filter({hasText:'Browser acute coronary syndrome'});
  await topicCard.getByRole('button', {name:'Edit'}).click();
  await expect(page.getByRole('status')).toContainText('Editing topic');
  await page.getByLabel('Browser Cardiovascular').uncheck();
  await page.getByRole('button', {name:'Save topic changes'}).click();
  await expect(page.getByRole('status')).toHaveText('Topic updated.');

  const refreshedCard = page.locator('.topic-card').filter({hasText:'Browser acute coronary syndrome'});
  await expect(refreshedCard).not.toContainText('System: Browser Cardiovascular');
  await refreshedCard.getByRole('button', {name:'Archive'}).click();
  await expect(page.getByRole('status')).toHaveText('Topic archived.');
  await expect(page.locator('.topic-card.archived').filter({hasText:'Browser acute coronary syndrome'})).toBeVisible();

  const snapshot = await (await request.get('/api/taxonomy')).json();
  const stored = snapshot.topics.find(topic => topic.name === 'Browser acute coronary syndrome');
  expect(stored.lifecycle_status).toBe('archived');
  expect(stored.system_ids).toHaveLength(0);
  expect(stored.subtopics).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({path:'test-results/tablet-taxonomy.png', fullPage:true});
});

test('taxonomy remains usable on mobile', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await page.goto('/taxonomy');
  await expect(page.getByRole('heading', {name:'Taxonomy'})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
