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


  function frontmatterProps(content) {
    const src = String(content || '');
    const out = {};
    if (!src.startsWith('---\n')) return out;
    const end = src.indexOf('\n---', 4);
    if (end < 0) return out;
    src.slice(4, end).split('\n').forEach(line => {
      const i = line.indexOf(':');
      if (i < 1) return;
      out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return out;
  }

  function features(value) {
    const ts = tokens(value);
    const out = [];
    ts.forEach(token => {
      out.push('w:' + token);
      if (token.length >= 5) {
        for (let i = 0; i <= token.length - 3; i++) out.push('c:' + token.slice(i, i + 3));
      }
    });
    for (let i = 0; i < ts.length - 1; i++) out.push('b:' + ts[i] + '_' + ts[i + 1]);
    return out;
  }

  function vector(value) {
    const counts = new Map();
    features(value).forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
    const out = new Map();
    counts.forEach((count, key) => out.set(key, 1 + Math.log(count)));
    return out;
  }

  function cosine(a, b) {
    if (!a.size || !b.size) return 0;
    let dot = 0, aa = 0, bb = 0;
    a.forEach(v => { aa += v * v; });
    b.forEach(v => { bb += v * v; });
    const small = a.size <= b.size ? a : b;
    const large = a.size <= b.size ? b : a;
    small.forEach((v, key) => {
      const x = large.get(key);
      if (x) dot += v * x;
    });
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }

  function noteVectorText(note) {
    const p = note.properties || frontmatterProps(note.content);
    return [
      note.title || '',
      note.title || '',
      p.subject || '',
      p.system || '',
      p.type || '',
      stripFrontmatter(note.content || '')
    ].join(' ');
  }

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

    const qv = vector(query);
    const docs = (notes || []).map(note => {
      const titleTokens = unique(tokens(note.title));
      const bodyTokens = unique(tokens(note.content));
      return {
        note,
        titleTokens,
        bodyTokens,
        bodySet: new Set(bodyTokens),
        titleSet: new Set(titleTokens),
        concept: cosine(qv, vector(noteVectorText(note)))
      };
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
      let lexical = 0;
      if (title === qn) lexical += 120;
      else if (title.includes(qn)) lexical += 70;
      if (body.includes(qn)) lexical += 25;

      qt.forEach(term => {
        const idf = Math.log((docs.length + 1) / ((df.get(term) || 0) + 1)) + 1;
        if (d.titleSet.has(term)) lexical += 18 * idf;
        if (d.bodySet.has(term)) lexical += 5 * idf;
      });

      const score = lexical + d.concept * 80;
      return {
        note: d.note,
        score: Math.round(score * 10) / 10,
        lexical: Math.round(lexical * 10) / 10,
        concept: Math.round(d.concept * 1000) / 1000,
        snippet: snippet(d.note.content, query)
      };
    }).filter(x => x.score > 3)
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

  function relatedAcrossSubjects(notes, currentNote, limit = 8) {
    if (!currentNote) return [];
    const currentProps = currentNote.properties || frontmatterProps(currentNote.content);
    const currentSubject = norm(currentProps.subject || '');
    const currentVector = vector(noteVectorText(currentNote));
    return (notes || [])
      .filter(note => note.id !== currentNote.id)
      .map(note => {
        const p = note.properties || frontmatterProps(note.content);
        const subject = norm(p.subject || '');
        const similarity = cosine(currentVector, vector(noteVectorText(note)));
        const crossSubject = Boolean(currentSubject && subject && currentSubject !== subject);
        const score = similarity + (crossSubject ? 0.12 : 0);
        return {
          note,
          score: Math.round(score * 1000) / 1000,
          similarity: Math.round(similarity * 1000) / 1000,
          subject: p.subject || 'Unspecified',
          crossSubject
        };
      })
      .filter(x => x.score >= 0.12)
      .sort((a,b) => b.score - a.score || String(a.note.title).localeCompare(String(b.note.title)))
      .slice(0, limit);
  }

  function flashcardCandidates(note, limit = 8) {
    if (!note) return [];
    const body = stripFrontmatter(note.content || '');
    const lines = body.split(/\r?\n/);
    const cards = [];
    let heading = 'Core concept';
    let buf = [];

    const push = () => {
      const answer = buf.join(' ').replace(/\s+/g, ' ').trim();
      if (answer.length >= 24) {
        cards.push({
          question: 'Recall ' + heading + ' of ' + note.title + '.',
          answer: answer.slice(0, 420),
          source: note.title
        });
      }
      buf = [];
    };

    lines.forEach(line => {
      const m = line.match(/^#{1,4}\s+(.+)/);
      if (m) {
        push();
        heading = m[1].trim();
      } else if (line.trim() && !/^[-*]\s*$/.test(line.trim())) {
        buf.push(line.replace(/^[-*]\s+/, '').trim());
      }
    });
    push();

    return cards
      .filter((card, i, arr) => arr.findIndex(x => norm(x.question) === norm(card.question)) === i)
      .slice(0, limit);
  }

  function proposeSafePatch(notes, note) {
    if (!note) return null;
    const expected = [
      ['Mechanism / pathophysiology', /mechanism|pathophysiology/i],
      ['Clinical clues', /clinical|features|presentation/i],
      ['Investigations', /investigation|diagnosis|workup/i],
      ['Management', /management|treatment|therapy/i],
      ['PYQ anchors', /pyq|exam|high.?yield/i],
      ['Confusions / differentials', /differential|confusion|versus|vs\b/i],
      ['Links', /^links$/i]
    ];
    const headings = String(note.content || '').split(/\r?\n/)
      .filter(line => /^#{1,4}\s+/.test(line))
      .map(line => line.replace(/^#{1,4}\s+/, '').trim());
    const missing = expected.filter(([, re]) => !headings.some(h => re.test(h))).map(([name]) => name);
    const existingLinks = new Set(
      [...String(note.content || '').matchAll(/\[\[([^\]|#]+)/g)].map(m => norm(m[1]))
    );
    const related = relatedAcrossSubjects(notes, note, 6)
      .filter(x => !existingLinks.has(norm(x.note.title)))
      .slice(0, 4);

    let after = String(note.content || '').replace(/\s+$/, '');
    const changes = [];
    if (missing.length) {
      after += '\n\n' + missing.map(name => '## ' + name + '\n\n').join('\n');
      changes.push('Add missing exam-oriented section headings: ' + missing.join(', '));
    }
    if (related.length) {
      const linksBlock = related.map(x => '- [[' + x.note.title + ']]').join('\n');
      if (/^##\s+Suggested links\s*$/mi.test(after)) {
        after += '\n' + linksBlock;
      } else {
        after += '\n\n## Suggested links\n\n' + linksBlock;
      }
      changes.push('Add cross-subject link suggestions: ' + related.map(x => x.note.title).join(', '));
    }
    if (after !== String(note.content || '')) after += '\n';

    return {
      before: String(note.content || ''),
      after,
      changes,
      related
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
      lines.push('### NOTE ' + (i + 1) + ' · ' + x.note.title);
      lines.push('Source-ID: NOTE:' + x.note.id);
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
      lines.push('Source-ID: PYQ:' + (q.external_id || 'unknown'));
      lines.push('Year: ' + (q.exam_year || 'unknown') + ' | Subject: ' + (q.subject || '') + ' | Topic: ' + (q.topic || q.subtopic || ''));
      lines.push(q.stem || '');
    });

    lines.push('');
    lines.push('## Instruction');
    lines.push('Use the evidence above as the primary grounding source. Cite Source-ID values such as [NOTE:...] and [PYQ:...] near claims based on them. Distinguish evidence-backed statements from any additional model knowledge or reasoning.');
    return lines.join('\n');
  }

  window.NeuralVaultIntelligence = {
    search, noteSearch, snapshot, noteInsight, contextBundle,
    relatedAcrossSubjects, flashcardCandidates, proposeSafePatch,
    vector, cosine
  };
})();