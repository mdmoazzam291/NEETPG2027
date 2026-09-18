(() => {
  'use strict';

  const YEAR_OPTIONS = [
    ['all', 'All PYQ years'],
    ['last3', 'Last 3 years (2024–2026)'],
    ['last5', 'Last 5 years (2022–2026)'],
    ['2026', '2026'], ['2025', '2025'], ['2024', '2024'],
    ['2023', '2023'], ['2022', '2022'], ['2021', '2021']
  ];
  const REPEAT_OPTIONS = [
    ['all', 'Any repeat count'],
    ['2', 'Repeated 2+ years'],
    ['3', 'Repeated 3+ years']
  ];

  let baseGet = null;
  let baseSessionConfig = null;
  let basePreset = null;
  let baseSetPracticeForm = null;
  let baseRenderQuestion = null;
  let baseBankFilter = null;

  const yearOf = q => {
    const n = Number(q?.exam_year);
    return Number.isInteger(n) && n >= 2000 ? n : null;
  };

  function allQuestions() {
    if (!baseGet) return [];
    return baseGet({mode:'all', order:'none'});
  }

  function repeatIndex() {
    const map = new Map();
    for (const q of allQuestions()) {
      if (!q.repeat_key) continue;
      const y = yearOf(q);
      if (!y) continue;
      if (!map.has(q.repeat_key)) map.set(q.repeat_key, new Set());
      map.get(q.repeat_key).add(y);
    }
    return map;
  }

  function enrich(q, index = repeatIndex()) {
    const y = yearOf(q);
    const years = q.repeat_key && index.has(q.repeat_key)
      ? [...index.get(q.repeat_key)].sort((a,b)=>a-b)
      : (y ? [y] : []);
    q.exam_year = y;
    q.occurrence_years = years;
    q.repeat_count = years.length || (q.repeat_key ? 1 : 0);
    q.is_pyq_recall = q.pyq_status === 'memory_based_recall' || !!y;
    return q;
  }

  function yearMatches(q, filter) {
    if (!filter || filter === 'all') return true;
    const y = yearOf(q);
    if (!y) return false;
    if (filter === 'last3') return y >= 2024 && y <= 2026;
    if (filter === 'last5') return y >= 2022 && y <= 2026;
    return y === Number(filter);
  }

  function repeatMatches(q, filter, index) {
    if (!filter || filter === 'all') return true;
    const count = enrich(q, index).repeat_count;
    return count >= Number(filter);
  }

  function optionsHtml(items) {
    return items.map(([value,label]) => `<option value="${value}">${label}</option>`).join('');
  }

  function installControls() {
    const pTopic = document.querySelector('#pTopic');
    if (pTopic && !document.querySelector('#pYear')) {
      const year = document.createElement('div');
      year.className = 'field';
      year.innerHTML = `<label>PYQ year</label><select id="pYear">${optionsHtml(YEAR_OPTIONS)}</select>`;
      pTopic.closest('.field')?.after(year);

      const repeat = document.createElement('div');
      repeat.className = 'field';
      repeat.innerHTML = `<label>Repeat frequency</label><select id="pRepeat">${optionsHtml(REPEAT_OPTIONS)}</select>`;
      year.after(repeat);
    }

    const bankDifficulty = document.querySelector('#bankDifficulty');
    if (bankDifficulty && !document.querySelector('#bankYear')) {
      const year = document.createElement('select');
      year.id = 'bankYear';
      year.innerHTML = optionsHtml(YEAR_OPTIONS);
      bankDifficulty.after(year);

      const repeat = document.createElement('select');
      repeat.id = 'bankRepeat';
      repeat.innerHTML = optionsHtml(REPEAT_OPTIONS);
      year.after(repeat);
    }

    const qTopic = document.querySelector('#qTopic');
    if (qTopic && !document.querySelector('#qYear')) {
      const y = document.createElement('span');
      y.className = 'tag hidden';
      y.id = 'qYear';
      qTopic.after(y);

      const r = document.createElement('span');
      r.className = 'tag hidden';
      r.id = 'qRepeat';
      y.after(r);
    }
  }

  function patchCore() {
    baseGet = window.getFilteredQuestions;
    baseSessionConfig = window.sessionConfigFromForm;
    basePreset = window.builtInPreset;
    baseSetPracticeForm = window.setPracticeForm;
    baseRenderQuestion = window.renderQuestion;
    baseBankFilter = window.bankFilter;

    if (typeof baseGet === 'function') {
      window.getFilteredQuestions = function(cfg={}) {
        const index = repeatIndex();
        return baseGet(cfg)
          .map(q => enrich(q, index))
          .filter(q => yearMatches(q, cfg.year))
          .filter(q => repeatMatches(q, cfg.repeat, index));
      };
    }

    if (typeof baseSessionConfig === 'function') {
      window.sessionConfigFromForm = function() {
        return {
          ...baseSessionConfig(),
          year: document.querySelector('#pYear')?.value || 'all',
          repeat: document.querySelector('#pRepeat')?.value || 'all'
        };
      };
    }

    if (typeof basePreset === 'function') {
      window.builtInPreset = function(name) {
        return {...basePreset(name), year:'all', repeat:'all'};
      };
    }

    if (typeof baseSetPracticeForm === 'function') {
      window.setPracticeForm = function(c) {
        baseSetPracticeForm(c);
        const y = document.querySelector('#pYear');
        const r = document.querySelector('#pRepeat');
        if (y) y.value = c.year || 'all';
        if (r) r.value = c.repeat || 'all';
      };
    }

    if (typeof baseRenderQuestion === 'function') {
      window.renderQuestion = function() {
        baseRenderQuestion();
        const q = typeof currentQ === 'function' ? currentQ() : null;
        const index = repeatIndex();
        if (q) enrich(q, index);
        const y = document.querySelector('#qYear');
        const r = document.querySelector('#qRepeat');
        if (y) {
          y.textContent = q?.exam_year ? `PYQ ${q.exam_year}` : '';
          y.classList.toggle('hidden', !q?.exam_year);
        }
        if (r) {
          const years = q?.occurrence_years || [];
          r.textContent = q?.repeat_count >= 2 ? `${q.repeat_count}× concept · ${years.join(', ')}` : '';
          r.classList.toggle('hidden', !(q?.repeat_count >= 2));
        }
      };
    }

    if (typeof baseBankFilter === 'function') {
      window.bankFilter = function() {
        baseBankFilter();
        applyBankFilters();
      };
    }
  }

  function filteredBankFromUi() {
    const term = document.querySelector('#bankSearch')?.value.trim().toLowerCase() || '';
    const subject = document.querySelector('#bankSubject')?.value || 'all';
    const system = document.querySelector('#bankSystem')?.value || 'all';
    const status = document.querySelector('#bankStatus')?.value || 'all';
    const diff = document.querySelector('#bankDifficulty')?.value || 'all';
    const year = document.querySelector('#bankYear')?.value || 'all';
    const repeat = document.querySelector('#bankRepeat')?.value || 'all';
    const index = repeatIndex();

    return allQuestions().map(q => enrich(q,index)).filter(q => {
      const st = typeof stateFor === 'function' ? stateFor(q.external_id) : {};
      const hay = `${q.stem||''} ${q.subject||''} ${q.system||''} ${q.topic||''} ${q.subtopic||''} ${q.exam_year||''}`.toLowerCase();
      if (term && !hay.includes(term)) return false;
      if (subject !== 'all' && q.subject !== subject) return false;
      if (system !== 'all' && q.system !== system) return false;
      if (diff !== 'all' && q.difficulty !== Number(diff)) return false;
      if (!yearMatches(q, year)) return false;
      if (!repeatMatches(q, repeat, index)) return false;
      if (status === 'unseen' && st.attempts) return false;
      if (status === 'correct' && st.lastCorrect !== true) return false;
      if (status === 'incorrect' && st.lastCorrect !== false) return false;
      if (status === 'bookmarked' && !st.bookmarked) return false;
      if (status === 'due' && !(st.dueAt && st.dueAt <= Date.now())) return false;
      return true;
    });
  }

  function applyBankFilters() {
    const allowed = new Set(filteredBankFromUi().map(q => q.external_id));
    let visible = 0;
    document.querySelectorAll('#bankBody tr').forEach(tr => {
      const id = tr.querySelector('[data-practice-q]')?.dataset.practiceQ;
      const show = allowed.has(id);
      tr.hidden = !show;
      if (show) visible++;
    });
    const count = document.querySelector('#bankCount');
    if (count) count.textContent = `${visible} of ${allQuestions().length} questions`;
  }

  function bindUi() {
    for (const id of ['bankSearch','bankSubject','bankSystem','bankStatus','bankDifficulty','bankYear','bankRepeat']) {
      document.querySelector(`#${id}`)?.addEventListener('input', () => {
        baseBankFilter?.();
        applyBankFilters();
      });
    }
    const practice = document.querySelector('#practiceFiltered');
    if (practice) {
      practice.onclick = () => {
        const qs = filteredBankFromUi();
        if (typeof buildSession === 'function' && typeof builtInPreset === 'function') {
          buildSession(qs, {...builtInPreset('rapid'), mode:'filtered', count:Math.min(50,qs.length), order:'adaptive'});
        }
      };
    }
  }

  function boot() {
    const wait = setInterval(() => {
      if (!window.NEETPG_PHASE10 || typeof window.getFilteredQuestions !== 'function') return;
      const probe = window.NEETPG_PHASE10.allQuestions?.() || [];
      if (!probe.length) return;
      clearInterval(wait);
      installControls();
      patchCore();
      bindUi();
      applyBankFilters();
      window.NEETPG_PYQ = {
        version:1,
        allQuestions,
        enrich,
        repeatIndex,
        filteredBankFromUi,
        yearMatches
      };
    }, 50);
    setTimeout(() => clearInterval(wait), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
