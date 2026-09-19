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

  async function match(note, limit = 15) {
    const questions = await load();
    return questions
      .map(q => ({ q, score: score(note, q) }))
      .filter(x => x.score >= 16)
      .sort((a,b) => b.score - a.score || Number(b.q.exam_year || 0) - Number(a.q.exam_year || 0))
      .slice(0, limit);
  }

  async function studyStateMap() {
    try {
      if (!indexedDB.databases) return new Map();
      const databases = await indexedDB.databases();
      if (!databases.some(x => x.name === 'neetpg2027-static-v2')) return new Map();
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('neetpg2027-static-v2');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!db.objectStoreNames.contains('qstate')) { db.close(); return new Map(); }
      const rows = await new Promise((resolve, reject) => {
        const tx = db.transaction('qstate','readonly');
        const req = tx.objectStore('qstate').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return new Map(rows.map(x => [x.qid, x]));
    } catch (_) {
      return new Map();
    }
  }

  async function summary(note) {
    const matches = await match(note, 200);
    const years = [...new Set(matches.map(x => x.q.exam_year).filter(Boolean))].sort();
    const subjects = [...new Set(matches.map(x => x.q.subject).filter(Boolean))].sort();
    const states = await studyStateMap();
    const matchedStates = matches.map(x => states.get(x.q.external_id)).filter(Boolean);
    const attempted = matchedStates.filter(x => Number(x.attempts || 0) > 0);
    const attempts = attempted.reduce((sum, x) => sum + Number(x.attempts || 0), 0);
    const correct = attempted.reduce((sum, x) => sum + Number(x.correct || 0), 0);
    const accuracy = attempts ? Math.round(correct / attempts * 100) : null;
    const coverage = matches.length ? Math.round(attempted.length / matches.length * 100) : 0;
    return { count: matches.length, years, subjects, matches, attempted: attempted.length, attempts, correct, accuracy, coverage };
  }

  function questionUrl(q) {
    return '../?nvq=' + encodeURIComponent(q.external_id) + '&source=neuralvault';
  }

  function topicUrl(note) {
    const p = note.properties || {};
    const params = new URLSearchParams({ source: 'neuralvault' });
    if (p.subject) params.set('nvsubject', p.subject);
    if (note.title) params.set('nvtopic', note.title);
    return '../?' + params.toString();
  }

  window.NeuralVaultMedical = { load, match, summary, questionUrl, topicUrl };
})();