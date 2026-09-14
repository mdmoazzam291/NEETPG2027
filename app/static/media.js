const $ = (selector) => document.querySelector(selector);
let currentQuestion = null;

async function api(path, options = {}) {
  const response = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...options});
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `Request failed (${response.status})`);
  return body;
}
function busy(value) { document.body.dataset.busy = value ? 'true' : 'false'; }
function clearMessages() { $('#notice').hidden = true; $('#error').hidden = true; }
function message(text) { $('#error').hidden = true; $('#notice').textContent = text; $('#notice').hidden = false; }
function failure(error) { $('#notice').hidden = true; $('#error').textContent = error.message; $('#error').hidden = false; $('#error').focus(); }
function optionLabel(option) { return option.label || String.fromCharCode(64 + option.position); }

function renderQuestion() {
  $('#question-panel').hidden = false;
  $('#media-workspace').hidden = false;
  $('#question-meta').textContent = `QUESTION #${currentQuestion.id} · ${currentQuestion.question_type.replaceAll('_', ' ')}`;
  $('#question-stem').textContent = currentQuestion.stem;
  $('#media-count').textContent = `${currentQuestion.media.length} image${currentQuestion.media.length === 1 ? '' : 's'}`;
  const options = $('#question-options'); options.replaceChildren();
  currentQuestion.options.forEach(option => {
    const li = document.createElement('li'); li.className = option.is_correct ? 'correct' : '';
    li.textContent = `${optionLabel(option)}. ${option.text}${option.is_correct ? ' ✓' : ''}`; options.append(li);
  });
  const target = $('#media-target'); target.replaceChildren();
  const stem = document.createElement('option'); stem.value = ''; stem.textContent = 'Question stem'; target.append(stem);
  currentQuestion.options.forEach(option => {
    const item = document.createElement('option'); item.value = option.id; item.textContent = `Option ${optionLabel(option)}: ${option.text}`; target.append(item);
  });
  renderGallery();
}

function renderGallery() {
  const root = $('#media-gallery'); root.replaceChildren();
  if (!currentQuestion.media.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'No media attached.'; root.append(p); return; }
  const optionById = new Map(currentQuestion.options.map(option => [option.id, option]));
  currentQuestion.media.forEach(media => {
    const card = document.createElement('article'); card.className = 'media-card'; card.dataset.mediaId = media.id;
    const preview = document.createElement('div'); preview.className = 'media-preview';
    const image = document.createElement('img'); image.src = media.content_url; image.alt = media.alt_text; image.loading = 'lazy'; preview.append(image);
    const body = document.createElement('div'); body.className = 'media-body';
    const strong = document.createElement('strong'); strong.textContent = media.alt_text; body.append(strong);
    const meta = document.createElement('div'); meta.className = 'media-meta';
    const type = document.createElement('span'); type.className = 'media-tag'; type.textContent = media.media_type;
    const position = document.createElement('span'); position.className = 'media-tag'; position.textContent = `position ${media.position}`;
    const target = document.createElement('span'); target.className = 'media-tag';
    const option = optionById.get(media.question_option_id); target.textContent = option ? `option ${optionLabel(option)}` : 'question stem';
    meta.append(type, position, target); body.append(meta);
    if (media.caption) { const caption = document.createElement('p'); caption.className = 'media-caption'; caption.textContent = media.caption; body.append(caption); }
    const hash = document.createElement('p'); hash.className = 'media-hash'; hash.textContent = `sha256 ${media.content_hash}`; body.append(hash);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'text-button'; edit.dataset.action = 'edit-media'; edit.dataset.id = media.id; edit.textContent = 'Edit text'; body.append(edit);
    card.append(preview, body); root.append(card);
  });
}

async function loadQuestion(id, {quiet = false} = {}) {
  if (!quiet) clearMessages(); busy(true);
  try {
    currentQuestion = await api(`/api/questions/${id}`);
    $('#question-id').value = currentQuestion.id;
    renderQuestion();
    const url = new URL(location.href); url.searchParams.set('question', currentQuestion.id); history.replaceState({}, '', url);
  } catch (error) {
    currentQuestion = null; $('#question-panel').hidden = true; $('#media-workspace').hidden = true; failure(error);
  } finally { busy(false); }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
}

$('#question-form').addEventListener('submit', event => {
  event.preventDefault(); const id = Number($('#question-id').value); if (id > 0) loadQuestion(id);
});
$('#media-file').addEventListener('change', event => {
  const file = event.target.files[0]; $('#media-file-info').textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KiB · ${file.type || 'unknown type'}` : 'No image selected.';
});
$('#media-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!currentQuestion) return;
  clearMessages();
  const file = $('#media-file').files[0];
  if (!file) return failure(new Error('Choose an image first.'));
  const allowed = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowed.includes(file.type)) return failure(new Error('Use PNG, JPEG, or WebP.'));
  if (file.size > 5 * 1024 * 1024) return failure(new Error('Image exceeds the 5 MiB limit.'));
  busy(true);
  try {
    const payload = {
      media_type: $('#media-type').value,
      mime_type: file.type,
      content_base64: await fileToBase64(file),
      alt_text: $('#media-alt').value.trim(),
      caption: $('#media-caption').value.trim() || null,
      question_option_id: $('#media-target').value ? Number($('#media-target').value) : null,
    };
    await api(`/api/questions/${currentQuestion.id}/media`, {method:'POST', body:JSON.stringify(payload)});
    event.target.reset(); $('#media-file-info').textContent = 'No image selected.';
    await loadQuestion(currentQuestion.id, {quiet:true}); message('Image attached to question.');
  } catch (error) { failure(error); } finally { busy(false); }
});
$('#refresh-media').addEventListener('click', async () => { if (!currentQuestion) return; await loadQuestion(currentQuestion.id, {quiet:true}); message('Question media refreshed.'); });
$('#media-gallery').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action="edit-media"]'); if (!button || !currentQuestion) return;
  const media = currentQuestion.media.find(item => item.id === Number(button.dataset.id)); if (!media) return;
  const alt_text = window.prompt('Alt text', media.alt_text); if (!alt_text || !alt_text.trim()) return;
  const caption = window.prompt('Caption (leave blank to clear)', media.caption || ''); if (caption === null) return;
  busy(true); clearMessages();
  try {
    await api(`/api/questions/${currentQuestion.id}/media/${media.id}`, {method:'PATCH', body:JSON.stringify({alt_text:alt_text.trim(), caption:caption.trim() || null})});
    await loadQuestion(currentQuestion.id, {quiet:true}); message('Media text updated.');
  } catch (error) { failure(error); } finally { busy(false); }
});

const initialId = Number(new URL(location.href).searchParams.get('question'));
if (initialId > 0) loadQuestion(initialId);
