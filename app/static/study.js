const $ = selector => document.querySelector(selector);
let questions = [];
let questionIndex = 0;
let startedAt = 0;
let timerHandle = null;
let currentAttempt = null;

async function api(path, options = {}) {
  const response = await fetch(path, {headers: {'Content-Type': 'application/json'}, ...options});
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try { const body = await response.json(); message = body.detail || message; } catch (_) {}
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showError(error) {
  const box = $('#error');
  box.textContent = error instanceof Error ? error.message : String(error);
  box.hidden = false;
  box.focus();
}

function clearError() { $('#error').hidden = true; }
function notice(message) { const box = $('#notice'); box.textContent = message; box.hidden = false; }

function formatTime(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function renderMedia(container, items, extraClass = '') {
  container.replaceChildren();
  (items || []).forEach(item => {
    const figure = document.createElement('figure');
    if (extraClass) figure.className = extraClass;
    const image = document.createElement('img');
    image.src = item.content_url;
    image.alt = item.alt_text || '';
    image.loading = 'lazy';
    figure.append(image);
    if (item.caption) {
      const caption = document.createElement('figcaption');
      caption.textContent = item.caption;
      figure.append(caption);
    }
    container.append(figure);
  });
}

function verificationLabel(status) {
  if (status === 'verified') return 'Verified answer';
  if (status === 'rejected') return 'Rejected answer key';
  if (status === 'pending') return 'Answer review pending';
  return 'Unverified answer';
}

function startTimer() {
  clearInterval(timerHandle);
  startedAt = Date.now();
  $('#timer').textContent = '0:00';
  timerHandle = setInterval(() => {
    $('#timer').textContent = formatTime(Math.floor((Date.now() - startedAt) / 1000));
  }, 1000);
}

function stopTimer() { clearInterval(timerHandle); timerHandle = null; }

function renderOption(question, option) {
  const label = document.createElement('label');
  label.className = 'answer-option';
  label.dataset.optionId = String(option.id);
  const input = document.createElement('input');
  input.type = 'radio'; input.name = 'answer'; input.value = String(option.id);
  const body = document.createElement('div'); body.className = 'option-copy';
  const marker = document.createElement('span'); marker.className = 'option-label'; marker.textContent = option.label || String(option.position);
  const text = document.createElement('span'); text.textContent = option.text;
  body.append(marker, text);
  label.append(input, body);
  if (option.media && option.media.length) {
    const media = document.createElement('div'); media.className = 'study-media option-media';
    renderMedia(media, option.media);
    label.append(media);
  }
  return label;
}

function renderQuestion() {
  clearError();
  currentAttempt = null;
  const question = questions[questionIndex];
  if (!question) return finishSession();
  $('#empty-session').hidden = true;
  $('#question-panel').hidden = false;
  $('#progress').textContent = `Question ${questionIndex + 1} of ${questions.length}`;
  $('#verification').textContent = verificationLabel(question.answer_verification_status);
  $('#stem').textContent = question.stem;
  renderMedia($('#stem-media'), question.media);
  const options = $('#options'); options.replaceChildren();
  question.options.forEach(option => options.append(renderOption(question, option)));
  document.querySelectorAll('input[name="confidence"]').forEach(input => { input.checked = false; input.disabled = false; });
  $('#submit-answer').disabled = false;
  $('#skip-question').disabled = false;
  $('#result').hidden = true;
  $('#mistake-category').value = '';
  $('#attempt-note').value = '';
  updateBookmarkButton(question.bookmarked);
  startTimer();
  $('#stem').focus();
}

function updateBookmarkButton(bookmarked) {
  $('#bookmark').textContent = bookmarked ? '★ Bookmarked' : '☆ Bookmark';
  $('#bookmark').setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
}

function lockQuestion() {
  document.querySelectorAll('input[name="answer"], input[name="confidence"]').forEach(input => { input.disabled = true; });
  document.querySelectorAll('.answer-option').forEach(item => item.classList.add('disabled'));
  $('#submit-answer').disabled = true;
  $('#skip-question').disabled = true;
  stopTimer();
}

function showResult(result) {
  currentAttempt = result;
  lockQuestion();
  result.options.forEach(option => {
    const row = document.querySelector(`.answer-option[data-option-id="${option.id}"]`);
    if (!row) return;
    if (option.is_correct) row.classList.add('correct-option');
    if (result.selected_option_id === option.id && !option.is_correct) row.classList.add('selected-wrong');
  });
  const title = result.outcome === 'correct' ? 'Correct' : result.outcome === 'incorrect' ? 'Incorrect' : 'Skipped';
  $('#result-title').textContent = title;
  $('#result-verification').textContent = verificationLabel(result.answer_verification_status);
  $('#explanation').textContent = result.answer_explanation || 'No answer explanation is stored yet.';
  const reference = $('#reference');
  reference.textContent = result.reference_text ? `Reference: ${result.reference_text}` : 'No reference text is stored yet.';
  $('#result').hidden = false;
  $('#result').scrollIntoView({behavior: 'smooth', block: 'nearest'});
  loadSummary();
  loadHistory();
}

async function submitAttempt(skipped) {
  clearError();
  const question = questions[questionIndex];
  const confidence = document.querySelector('input[name="confidence"]:checked');
  if (!confidence) return showError(new Error('Choose confidence 1–5 before revealing the answer.'));
  const selected = document.querySelector('input[name="answer"]:checked');
  if (!skipped && !selected) return showError(new Error('Choose an answer or use Skip.'));
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  try {
    const result = await api(`/api/study/questions/${question.id}/attempts`, {
      method: 'POST',
      body: JSON.stringify({
        selected_option_id: skipped ? null : Number(selected.value),
        skipped,
        confidence: Number(confidence.value),
        time_spent_seconds: seconds,
      }),
    });
    showResult(result);
  } catch (error) { showError(error); }
}

async function saveReflection() {
  if (!currentAttempt) return;
  clearError();
  const category = $('#mistake-category').value;
  const note = $('#attempt-note').value.trim();
  const payload = {};
  if (category) payload.mistake_category = category;
  if (note) payload.user_notes = note;
  if (!Object.keys(payload).length) return notice('Nothing to save.');
  try {
    await api(`/api/study/attempts/${currentAttempt.attempt_id}`, {method: 'PATCH', body: JSON.stringify(payload)});
    notice('Reflection saved.');
    loadHistory();
  } catch (error) { showError(error); }
}

async function toggleBookmark() {
  const question = questions[questionIndex];
  if (!question) return;
  clearError();
  try {
    const result = await api(`/api/study/questions/${question.id}/bookmark`, {method: question.bookmarked ? 'DELETE' : 'PUT'});
    question.bookmarked = result.bookmarked;
    updateBookmarkButton(question.bookmarked);
    loadSummary();
  } catch (error) { showError(error); }
}

function finishSession() {
  stopTimer();
  $('#question-panel').hidden = true;
  $('#empty-session').hidden = false;
  $('#empty-title').textContent = questions.length ? 'Session complete' : 'No questions in this queue';
  $('#empty-copy').textContent = questions.length ? 'Start another queue when you are ready.' : 'Try another mode or import more questions.';
}

async function startSession() {
  clearError();
  stopTimer();
  const mode = $('#study-mode').value;
  const limit = Number($('#session-size').value);
  try {
    const data = await api(`/api/study/queue?mode=${encodeURIComponent(mode)}&limit=${limit}`);
    questions = data.questions;
    questionIndex = 0;
    if (!questions.length) finishSession(); else renderQuestion();
  } catch (error) { showError(error); }
}

function summaryCard(label, value) {
  const card = document.createElement('div'); card.className = 'summary-card';
  const strong = document.createElement('strong'); strong.textContent = value;
  const span = document.createElement('span'); span.textContent = label;
  card.append(strong, span); return card;
}

async function loadSummary() {
  try {
    const data = await api('/api/study/summary');
    const summary = $('#summary'); summary.replaceChildren();
    summary.append(
      summaryCard('Accuracy', data.accuracy_percent == null ? '—' : `${data.accuracy_percent}%`),
      summaryCard('Attempted', `${data.questions_attempted}/${data.eligible_questions}`),
      summaryCard('Unseen', data.unseen_questions),
      summaryCard('Bookmarks', data.bookmarks),
      summaryCard('Avg time', data.average_time_seconds == null ? '—' : formatTime(Math.round(data.average_time_seconds))),
    );
  } catch (error) { showError(error); }
}

async function loadHistory() {
  try {
    const rows = await api('/api/study/history?limit=10');
    const container = $('#history'); container.replaceChildren();
    if (!rows.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No attempts yet.'; container.append(empty); return; }
    rows.forEach(row => {
      const item = document.createElement('div'); item.className = 'attempt-row';
      const outcome = document.createElement('span'); outcome.className = 'attempt-outcome'; outcome.textContent = row.outcome;
      const stem = document.createElement('span'); stem.className = 'attempt-stem'; stem.textContent = row.stem;
      const meta = document.createElement('span'); meta.className = 'attempt-meta'; meta.textContent = `C${row.confidence ?? '—'} · ${formatTime(row.time_spent_seconds)}`;
      item.append(outcome, stem, meta); container.append(item);
    });
  } catch (error) { showError(error); }
}

$('#start-session').addEventListener('click', startSession);
$('#submit-answer').addEventListener('click', () => submitAttempt(false));
$('#skip-question').addEventListener('click', () => submitAttempt(true));
$('#save-reflection').addEventListener('click', saveReflection);
$('#bookmark').addEventListener('click', toggleBookmark);
$('#next-question').addEventListener('click', () => { questionIndex += 1; renderQuestion(); });
$('#refresh-history').addEventListener('click', loadHistory);

loadSummary();
loadHistory();
startSession();
