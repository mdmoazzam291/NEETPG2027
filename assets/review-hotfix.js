(() => {
  const state = { active: false, pos: 0, last: null };
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  function setHidden(el, hidden) {
    if (el) el.classList.toggle('hidden', hidden);
  }

  function restoreControls() {
    setHidden($('.q-tools'), false);
    setHidden($('.confidence'), false);
    setHidden($('#qSubmit'), false);
    setHidden($('#qFeedback .form-grid'), false);
    setHidden($('#qFeedback .note-box'), false);
    setHidden($('#qFeedback .review-buttons'), false);
    if ($('#qSubmit')) $('#qSubmit').disabled = false;
    if ($('#qNext')) $('#qNext').textContent = 'Next question';
  }

  function renderReviewItem() {
    const last = state.last;
    if (!last || !last.questions?.length) return;
    const q = last.questions[state.pos];
    const answer = last.answers?.[state.pos] || null;
    const correct = q.options?.find((o) => o.is_correct);
    const selected = answer?.selected || null;

    $('#qProgress').textContent = `${state.pos + 1} / ${last.questions.length}`;
    $('#qProgressFill').style.width = `${((state.pos + 1) / last.questions.length) * 100}%`;
    $('#qSubject').textContent = q.subject || '';
    $('#qTopic').textContent = q.topic || '';
    $('#qDifficulty').textContent = q.difficulty <= 1 ? 'Easy' : q.difficulty === 2 ? 'Medium' : 'Hard';
    $('#qStem').textContent = q.stem || '';
    $('#qTimer').textContent = 'Review';

    $('#qOptions').innerHTML = (q.options || []).map((o) => {
      const classes = ['option'];
      if (o.label === correct?.label) classes.push('correct');
      if (selected && o.label === selected) classes.push('selected');
      if (selected && o.label === selected && !answer?.correct) classes.push('wrong');
      return `<button class="${classes.join(' ')}" data-label="${String(o.label || '').replace(/"/g, '&quot;')}" disabled><span class="letter">${o.label || ''}</span><span>${o.text || ''}</span></button>`;
    }).join('');

    setHidden($('.q-tools'), true);
    setHidden($('.confidence'), true);
    setHidden($('#qSubmit'), true);
    setHidden($('#qFeedback .form-grid'), true);
    setHidden($('#qFeedback .note-box'), true);
    setHidden($('#qFeedback .review-buttons'), true);
    if ($('#qSubmit')) $('#qSubmit').disabled = true;

    $('#feedbackTag').textContent = answer?.correct ? 'Correct' : selected ? 'Incorrect' : 'Skipped';
    $('#feedbackTag').className = `tag ${answer?.correct ? 'good' : 'bad'}`;
    $('#feedbackTitle').textContent = answer?.correct
      ? `Your answer: ${selected}`
      : `Your answer: ${selected || 'Skipped'} · Correct: ${correct?.label || '—'}`;
    $('#feedbackExplanation').textContent = q.answer_explanation || 'No explanation provided.';
    $('#feedbackExplanation').classList.remove('hidden');
    $('#feedbackReference').textContent = q.reference_text || '';
    $('#qFeedback').classList.remove('hidden');
    $('#qNext').textContent = state.pos + 1 >= last.questions.length ? 'Back to summary' : 'Next answer';
  }

  function openReview() {
    if (typeof app === 'undefined' || !app.lastSession?.questions?.length) return;
    state.active = true;
    state.pos = 0;
    state.last = app.lastSession;
    $('#practiceSetup')?.classList.add('hidden');
    $('#sessionSummary')?.classList.add('hidden');
    $('#practiceShell')?.classList.remove('hidden');
    if (typeof navigate === 'function') navigate('practice');
    renderReviewItem();
  }

  function closeReview() {
    state.active = false;
    state.pos = 0;
    state.last = null;
    $('#practiceShell')?.classList.add('hidden');
    $('#practiceSetup')?.classList.add('hidden');
    $('#sessionSummary')?.classList.remove('hidden');
    restoreControls();
  }

  document.addEventListener('click', (event) => {
    const reviewButton = event.target.closest?.('#reviewSession');
    if (reviewButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openReview();
      return;
    }

    const nextButton = event.target.closest?.('#qNext');
    if (nextButton && state.active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.pos + 1 >= state.last.questions.length) closeReview();
      else {
        state.pos += 1;
        renderReviewItem();
      }
    }
  }, true);
})();
