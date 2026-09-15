// NEET-PG pacing layer for the GitHub-only study engine.
// NBEMS pattern: 40 questions in 42 minutes per time-bound section.
// 42*60/40 = 63 seconds average pace per question.
(() => {
  const PACE_SECONDS = 63;
  const WARNING_SECONDS = 45;
  const SECTION_QUESTIONS = 40;
  const SECTION_SECONDS = 42 * 60;

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  }

  function setTimerClass(el, cls) {
    if (!el) return;
    el.classList.remove('good', 'warn', 'bad', 'neetpg-timer');
    el.classList.add('neetpg-timer', cls);
  }

  function ensureStyles() {
    if (document.getElementById('neetpgTimerStyles')) return;
    const style = document.createElement('style');
    style.id = 'neetpgTimerStyles';
    style.textContent = `
      .neetpg-guideline{grid-column:1/-1;border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);background:color-mix(in srgb,var(--accent) 8%,var(--card));border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start}
      .neetpg-guideline strong{display:block;margin-bottom:3px}.neetpg-guideline p{margin:0;color:var(--muted);font-size:.88rem;line-height:1.45}
      .neetpg-timer{font-variant-numeric:tabular-nums;font-weight:800;letter-spacing:.01em;white-space:nowrap}
      .neetpg-timer.good{background:#e8f6ef!important;color:#146b43!important;border-color:#bce4cf!important}
      .neetpg-timer.warn{background:#fff5db!important;color:#8a5a00!important;border-color:#f0d28a!important}
      .neetpg-timer.bad{background:#fdeaea!important;color:#a52f2f!important;border-color:#efb7b7!important}
      [data-theme="dark"] .neetpg-timer.good{background:#123b2a!important;color:#9de3bc!important;border-color:#266a49!important}
      [data-theme="dark"] .neetpg-timer.warn{background:#473711!important;color:#ffd77a!important;border-color:#765d21!important}
      [data-theme="dark"] .neetpg-timer.bad{background:#4b2020!important;color:#ffaaaa!important;border-color:#7f3838!important}
      .neetpg-section{font-variant-numeric:tabular-nums;white-space:nowrap}.neetpg-pace-note{font-weight:700;white-space:nowrap}
      @media(max-width:700px){.neetpg-pace-note{display:none}.neetpg-section{font-size:.76rem}}
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    ensureStyles();
    const timerSelect = document.getElementById('pTimer');
    if (timerSelect && !timerSelect.querySelector('option[value="neetpg"]')) {
      const option = document.createElement('option');
      option.value = 'neetpg';
      option.textContent = 'NEET-PG pace · 63s avg + 42m section';
      timerSelect.insertBefore(option, timerSelect.firstChild);
    }

    const seconds = document.getElementById('pSeconds');
    if (seconds) {
      seconds.value = String(PACE_SECONDS);
      const label = seconds.closest('.field')?.querySelector('label');
      if (label) label.textContent = 'Pace seconds / question';
    }

    const grid = timerSelect?.closest('.form-grid');
    if (grid && !document.getElementById('neetpgGuideline')) {
      const info = document.createElement('div');
      info.id = 'neetpgGuideline';
      info.className = 'neetpg-guideline';
      info.innerHTML = `<span style="font-size:1.25rem">⏱</span><div><strong>NEET-PG exam pace</strong><p>40 questions in 42 minutes = <b>63 seconds average per question</b>. The real exam locks the section, not each question, so this pace timer warns at 63s but does not auto-submit.</p></div>`;
      grid.appendChild(info);
    }

    const qTimer = document.getElementById('qTimer');
    if (qTimer && !document.getElementById('qSectionTimer')) {
      const section = document.createElement('span');
      section.id = 'qSectionTimer';
      section.className = 'tag neetpg-section hidden';
      qTimer.before(section);
      const pace = document.createElement('span');
      pace.id = 'qPaceStatus';
      pace.className = 'tag neetpg-pace-note hidden';
      section.before(pace);
    }

    const sync = () => {
      if (!timerSelect || !seconds) return;
      const active = timerSelect.value === 'neetpg';
      seconds.disabled = active;
      if (active) seconds.value = String(PACE_SECONDS);
    };
    timerSelect?.addEventListener('change', sync);
    sync();
  }

  const originalSessionConfigFromForm = sessionConfigFromForm;
  sessionConfigFromForm = function () {
    const cfg = originalSessionConfigFromForm();
    if (document.getElementById('pTimer')?.value === 'neetpg') {
      cfg.timer = 'neetpg';
      cfg.seconds = PACE_SECONDS;
    }
    return cfg;
  };

  const originalApplyDefaultsToPractice = applyDefaultsToPractice;
  applyDefaultsToPractice = function () {
    originalApplyDefaultsToPractice();
    ensureUi();
    const timer = document.getElementById('pTimer');
    const seconds = document.getElementById('pSeconds');
    if (timer) timer.value = 'neetpg';
    if (seconds) { seconds.value = String(PACE_SECONDS); seconds.disabled = true; }
  };

  const originalSetPracticeForm = setPracticeForm;
  setPracticeForm = function (cfg) {
    originalSetPracticeForm(cfg);
    ensureUi();
    const timer = document.getElementById('pTimer');
    const seconds = document.getElementById('pSeconds');
    if (timer?.value === 'neetpg' && seconds) { seconds.value = String(PACE_SECONDS); seconds.disabled = true; }
    else if (seconds) seconds.disabled = false;
  };

  const originalBuiltInPreset = builtInPreset;
  builtInPreset = function (name) {
    const cfg = originalBuiltInPreset(name);
    if (name !== 'inicet') {
      cfg.timer = 'neetpg';
      cfg.seconds = PACE_SECONDS;
    }
    return cfg;
  };

  const originalStartTimer = startTimer;
  startTimer = function () {
    const s = app.session;
    if (!s || s.cfg.timer !== 'neetpg') return originalStartTimer();
    clearInterval(s.timerId);
    s._neetSectionIndex = 0;
    s._neetSectionStartedAt = now();
    s._paceAlertedForPos = -1;
    s.timerId = setInterval(() => updateTimerLabel(), 250);
    updateTimerLabel();
  };

  const originalUpdateTimerLabel = updateTimerLabel;
  updateTimerLabel = function () {
    const s = app.session;
    if (!s || s.cfg.timer !== 'neetpg') {
      document.getElementById('qSectionTimer')?.classList.add('hidden');
      document.getElementById('qPaceStatus')?.classList.add('hidden');
      return originalUpdateTimerLabel();
    }

    const qElapsed = elapsedCurrent();
    const qTimer = document.getElementById('qTimer');
    const pace = document.getElementById('qPaceStatus');
    const section = document.getElementById('qSectionTimer');
    if (!qTimer || !pace || !section) return;

    qTimer.textContent = `Q ${fmt(qElapsed)} / 01:03`;
    let timerClass = 'good';
    let paceText = 'On pace';
    if (qElapsed >= PACE_SECONDS) {
      timerClass = 'bad';
      paceText = `+${qElapsed - PACE_SECONDS}s over pace`;
      if (s._paceAlertedForPos !== s.pos) {
        s._paceAlertedForPos = s.pos;
        toast('63-second NEET-PG pace reached. Decide, flag, or move on.');
      }
    } else if (qElapsed >= WARNING_SECONDS) {
      timerClass = 'warn';
      paceText = `${PACE_SECONDS - qElapsed}s to pace target`;
    }
    setTimerClass(qTimer, timerClass);
    pace.textContent = paceText;
    pace.classList.remove('hidden');
    setTimerClass(pace, timerClass);

    const sectionIndex = Math.floor(s.pos / SECTION_QUESTIONS);
    if (s._neetSectionIndex !== sectionIndex) {
      s._neetSectionIndex = sectionIndex;
      s._neetSectionStartedAt = now();
    }
    const sectionElapsed = Math.floor((now() - s._neetSectionStartedAt) / 1000);
    const left = Math.max(0, SECTION_SECONDS - sectionElapsed);
    const letter = String.fromCharCode(65 + Math.min(sectionIndex, 25));
    section.textContent = `Section ${letter} · ${fmt(left)} / 42:00`;
    section.classList.remove('hidden');
    setTimerClass(section, left <= 300 ? 'bad' : left <= 600 ? 'warn' : 'good');
  };

  ensureUi();
})();
