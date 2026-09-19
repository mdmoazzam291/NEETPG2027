(() => {
  'use strict';

  const STOP = new Set([
    'the','and','for','with','from','into','this','that','which','what','when','where','are','was','were',
    'has','have','had','not','but','can','may','more','most','than','then','their','there','also','used',
    'using','use','your','you','our','out','all','any','very','should','of','to','in','on','is','a','an',
    'as','at','by','or','be','if','it','we','i'
  ]);

  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = value => norm(value).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
  const unique = value => [...new Set(value)];

  function stripFrontmatter(content) {
    const src = String(content || '');
    if (!src.startsWith('---\n')) return src;
    const end = src.indexOf('\n---', 4);
    return end < 0 ? src : src.slice(end + 4).replace(/^\n/, '');
  }

  function snippet(text, query, max = 220) {
    const clean = stripFrontmatter(text).replace(/[#*_[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const terms = tokens(query);
    const lower = clean.toLowerCase();
    let at = -1;
    for (const term of terms) {
      at = lower.indexOf(term);
      if (at >= 0) break;
    }
    if (at < 0) return clean.slice(0, max);
    const start = Math.max(0, at - Math.floor(max * 0.35));
    const out = clean.slice(start, start + max);
    return (start ? '…' : '') + out + (start + max < clean.length ? '…' : '');
  }

  function noteSearch(notes, query, limit = 8) {
    const qn = norm(query);
    const qt = unique(tokens(query));
    if (!qn || !qt.length) return [];

    const docs = (notes || []).map(note => {
      const titleTokens = unique(tokens(note.title));
      const bodyTokens = unique(tokens(note.content));
      return { note, titleTokens, bodyTokens, bodySet: new Set(bodyTokens), titleSet: new Set(titleTokens) };
    });

    const df = new Map();
    qt.forEach(term => {
      let count = 0;
      docs.forEach(d => { if (d.titleSet.has(term) || d.bodySet.has(term)) count += 1; });
      df.set(term, count);
    });

    return docs.map(d => {
      const title = norm(d.note.title);
      const body = norm(d.note.content);
      let score = 0;
      if (title === qn) score += 120;
      else if (title.includes(qn)) score += 70;
      if (body.includes(qn)) score += 25;

      qt.forEach(term => {
        const idf = Math.log((docs.length + 1) / ((df.get(term) || 0) + 1)) + 1;
        if (d.titleSet.has(term)) score += 18 * idf;
        if (d.bodySet.has(term)) score += 5 * idf;
      });

      return { note: d.note, score: Math.round(score * 10) / 10, snippet: snippet(d.note.content, query) };
    }).filter(x => x.score > 0)
      .sort((a,b) => b.score - a.score || String(a.note.title).localeCompare(String(b.note.title)))
      .slice(0, limit);
  }

  async function search(notes, query, limit = 8) {
    const noteResults = noteSearch(notes, query, limit);
    const questionResults = window.NeuralVaultMedical
      ? await NeuralVaultMedical.searchQuestions(query, Math.max(8, limit))
      : [];
    return {
      query,
      notes: noteResults,
      questions: questionResults,
      summary: noteResults.length + ' note match' + (noteResults.length === 1 ? '' : 'es') +
        ' · ' + questionResults.length + ' PYQ match' + (questionResults.length === 1 ? '' : 'es')
    };
  }

  async function snapshot(notes) {
    if (!window.NeuralVaultMedical) {
      return { byId: new Map(), measured: 0, total: (notes || []).length, average: null, bands: {}, actions: [] };
    }
    const prepared = (notes || []).map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      properties: note.properties || {}
    }));
    const byId = await NeuralVaultMedical.batchSummary(prepared);
    const bands = { unmeasured: 0, weak: 0, building: 0, strong: 0, mastered: 0 };
    const measured = [];
    const actions = [];

    prepared.forEach(note => {
      const s = byId.get(note.id);
      if (!s) return;
      bands[s.band] = (bands[s.band] || 0) + 1;
      if (s.readiness != null) measured.push(s.readiness);
      if (!s.count) return;

      let priority = 0;
      let reason = '';
      if (s.attempted === 0) {
        priority = 95 + Math.min(20, s.count);
        reason = 'No matched PYQ has been attempted yet.';
      } else {
        priority = (100 - Number(s.readiness || 0)) +
          Math.min(25, s.unseenQuestions.length * 2) +
          Math.min(25, s.weakQuestions.length * 5);
        if (s.accuracy != null && s.accuracy < 60) reason = 'Accuracy is ' + s.accuracy + '% on matched retrieval.';
        else if (s.coverage < 50) reason = 'Only ' + s.coverage + '% of matched PYQs have been attempted.';
        else if (s.weakQuestions.length) reason = s.weakQuestions.length + ' matched PYQ' + (s.weakQuestions.length === 1 ? '' : 's') + ' remain weak.';
        else reason = 'Keep the concept warm with spaced retrieval.';
      }
      actions.push({ note, summary: s, priority, reason });
    });

    actions.sort((a,b) => b.priority - a.priority || String(a.note.title).localeCompare(String(b.note.title)));
    const average = measured.length ? Math.round(measured.reduce((a,b) => a + b, 0) / measured.length) : null;

    return {
      byId,
      measured: measured.length,
      total: prepared.length,
      average,
      bands,
      actions: actions.slice(0, 12),
      formula: 'Evidence score = 70% matched-PYQ accuracy + 30% matched-PYQ coverage.'
    };
  }

  async function noteInsight(note) {
    if (!window.NeuralVaultMedical) return null;
    return NeuralVaultMedical.summary({
      title: note.title,
      content: note.content,
      properties: note.properties || {}
    });
  }

  async function contextBundle(notes, query) {
    const results = await search(notes, query, 8);
    const lines = [
      '# NeuralVault evidence bundle',
      '',
      'Query: ' + query,
      'Generated: ' + new Date().toISOString(),
      '',
      '## Vault notes'
    ];

    if (!results.notes.length) lines.push('- No matching vault notes.');
    results.notes.forEach((x, i) => {
      lines.push('');
      lines.push('### ' + (i + 1) + '. ' + x.note.title);
      lines.push('Path: ' + (x.note.path || ''));
      lines.push(stripFrontmatter(x.note.content).slice(0, 3000));
    });

    lines.push('');
    lines.push('## Matched NEET-PG PYQs');
    if (!results.questions.length) lines.push('- No matching PYQs.');
    results.questions.forEach((x, i) => {
      const q = x.q;
      lines.push('');
      lines.push('### PYQ ' + (i + 1));
      lines.push('Year: ' + (q.exam_year || 'unknown') + ' | Subject: ' + (q.subject || '') + ' | Topic: ' + (q.topic || q.subtopic || ''));
      lines.push(q.stem || '');
    });

    lines.push('');
    lines.push('## Instruction');
    lines.push('Use only the evidence above. Distinguish facts present in the notes/PYQs from any additional reasoning.');
    return lines.join('\n');
  }

  window.NeuralVaultIntelligence = { search, noteSearch, snapshot, noteInsight, contextBundle };
})();