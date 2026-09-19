(() => {
  'use strict';

  const MANIFEST = '../data/pyq/manifest.json';
  const FALLBACK = [
    '../data/pyq/2021_2026/2021.json','../data/pyq/2021_2026/2022.json','../data/pyq/2021_2026/2023.json',
    '../data/pyq/2021_2026/2024.json','../data/pyq/2021_2026/2024-expansion-a.json','../data/pyq/2021_2026/2024-expansion-b.json',
    '../data/pyq/2021_2026/2024-expansion-c.json','../data/pyq/2021_2026/2024-expansion-d.json','../data/pyq/2021_2026/2025.json',
    '../data/pyq/2021_2026/2025-expansion-a.json','../data/pyq/2021_2026/2025-expansion-b.json','../data/pyq/2021_2026/2025-expansion-c.json',
    '../data/pyq/2021_2026/2026.json'
  ];

  const STOP = new Set(['the','and','for','with','from','into','this','that','which','what','when','where','are','was','were','has','have','had','not','but','can','may','more','most','than','then','their','there','also','used','using','use','of','to','in','on','is','a','an','as','at','by','or','be','if','it']);

  let cache = null;
  let loading = null;

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const toks = s => new Set(norm(s).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)));

  async function files() {
    try {
      const r = await fetch(MANIFEST, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      const list = Array.isArray(data) ? data : data.files;
      if (Array.isArray(list) && list.length) return list.map(x => '../' + x);
    } catch (_) {}
    return FALLBACK;
  }

  async function load() {
    if (cache) return cache;
    if (loading) return loading;
    loading = (async () => {
      const list = await files();
      const parts = await Promise.all(list.map(async file => {
        const r = await fetch(file);
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data) ? data : [];
      }));
      const seen = new Set();
      cache = parts.flat().filter(q => q && q.external_id && !seen.has(q.external_id) && seen.add(q.external_id));
      return cache;
    })();
    return loading;
  }

  function score(note, q) {
    const p = note.properties || {};
    const title = norm(note.title);
    const subject = norm(p.subject);
    const system = norm(p.system);
    const qt = norm(q.topic);
    const qs = norm(q.subtopic);
    const qsub = norm(q.subject);
    const qsys = norm(q.system);
    let s = 0;

    if (title && title === qt) s += 120;
    if (title && title === qs) s += 100;
    if (title && qt.includes(title)) s += 72;
    if (title && qs.includes(title)) s += 65;
    if (title && norm(q.stem).includes(title)) s += 52;
    if (subject && subject === qsub) s += 14;
    if (system && system === qsys) s += 18;

    const a = toks(note.title + ' ' + (p.topic || '') + ' ' + (p.subtopic || ''));
    const b = toks((q.topic || '') + ' ' + (q.subtopic || '') + ' ' + (q.stem || ''));
    let shared = 0;
    a.forEach(t => { if (b.has(t)) shared += 1; });
    s += Math.min(40, shared * 8);

    return s;
  }

  function matchFrom(questions, note, limit = 15) {
    return questions
      .map(q => ({ q, score: score(note, q) }))
      .filter(x => x.score >= 16)
      .sort((a,b) => b.score - a.score || Number(b.q.exam_year || 0) - Number(a.q.exam_year || 0))
      .slice(0, limit);
  }

  async function match(note, limit = 15) {
    return matchFrom(await load(), note, limit);
  }

  function mirroredStateMap() {
    try {
      const rows = JSON.parse(localStorage.getItem('neetpg2027:qstate-mirror') || '[]');
      return new Map((Array.isArray(rows) ? rows : []).filter(x => x && x.qid).map(x => [x.qid, x]));
    } catch (_) {
      return new Map();
    }
  }

  async function studyStateMap() {
    const mirror = mirroredStateMap();
    try {
      if (!indexedDB.databases) return mirror;
      const databases = await indexedDB.databases();
      if (!databases.some(x => x.name === 'neetpg2027-static-v2')) return mirror;
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('neetpg2027-static-v2');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains('qstate')) { db.close(); return mirror; }
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction('qstate','readonly');
        const req = tx.objectStore('qstate').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      db.close();
      const live = new Map(rows.map(x => [x.qid, x]));
      mirror.forEach((value, key) => { if (!live.has(key)) live.set(key, value); });
      return live;
    } catch (_) {
      return mirror;
    }
  }

  function summarizeMatches(matches, states) {
    const years = [...new Set(matches.map(x => x.q.exam_year).filter(Boolean))].sort();
    const subjects = [...new Set(matches.map(x => x.q.subject).filter(Boolean))].sort();
    const matchedStates = matches.map(x => states.get(x.q.external_id)).filter(Boolean);
    const attemptedRows = matchedStates.filter(x => Number(x.attempts || 0) > 0);
    const attempts = attemptedRows.reduce((sum, x) => sum + Number(x.attempts || 0), 0);
    const correct = attemptedRows.reduce((sum, x) => sum + Number(x.correct || 0), 0);
    const accuracy = attempts ? Math.round(correct / attempts * 100) : null;
    const coverage = matches.length ? Math.round(attemptedRows.length / matches.length * 100) : 0;
    const readiness = attempts ? Math.round((accuracy * 0.70) + (coverage * 0.30)) : null;
    const band = readiness == null ? 'unmeasured' : readiness < 50 ? 'weak' : readiness < 70 ? 'building' : readiness < 85 ? 'strong' : 'mastered';
    const weakQuestions = matches.filter(x => {
      const s = states.get(x.q.external_id);
      return s && Number(s.attempts || 0) > 0 && Number(s.correct || 0) / Math.max(1, Number(s.attempts || 0)) < 0.6;
    });
    const unseenQuestions = matches.filter(x => {
      const s = states.get(x.q.external_id);
      return !s || Number(s.attempts || 0) === 0;
    });
    return {
      count: matches.length, years, subjects, matches,
      attempted: attemptedRows.length, attempts, correct, accuracy, coverage,
      readiness, band, weakQuestions, unseenQuestions
    };
  }

  async function summary(note) {
    const questions = await load();
    const states = await studyStateMap();
    return summarizeMatches(matchFrom(questions, note, 200), states);
  }

  async function batchSummary(notes) {
    const questions = await load();
    const states = await studyStateMap();
    const out = new Map();
    for (const note of notes || []) {
      out.set(note.id, summarizeMatches(matchFrom(questions, note, 200), states));
    }
    return out;
  }

  async function searchQuestions(query, limit = 10) {
    const questions = await load();
    const qn = norm(query);
    const qt = toks(query);
    return questions.map(q => {
      const hay = norm((q.topic || '') + ' ' + (q.subtopic || '') + ' ' + (q.subject || '') + ' ' + (q.system || '') + ' ' + (q.stem || ''));
      const ht = toks(hay);
      let s = qn && hay.includes(qn) ? 70 : 0;
      qt.forEach(t => { if (ht.has(t)) s += 9; });
      if (qn && norm(q.topic) === qn) s += 70;
      if (qn && norm(q.subtopic) === qn) s += 55;
      return { q, score: s };
    }).filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score || Number(b.q.exam_year || 0) - Number(a.q.exam_year || 0))
      .slice(0, limit);
  }

  function questionUrl(q) {
    return '../?nvq=' + encodeURIComponent(q.external_id) + '&source=neuralvault';
  }

  function topicUrl(note, options = {}) {
    const p = note.properties || {};
    const params = new URLSearchParams({ source: 'neuralvault' });
    if (p.subject) params.set('nvsubject', p.subject);
    if (note.title) params.set('nvtopic', note.title);
    if (options.practice) params.set('nvpractice', '1');
    return '../?' + params.toString();
  }

  function practiceUrl(matches, note) {
    const ids = (matches || []).map(x => x.q?.external_id || x.external_id).filter(Boolean).slice(0, 15);
    if (!ids.length) return topicUrl(note, { practice: true });
    const params = new URLSearchParams({ source: 'neuralvault', nvqs: ids.join(',') });
    return '../?' + params.toString();
  }

  window.NeuralVaultMedical = { load, match, summary, batchSummary, searchQuestions, questionUrl, topicUrl, practiceUrl };
})();