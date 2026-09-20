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
  let baseNavigate = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const yearOf = q => {
    const n = Number(q?.exam_year);
    return Number.isInteger(n) && n >= 2000 ? n : null;
  };

  function allQuestions() {
    if (!baseGet) return [];
    return baseGet({mode:'all', order:'none'});
  }

  function pyqQuestions() {
    return allQuestions().filter(q => yearOf(q));
  }

  function repeatIndex() {
    const map = new Map();
    for (const q of pyqQuestions()) {
      if (!q.repeat_key) continue;
      const y = yearOf(q);
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
    q.is_pyq_recall = q.pyq_status === 'memory_based_recall' ||
      q.pyq_status === 'memory_based_topic_reconstruction' || !!y;
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

  function installIntelligenceView() {
    if (document.querySelector('#view-pyq')) return;
    const content = document.querySelector('.content');
    if (!content) return;

    const section = document.createElement('section');
    section.className = 'view';
    section.id = 'view-pyq';
    section.innerHTML = `
      <div class="page-head">
        <div><h2>PYQ Intelligence</h2><p>See what has been captured, what repeats across years, and where the exam keeps returning.</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="pyqRecent">Practice 2024–2026</button>
          <button class="btn primary" id="pyqRepeated">Practice repeated concepts</button>
        </div>
      </div>
      <div class="callout small" id="pyqProvenanceNote">Public NEET-PG PYQs are memory-based reconstructions. Repeat counts here mean distinct exam years sharing a normalized concept, not duplicated websites.</div>
      <div class="grid stats" style="margin-top:16px">
        <div class="card stat-card"><span class="stat-label">Captured PYQs</span><strong class="stat-number" id="pyqTotal">0</strong><span class="stat-note">2021–2026 seed</span></div>
        <div class="card stat-card"><span class="stat-label">Years</span><strong class="stat-number" id="pyqYears">0</strong><span class="stat-note">with imported recalls</span></div>
        <div class="card stat-card"><span class="stat-label">Repeated concepts</span><strong class="stat-number" id="pyqRepeatConcepts">0</strong><span class="stat-note">seen in 2+ years</span></div>
        <div class="card stat-card"><span class="stat-label">Unverified</span><strong class="stat-number" id="pyqUnverified">0</strong><span class="stat-note">awaiting explicit review</span></div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="card"><h3>Coverage by exam year</h3><div id="pyqYearBars" class="bar-list"></div></div>
        <div class="card"><h3>Most repeated concepts</h3><div id="pyqRepeatList" class="list"></div></div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <div class="card"><h3>Subject distribution</h3><div id="pyqSubjectBars" class="bar-list"></div></div>
        <div class="card"><h3>System distribution</h3><div id="pyqSystemBars" class="bar-list"></div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <div class="section-title" style="margin-top:0"><h3>Year × subject matrix</h3><span class="muted small">Captured recall count, not official exam weightage</span></div>
        <div style="overflow:auto"><table class="question-table"><thead id="pyqMatrixHead"></thead><tbody id="pyqMatrixBody"></tbody></table></div>
      </div>`;
    content.appendChild(section);

    const nav = document.querySelector('#view-bank .section-title') || document.querySelector('#view-bank');
    if (nav && !nav.querySelector('[data-view="pyq"]')) {
      const b = document.createElement('button');
      b.dataset.view = 'pyq';
      b.innerHTML = '<span>⌁</span> <span>PYQ Intelligence</span>';
      b.onclick = () => window.navigate?.('pyq');
      const analytics = nav.querySelector('[data-view="analytics"]');
      if (analytics) nav.insertBefore(b, analytics);
      else nav.appendChild(b);
    }
  }

  function countBy(items, keyFn) {
    const out = new Map();
    for (const item of items) {
      const key = keyFn(item) || 'Uncategorized';
      out.set(key, (out.get(key) || 0) + 1);
    }
    return [...out.entries()].sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0])));
  }

  function barRows(entries, max, limit=20) {
    const denom = Math.max(1, max || Math.max(0, ...entries.map(([,n])=>n)));
    return entries.slice(0,limit).map(([label,n]) =>
      `<div class="bar-row"><span title="${esc(label)}">${esc(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,Math.round(n/denom*100))}%"></div></div><strong>${n}</strong></div>`
    ).join('') || '<div class="empty">No PYQ data yet.</div>';
  }

  function repeatRows() {
    const idx = repeatIndex();
    const qs = pyqQuestions();
    return [...idx.entries()].map(([key,years]) => {
      const related = qs.filter(q => q.repeat_key === key);
      const representative = related[0] || {};
      return {
        key,
        years:[...years].sort((a,b)=>a-b),
        count:years.size,
        label:representative.subtopic || representative.topic || key,
        subject:representative.subject || 'Uncategorized',
        related
      };
    }).filter(x=>x.count>=2).sort((a,b)=>b.count-a.count || b.years.at(-1)-a.years.at(-1) || xLabel(a).localeCompare(xLabel(b)));
  }
  function xLabel(x){ return String(x?.label || x?.key || ''); }

  function renderMatrix(items) {
    const years=[...new Set(items.map(yearOf).filter(Boolean))].sort((a,b)=>b-a);
    const subjects=[...new Set(items.map(q=>q.subject||'Uncategorized'))].sort();
    const head=document.querySelector('#pyqMatrixHead');
    const body=document.querySelector('#pyqMatrixBody');
    if (!head || !body) return;
    head.innerHTML='<tr><th>Subject</th>'+years.map(y=>`<th>${y}</th>`).join('')+'<th>Total</th></tr>';
    body.innerHTML=subjects.map(subject=>{
      const counts=years.map(y=>items.filter(q=>(q.subject||'Uncategorized')===subject&&yearOf(q)===y).length);
      const total=counts.reduce((a,b)=>a+b,0);
      return `<tr><td>${esc(subject)}</td>${counts.map(n=>`<td>${n||'—'}</td>`).join('')}<td><strong>${total}</strong></td></tr>`;
    }).join('');
  }

  function renderIntelligence() {
    const items = pyqQuestions().map(q=>enrich(q));
    const repeats = repeatRows();
    const years = [...new Set(items.map(yearOf).filter(Boolean))].sort((a,b)=>b-a);
    const unverified = items.filter(q => (q.verification_status || 'unverified') === 'unverified').length;

    const setText=(id,value)=>{const el=document.querySelector(id); if(el)el.textContent=String(value)};
    setText('#pyqTotal',items.length);
    setText('#pyqYears',years.length);
    setText('#pyqRepeatConcepts',repeats.length);
    setText('#pyqUnverified',unverified);

    const yearEntries = years.map(y=>[String(y),items.filter(q=>yearOf(q)===y).length]);
    const subjectEntries = countBy(items,q=>q.subject);
    const systemEntries = countBy(items,q=>q.system);
    const maxYear = Math.max(1,...yearEntries.map(([,n])=>n));
    const maxSubject = Math.max(1,...subjectEntries.map(([,n])=>n));
    const maxSystem = Math.max(1,...systemEntries.map(([,n])=>n));

    const yearBars=document.querySelector('#pyqYearBars');
    const subjectBars=document.querySelector('#pyqSubjectBars');
    const systemBars=document.querySelector('#pyqSystemBars');
    if(yearBars)yearBars.innerHTML=barRows(yearEntries,maxYear,10);
    if(subjectBars)subjectBars.innerHTML=barRows(subjectEntries,maxSubject,15);
    if(systemBars)systemBars.innerHTML=barRows(systemEntries,maxSystem,15);

    const list=document.querySelector('#pyqRepeatList');
    if(list){
      list.innerHTML = repeats.length ? repeats.slice(0,20).map(r=>`
        <div class="list-item">
          <span class="tag">${r.count}×</span>
          <div class="grow"><strong>${esc(r.label)}</strong><p>${esc(r.subject)} · ${r.years.join(', ')}</p></div>
          <button class="btn small" data-pyq-repeat="${esc(r.key)}">Practice</button>
        </div>`).join('') : '<div class="empty">No cross-year repeats detected yet.</div>';
      list.querySelectorAll('[data-pyq-repeat]').forEach(btn=>{
        btn.onclick=()=>practiceRepeat(btn.dataset.pyqRepeat);
      });
    }
    renderMatrix(items);
  }

  function practiceQuestions(items, label) {
    if (!items.length || typeof buildSession !== 'function' || typeof builtInPreset !== 'function') return;
    const cfg={...builtInPreset('rapid'),mode:'pyq',count:Math.min(50,items.length),order:'random',year:'all',repeat:'all'};
    buildSession(items,cfg);
    if (typeof toast === 'function') toast(label);
  }

  function practiceRepeat(key) {
    const items=pyqQuestions().filter(q=>q.repeat_key===key).map(q=>enrich(q));
    practiceQuestions(items,`Repeated concept · ${items.length} PYQs`);
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

  function patchCore() {
    baseGet = window.getFilteredQuestions;
    baseSessionConfig = window.sessionConfigFromForm;
    basePreset = window.builtInPreset;
    baseSetPracticeForm = window.setPracticeForm;
    baseRenderQuestion = window.renderQuestion;
    baseBankFilter = window.bankFilter;
    baseNavigate = window.navigate;

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
      window.renderQuestion = function(...args) {
        baseRenderQuestion(...args);
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
      window.bankFilter = function(...args) {
        baseBankFilter(...args);
      };
    }

    if (typeof baseNavigate === 'function') {
      window.navigate = function(view) {
        baseNavigate(view);
        if (view === 'pyq') {
          const title=document.querySelector('#topTitle');
          if(title)title.textContent='PYQ Intelligence';
          renderIntelligence();
        }
      };
    }
  }

  function bindUi() {
    for (const id of ['bankSearch','bankSubject','bankSystem','bankStatus','bankDifficulty','bankYear','bankRepeat']) {
      document.querySelector(`#${id}`)?.addEventListener('input', () => {
        baseBankFilter?.();

      });
    }
    const practice = document.querySelector('#practiceFiltered');
    if (practice) {
      practice.onclick = () => {
        const qs = filteredBankFromUi();
        practiceQuestions(qs,'Practicing filtered PYQs');
      };
    }
    document.querySelector('#pyqRecent')?.addEventListener('click',()=>{
      practiceQuestions(pyqQuestions().filter(q=>yearOf(q)>=2024),'Practicing 2024–2026 PYQs');
    });
    document.querySelector('#pyqRepeated')?.addEventListener('click',()=>{
      const idx=repeatIndex();
      practiceQuestions(pyqQuestions().filter(q=>q.repeat_key && (idx.get(q.repeat_key)?.size||0)>=2),'Practicing repeated PYQ concepts');
    });
  }

  function boot() {
    const wait = setInterval(() => {
      if (!window.NEETPG_PHASE10 || typeof window.getFilteredQuestions !== 'function') return;
      const probe = window.NEETPG_PHASE10.allQuestions?.() || [];
      if (!probe.length) return;
      clearInterval(wait);
      installControls();
      installIntelligenceView();
      patchCore();
      bindUi();
      window.bankFilter?.();
      renderIntelligence();
      window.NEETPG_PYQ = {
        version:2,
        allQuestions,
        pyqQuestions,
        enrich,
        repeatIndex,
        repeatRows,
        filteredBankFromUi,
        yearMatches,
        renderIntelligence,
        practiceRepeat
      };
    }, 50);
    setTimeout(() => clearInterval(wait), 15000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
