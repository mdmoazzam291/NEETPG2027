const { test, expect } = require('@playwright/test');

test.describe('NeuralVault V1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/neuralvault/');
    await page.evaluate(() => localStorage.removeItem('neuralvault:v1'));
    await page.reload();
  });

  test('loads a portable markdown vault and persists edits', async ({ page }) => {
    await expect(page.locator('.brand')).toContainText('NeuralVault');
    await expect(page.locator('#noteCount')).toContainText('5 notes');

    await page.locator('#newNoteBtn').click();
    await page.locator('#titleInput').fill('Heart Failure');
    await page.locator('#editor').fill(
      '---\ntype: disease\nsubject: Medicine\nsystem: Cardiovascular\n---\n\n# Heart Failure\n\nRelated to [[Myocardial Infarction]].\n\n#cardiology'
    );

    await expect(page.locator('#wordCount')).not.toContainText('0 words');
    await page.locator('[data-view="preview"]').click();
    await expect(page.locator('#preview')).toContainText('Heart Failure');
    await expect(page.locator('#preview .wiki-link')).toContainText('Myocardial Infarction');

    await page.reload();
    await expect(page.locator('#titleInput')).toHaveValue('Heart Failure');
    await expect(page.locator('#editor')).toHaveValue(/Myocardial Infarction/);
  });

  test('creates backlinks and renders the knowledge graph', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await expect(page.locator('#backlinkCount')).not.toHaveText('0');

    await page.locator('[data-view="graph"]').click();
    await expect(page.locator('#graphStats')).toContainText('nodes');
    await expect(page.locator('#graphSvg .graph-node')).toHaveCount(5);
    await expect(page.locator('#graphSvg .graph-edge').first()).toBeVisible();
  });

  test('supports the command palette and mobile sidebar controls', async ({ page }) => {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
    await expect(page.locator('#paletteBackdrop')).toBeVisible();
    await page.locator('#paletteInput').fill('graph');
    await expect(page.locator('.palette-item').first()).toContainText('Open graph');
    await page.keyboard.press('Escape');
    await expect(page.locator('#paletteBackdrop')).toBeHidden();
  });
});
