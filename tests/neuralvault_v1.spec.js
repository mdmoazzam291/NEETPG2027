const { test, expect } = require('@playwright/test');

test.describe('NeuralVault durable knowledge layer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/neuralvault/');
    await page.evaluate(async () => {
      localStorage.removeItem('neuralvault:v1');
      if (window.NeuralVaultDB) await window.NeuralVaultDB.clear();
    });
    await page.reload();
    await expect(page.locator('#noteCount')).toContainText('5 notes');
  });

  test('persists markdown through IndexedDB even when the localStorage cache is removed', async ({ page }) => {
    await page.locator('#newNoteBtn').click();
    await page.locator('#titleInput').fill('Heart Failure');
    await page.locator('#editor').fill(
      '---\ntype: disease\nsubject: Medicine\nsystem: Cardiovascular\n---\n\n# Heart Failure\n\nRelated to [[Myocardial Infarction]].\n\n#cardiology'
    );

    await page.keyboard.press('Control+S');
    await expect(page.locator('#storageStatus')).toContainText('IndexedDB');

    await page.evaluate(() => localStorage.removeItem('neuralvault:v1'));
    await page.reload();

    await expect(page.locator('#titleInput')).toHaveValue('Heart Failure');
    await expect(page.locator('#editor')).toHaveValue(/Myocardial Infarction/);
    await expect(page.locator('#noteCount')).toContainText('6 notes');
  });

  test('keeps wiki links rename-safe and exposes outgoing/backlinks', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await expect(page.locator('#backlinkCount')).not.toHaveText('0');
    await expect(page.locator('#outgoingCount')).not.toHaveText('0');

    await page.locator('#titleInput').fill('Acute MI');
    await page.locator('#editor').click();

    await page.locator('.note-row', { hasText: 'Acute Coronary Syndrome' }).click();
    await expect(page.locator('#editor')).toHaveValue(/\[\[Acute MI\]\]/);
  });

  test('renders the graph and provides recoverable note history', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('#editor').fill('# Myocardial Infarction\n\nEdited content.\n\n[[Troponin]]');
    await page.waitForTimeout(350);

    await page.locator('[data-view="graph"]').click();
    await expect(page.locator('#graphSvg .graph-node')).toHaveCount(5);
    await expect(page.locator('#graphSvg .graph-edge').first()).toBeVisible();

    await page.locator('#moreBtn').click();
    await page.locator('[data-action="history-note"]').click();
    await expect(page.locator('#historyBackdrop')).toBeVisible();
    await expect(page.locator('.history-row').first()).toBeVisible();
  });

  test('matches a note to the existing PYQ bank and deep-links into single-question practice', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-context="medical"]').click();

    const first = page.locator('#medicalQuestions .medical-question').first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await expect(first).toHaveAttribute('href', /nvq=/);

    await first.click();
    await expect(page.locator('#practiceShell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#qStem')).not.toHaveText('');
    await expect(page).not.toHaveURL(/nvq=/);
  });

  test('supports command palette and creates unresolved linked notes', async ({ page }) => {
    await page.keyboard.press('Control+K');
    await expect(page.locator('#paletteBackdrop')).toBeVisible();
    await page.locator('#paletteInput').fill('PYQ');
    await expect(page.locator('.palette-item').first()).toContainText('matched PYQs');
    await page.keyboard.press('Escape');

    await page.locator('#newNoteBtn').click();
    await page.locator('#editor').fill('# Test\n\n[[Brand New Concept]]');
    await page.waitForTimeout(300);
    await page.locator('[data-context="backlinks"]').click();
    await page.locator('#outgoingLinks [data-note-title="Brand New Concept"]').click();
    await expect(page.locator('#titleInput')).toHaveValue('Brand New Concept');
  });

  test('renders transparent learning intelligence and mastery graph mode', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-context="intelligence"]').click();

    await expect(page.locator('#insightMetrics .insight-metric')).toHaveCount(4, { timeout: 15000 });
    await expect(page.locator('#insightAction')).not.toHaveText('');
    await expect(page.locator('#insightBand')).not.toHaveText('…');

    await page.locator('[data-view="graph"]').click();
    await page.locator('#graphMode').selectOption('mastery');
    await expect(page.locator('#graphLegend')).toBeVisible();
    await expect(page.locator('#graphStats')).toContainText('measured', { timeout: 15000 });
    await expect(page.locator('#graphSvg .graph-node').first()).toHaveClass(/mastery-/);
  });

  test('searches vault plus PYQs and starts matched concept practice', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-context="intelligence"]').click();

    await page.locator('#vaultQuery').fill('myocardial infarction');
    await page.locator('#vaultQueryForm button[type="submit"]').click();
    await expect(page.locator('#evidenceSummary')).toContainText('PYQ', { timeout: 15000 });
    await expect(page.locator('#evidenceResults .evidence-result').first()).toBeVisible();
    await expect(page.locator('#copyContextBtn')).toBeVisible();

    const practice = page.locator('#insightAction a');
    await expect(practice).toBeVisible({ timeout: 15000 });
    await practice.click();

    await expect(page.locator('#practiceShell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#qStem')).not.toHaveText('');
    await expect(page).not.toHaveURL(/nvpractice=/);
  });

});
