const { test, expect } = require('@playwright/test');

test.describe('NeuralVault durable knowledge layer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/neuralvault/');
    await page.evaluate(async () => {
      localStorage.removeItem('neuralvault:v1');
      localStorage.removeItem('neuralvault:brain-provider-v1');
      sessionStorage.removeItem('neuralvault:brain-gateway-token');
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
    await expect(page).not.toHaveURL(/nvqs=/);
  });


  test('uses the study progress mirror for evidence scoring when no study DB is available', async ({ page }) => {
    const metrics = await page.evaluate(async () => {
      const note = {
        title: 'Myocardial Infarction',
        content: '# Myocardial Infarction',
        properties: { subject: 'Medicine', system: 'Cardiovascular' }
      };
      const first = (await window.NeuralVaultMedical.match(note, 1))[0];
      if (!first) throw new Error('Expected at least one matched PYQ');
      localStorage.setItem('neetpg2027:qstate-mirror', JSON.stringify([
        { qid: first.q.external_id, attempts: 2, correct: 1, incorrect: 1, lastCorrect: false }
      ]));
      const s = await window.NeuralVaultMedical.summary(note);
      return { attempted: s.attempted, accuracy: s.accuracy, coverage: s.coverage, readiness: s.readiness };
    });

    expect(metrics.attempted).toBe(1);
    expect(metrics.accuracy).toBe(50);
    expect(metrics.readiness).toBe(Math.round((metrics.accuracy * 0.70) + (metrics.coverage * 0.30)));
  });


  test('Brain answers from the current note with clickable grounded citations', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-view="brain"]').click();
    await expect(page.locator('#brainCurrentNote')).toHaveText('Myocardial Infarction');
    await page.locator('#brainScope').selectOption('current');
    await page.locator('#brainInput').fill('Explain this concept using my vault.');
    await page.locator('#brainForm').evaluate(form => form.requestSubmit());

    const answer = page.locator('#brainThread .brain-message.assistant').last();
    await expect(answer).toContainText('Current note · Myocardial Infarction', { timeout: 15000 });
    await expect(answer).toContainText(/myocardial/i);
    await expect(answer.locator('[data-brain-note="mi"]').first()).toBeVisible();
    await expect(page.locator('#brainCopyPrompt')).toBeVisible();
  });

  test('Brain exposes exact PYQ evidence and one-tap matched practice', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-view="brain"]').click();
    await page.locator('[data-brain-prompt="Which PYQs test this concept?"]').click();

    const answer = page.locator('#brainThread .brain-message.assistant').last();
    await expect(answer).toContainText('PYQ evidence · Myocardial Infarction', { timeout: 15000 });
    const practice = answer.locator('.brain-action-link.primary');
    await expect(practice).toHaveAttribute('href', /nvqs=/);

    await practice.click();
    await expect(page.locator('#practiceShell')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#qStem')).not.toHaveText('');
    await expect(page).not.toHaveURL(/nvqs=/);
  });

  test('Brain can rank the next study target from retrieval evidence', async ({ page }) => {
    await page.locator('[data-view="brain"]').click();
    await page.locator('[data-brain-prompt="What should I study next?"]').click();

    const answer = page.locator('#brainThread .brain-message.assistant').last();
    await expect(answer).toContainText('Next best study target', { timeout: 15000 });
    await expect(answer.locator('.brain-source-chip').first()).toBeVisible();
    await expect(answer.locator('.brain-action-button')).toBeVisible();
  });


  test('Brain V2 finds cross-subject links and derives source-traceable recall cards', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-view="brain"]').click();

    await page.locator('[data-brain-prompt="Connect this concept across subjects."]').click();
    const connections = page.locator('#brainThread .brain-message.assistant').last();
    await expect(connections).toContainText('Cross-subject connections · Myocardial Infarction', { timeout: 15000 });
    await expect(connections.locator('.brain-source-chip').first()).toBeVisible();

    await page.locator('[data-brain-prompt="Generate recall cards from this note."]').click();
    const cards = page.locator('#brainThread .brain-message.assistant').last();
    await expect(cards).toContainText('Recall-card candidates · Myocardial Infarction');
    await expect(cards.locator('[data-brain-copy-cards]')).toBeVisible();
  });

  test('Brain V2 previews and applies only a safe structural note patch', async ({ page }) => {
    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-view="brain"]').click();
    await page.locator('[data-brain-prompt="Improve the structure of this note safely."]').click();

    const answer = page.locator('#brainThread .brain-message.assistant').last();
    await expect(answer).toContainText('Safe note improvement · Myocardial Infarction', { timeout: 15000 });
    await answer.locator('[data-brain-patch]').click();

    await expect(page.locator('#patchBackdrop')).toBeVisible();
    await expect(page.locator('#patchAfter')).toContainText('## Management');
    await page.locator('#applyPatch').click();

    await expect(page.locator('#view-editor')).toHaveClass(/active/);
    await expect(page.locator('#editor')).toHaveValue(/## Management/);
    await expect(page.locator('#editor')).toHaveValue(/\[\[(Aspirin|Troponin)/);
  });

  test('Brain V2 remote provider receives grounded source IDs without provider keys in browser config', async ({ page }) => {
    const origin = await page.evaluate(() => location.origin);
    let generated = null;

    await page.route('**/ai/providers', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          local_evidence: true,
          gateway_ready: true,
          providers: [
            { id: 'openai', label: 'OpenAI', configured: true, model: 'test-model' }
          ]
        })
      });
    });
    await page.route('**/ai/generate', async route => {
      generated = {
        headers: route.request().headers(),
        body: JSON.parse(route.request().postData() || '{}')
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          provider: 'openai',
          model: 'test-model',
          text: 'Remote grounded answer [NOTE:mi]'
        })
      });
    });

    await page.locator('.note-row', { hasText: 'Myocardial Infarction' }).click();
    await page.locator('[data-view="brain"]').click();
    await page.locator('#brainProviderBtn').click();
    await page.locator('#brainBackendUrl').fill(origin);
    await page.locator('#brainGatewayToken').fill('session-gateway-token');
    await page.locator('#brainSaveBackend').click();

    await expect(page.locator('#brainProvider')).toContainText('OpenAI');
    await page.locator('#brainProvider').selectOption('openai');
    await page.locator('#brainInput').fill('Explain this concept using my vault.');
    await page.locator('#brainForm').evaluate(form => form.requestSubmit());

    const answer = page.locator('#brainThread .brain-message.assistant').last();
    await expect(answer).toContainText('OpenAI · test-model', { timeout: 15000 });
    await expect(answer).toContainText('Remote grounded answer [NOTE:mi]');
    await expect(answer.locator('[data-brain-note="mi"]').first()).toBeVisible();

    expect(generated).not.toBeNull();
    expect(generated.headers['x-neuralvault-token']).toBe('session-gateway-token');
    expect(generated.body.provider).toBe('openai');
    expect(generated.body.prompt).toContain('Source-ID: NOTE:mi');
    expect(await page.locator('#brainSettingsBackdrop').textContent()).not.toContain('OPENAI_API_KEY');
  });

});
