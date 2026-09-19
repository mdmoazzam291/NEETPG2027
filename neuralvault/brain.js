(() => {
  'use strict';

  const STOP = new Set([
    'the','and','for','with','from','into','this','that','which','what','when','where','are','was','were',
    'has','have','had','not','but','can','may','more','most','than','then','their','there','also','used',
    'using','use','your','you','our','out','all','any','very','should','would','could','about','tell',
    'explain','show','give','of','to','in','on','is','a','an','as','at','by','or','be','if','it','we','i'
  ]);

  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const toks = value => [...new Set(norm(value).split(/\s+/).filter(x => x.length > 2 && !STOP.has(x)))];

  function stripFrontmatter(content) {
    const src = String(content || '');
    if (!src.startsWith('---\n')) return src;
    const end = src.indexOf('\n---', 4);
    return end < 0 ? src : src.slice(end + 4).replace(/^\n/, '');
  }

  function parseProperties(content) {
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

  function cleanText(content) {
    return stripFrontmatter(content)
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
      .replace(/[#*_>~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sentences(content) {
    const text = cleanText(content);
    return text.split(/(?<=[.!?])\s+|\s+(?=[A-Z][A-Za-z ]{2,}:)/)
      .map(x => x.trim())
      .filter(x => x.length >= 24 && x.length <= 420);
  }

  function sentenceScore(sentence, query, noteTitle) {
    const q = toks(query);
    const s = new Set(toks(sentence));
    let score = 0;
    q.forEach(t => { if (s.has(t)) score += 8; });
    const qn = norm(query), sn = norm(sentence), tn = norm(noteTitle);
    if (qn && sn.includes(qn)) score += 25;
    if (qn && tn.includes(qn)) score += 30;
    if (/\b(pyq|neet|ini|exam|management|treatment|diagnosis|investigation|mechanism|pathophysiology)\b/i.test(sentence)) score += 2;
    return score;
  }

  function bestExtracts(note, query, limit = 2) {
    return sentences(note.content)
      .map(text => ({ text, score: sentenceScore(text, query, note.title) }))
      .sort((a,b) => b.score - a.score || a.text.length - b.text.length)
      .filter(x => x.score > 0)
      .slice(0, limit);
  }

  function headings(content) {
    return String(content || '').split(/\r?\n/)
      .filter(line => /^#{1,4}\s+/.test(line))
      .map(line => line.replace(/^#{1,4}\s+/, '').trim());
  }

  function sectionStatus(content) {
    const body = stripFrontmatter(content);
    const expected = [
      ['mechanism', /mechanism|pathophysiology/i],
      ['clinical', /clinical|features|presentation/i],
      ['investigations', /investigation|diagnosis|workup/i],
      ['management', /management|treatment|therapy/i],
      ['pyq', /pyq|exam|high.?yield/i],
      ['differentials', /differential|confusion|versus|vs\b/i]
    ];
    const hs = headings(body);
    return expected.map(([key,re]) => {
      const heading = hs.find(h => re.test(h));
      if (!heading) return { key, present:false, filled:false };
      const escaped = heading.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
      const m = body.match(new RegExp('^#{1,4}\\s+' + escaped + '\\s*$([\\s\\S]*?)(?=^#{1,4}\\s+|$)', 'mi'));
      const section = m ? m[1].replace(/\s+/g, ' ').trim() : '';
      return { key, present:true, filled:section.length > 24 };
    });
  }

  function noteRef(note, excerpt = '') {
    return { kind:'note', id:note.id, title:note.title, path:note.path || '', excerpt };
  }

  function questionRef(q) {
    return {
      kind:'pyq',
      id:q.external_id,
      title:(q.exam_year ? q.exam_year + ' · ' : '') + (q.topic || q.subtopic || q.subject || 'PYQ'),
      excerpt:q.stem || '',
      url:window.NeuralVaultMedical ? NeuralVaultMedical.questionUrl(q) : '../'
    };
  }

  async function genericAnswer(notes, query) {
    const results = await NeuralVaultIntelligence.search(notes, query, 7);
    const bullets = [];
    const sources = [];

    results.notes.slice(0,5).forEach(hit => {
      const extracts = bestExtracts(hit.note, query, 2);
      if (!extracts.length && hit.snippet) extracts.push({ text:hit.snippet, score:hit.score });
      extracts.forEach(x => bullets.push({
        text:x.text,
        source:{ kind:'note', id:hit.note.id, title:hit.note.title }
      }));
      sources.push(noteRef(hit.note, hit.snippet));
    });

    results.questions.slice(0,5).forEach(hit => sources.push(questionRef(hit.q)));

    if (!bullets.length && results.questions.length) {
      bullets.push({
        text:'Your vault has no strong note statement for this query yet, but the bundled PYQ corpus contains related questions.',
        source:null
      });
    }
    if (!bullets.length) {
      bullets.push({
        text:'No strong grounded answer was found in the current vault or cached PYQ corpus. Add a canonical topic name, subject/system property, or more note content.',
        source:null
      });
    }

    return {
      mode:'evidence',
      title:'Grounded answer',
      summary:'Extracted from your own notes and matched PYQs. NeuralVault does not invent missing medical facts in local mode.',
      sections:[
        { title:'What your vault says', bullets:bullets.slice(0,6) },
        results.questions.length ? {
          title:'Exam evidence',
          bullets:results.questions.slice(0,4).map(x => ({
            text:(x.q.exam_year ? x.q.exam_year + ': ' : '') + (x.q.stem || x.q.topic || 'Matched PYQ'),
            source:{ kind:'pyq', id:x.q.external_id, title:x.q.topic || x.q.subject || 'PYQ', url:NeuralVaultMedical.questionUrl(x.q) }
          }))
        } : null
      ].filter(Boolean),
      sources,
      resultSummary:results.summary
    };
  }

  async function nextStudyAnswer(notes) {
    const prepared = notes.map(n => ({...n, properties:parseProperties(n.content)}));
    const snap = await NeuralVaultIntelligence.snapshot(prepared);
    const targets = snap.actions.slice(0,5);
    if (!targets.length) {
      return {
        mode:'study',
        title:'Next best study target',
        summary:'There is not enough PYQ-backed performance evidence yet.',
        sections:[{title:'Next action',bullets:[{text:'Attempt matched PYQs from several core notes first. NeuralVault will then rank targets from retrieval evidence.',source:null}]}],
        sources:[]
      };
    }
    return {
      mode:'study',
      title:'Next best study target',
      summary:(snap.average == null ? 'No vault-wide score yet.' : 'Average measured evidence: ' + snap.average + '%.') + ' Ranking uses your matched-PYQ accuracy and coverage.',
      sections:[{
        title:'Priority queue',
        bullets:targets.map((x,i) => ({
          text:(i+1)+'. '+x.note.title+' · '+x.reason+' Evidence '+(x.summary.readiness==null?'unmeasured':x.summary.readiness+'%')+'.',
          source:{kind:'note',id:x.note.id,title:x.note.title}
        }))
      }],
      sources:targets.map(x => noteRef(x.note, x.reason)),
      nextTarget:targets[0] ? {
        noteId:targets[0].note.id,
        title:targets[0].note.title,
        practiceUrl:NeuralVaultMedical.practiceUrl(targets[0].summary.matches, targets[0].note)
      } : null
    };
  }

  async function gapAnswer(note) {
    if (!note) {
      return {
        mode:'gap',
        title:'Note gap check',
        summary:'Open a medical note first.',
        sections:[{title:'No current note',bullets:[{text:'Select the note you want NeuralVault to audit.',source:null}]}],
        sources:[]
      };
    }

    const status = sectionStatus(note.content);
    const missing = status.filter(x => !x.present);
    const empty = status.filter(x => x.present && !x.filled);
    const summary = await NeuralVaultMedical.summary({...note, properties:parseProperties(note.content)});
    const bullets = [];

    if (missing.length) bullets.push({text:'Missing sections: '+missing.map(x=>x.key).join(', ')+'.',source:{kind:'note',id:note.id,title:note.title}});
    if (empty.length) bullets.push({text:'Sections present but thin: '+empty.map(x=>x.key).join(', ')+'.',source:{kind:'note',id:note.id,title:note.title}});
    if (!missing.length && !empty.length) bullets.push({text:'The major exam-oriented sections are present and contain material.',source:{kind:'note',id:note.id,title:note.title}});
    if (summary.count) {
      bullets.push({
        text:'Matched PYQ coverage: '+summary.attempted+'/'+summary.count+' questions attempted'+(summary.accuracy==null?'':', '+summary.accuracy+'% accuracy')+'.',
        source:null
      });
    } else {
      bullets.push({text:'No strong PYQ mapping was found. Consider adding canonical subject/system/topic properties.',source:null});
    }

    return {
      mode:'gap',
      title:'Gap audit · '+note.title,
      summary:'Structural audit plus your matched-PYQ evidence. It does not claim that absent sections are clinically exhaustive.',
      sections:[{title:'Detected gaps',bullets}],
      sources:[noteRef(note, cleanText(note.content).slice(0,220))],
      practiceUrl:summary.count ? NeuralVaultMedical.practiceUrl(summary.matches, {...note,properties:parseProperties(note.content)}) : null
    };
  }

  async function pyqAnswer(note) {
    if (!note) {
      return {
        mode:'pyq',
        title:'PYQ evidence',
        summary:'Open a medical note first.',
        sections:[{title:'No current note',bullets:[{text:'Select a concept note so NeuralVault can map it to the PYQ corpus.',source:null}]}],
        sources:[]
      };
    }
    const prepared={...note,properties:parseProperties(note.content)};
    const s=await NeuralVaultMedical.summary(prepared);
    if(!s.count){
      return {
        mode:'pyq',
        title:'PYQ evidence · '+note.title,
        summary:'No strong PYQ mapping was found.',
        sections:[{title:'Improve mapping',bullets:[{text:'Use the canonical exam topic name and add subject/system properties to this note.',source:{kind:'note',id:note.id,title:note.title}}]}],
        sources:[noteRef(note)]
      };
    }
    return {
      mode:'pyq',
      title:'PYQ evidence · '+note.title,
      summary:s.count+' matched PYQ'+(s.count===1?'':'s')+' · '+s.attempted+' attempted'+(s.accuracy==null?'':' · '+s.accuracy+'% accuracy'),
      sections:[{
        title:'Matched questions',
        bullets:s.matches.slice(0,6).map(x=>({
          text:(x.q.exam_year?x.q.exam_year+': ':'')+(x.q.stem||x.q.topic||'Matched PYQ'),
          source:{kind:'pyq',id:x.q.external_id,title:x.q.topic||x.q.subject||'PYQ',url:NeuralVaultMedical.questionUrl(x.q)}
        }))
      }],
      sources:[noteRef(note),...s.matches.slice(0,6).map(x=>questionRef(x.q))],
      practiceUrl:NeuralVaultMedical.practiceUrl(s.matches,prepared)
    };
  }


  async function crossSubjectAnswer(notes, note) {
    if (!note) {
      return {
        mode:'connections',
        title:'Cross-subject connections',
        summary:'Open a concept note first.',
        sections:[{title:'No current note',bullets:[{text:'Select the concept you want to integrate across MBBS subjects.',source:null}]}],
        sources:[]
      };
    }
    const related = NeuralVaultIntelligence.relatedAcrossSubjects(notes, note, 8);
    if (!related.length) {
      return {
        mode:'connections',
        title:'Cross-subject connections · '+note.title,
        summary:'No strong cross-subject note connection is present in the vault yet.',
        sections:[{title:'Next step',bullets:[{text:'Add related canonical notes from other subjects, then rerun this connection scan.',source:{kind:'note',id:note.id,title:note.title}}]}],
        sources:[noteRef(note)]
      };
    }
    return {
      mode:'connections',
      title:'Cross-subject connections · '+note.title,
      summary:'Ranked locally from shared concept features. These are link suggestions, not claims that every relationship is clinically equivalent.',
      sections:[{
        title:'Suggested integrations',
        bullets:related.map(x=>({
          text:x.note.title+' · '+x.subject+' · similarity '+Math.round(x.similarity*100)+'%.',
          source:{kind:'note',id:x.note.id,title:x.note.title}
        }))
      }],
      sources:[noteRef(note),...related.map(x=>noteRef(x.note,'Cross-subject similarity '+Math.round(x.similarity*100)+'%'))],
      related
    };
  }

  async function flashcardAnswer(note) {
    if (!note) {
      return {
        mode:'cards',
        title:'Recall-card candidates',
        summary:'Open a note first.',
        sections:[{title:'No current note',bullets:[{text:'Select the note you want converted into source-traceable recall prompts.',source:null}]}],
        sources:[]
      };
    }
    const cards = NeuralVaultIntelligence.flashcardCandidates(note, 8);
    if (!cards.length) {
      return {
        mode:'cards',
        title:'Recall-card candidates · '+note.title,
        summary:'This note does not yet contain enough section text to derive cards without inventing content.',
        sections:[{title:'Next step',bullets:[{text:'Add concise factual material under headings, then generate cards again.',source:{kind:'note',id:note.id,title:note.title}}]}],
        sources:[noteRef(note)]
      };
    }
    return {
      mode:'cards',
      title:'Recall-card candidates · '+note.title,
      summary:'Every answer is copied or compressed from this note. Review before adding these to a future SRS card store.',
      sections:[{
        title:'Candidates',
        bullets:cards.map(card=>({
          text:card.question+' → '+card.answer,
          source:{kind:'note',id:note.id,title:note.title}
        }))
      }],
      cards,
      sources:[noteRef(note,cleanText(note.content).slice(0,240))]
    };
  }

  async function patchAnswer(notes, note) {
    if (!note) {
      return {
        mode:'patch',
        title:'Safe note improvement',
        summary:'Open a note first.',
        sections:[{title:'No current note',bullets:[{text:'Select the note you want to improve.',source:null}]}],
        sources:[]
      };
    }
    const patch = NeuralVaultIntelligence.proposeSafePatch(notes, note);
    if (!patch || !patch.changes.length) {
      return {
        mode:'patch',
        title:'Safe note improvement · '+note.title,
        summary:'No structural or cross-link patch is needed right now.',
        sections:[{title:'Result',bullets:[{text:'The expected exam-oriented headings are present and no new strong cross-subject links were detected.',source:{kind:'note',id:note.id,title:note.title}}]}],
        sources:[noteRef(note)]
      };
    }
    return {
      mode:'patch',
      title:'Safe note improvement · '+note.title,
      summary:'This patch adds structure and wiki-link suggestions only. It does not generate new medical facts.',
      sections:[{
        title:'Proposed changes',
        bullets:patch.changes.map(text=>({text,source:{kind:'note',id:note.id,title:note.title}}))
      }],
      patch:{...patch,noteId:note.id,noteTitle:note.title},
      sources:[noteRef(note)]
    };
  }

  async function currentNoteAnswer(notes, note, query) {
    if (!note) return genericAnswer(notes, query);
    const contextual=/\b(this concept|this note|current note|using my vault)\b/i.test(query) ? note.title+' '+query : query;
    const local = await genericAnswer([note], contextual);
    if (local.sections[0].bullets.length === 1 && /No strong grounded answer/.test(local.sections[0].bullets[0].text)) {
      return genericAnswer(notes, note.title+' '+query);
    }
    local.title = 'Current note · ' + note.title;
    return local;
  }

  async function ask({notes = [], currentNote = null, query = '', scope = 'vault'} = {}) {
    query = String(query || '').trim();
    if (!query) throw new Error('Ask a question first');
    if (!window.NeuralVaultIntelligence || !window.NeuralVaultMedical) throw new Error('Knowledge intelligence is unavailable');

    const n = norm(query);
    if (/\b(next|revise|revision|study|weak|priority|focus)\b/.test(n) && /\b(next|what|where|weak|priority|focus|revise|study)\b/.test(n)) {
      return nextStudyAnswer(notes);
    }
    if (/\b(connect|connection|integrate|integration|across subjects|cross subject)\b/.test(n)) {
      return crossSubjectAnswer(notes, currentNote);
    }
    if (/\b(flashcard|flashcards|recall card|recall cards|make cards|generate cards)\b/.test(n)) {
      return flashcardAnswer(currentNote);
    }
    if (/\b(improve|organize|organise|structure|patch|fix note|upgrade note)\b/.test(n)) {
      return patchAnswer(notes, currentNote);
    }
    if (/\b(gap|missing|incomplete|audit|what is missing)\b/.test(n)) {
      return gapAnswer(currentNote);
    }
    if (/\b(pyq|pyqs|previous year|exam question|questions test)\b/.test(n) && /\b(this|concept|current|note|pyq|question)\b/.test(n)) {
      return pyqAnswer(currentNote);
    }
    if (scope === 'current' || /\b(this concept|this note|current note|using my vault)\b/.test(n)) return currentNoteAnswer(notes, currentNote, query);
    return genericAnswer(notes, query);
  }

  async function modelPrompt(notes, query, currentNote = null) {
    const selected = currentNote ? [currentNote, ...notes.filter(n => n.id !== currentNote.id)] : notes;
    const effectiveQuery = currentNote ? currentNote.title+' '+query : query;
    const bundle = await NeuralVaultIntelligence.contextBundle(selected, effectiveQuery);
    return [
      '# NeuralVault grounded model request',
      '',
      'Question: ' + query,
      currentNote ? 'Current note: ' + currentNote.title : 'Scope: whole vault',
      '',
      'Rules:',
      '- Answer from the supplied evidence first.',
      '- Cite note titles and PYQ IDs for every substantive claim derived from the bundle.',
      '- Clearly label any knowledge added from outside the bundle.',
      '- Do not invent PYQ provenance, exam year, performance data, or note content.',
      '- For medical content, separate exam-oriented recall from clinical guidance.',
      '',
      bundle
    ].join('\n');
  }

  window.NeuralVaultBrain = {
    ask, modelPrompt, bestExtracts, sectionStatus,
    crossSubjectAnswer, flashcardAnswer, patchAnswer
  };
})();