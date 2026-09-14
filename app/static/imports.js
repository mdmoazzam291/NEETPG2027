'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const flagged = new Set(['exact_duplicate', 'probable_duplicate', 'requires_review']);
  const labels = {accepted: 'Ready', rejected: 'Rejected', exact_duplicate: 'Exact match', probable_duplicate: 'Possible match', requires_review: 'Review needed', previewed: 'Preview saved', imported: 'Imported', partially_rejected: 'Imported with rejections', validated: 'Validated'};
  const state = {batch: null, busy: false, page: 0, history: [], hasMore: false};
  const pageSize = 15;
  const drafts = new Map();
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  };
  const button = (text, handler, className = 'secondary') => {
    const element = node('button', text, className);
    element.type = 'button'; element.addEventListener('click', () => run(handler)); return element;
  };
  function message(text, error = false) {
    $(error ? 'notice' : 'error').hidden = true;
    const box = $(error ? 'error' : 'notice'); box.textContent = text; box.hidden = !text;
    if (error) box.focus();
  }
  async function api(path, body) {
    let response;
    try { response = await fetch(path, body === undefined ? {cache: 'no-store'} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); }
    catch { throw new Error('Connection lost. Refresh saved batches before retrying; your last action may already be saved.'); }
    let data;
    try { data = await response.json(); } catch { throw new Error('The app returned an unreadable response. Check that it is running, then refresh.'); }
    if (!response.ok) {
      const detail = data.detail;
      throw new Error(Array.isArray(detail) ? detail.map(x => `${(x.loc || []).slice(1).join('.')}: ${x.msg}`).join('; ') : (detail || `Request failed (${response.status}).`));
    }
    return data;
  }
  async function run(action) {
    if (state.busy) return;
    state.busy = true; $('workspace').disabled = true; document.body.dataset.busy = 'true'; $('workspace').setAttribute('aria-busy', 'true');
    $('error').hidden = true;
    try { await action(); } catch (error) { message(error.message || 'Unable to complete this action.', true); }
    finally { state.busy = false; $('workspace').disabled = false; document.body.dataset.busy = 'false'; $('workspace').setAttribute('aria-busy', 'false'); }
  }
  async function loadSources(selected = $('source').value) {
    const sources = [];
    for (let offset = 0; ; offset += 200) {
      const page = await api(`/api/sources?limit=200&offset=${offset}`); sources.push(...page);
      if (page.length < 200) break;
    }
    $('source').replaceChildren(new Option(sources.length ? 'Choose a source' : 'Add your first source below', ''));
    sources.forEach(source => $('source').add(new Option(`${source.name} · #${source.id}`, String(source.id))));
    $('source').value = String(selected || '');
    if (!sources.length) $('source-details').open = true;
  }
  async function loadHistory(append = false) {
    const data = await api(`/api/imports?limit=20&offset=${append ? state.history.length : 0}`);
    state.history = append ? state.history.concat(data) : data;
    state.hasMore = data.length === 20;
    renderHistory();
  }
  function renderHistory() {
    $('history').replaceChildren();
    if (!state.history.length) $('history').append(node('p', 'No imports yet. Your first preview will appear here.', 'empty'));
    state.history.forEach(batch => {
      const item = button('', () => openBatch(batch.id), 'history-item');
      item.append(node('strong', batch.input_name), node('small', `#${batch.id} · ${batch.row_count} rows · ${labels[batch.status] || batch.status}`));
      if (batch.id === state.batch?.id) item.setAttribute('aria-current', 'true');
      $('history').append(item);
    });
    $('more-history').hidden = !state.hasMore;
  }
  async function openBatch(id) {
    const batch = await api(`/api/imports/${id}`);
    showBatch(batch, true);
    message(batch.completed_at ? 'This batch is already complete. Its questions and review history are saved.' : 'Saved preview loaded. Continue reviewing below.');
  }
  function showBatch(batch, reset = false) {
    state.batch = batch;
    if (reset) { state.page = 0; $('row-filter').value = 'all'; $('search').value = ''; }
    history.replaceState(null, '', `#batch=${batch.id}`);
    $('confirmation').hidden = true; $('confirm-check').checked = false; $('commit').disabled = true;
    $('batch-panel').hidden = false;
    $('batch-title').textContent = batch.input_name;
    $('batch-meta').textContent = `BATCH #${batch.id} · SOURCE #${batch.source_id}`;
    $('batch-state').textContent = labels[batch.status] || batch.status;
    const attention = batch.rows.filter(row => flagged.has(row.status)).length;
    $('stats').replaceChildren();
    [[batch.row_count, 'Total rows'], [batch.accepted_count, batch.completed_at ? 'Imported' : 'Ready'], [attention, 'Need review'], [batch.rejected_count, 'Rejected']].forEach(([count, label]) => {
      const stat = node('div', undefined, 'stat'); stat.append(node('strong', count), node('span', label)); $('stats').append(stat);
    });
    $('confirm-import').disabled = Boolean(batch.completed_at) || attention > 0;
    $('confirm-import').textContent = batch.completed_at ? 'Import complete' : 'Review import summary →';
    $('commit-title').textContent = batch.completed_at ? 'Batch saved' : attention ? `${attention} row${attention === 1 ? '' : 's'} still need review` : 'Ready for your final check';
    $('commit-help').textContent = batch.completed_at ? 'All decisions are retained. Imported answers remain unverified.' : attention ? 'Resolve each flagged row before confirming.' : `${batch.accepted_count} rows will be imported; ${batch.rejected_count} rejected rows will be skipped.`;
    renderRows(); renderHistory();
    if (reset) { $('batch-title').focus(); $('batch-panel').scrollIntoView({behavior: 'smooth', block: 'start'}); }
  }
  function renderOptions(container, options) {
    const list = node('ol', undefined, 'options');
    options.forEach((option, index) => list.append(node('li', `${option.label || String.fromCharCode(65 + index)}. ${option.text}${option.is_correct ? ' — marked correct' : ''}`, option.is_correct ? 'correct' : '')));
    container.append(list);
  }
  function textDetail(container, title, text) {
    if (!text) return;
    const details = node('details'); details.append(node('summary', title), node('p', text)); container.append(details);
  }
  async function inspectTarget(id, output) {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Enter a valid question ID to inspect.');
    const question = await api(`/api/questions/${id}`);
    output.replaceChildren(node('h3', `Existing question #${question.id}`), node('p', question.stem));
    renderOptions(output, question.options);
    textDetail(output, 'Existing explanation', question.answer_explanation);
    textDetail(output, 'Existing reference', question.reference_text);
    output.append(node('p', `Verification: ${Object.entries(question.verification).map(([aspect, status]) => `${aspect}: ${status}`).join(' · ') || 'No verification recorded'}`, 'muted'));
    output.append(node('p', `Sources: ${question.occurrences.map(x => `#${x.source_id ?? 'legacy'} / ${x.external_id || 'no external ID'}`).join(', ') || 'No occurrences'}`, 'muted'));
    output.hidden = false;
  }
  function rowCard(row) {
    const batchId = state.batch.id;
    const card = node('article', undefined, 'row-card');
    card.dataset.row = String(row.id);
    const heading = node('div', undefined, 'row-heading');
    heading.append(node('span', `ROW ${row.row_number} · ${row.external_id || 'No source ID'}`), node('span', state.batch.completed_at && row.status === 'accepted' ? 'Imported' : labels[row.status], `badge ${flagged.has(row.status) ? 'attention' : row.status === 'rejected' ? 'rejected' : ''}`));
    card.append(heading);
    const payload = row.normalized_payload;
    const data = payload?.question;
    card.append(node('p', data?.stem || row.raw_payload?.stem || 'Invalid question row', 'row-stem'));
    if (data) {
      renderOptions(card, data.options);
      textDetail(card, 'Explanation', data.answer_explanation);
      textDetail(card, 'Reference', data.reference_text);
    }
    if (row.errors.length) {
      const errors = node('ul', undefined, 'error-list'); row.errors.forEach(error => errors.append(node('li', error))); card.append(errors);
    }
    textDetail(card, 'Original row', JSON.stringify(row.raw_payload, null, 2));
    if (payload?.review_history?.length) {
      const details = node('details'); details.append(node('summary', 'Review history'));
      payload.review_history.forEach(review => details.append(node('p', `${review.action}${review.question_id ? ` #${review.question_id}` : ''} · ${review.note} · ${review.reviewed_at}`)));
      card.append(details);
    }
    if (!payload) card.append(node('p', 'Correct this row in your file and create a new preview. This row will be skipped.', 'muted'));
    else if (!state.batch.completed_at) {
      const fields = node('div', undefined, 'review-fields');
      const noteId = `note-${row.id}`;
      const noteLabel = node('label', 'Decision note'); noteLabel.htmlFor = noteId;
      const note = node('input'); note.id = noteId;
      const draftKey = `${batchId}:${row.id}`;
      note.value = drafts.get(draftKey) || '';
      note.addEventListener('input', () => drafts.set(draftKey, note.value)); note.maxLength = 2000; note.placeholder = 'Why are you keeping, linking, or rejecting this row?';
      fields.append(noteLabel, note);
      const targetId = `target-${row.id}`;
      const targetLabel = node('label', 'Existing question ID'); targetLabel.htmlFor = targetId;
      const target = node('input'); target.type = 'number'; target.min = '1'; target.step = '1'; target.id = targetId; target.inputMode = 'numeric';
      target.value = String(payload.review?.question_id || row.matched_question_id || '');
      fields.append(targetLabel, target);
      const comparison = node('div', undefined, 'comparison'); comparison.hidden = true;
      let inspectedId = null;
      const link = button('Link to this question', () => save('link'));
      link.disabled = true;
      target.addEventListener('input', () => {inspectedId = null; comparison.hidden = true; link.disabled = true;});
      const inspect = button('Inspect existing question', async () => {
        const id = Number(target.value); await inspectTarget(id, comparison); inspectedId = id; link.disabled = false;
      });
      async function save(action) {
        if (!note.value.trim()) { note.focus(); throw new Error('Add a decision note before saving this review.'); }
        const request = {action, note: note.value.trim()};
        if (action === 'link') {
          if (!inspectedId || inspectedId !== Number(target.value)) throw new Error('Inspect the existing question before linking.');
          request.question_id = inspectedId;
        }
        const updated = await api(`/api/imports/${batchId}/rows/${row.id}/review`, request);
        drafts.delete(draftKey); showBatch(updated); message(`Row ${row.row_number}: decision saved.`);
      }
      const actions = node('div', undefined, 'actions');
      actions.append(button('Keep as separate question', () => save('create')), button('Reject row', () => save('reject')));
      const linkActions = node('div', undefined, 'actions'); linkActions.append(inspect, link);
      fields.append(linkActions, comparison, actions); card.append(fields);
    }
    if (row.question_id) card.append(node('p', `Saved as question #${row.question_id} · occurrence #${row.question_occurrence_id}`, 'muted'));
    return card;
  }
  function renderRows() {
    if (!state.batch) return;
    const filter = $('row-filter').value; const query = $('search').value.trim().toLowerCase();
    const rows = state.batch.rows.filter(row => (filter === 'all' || (filter === 'attention' ? flagged.has(row.status) : row.status === filter)) && (!query || `${row.external_id || ''} ${row.normalized_payload?.question?.stem || row.raw_payload?.stem || ''}`.toLowerCase().includes(query)));
    const pages = Math.max(1, Math.ceil(rows.length / pageSize)); state.page = Math.min(state.page, pages - 1);
    $('rows').replaceChildren(...rows.slice(state.page * pageSize, (state.page + 1) * pageSize).map(rowCard));
    if (!rows.length) $('rows').append(node('p', 'No rows match this view.', 'empty'));
    $('previous').disabled = state.page === 0; $('next').disabled = state.page >= pages - 1;
    $('page-info').textContent = `Page ${state.page + 1} of ${pages} · ${rows.length} rows`;
  }
  $('save-source').addEventListener('click', () => run(async () => {
    const name = $('source-name').value.trim(); if (!name) throw new Error('Enter a source name.');
    const form = $('source-details');
    form.dataset.namespace ||= `personal.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    const source = await api('/api/sources', {name, external_namespace: form.dataset.namespace, source_type: $('source-type').value, citation: $('source-citation').value.trim() || null});
    await loadSources(source.id); delete form.dataset.namespace; form.open = false;
    $('source-name').value = ''; $('source-citation').value = ''; message('Source saved. Choose your question file.');
  }));
  $('file').addEventListener('change', () => {const file = $('file').files[0]; $('file-info').textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'No file selected.';});
  $('clear-file').addEventListener('click', () => {$('file').value = ''; $('file-info').textContent = 'No file selected. Pasted content will be used.';});
  $('upload-form').addEventListener('submit', event => {
    event.preventDefault(); run(async () => {
      const file = $('file').files[0]; let format = $('format').value; let content;
      if (file) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (!['json', 'csv'].includes(extension)) throw new Error('Choose a .csv or .json file.');
        if (file.size > 8_000_000) throw new Error('This file is too large. Split it into smaller batches.');
        format = extension; content = await file.text();
      } else content = $('pasted-content').value;
      if (!content.trim()) throw new Error('Choose a file or paste its content before previewing.');
      if (content.length > 2_000_000) throw new Error('The file exceeds 2,000,000 characters. Split it into smaller batches.');
      const batch = await api('/api/imports/preview', {source_id: Number($('source').value), input_format: format, input_name: file ? file.name : `pasted-questions.${format}`, content});
      showBatch(batch, true); await loadHistory(); message('Preview saved. No questions have been added yet. Review the results below.');
    });
  });
  $('refresh').addEventListener('click', () => run(async () => {
    await loadSources(); await loadHistory(); if (state.batch) showBatch(await api(`/api/imports/${state.batch.id}`)); message('Saved data refreshed.');
  }));
  $('more-history').addEventListener('click', () => run(() => loadHistory(true)));
  $('row-filter').addEventListener('change', () => {state.page = 0; renderRows();});
  $('search').addEventListener('input', () => {state.page = 0; renderRows();});
  $('previous').addEventListener('click', () => {state.page--; renderRows();});
  $('next').addEventListener('click', () => {state.page++; renderRows();});
  $('confirm-import').addEventListener('click', () => {
    const batch = state.batch;
    if (!batch || batch.completed_at || batch.rows.some(row => flagged.has(row.status))) return;
    const links = batch.rows.filter(row => row.status === 'accepted' && row.normalized_payload?.review?.action === 'link').length;
    $('confirmation-text').textContent = `${batch.accepted_count - links} new questions, ${links} links to existing questions, and ${batch.rejected_count} rejected rows to skip. This saves the batch to your question bank.`;
    $('confirmation').hidden = false; $('confirm-check').checked = false; $('commit').disabled = true; $('confirm-check').focus();
  });
  $('confirm-check').addEventListener('change', () => {$('commit').disabled = !$('confirm-check').checked;});
  $('cancel-confirm').addEventListener('click', () => {$('confirmation').hidden = true; $('confirm-check').checked = false; $('commit').disabled = true; $('confirm-import').focus();});
  $('commit').addEventListener('click', () => run(async () => {
    if (!$('confirm-check').checked || !state.batch || state.batch.completed_at) return;
    const batch = await api(`/api/imports/${state.batch.id}/commit`, {});
    showBatch(batch); await loadHistory(); message(`Batch complete: ${batch.accepted_count} rows imported, ${batch.rejected_count} rejected. Review history saved.`);
  }));
  window.addEventListener('hashchange', () => run(async () => {const match = location.hash.match(/^#batch=(\d+)$/); if (match) await openBatch(Number(match[1]));}));
  run(async () => {await loadSources(); await loadHistory(); const match = location.hash.match(/^#batch=(\d+)$/); if (match) await openBatch(Number(match[1]));});
})();
