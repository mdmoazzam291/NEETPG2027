const $ = (selector) => document.querySelector(selector);
let taxonomy = {subjects: [], systems: [], topics: []};
let editingTopicId = null;

async function api(path, options = {}) {
  const response = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...options});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}
function busy(value) { document.body.dataset.busy = value ? 'true' : 'false'; }
function message(text) { $('#error').hidden = true; $('#notice').textContent = text; $('#notice').hidden = false; }
function failure(error) { $('#notice').hidden = true; $('#error').textContent = error.message; $('#error').hidden = false; $('#error').focus(); }
function clearMessages() { $('#notice').hidden = true; $('#error').hidden = true; }

function optionSelect(element, items, placeholder) {
  element.replaceChildren();
  const first = document.createElement('option'); first.value = ''; first.textContent = placeholder; element.append(first);
  items.forEach(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${item.name} (#${item.id})`; element.append(option); });
}
function choiceList(element, items, kind) {
  element.replaceChildren();
  if (!items.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = `Create a ${kind} first.`; element.append(p); return; }
  items.forEach(item => {
    const label = document.createElement('label'); label.className = 'choice-item';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = item.id; input.dataset.kind = kind;
    const span = document.createElement('span'); span.textContent = item.name;
    label.append(input, span); element.append(label);
  });
}
function selectedIds(selector) { return [...document.querySelectorAll(selector)].filter(input => input.checked).map(input => Number(input.value)); }
function nameMap(items) { return new Map(items.map(item => [item.id, item.name])); }

function renderSummary() {
  const subtopics = taxonomy.topics.reduce((count, topic) => count + topic.subtopics.length, 0);
  const values = [['Subjects', taxonomy.subjects.length], ['Systems', taxonomy.systems.length], ['Topics', taxonomy.topics.length], ['Subtopics', subtopics]];
  $('#summary').replaceChildren(...values.map(([label, value]) => {
    const box = document.createElement('div'); box.className = 'stat';
    const strong = document.createElement('strong'); strong.textContent = value;
    const span = document.createElement('span'); span.textContent = label;
    box.append(strong, span); return box;
  }));
}
function actionButton(label, action, id) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'text-button'; button.textContent = label;
  button.dataset.action = action; button.dataset.id = id; return button;
}
function taxonomyRow(item, detail, action) {
  const row = document.createElement('div'); row.className = 'taxonomy-row';
  const main = document.createElement('div'); main.className = 'taxonomy-row-main';
  const strong = document.createElement('strong'); strong.textContent = item.name;
  const small = document.createElement('small'); small.textContent = detail;
  main.append(strong, small);
  const actions = document.createElement('div'); actions.className = 'mini-actions'; actions.append(actionButton('Rename', action, item.id));
  row.append(main, actions); return row;
}
function catalogueGroup(title) {
  const group = document.createElement('section'); group.className = 'catalogue-group';
  const head = document.createElement('div'); head.className = 'catalogue-heading'; const h3 = document.createElement('h3'); h3.textContent = title; head.append(h3); group.append(head); return group;
}
function matches(value, query) { return !query || value.toLocaleLowerCase().includes(query); }

function renderCatalogue() {
  const root = $('#catalogue'); root.replaceChildren();
  const query = $('#taxonomy-search').value.trim().toLocaleLowerCase();
  const subjectNames = nameMap(taxonomy.subjects), systemNames = nameMap(taxonomy.systems);
  const subjects = taxonomy.subjects.filter(item => matches(`${item.name} ${item.code || ''}`, query));
  const systems = taxonomy.systems.filter(item => matches(item.name, query));
  const topics = taxonomy.topics.filter(topic => matches(`${topic.name} ${topic.description || ''} ${topic.subtopics.map(s => s.name).join(' ')}`, query));

  const subjectGroup = catalogueGroup(`Subjects (${subjects.length})`);
  subjects.forEach(item => subjectGroup.append(taxonomyRow(item, `#${item.id}${item.code ? ` · ${item.code}` : ''} · ${item.system_ids.length} systems`, 'rename-subject')));
  root.append(subjectGroup);

  const systemGroup = catalogueGroup(`Systems (${systems.length})`);
  systems.forEach(item => systemGroup.append(taxonomyRow(item, `#${item.id} · ${item.subject_ids.length} subjects`, 'rename-system')));
  root.append(systemGroup);

  const topicGroup = catalogueGroup(`Topics (${topics.length})`);
  topics.forEach(topic => {
    const card = document.createElement('article'); card.className = `topic-card ${topic.lifecycle_status === 'archived' ? 'archived' : ''}`;
    const head = document.createElement('div'); head.className = 'topic-head';
    const main = document.createElement('div'); const strong = document.createElement('strong'); strong.textContent = topic.name;
    const small = document.createElement('small'); small.className = `status-${topic.lifecycle_status}`; small.textContent = `#${topic.id} · ${topic.lifecycle_status}`; main.append(strong, small);
    const actions = document.createElement('div'); actions.className = 'mini-actions';
    actions.append(actionButton('Edit', 'edit-topic', topic.id), actionButton(topic.lifecycle_status === 'archived' ? 'Activate' : 'Archive', 'toggle-topic', topic.id));
    head.append(main, actions); card.append(head);
    const meta = document.createElement('div'); meta.className = 'topic-meta';
    [...topic.subject_ids.map(id => `Subject: ${subjectNames.get(id) || `#${id}`}`), ...topic.system_ids.map(id => `System: ${systemNames.get(id) || `#${id}`}`)].forEach(text => { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = text; meta.append(tag); });
    if (!meta.children.length) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'No subject/system links'; meta.append(tag); }
    card.append(meta);
    if (topic.description) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = topic.description; card.append(p); }
    if (topic.subtopics.length) {
      const list = document.createElement('ul'); list.className = 'subtopic-list';
      topic.subtopics.forEach(subtopic => { const li = document.createElement('li'); const span = document.createElement('span'); span.textContent = `${subtopic.name} (#${subtopic.id})`; const actions = document.createElement('div'); actions.className = 'mini-actions'; actions.append(actionButton('Rename', 'rename-subtopic', subtopic.id), actionButton(subtopic.lifecycle_status === 'archived' ? 'Activate' : 'Archive', 'toggle-subtopic', subtopic.id)); li.append(span, actions); list.append(li); });
      card.append(list);
    }
    topicGroup.append(card);
  });
  root.append(topicGroup);
  if (!subjects.length && !systems.length && !topics.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No taxonomy matches your search.'; root.append(empty); }
}
function render() {
  renderSummary();
  optionSelect($('#link-subject'), taxonomy.subjects, 'Choose subject'); optionSelect($('#link-system'), taxonomy.systems, 'Choose system'); optionSelect($('#subtopic-topic'), taxonomy.topics.filter(t => t.lifecycle_status === 'active'), 'Choose topic');
  choiceList($('#topic-subjects'), taxonomy.subjects, 'subject'); choiceList($('#topic-systems'), taxonomy.systems, 'system');
  renderCatalogue();
}
async function load({quiet = false} = {}) {
  try { if (!quiet) busy(true); taxonomy = await api('/api/taxonomy'); render(); }
  catch (error) { failure(error); }
  finally { busy(false); }
}
async function run(task, success) {
  clearMessages(); busy(true);
  try { await task(); await load({quiet: true}); message(success); }
  catch (error) { failure(error); }
  finally { busy(false); }
}

$('#subject-form').addEventListener('submit', event => { event.preventDefault(); const name = $('#subject-name').value.trim(), code = $('#subject-code').value.trim(); run(async () => { await api('/api/taxonomy/subjects', {method:'POST', body:JSON.stringify({name, code: code || null})}); event.target.reset(); }, 'Subject saved.'); });
$('#system-form').addEventListener('submit', event => { event.preventDefault(); const name = $('#system-name').value.trim(); run(async () => { await api('/api/taxonomy/systems', {method:'POST', body:JSON.stringify({name})}); event.target.reset(); }, 'System saved.'); });
$('#link-form').addEventListener('submit', event => { event.preventDefault(); const subject_id = Number($('#link-subject').value), system_id = Number($('#link-system').value); run(async () => { const result = await api('/api/taxonomy/subject-systems', {method:'POST', body:JSON.stringify({subject_id, system_id})}); if (!result.created) throw new Error('That subject-system link already exists.'); }, 'Subject and system linked.'); });
$('#topic-form').addEventListener('submit', event => { event.preventDefault(); const payload = {name:$('#topic-name').value.trim(), description:$('#topic-description').value.trim() || null, subject_ids:selectedIds('#topic-subjects input'), system_ids:selectedIds('#topic-systems input')}; const id = editingTopicId; run(async () => { await api(id ? `/api/taxonomy/topics/${id}` : '/api/taxonomy/topics', {method:id ? 'PATCH':'POST', body:JSON.stringify(payload)}); editingTopicId = null; event.target.reset(); event.target.querySelector('button[type=submit]').textContent = 'Add topic'; }, id ? 'Topic updated.' : 'Topic saved.'); });
$('#subtopic-form').addEventListener('submit', event => { event.preventDefault(); const payload = {topic_id:Number($('#subtopic-topic').value), name:$('#subtopic-name').value.trim(), description:$('#subtopic-description').value.trim() || null}; run(async () => { await api('/api/taxonomy/subtopics', {method:'POST', body:JSON.stringify(payload)}); event.target.reset(); }, 'Subtopic saved.'); });
$('#refresh-taxonomy').addEventListener('click', () => load().then(() => message('Taxonomy refreshed.')));
$('#taxonomy-search').addEventListener('input', renderCatalogue);

$('#catalogue').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const id = Number(button.dataset.id), action = button.dataset.action;
  if (action === 'edit-topic') {
    const topic = taxonomy.topics.find(item => item.id === id); if (!topic) return;
    editingTopicId = id; $('#topic-name').value = topic.name; $('#topic-description').value = topic.description || '';
    document.querySelectorAll('#topic-subjects input').forEach(input => input.checked = topic.subject_ids.includes(Number(input.value)));
    document.querySelectorAll('#topic-systems input').forEach(input => input.checked = topic.system_ids.includes(Number(input.value)));
    $('#topic-form button[type=submit]').textContent = 'Save topic changes'; $('#topic-name').focus(); message(`Editing topic #${id}. Saving replaces its subject/system links with the checked set.`); return;
  }
  if (action === 'rename-subject' || action === 'rename-system' || action === 'rename-subtopic') {
    let current, path;
    if (action === 'rename-subject') { current = taxonomy.subjects.find(item => item.id === id); path = `/api/taxonomy/subjects/${id}`; }
    if (action === 'rename-system') { current = taxonomy.systems.find(item => item.id === id); path = `/api/taxonomy/systems/${id}`; }
    if (action === 'rename-subtopic') { current = taxonomy.topics.flatMap(item => item.subtopics).find(item => item.id === id); path = `/api/taxonomy/subtopics/${id}`; }
    const name = window.prompt('New name', current?.name || ''); if (!name || !name.trim()) return;
    await run(() => api(path, {method:'PATCH', body:JSON.stringify({name:name.trim()})}), 'Name updated.'); return;
  }
  if (action === 'toggle-topic') {
    const current = taxonomy.topics.find(item => item.id === id); const lifecycle_status = current.lifecycle_status === 'archived' ? 'active' : 'archived';
    await run(() => api(`/api/taxonomy/topics/${id}`, {method:'PATCH', body:JSON.stringify({lifecycle_status})}), `Topic ${lifecycle_status}.`); return;
  }
  if (action === 'toggle-subtopic') {
    const current = taxonomy.topics.flatMap(item => item.subtopics).find(item => item.id === id); const lifecycle_status = current.lifecycle_status === 'archived' ? 'active' : 'archived';
    await run(() => api(`/api/taxonomy/subtopics/${id}`, {method:'PATCH', body:JSON.stringify({lifecycle_status})}), `Subtopic ${lifecycle_status}.`);
  }
});

load();
