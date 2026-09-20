(() => {
'use strict';

const KEY='neuralvault:v1';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const iso=()=>new Date().toISOString();
const STOP=new Set(['the','and','for','that','with','this','from','are','was','were','into','your','you','not','but','has','have','had','can','will','about','what','when','where','which','than','then','them','its','our','out','all','any','use','using','used','also','more','most','very','may','should','of','to','in','on','is','a','an','as','at','by','or','be','if','it','we','i']);

function sampleNotes(){
  const t=iso();
  return [
    {id:'welcome',title:'Welcome to NeuralVault',path:'Inbox/Welcome to NeuralVault.md',createdAt:t,updatedAt:t,content:'---\ntype: dashboard\nstatus: active\nsubject: General\nmastery: 0\n---\n\n# Welcome to NeuralVault\n\nThis is your local-first medical knowledge layer.\n\n## Start here\n\n- Create a note with **Cmd/Ctrl + N**\n- Link notes with [[Myocardial Infarction]]\n- Import your existing Obsidian Markdown files\n- Use **Backlinks** to see reverse connections\n- Open **Graph** to visualize the vault\n- Open **PYQs** to connect notes to the existing question bank\n\n## Design rule\n\nYour Markdown stays portable. NeuralVault adds intelligence around it without trapping the notes.'},
    {id:'mi',title:'Myocardial Infarction',path:'Medicine/Cardiology/Myocardial Infarction.md',createdAt:t,updatedAt:t,content:'---\ntype: disease\nsubject: Medicine\nsystem: Cardiovascular\nexam: NEET-PG\nmastery: 62\nstatus: learning\n---\n\n# Myocardial Infarction\n\nAcute myocardial necrosis due to ischemia, usually from plaque rupture and thrombosis.\n\n## Connections\n\n- [[Acute Coronary Syndrome]]\n- [[Troponin]]\n- [[Aspirin]]\n\n#cardiology #emergency'},
    {id:'acs',title:'Acute Coronary Syndrome',path:'Medicine/Cardiology/Acute Coronary Syndrome.md',createdAt:t,updatedAt:t,content:'---\ntype: syndrome\nsubject: Medicine\nsystem: Cardiovascular\nmastery: 55\n---\n\n# Acute Coronary Syndrome\n\nSpectrum containing unstable angina, NSTEMI and STEMI.\n\nRelated: [[Myocardial Infarction]], [[Aspirin]], [[Troponin]].\n\n#cardiology'},
    {id:'aspirin',title:'Aspirin',path:'Pharmacology/Antiplatelets/Aspirin.md',createdAt:t,updatedAt:t,content:'---\ntype: drug\nsubject: Pharmacology\nsystem: Cardiovascular\nmastery: 74\n---\n\n# Aspirin\n\nIrreversibly inhibits platelet COX-1 and reduces thromboxane A2 synthesis.\n\nUsed in [[Acute Coronary Syndrome]] and [[Myocardial Infarction]].\n\n#pharmacology #antiplatelet'},
    {id:'troponin',title:'Troponin',path:'Pathology/Biomarkers/Troponin.md',createdAt:t,updatedAt:t,content:'---\ntype: investigation\nsubject: Pathology\nsystem: Cardiovascular\nmastery: 68\n---\n\n# Troponin\n\nCardiac troponins are biomarkers of myocardial injury.\n\nLinked concepts: [[Myocardial Infarction]], [[Acute Coronary Syndrome]].\n\n#pathology #biomarker'}
  ];
}

function loadLocal(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||'null');
    if(x&&Array.isArray(x.notes)&&x.notes.length)return x;
  }catch(_){}
  return {version:2,notes:sampleNotes(),currentId:'welcome',savedAt:0};
}

let state=loadLocal();
const requestedNoteId=new URLSearchParams(location.search).get('note');
let currentId=state.notes.some(n=>n.id===state.currentId)?state.currentId:state.notes[0].id;
if(requestedNoteId&&state.notes.some(n=>n.id===requestedNoteId))currentId=requestedNoteId;
let view='editor';
let saveTimer=null;
let toastTimer=null;
let titleSnapshot=null;
let medicalToken=0;
let insightToken=0;
let graphToken=0;
let evidenceToken=0;
let lastEvidenceQuery='';
let brainToken=0;
let brainLastQuery='';
let brainLastNoteId=null;
let brainLastScope='vault';
let brainLastProvider='local';
let pendingPatch=null;

function current(){return state.notes.find(n=>n.id===currentId)||state.notes[0]||null}
function uid(){return crypto&&crypto.randomUUID?crypto.randomUUID():'note-'+Date.now()+'-'+Math.random().toString(16).slice(2)}
function norm(s){return String(s||'').trim().toLowerCase()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function filename(s){return (String(s||'Untitled').replace(/[\\/:*?"<>|]+/g,'-').trim()||'Untitled')+'.md'}
function folder(n){const p=String(n.path||'').split('/');return p.length>1?p.slice(0,-1).join('/'):'Inbox'}
function stripFM(c){c=String(c||'');if(!c.startsWith('---\n'))return c;const e=c.indexOf('\n---',4);return e<0?c:c.slice(e+4).replace(/^\n/,'')}
function props(c){
  c=String(c||'');const out={};if(!c.startsWith('---\n'))return out;
  const e=c.indexOf('\n---',4);if(e<0)return out;
  c.slice(4,e).split('\n').forEach(line=>{
    const i=line.indexOf(':');if(i<1)return;
    const k=line.slice(0,i).trim();let v=line.slice(i+1).trim();
    if(/^-?\d+(\.\d+)?$/.test(v))v=Number(v);
    else if(/^(true|false)$/i.test(v))v=v.toLowerCase()==='true';
    out[k]=v;
  });
  return out;
}
function links(c){
  const out=[],re=/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;let m;
  while((m=re.exec(String(c||''))))out.push(m[1].trim());
  return [...new Set(out)];
}
function tags(c){
  const m=String(c||'').replace(/~~~[\s\S]*?~~~/g,'').match(/(^|\s)#([a-zA-Z][\w/-]*)/g)||[];
  return [...new Set(m.map(x=>x.trim().slice(1)))];
}
function byTitle(t){const x=norm(t);return state.notes.find(n=>norm(n.title)===x)}
function countWords(c){return (stripFM(c).replace(/[^\p{L}\p{N}\s]/gu,' ').match(/[\p{L}\p{N}]+/gu)||[]).length}
function ago(x){
  const m=Math.floor(Math.max(0,Date.now()-new Date(x).getTime())/60000);
  if(m<1)return'just now';if(m<60)return m+'m ago';
  const h=Math.floor(m/60);return h<24?h+'h ago':Math.floor(h/24)+'d ago';
}
function escapeRe(s){return String(s).replace(/[.*+?^$(){}|[\]\\]/g,'\\$&')}

let saveQueue=Promise.resolve();
function save(){
  state.currentId=currentId;state.savedAt=Date.now();
  const snapshot=JSON.parse(JSON.stringify(state));
  $('#saveState').textContent='Saving…';
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    try{
      if(!window.NeuralVaultDB)throw new Error('Durable storage unavailable');
      await NeuralVaultDB.saveState(snapshot);
      try{localStorage.setItem(KEY,JSON.stringify(snapshot))}catch{}
      if(snapshot.savedAt===state.savedAt)$('#saveState').textContent='Saved on device';
      $('#storageStatus').textContent='Saved in IndexedDB';
    }catch(e){$('#saveState').textContent='Save failed — keep this tab open';$('#storageStatus').textContent=e.message;}
  });return saveQueue;
}

async function hydrateDurable(){
  if(!window.NeuralVaultDB)return;
  try{
    const durable=await NeuralVaultDB.loadState();
    if(durable&&Array.isArray(durable.notes)&&durable.notes.length&&Number(durable.savedAt||0)>Number(state.savedAt||0)){
      state=durable;
      currentId=requestedNoteId&&state.notes.some(n=>n.id===requestedNoteId)
        ? requestedNoteId
        : state.notes.some(n=>n.id===state.currentId)?state.currentId:state.notes[0].id;
      try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
      renderCurrent();
    }else{
      await NeuralVaultDB.saveState(state);
    }
    $('#storageStatus').textContent='IndexedDB + local cache';
  }catch(_){
    $('#storageStatus').textContent='Local cache only';
  }
}

function inline(s){
  s=esc(s);
  s=s.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,(_,target,alias)=>'<button class="wiki-link" data-note-title="'+esc(target.trim())+'">'+esc((alias||target).trim())+'</button>');
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/(^|\s)#([a-zA-Z][\w/-]*)/g,'$1<span class="tag-link">#$2</span>');
  return s;
}

function markdown(c){
  const lines=stripFM(c).split(/\r?\n/),out=[];
  let ul=false,code=false,buf=[];
  const close=()=>{if(ul){out.push('</ul>');ul=false}};
  lines.forEach(line=>{
    if(line.trim().startsWith('~~~')){
      close();
      if(!code){code=true;buf=[]}
      else{out.push('<pre><code>'+esc(buf.join('\n'))+'</code></pre>');code=false;buf=[]}
      return;
    }
    if(code){buf.push(line);return}
    if(!line.trim()){close();out.push('');return}
    if(/^###\s+/.test(line)){close();out.push('<h3>'+inline(line.replace(/^###\s+/,''))+'</h3>');return}
    if(/^##\s+/.test(line)){close();out.push('<h2>'+inline(line.replace(/^##\s+/,''))+'</h2>');return}
    if(/^#\s+/.test(line)){close();out.push('<h1>'+inline(line.replace(/^#\s+/,''))+'</h1>');return}
    if(/^>\s?/.test(line)){close();out.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');return}
    if(/^---+$/.test(line.trim())){close();out.push('<hr>');return}
    if(/^\s*[-*]\s+/.test(line)){
      if(!ul){out.push('<ul>');ul=true}
      out.push('<li>'+inline(line.replace(/^\s*[-*]\s+/,''))+'</li>');
      return;
    }
    close();out.push('<p>'+inline(line)+'</p>');
  });
  close();
  if(code)out.push('<pre><code>'+esc(buf.join('\n'))+'</code></pre>');
  return out.join('\n');
}

function renderTree(filter=''){
  const q=norm(filter);
  const notes=state.notes.filter(n=>!q||norm(n.title+' '+n.path+' '+n.content).includes(q)).sort((a,b)=>a.path.localeCompare(b.path));
  const groups=new Map();
  notes.forEach(n=>{const f=folder(n);if(!groups.has(f))groups.set(f,[]);groups.get(f).push(n)});
  const root=$('#fileTree');root.replaceChildren();
  if(!notes.length)root.innerHTML='<div class="empty-tree">No notes match this search.</div>';
  [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).forEach(([f,list])=>{
    const wrap=document.createElement('div');wrap.className='tree-folder';
    const head=document.createElement('div');head.className='tree-folder-title';head.textContent=f;wrap.append(head);
    list.forEach(n=>{
      const b=document.createElement('button');b.className='note-row'+(n.id===currentId?' active':'');b.dataset.noteId=n.id;
      b.innerHTML='<span class="note-icon">◇</span><span class="note-name">'+esc(n.title)+'</span>';wrap.append(b);
    });
    root.append(wrap);
  });
  $('#noteCount').textContent=state.notes.length+(state.notes.length===1?' note':' notes');
}

function contextItem(n,subtitle){
  const b=document.createElement('button');b.className='context-item';b.dataset.noteId=n.id;
  const excerpt=subtitle||stripFM(n.content).replace(/[#*_[\]]/g,' ').replace(/\s+/g,' ').trim().slice(0,140)||folder(n);
  b.innerHTML='<strong>'+esc(n.title)+'</strong><p>'+esc(excerpt)+'</p>';
  return b;
}

function renderBacklinks(){
  const n=current(),target=norm(n.title);
  const list=state.notes.filter(x=>x.id!==n.id&&links(x.content).some(v=>norm(v)===target));
  $('#backlinkCount').textContent=list.length;
  const root=$('#backlinks');root.replaceChildren();
  if(!list.length)root.innerHTML='<div class="context-empty">No backlinks yet. Link this note from another note with double brackets.</div>';
  else list.forEach(x=>root.append(contextItem(x)));
  renderOutgoing();
}

function renderOutgoing(){
  const list=links(current().content),root=$('#outgoingLinks');
  $('#outgoingCount').textContent=list.length;root.replaceChildren();
  if(!list.length){root.innerHTML='<div class="context-empty">No outgoing wiki links in this note.</div>';return}
  list.forEach(title=>{
    const target=byTitle(title),b=document.createElement('button');
    b.className='context-item outgoing-link'+(target?'':' broken');b.dataset.noteTitle=title;
    b.innerHTML='<strong>'+esc(title)+'</strong><span class="link-state">'+(target?'linked':'create')+'</span>';
    root.append(b);
  });
}

function tokens(n){
  return new Set((n.title+' '+stripFM(n.content)).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,' ').split(/\s+/).filter(x=>x.length>3&&!STOP.has(x)));
}

function renderRelated(){
  const n=current(),a=tokens(n);
  const ranked=state.notes.filter(x=>x.id!==n.id).map(x=>{
    const b=tokens(x);let score=0;a.forEach(w=>{if(b.has(w))score++});
    if(links(n.content).some(t=>norm(t)===norm(x.title)))score+=4;
    return{n:x,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,6);
  const root=$('#relatedNotes');root.replaceChildren();
  if(!ranked.length){root.innerHTML='<div class="context-empty">No strong local connection yet.</div>';return}
  ranked.forEach(x=>root.append(contextItem(x.n,x.score+' shared connection points')));
}

function renderProps(){
  const n=current(),data=Object.assign({
    path:n.path,
    created:new Date(n.createdAt).toLocaleDateString(),
    updated:new Date(n.updatedAt).toLocaleDateString(),
    links:links(n.content).length,
    tags:tags(n.content).join(', ')||'—'
  },props(n.content));
  const root=$('#properties');root.replaceChildren();
  Object.entries(data).forEach(([k,v])=>{
    const row=document.createElement('div');row.className='property-row';
    row.innerHTML='<span class="property-key">'+esc(k)+'</span><span class="property-value">'+esc(Array.isArray(v)?v.join(', '):v)+'</span>';
    root.append(row);
  });
}

async function renderMedical(){
  if(!window.NeuralVaultMedical)return;
  const token=++medicalToken,n=current(),note={title:n.title,content:n.content,properties:props(n.content)},root=$('#medicalQuestions');
  $('#medicalCount').textContent='…';$('#medicalSummary').textContent='Matching this note against the existing NEET-PG PYQ bank…';root.replaceChildren();
  try{
    const summary=await NeuralVaultMedical.summary(note);
    if(token!==medicalToken)return;
    $('#medicalCount').textContent=summary.count;
    $('#medicalOpenAll').href=NeuralVaultMedical.topicUrl(note);
    if(summary.count){const perf=summary.attempted?' · '+summary.attempted+'/'+summary.count+' attempted'+(summary.accuracy==null?'':' · '+summary.accuracy+'% accuracy'):' · not attempted yet';$('#medicalSummary').textContent=summary.count+' related PYQ matches across '+summary.years.length+' exam year'+(summary.years.length===1?'':'s')+perf+'.';}else $('#medicalSummary').textContent='No strong PYQ match yet. Add subject/system properties or use the exam topic name.';
    summary.matches.slice(0,12).forEach(x=>{
      const q=x.q,a=document.createElement('a');a.className='context-item medical-question';a.href=NeuralVaultMedical.questionUrl(q);
      a.innerHTML='<strong>'+esc(q.topic||q.subtopic||'Question')+'</strong><p>'+esc(q.stem)+'</p><div class="medical-meta"><span class="medical-chip">'+esc(q.exam_year||'PYQ')+'</span><span class="medical-chip">'+esc(q.subject||'')+'</span><span class="medical-chip">'+esc(q.system||'')+'</span></div>';
      root.append(a);
    });
    if(!summary.matches.length)root.innerHTML='<div class="context-empty">No matching PYQs found for this note.</div>';
  }catch(_){
    if(token!==medicalToken)return;
    $('#medicalCount').textContent='!';
    $('#medicalSummary').textContent='PYQ index is unavailable offline until it has been cached once.';
    root.innerHTML='<div class="context-empty">Open the Study Engine once online to cache the bundled question bank.</div>';
  }
}

async function renderInsights(){
  if(!window.NeuralVaultIntelligence||!window.NeuralVaultMedical)return;
  const token=++insightToken,n=current(),note={id:n.id,title:n.title,path:n.path,content:n.content,properties:props(n.content)};
  $('#insightBand').textContent='…';
  $('#insightMetrics').innerHTML='<div class="context-empty">Calculating from matched PYQ attempts…</div>';
  $('#insightAction').innerHTML='';
  try{
    const s=await NeuralVaultIntelligence.noteInsight(note);
    if(token!==insightToken)return;
    const bandLabel={unmeasured:'Unmeasured',weak:'Weak',building:'Building',strong:'Strong',mastered:'Mastered'}[s.band]||s.band;
    $('#insightBand').textContent=bandLabel;
    const value=v=>v==null?'—':v+'%';
    $('#insightMetrics').innerHTML=
      '<div class="insight-metric"><strong>'+s.count+'</strong><span>Matched PYQs</span></div>'+
      '<div class="insight-metric"><strong>'+s.attempted+'</strong><span>Attempted</span></div>'+
      '<div class="insight-metric"><strong>'+value(s.accuracy)+'</strong><span>Accuracy</span></div>'+
      '<div class="insight-metric"><strong>'+value(s.readiness)+'</strong><span>Evidence score</span></div>';
    let title='Keep building',reason='Evidence score = 70% matched-PYQ accuracy + 30% matched-PYQ coverage.';
    if(!s.count){title='Improve note mapping';reason='No strong PYQ match. Add subject/system properties or use the exam topic name.'}
    else if(!s.attempted){title='Start retrieval';reason='You have '+s.count+' matched PYQs and none attempted yet.'}
    else if(s.accuracy!=null&&s.accuracy<60){title='Repair weak retrieval';reason='Matched-PYQ accuracy is '+s.accuracy+'%. Re-attempt this concept before adding more notes.'}
    else if(s.coverage<50){title='Expand coverage';reason='Only '+s.coverage+'% of matched PYQs have been attempted.'}
    else if(s.weakQuestions.length){title='Target persistent misses';reason=s.weakQuestions.length+' matched question'+(s.weakQuestions.length===1?' is':'s are')+' still weak.'}
    else if(s.readiness!=null&&s.readiness>=85){title='Maintain, do not over-study';reason='Retrieval evidence is strong. Use spaced review instead of rereading.'}
    const href=NeuralVaultMedical.practiceUrl(s.matches,note);
    $('#insightAction').innerHTML='<strong>'+esc(title)+'</strong><p>'+esc(reason)+'</p>'+(s.count?'<a href="'+esc(href)+'">Practice matched PYQs →</a>':'');
  }catch(_){
    if(token!==insightToken)return;
    $('#insightBand').textContent='Offline';
    $('#insightMetrics').innerHTML='<div class="context-empty">Study evidence is unavailable until the PYQ corpus has been cached.</div>';
  }
}

async function runEvidenceSearch(query){
  query=String(query||'').trim();
  if(!query)return;
  lastEvidenceQuery=query;
  const token=++evidenceToken,root=$('#evidenceResults');
  $('#evidenceSummary').textContent='Searching vault notes and PYQs…';root.replaceChildren();$('#copyContextBtn').hidden=true;
  try{
    const results=await NeuralVaultIntelligence.search(state.notes,query,8);
    if(token!==evidenceToken)return;
    $('#evidenceSummary').textContent=results.summary;
    results.notes.forEach(x=>{
      const b=contextItem(x.note,x.snippet);b.classList.add('evidence-result');
      const k=document.createElement('span');k.className='evidence-kind';k.textContent='Vault note';b.prepend(k);root.append(b);
    });
    results.questions.forEach(x=>{
      const q=x.q,a=document.createElement('a');a.className='context-item evidence-result';a.href=NeuralVaultMedical.questionUrl(q);
      a.innerHTML='<span class="evidence-kind">PYQ · '+esc(q.exam_year||'')+'</span><strong>'+esc(q.topic||q.subtopic||q.subject||'Question')+'</strong><p>'+esc(q.stem||'')+'</p>';
      root.append(a);
    });
    if(!results.notes.length&&!results.questions.length)root.innerHTML='<div class="context-empty">No strong evidence match. Try the canonical disease, drug, investigation or syndrome name.</div>';
    $('#copyContextBtn').hidden=!(results.notes.length||results.questions.length);
  }catch(_){
    if(token!==evidenceToken)return;
    $('#evidenceSummary').textContent='Evidence search is unavailable offline until the PYQ corpus has been cached.';
  }
}

function renderBrainContext(){
  const n=current();
  if($('#brainCurrentNote'))$('#brainCurrentNote').textContent=n?n.title:'—';
}

function renderCurrent(){
  const n=current();if(!n)return;
  $('#titleInput').value=n.title;$('#editor').value=n.content;$('#pathLabel').textContent=folder(n);$('#breadcrumbs').textContent='Vault / '+folder(n)+' / '+n.title;
  $('#wordCount').textContent=countWords(n.content)+' words';$('#updatedLabel').textContent=ago(n.updatedAt);$('#preview').innerHTML=markdown(n.content);
  renderTree($('#searchInput').value);renderBacklinks();renderRelated();renderProps();renderMedical();renderInsights();renderBrainContext();if(view==='graph')renderGraph();
}

function scheduleSave(){
  $('#saveState').textContent='Saving…';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    save();renderBacklinks();renderRelated();renderProps();renderMedical();
    if(view==='preview')$('#preview').innerHTML=markdown(current().content);
    if(window.NeuralVaultDB)NeuralVaultDB.checkpoint(current(),'autosave').catch(()=>{});
  },600);
}

function openNote(noteId){
  if(!state.notes.some(n=>n.id===noteId))return;
  if(window.NeuralVaultDB&&current())NeuralVaultDB.checkpoint(current(),'navigation').catch(()=>{});
  currentId=noteId;save();renderCurrent();setView('editor');closeSidebar();
}

function createNote(title='Untitled'){
  const n={id:uid(),title,path:'Inbox/'+filename(title),content:'---\ntype: note\nstatus: learning\n---\n\n# '+title+'\n\n',createdAt:iso(),updatedAt:iso()};
  state.notes.push(n);currentId=n.id;save();renderCurrent();setView('editor');$('#titleInput').focus();$('#titleInput').select();toast('New note created');
}

function openTitle(title){
  const n=byTitle(title);
  if(n)openNote(n.id);else{createNote(title);toast('Created linked note')}
}

function updateEditor(){
  const n=current();n.content=$('#editor').value;n.updatedAt=iso();
  $('#wordCount').textContent=countWords(n.content)+' words';$('#updatedLabel').textContent='just now';scheduleSave();
}

function updateTitle(){
  const n=current(),v=$('#titleInput').value.trim()||'Untitled',parts=n.path.split('/');
  n.title=v;parts[parts.length-1]=filename(v);n.path=parts.join('/');n.updatedAt=iso();
  $('#breadcrumbs').textContent='Vault / '+folder(n)+' / '+v;renderTree($('#searchInput').value);scheduleSave();
}

function finalizeTitleRename(){
  const n=current();if(!titleSnapshot||titleSnapshot.id!==n.id)return;
  const oldTitle=titleSnapshot.title,newTitle=n.title;
  if(norm(oldTitle)!==norm(newTitle)){
    if(window.NeuralVaultDB)NeuralVaultDB.checkpoint(titleSnapshot,'before-rename').catch(()=>{});
    const re=new RegExp('\\[\\['+escapeRe(oldTitle)+'(?=([#|\\]]))','gi');
    let changed=0;
    state.notes.forEach(x=>{
      if(x.id===n.id)return;
      const next=x.content.replace(re,'[['+newTitle);
      if(next!==x.content){x.content=next;x.updatedAt=iso();changed++}
    });
    save();renderCurrent();toast('Renamed note and updated '+changed+' linked '+(changed===1?'note':'notes'));
  }
  titleSnapshot=null;
}

function graphData(){
  const map=new Map(state.notes.map(n=>[norm(n.title),n])),edges=[];
  state.notes.forEach(n=>links(n.content).forEach(t=>{const to=map.get(norm(t));if(to&&to.id!==n.id)edges.push({from:n.id,to:to.id})}));
  return{notes:state.notes,edges};
}

async function renderGraph(){
  const token=++graphToken,svg=$('#graphSvg');svg.replaceChildren();
  const all=graphData();let notes=all.notes,edges=all.edges;
  if($('#graphCurrentOnly').checked){
    const ids=new Set([currentId]);
    edges.forEach(e=>{if(e.from===currentId)ids.add(e.to);if(e.to===currentId)ids.add(e.from)});
    notes=notes.filter(n=>ids.has(n.id));edges=edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
  }
  const mode=$('#graphMode').value;
  $('#graphTitle').textContent=mode==='mastery'?'Mastery graph':'Knowledge graph';
  $('#graphLegend').hidden=mode!=='mastery';
  $('#graphStats').textContent=mode==='mastery'?'Calculating retrieval evidence…':notes.length+' nodes · '+edges.length+' links';

  let mastery=new Map(),measured=0;
  if(mode==='mastery'&&window.NeuralVaultIntelligence){
    try{
      const prepared=notes.map(n=>({id:n.id,title:n.title,path:n.path,content:n.content,properties:props(n.content)}));
      const snapshot=await NeuralVaultIntelligence.snapshot(prepared);
      if(token!==graphToken)return;
      mastery=snapshot.byId;measured=snapshot.measured;
      $('#graphStats').textContent=notes.length+' nodes · '+measured+' measured · '+(snapshot.average==null?'—':snapshot.average+'%')+' avg evidence';
    }catch(_){
      if(token!==graphToken)return;
      $('#graphStats').textContent='Mastery evidence unavailable offline';
    }
  }else if(mode==='knowledge'){
    $('#graphStats').textContent=notes.length+' nodes · '+edges.length+' links';
  }

  const NS='http://www.w3.org/2000/svg',cx=600,cy=380,rad=Math.min(300,120+notes.length*15),pos=new Map();
  notes.forEach((n,i)=>{const a=Math.PI*2*i/Math.max(1,notes.length)-Math.PI/2,j=(i%3)*18;pos.set(n.id,{x:cx+Math.cos(a)*(rad-j),y:cy+Math.sin(a)*(rad-j)})});
  edges.forEach(e=>{const a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)return;const l=document.createElementNS(NS,'line');l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);l.setAttribute('class','graph-edge');svg.append(l)});
  notes.forEach(n=>{
    const p=pos.get(n.id),s=mastery.get(n.id),band=s?s.band:'unmeasured';
    const g=document.createElementNS(NS,'g'),circle=document.createElementNS(NS,'circle'),text=document.createElementNS(NS,'text'),tip=document.createElementNS(NS,'title');
    g.setAttribute('class','graph-node'+(n.id===currentId?' current':'')+(mode==='mastery'?' mastery-'+band:''));g.dataset.noteId=n.id;
    const base=mode==='mastery'&&s?8+Math.min(6,Math.sqrt(Math.max(0,s.count||0))*1.5):8;
    circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',base+(n.id===currentId?3:0));
    text.setAttribute('x',p.x+15);text.setAttribute('y',p.y+4);text.textContent=n.title.length>28?n.title.slice(0,26)+'…':n.title;
    if(mode==='mastery'&&s){
      tip.textContent=n.title+' · '+(s.readiness==null?'unmeasured':s.readiness+'% evidence')+' · '+s.attempted+'/'+s.count+' PYQs attempted';
      g.append(tip);
      if(s.readiness!=null){
        const score=document.createElementNS(NS,'text');score.setAttribute('x',p.x+15);score.setAttribute('y',p.y+16);score.setAttribute('class','readiness-label');score.textContent=s.readiness+'%';g.append(score);
      }
    }
    g.append(circle,text);svg.append(g);
  });
}

function setView(v){
  view=v;
  $$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  $$('.editor-view,.preview-view,.graph-view,.brain-view').forEach(x=>x.classList.remove('active'));
  $('#view-'+v).classList.add('active');
  if(v==='preview')$('#preview').innerHTML=markdown(current().content);
  if(v==='graph')renderGraph();
  if(v==='brain'){renderBrainContext();requestAnimationFrame(()=>$('#brainInput')?.focus())}
}

function setContext(v){
  $$('.context-tab').forEach(x=>x.classList.toggle('active',x.dataset.context===v));
  $$('.context-view').forEach(x=>x.classList.remove('active'));
  $('#context-'+v).classList.add('active');
}

function download(name,text,type='text/plain'){
  const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),800);
}

function exportVault(){
  download('NeuralVault-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({app:'NeuralVault',version:2,exportedAt:iso(),notes:state.notes},null,2),'application/json');
  toast('Vault backup exported');
}

async function restoreBackup(file){
  try{
    const data=JSON.parse(await file.text()),notes=Array.isArray(data)?data:data.notes;
    if(!Array.isArray(notes)||!notes.length)throw new Error('No notes found');
    const clean=notes.filter(n=>n&&n.title&&typeof n.content==='string').map(n=>({
      id:n.id||uid(),title:String(n.title),path:String(n.path||('Imported/'+filename(n.title))),content:n.content,
      createdAt:n.createdAt||iso(),updatedAt:n.updatedAt||iso()
    }));
    if(!clean.length)throw new Error('No valid notes found');
    if(!confirm('Replace this browser vault with '+clean.length+' notes from the backup?'))return;
    state={version:2,notes:clean,currentId:clean[0].id,savedAt:Date.now()};currentId=clean[0].id;save();renderCurrent();toast('Backup restored: '+clean.length+' notes');
  }catch(e){toast('Backup restore failed: '+e.message)}
}

async function importFiles(files){
  const list=[...files].filter(f=>/\.md$/i.test(f.name));
  if(!list.length){toast('Choose Markdown .md files');return}
  for(const file of list){
    const text=await file.text(),path=file.webkitRelativePath||('Imported/'+file.name),title=file.name.replace(/\.md$/i,'');
    const existing=state.notes.find(n=>n.path===path);
    if(existing){if(window.NeuralVaultDB)NeuralVaultDB.checkpoint(existing,'before-import-update').catch(()=>{});existing.content=text;existing.title=title;existing.updatedAt=iso()}
    else state.notes.push({id:uid(),title,path,content:text,createdAt:iso(),updatedAt:iso()});
  }
  currentId=state.notes[state.notes.length-1].id;save();renderCurrent();toast(list.length+' Markdown '+(list.length===1?'note':'notes')+' imported');
}

async function writeVaultToFolder(){
  if(!window.showDirectoryPicker){toast('Direct folder writing is unavailable here. Use JSON backup or Markdown import/export.');return}
  try{
    const root=await window.showDirectoryPicker({mode:'readwrite'});
    for(const n of state.notes){
      const parts=n.path.split('/').filter(Boolean);let dir=root;
      for(let i=0;i<parts.length-1;i++)dir=await dir.getDirectoryHandle(parts[i],{create:true});
      const fh=await dir.getFileHandle(parts[parts.length-1]||filename(n.title),{create:true}),w=await fh.createWritable();
      await w.write(n.content);await w.close();
    }
    toast('Wrote '+state.notes.length+' Markdown notes to folder');
  }catch(e){if(e&&e.name!=='AbortError')toast('Folder export failed: '+e.message)}
}

async function showHistory(){
  if(!window.NeuralVaultDB){toast('Version history unavailable');return}
  const n=current();await NeuralVaultDB.checkpoint(n,'manual');
  const rows=await NeuralVaultDB.revisions(n.id),root=$('#historyList');
  $('#historyNoteTitle').textContent=n.title;root.replaceChildren();
  if(!rows.length)root.innerHTML='<div class="context-empty">No earlier versions yet.</div>';
  rows.forEach(row=>{
    const d=document.createElement('div');d.className='history-row';
    d.innerHTML='<div><strong>'+esc(new Date(row.savedAt).toLocaleString())+'</strong><p>'+esc(row.reason||'saved')+' · '+countWords(row.content)+' words</p></div>';
    const b=document.createElement('button');b.textContent='Restore';
    b.onclick=async()=>{
      if(!confirm('Restore this version? The current note will be checkpointed first.'))return;
      await NeuralVaultDB.checkpoint(current(),'before-restore');
      const x=current();x.title=row.title;x.path=row.path;x.content=row.content;x.updatedAt=iso();save();renderCurrent();$('#historyBackdrop').hidden=true;toast('Version restored');
    };
    d.append(b);root.append(d);
  });
  $('#historyBackdrop').hidden=false;
}

function openDailyNote(){
  const d=new Date(),date=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const path='Daily/'+date+'.md',existing=state.notes.find(n=>n.path===path);
  if(existing){openNote(existing.id);return}
  const n={id:uid(),title:date,path,content:'---\ntype: daily\ndate: '+date+'\n---\n\n# '+date+'\n\n## Focus\n\n- \n\n## Learned\n\n- \n\n## Errors to revisit\n\n- \n',createdAt:iso(),updatedAt:iso()};
  state.notes.push(n);currentId=n.id;save();renderCurrent();setView('editor');toast('Daily note created');
}

function createMedicalNote(){
  const title=prompt('Medical topic or disease');if(!title)return;
  const subject=(prompt('Primary MBBS subject (optional)')||'').trim();
  const front='---\ntype: medical-concept\nstatus: learning\n'+(subject?'subject: '+subject+'\n':'')+'mastery: 0\n---\n\n';
  const body='# '+title+'\n\n## Core concept\n\n\n## Mechanism / pathophysiology\n\n\n## Clinical clues\n\n\n## Investigations\n\n\n## Management\n\n\n## PYQ anchors\n\n\n## Confusions / differentials\n\n\n## Links\n\n';
  const n={id:uid(),title,path:'Medical/'+filename(title),content:front+body,createdAt:iso(),updatedAt:iso()};
  state.notes.push(n);currentId=n.id;save();renderCurrent();setView('editor');toast('Medical note created');
}

function duplicate(){
  const n=current(),copy=Object.assign({},n,{id:uid(),title:n.title+' Copy',path:'Inbox/'+filename(n.title+' Copy'),createdAt:iso(),updatedAt:iso()});
  state.notes.push(copy);currentId=copy.id;save();renderCurrent();toast('Note duplicated');
}

function del(){
  if(state.notes.length<2){toast('Keep at least one note');return}
  const n=current();if(!confirm('Delete "'+n.title+'"?'))return;
  if(window.NeuralVaultDB)NeuralVaultDB.checkpoint(n,'before-delete').catch(()=>{});
  const i=state.notes.findIndex(x=>x.id===n.id);state.notes.splice(i,1);currentId=state.notes[Math.max(0,i-1)].id;save();renderCurrent();toast('Note deleted');
}

async function openNextTarget(){
  if(!window.NeuralVaultIntelligence){toast('Learning intelligence unavailable');return}
  const prepared=state.notes.map(n=>({id:n.id,title:n.title,path:n.path,content:n.content,properties:props(n.content)}));
  try{
    const snap=await NeuralVaultIntelligence.snapshot(prepared),target=snap.actions[0];
    if(!target){toast('No PYQ-backed study target yet');return}
    openNote(target.note.id);
    setContext('intelligence');
    toast('Next target: '+target.note.title+' · '+target.reason);
  }catch(_){toast('Could not calculate next study target')}
}

function brainSourceButton(source){
  if(!source)return '';
  if(source.kind==='note')return '<button class="brain-cite" data-brain-note="'+esc(source.id)+'">['+esc(source.title)+']</button>';
  if(source.kind==='pyq')return '<a class="brain-cite" href="'+esc(source.url||'../')+'">['+esc(source.title||source.id)+']</a>';
  return '';
}

function brainRichText(text){
  let safe=esc(text||'').replace(/\n/g,'<br>');
  safe=safe.replace(/\[NOTE:([A-Za-z0-9._:-]+)\]/g,(m,id)=>{
    const n=state.notes.find(x=>x.id===id);
    return n?'<button class="brain-cite inline-source" data-brain-note="'+esc(id)+'">[NOTE:'+esc(id)+']</button>':m;
  });
  safe=safe.replace(/\[PYQ:([A-Za-z0-9._:-]+)\]/g,(m,id)=>{
    const href='../?'+new URLSearchParams({source:'neuralvault',nvq:id}).toString();
    return '<a class="brain-cite inline-source" href="'+esc(href)+'">[PYQ:'+esc(id)+']</a>';
  });
  return safe;
}

function renderBrainAnswer(answer){
  const thread=$('#brainThread');
  const box=document.createElement('div');box.className='brain-message assistant';
  let html='<div class="brain-answer-head"><strong>'+esc(answer.title||'NeuralVault Brain')+'</strong><span>'+esc(answer.mode||'grounded')+'</span></div>';
  if(answer.summary)html+='<p class="brain-answer-summary">'+esc(answer.summary)+'</p>';
  (answer.sections||[]).forEach(section=>{
    html+='<section class="brain-section"><h3>'+esc(section.title||'Evidence')+'</h3>';
    (section.bullets||[]).forEach(b=>{
      html+='<div class="brain-bullet"><span>'+brainRichText(b.text||'')+brainSourceButton(b.source)+'</span></div>';
    });
    html+='</section>';
  });
  if(answer.sources&&answer.sources.length){
    const seen=new Set();
    html+='<div class="brain-source-row">';
    answer.sources.forEach(s=>{
      const key=s.kind+':'+s.id;if(seen.has(key))return;seen.add(key);
      if(s.kind==='note')html+='<button class="brain-source-chip" data-brain-note="'+esc(s.id)+'">◇ '+esc(s.title)+'</button>';
      else if(s.kind==='pyq')html+='<a class="brain-source-chip pyq" href="'+esc(s.url||'../')+'">PYQ '+esc(s.title||s.id)+'</a>';
    });
    html+='</div>';
  }
  if(answer.nextTarget||answer.practiceUrl||answer.patch||answer.cards){
    html+='<div class="brain-actions">';
    if(answer.nextTarget){
      html+='<button class="brain-action-button" data-brain-note="'+esc(answer.nextTarget.noteId)+'">Open '+esc(answer.nextTarget.title)+'</button>';
      if(answer.nextTarget.practiceUrl)html+='<a class="brain-action-link primary" href="'+esc(answer.nextTarget.practiceUrl)+'">Practice matched PYQs →</a>';
    }else if(answer.practiceUrl){
      html+='<a class="brain-action-link primary" href="'+esc(answer.practiceUrl)+'">Practice matched PYQs →</a>';
    }
    if(answer.patch)html+='<button class="brain-action-button primary" data-brain-patch>Preview safe patch →</button>';
    if(answer.cards&&answer.cards.length)html+='<button class="brain-action-button" data-brain-copy-cards>Copy '+answer.cards.length+' cards JSON</button>';
    html+='</div>';
  }
  box.innerHTML=html;box._brainAnswer=answer;thread.append(box);thread.scrollTop=thread.scrollHeight;
}

async function askBrain(query){
  query=String(query||'').trim();if(!query)return;
  if(!window.NeuralVaultBrain){toast('Brain engine unavailable');return}
  brainLastQuery=query;brainLastNoteId=current()?.id||null;brainLastScope=$('#brainScope').value;brainLastProvider=$('#brainProvider').value;setView('brain');
  const thread=$('#brainThread');
  const empty=thread.querySelector('.brain-empty');if(empty)empty.remove();
  const user=document.createElement('div');user.className='brain-message user';user.innerHTML='<p>'+esc(query)+'</p>';thread.append(user);
  const loading=document.createElement('div');loading.className='brain-loading';loading.textContent='Grounding answer in your vault…';thread.append(loading);
  $('#brainAskBtn').disabled=true;
  const token=++brainToken;
  try{
    const notes=state.notes.map(n=>({...n,properties:props(n.content)}));
    const contextNote=current()?{...current(),properties:props(current().content)}:null;
    const grounded=await NeuralVaultBrain.ask({
      notes,
      currentNote:contextNote,
      query,
      scope:brainLastScope
    });
    if(token!==brainToken)return;

    let answer=grounded;
    const deterministic=new Set(['study','gap','pyq','connections','cards','patch']);
    if(brainLastProvider!=='local'&&!deterministic.has(grounded.mode)){
      if(!window.NeuralVaultProvider)throw new Error('Provider client unavailable');
      loading.textContent='Sending grounded evidence to configured model…';
      const contextual=/\b(this concept|this note|current note)\b/i.test(query);
      const prompt=await NeuralVaultBrain.modelPrompt(
        state.notes,
        query,
        (brainLastScope==='current'||contextual)?contextNote:null
      );
      const remote=await NeuralVaultProvider.generate(brainLastProvider,prompt,1400);
      if(token!==brainToken)return;
      const option=$('#brainProvider').selectedOptions[0];
      const providerLabel=option?option.textContent:brainLastProvider;
      answer={
        mode:'model',
        title:providerLabel+' · '+remote.model,
        summary:'Generated from a NeuralVault evidence bundle. Source chips are the evidence supplied to the model, not automatic claim-level verification.',
        sections:[{title:'Model answer',bullets:[{text:remote.text,source:null}]}],
        sources:grounded.sources||[]
      };
    }else if(brainLastProvider!=='local'&&deterministic.has(grounded.mode)){
      grounded.summary=(grounded.summary||'')+' This action stayed local because it changes study state, note structure, or evidence routing deterministically.';
    }

    loading.remove();renderBrainAnswer(answer);$('#brainCopyPrompt').hidden=false;
  }catch(e){
    if(token!==brainToken)return;
    loading.remove();
    const err=document.createElement('div');err.className='brain-message assistant';
    err.innerHTML='<div class="brain-answer-head"><strong>Model unavailable</strong><span>fallback</span></div><p class="brain-answer-summary">'+esc(e.message||'Brain error')+' Local evidence mode remains available.</p>';
    thread.append(err);
  }finally{
    if(token===brainToken)$('#brainAskBtn').disabled=false;
  }
}

function clearBrain(){
  brainLastQuery='';brainLastNoteId=null;brainLastScope='vault';brainLastProvider='local';brainToken++;
  $('#brainThread').innerHTML='<div class="brain-empty"><div class="brain-orb">✦</div><strong>NeuralVault Brain</strong><p>Ask a question. Local mode retrieves evidence and cites the exact notes/PYQs it used.</p></div>';
  $('#brainCopyPrompt').hidden=true;
}

async function copyBrainPrompt(){
  if(!brainLastQuery||!window.NeuralVaultBrain){toast('Ask the Brain first');return}
  try{
    const contextNote=brainLastNoteId?state.notes.find(n=>n.id===brainLastNoteId)||null:null;
    const prompt=await NeuralVaultBrain.modelPrompt(state.notes,brainLastQuery,brainLastScope==='current'?contextNote:null);
    try{await navigator.clipboard.writeText(prompt);toast('Grounded model prompt copied')}
    catch(_){download('NeuralVault-grounded-prompt.md',prompt,'text/markdown');toast('Clipboard unavailable; prompt downloaded')}
  }catch(_){toast('Could not build grounded model prompt')}
}



async function refreshBrainProviders(showStatus=false){
  const select=$('#brainProvider');
  const previous=select.value;
  select.innerHTML='<option value="local">Local evidence</option>';
  if(!window.NeuralVaultProvider)return;
  const info=await NeuralVaultProvider.providers();
  const tokenReady=Boolean(NeuralVaultProvider.accessToken());
  const gatewayReady=Boolean(info.gateway_ready);
  const gatewayAuthorized=Boolean(info.gateway_authorized);
  const configured=(info.providers||[]).filter(x=>x.configured).length;
  if(gatewayAuthorized){
    (info.providers||[]).filter(x=>x.configured).forEach(row=>{
      const o=document.createElement('option');o.value=row.id;o.textContent=row.label+(row.model?' · '+row.model:'');select.append(o);
    });
  }
  if([...select.options].some(o=>o.value===previous))select.value=previous;
  $('#brainModeLabel').textContent=(gatewayAuthorized&&configured)
    ? ('Local evidence + '+configured+' configured model'+(configured===1?'':'s'))
    : 'Local evidence mode · remote models locked';
  if(showStatus){
    $('#brainSettingsStatus').textContent=info.error
      ? 'Backend connection failed: '+info.error
      : !info.base
        ? 'No backend URL saved. Local evidence mode is active.'
        : !gatewayReady
          ? 'Backend reached, but its AI gateway token is not configured.'
          : !tokenReady
            ? 'Backend reached. Enter your NeuralVault gateway token for this session.'
            : !gatewayAuthorized
              ? 'Backend reached, but the gateway token was rejected.'
              : configured+' provider'+(configured===1?'':'s')+' ready on '+info.base;
  }
}

function openBrainSettings(){
  if(!window.NeuralVaultProvider)return;
  $('#brainBackendUrl').value=NeuralVaultProvider.settings().backendUrl||'';
  $('#brainGatewayToken').value=NeuralVaultProvider.accessToken()||'';
  $('#brainSettingsStatus').textContent='Provider API keys stay on FastAPI. The gateway token is kept only for this browser session.';
  $('#brainSettingsBackdrop').hidden=false;
}

async function saveBrainBackend(close=true){
  if(!window.NeuralVaultProvider)return;
  NeuralVaultProvider.save({
    backendUrl:$('#brainBackendUrl').value,
    accessToken:$('#brainGatewayToken').value
  });
  await refreshBrainProviders(true);
  if(close)$('#brainSettingsBackdrop').hidden=true;
}

function openPatchPreview(patch){
  if(!patch)return;
  pendingPatch=patch;
  $('#patchNoteTitle').textContent=patch.noteTitle||'';
  $('#patchChanges').innerHTML=(patch.changes||[]).map(x=>'<div>• '+esc(x)+'</div>').join('')||'<div>No changes.</div>';
  $('#patchBefore').textContent=patch.before||'';
  $('#patchAfter').textContent=patch.after||'';
  $('#patchBackdrop').hidden=false;
}

async function applyPendingPatch(){
  if(!pendingPatch)return;
  const n=state.notes.find(x=>x.id===pendingPatch.noteId);
  if(!n){toast('Target note no longer exists');return}
  if(n.content!==pendingPatch.before){toast('Note changed since this patch was proposed. Generate a fresh patch.');return}
  if(window.NeuralVaultDB)await NeuralVaultDB.checkpoint(n,'before-brain-safe-patch').catch(()=>{});
  n.content=pendingPatch.after;n.updatedAt=iso();currentId=n.id;save();renderCurrent();
  $('#patchBackdrop').hidden=true;pendingPatch=null;setView('editor');toast('Safe structural patch applied');
}

function toast(message){
  const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),1800);
}
function openSidebar(){document.body.classList.add('sidebar-open')}
function closeSidebar(){document.body.classList.remove('sidebar-open')}

const commands=[
  ['New note','Cmd N',()=>createNote()],
  ['New medical note','',createMedicalNote],
  ["Open today's daily note",'',openDailyNote],
  ['Open graph','Cmd Shift G',()=>setView('graph')],
  ['Preview note','Cmd P',()=>setView('preview')],
  ['Edit note','',()=>setView('editor')],
  ['Show matched PYQs','',()=>setContext('medical')],
  ['Open learning insights','',()=>setContext('intelligence')],
  ['Open next best study target','',openNextTarget],
  ['Ask NeuralVault Brain','Cmd Shift B',()=>setView('brain')],
  ['Import Markdown files','',()=>$('#fileImport').click()],
  ['Import Obsidian folder','',()=>$('#folderImport').click()],
  ['Restore JSON backup','',()=>$('#backupImport').click()],
  ['Export vault backup','',exportVault],
  ['Write vault to folder','',writeVaultToFolder],
  ['Version history','',showHistory],
  ['Toggle context panel','',()=>document.body.classList.toggle('context-hidden')],
  ['Open NEETPG2027 Study Engine','',()=>location.href='../']
];

function renderPalette(q){
  q=norm(q);
  const items=commands.filter(c=>!q||norm(c[0]).includes(q)).map(c=>({name:c[0],hint:c[1],run:c[2],kind:'cmd'}))
    .concat(state.notes.filter(n=>!q||norm(n.title+' '+n.path).includes(q)).slice(0,12).map(n=>({name:n.title,hint:folder(n),run:()=>openNote(n.id),kind:'note'}))).slice(0,18);
  const root=$('#paletteResults');root.replaceChildren();root._items=items;
  items.forEach((x,i)=>{
    const b=document.createElement('button');b.className='palette-item'+(i===0?' selected':'');
    b.innerHTML='<span>'+(x.kind==='note'?'◇':'⌘')+'</span><span>'+esc(x.name)+'</span><small>'+esc(x.hint||'')+'</small>';
    b.onclick=()=>{$('#paletteBackdrop').hidden=true;x.run()};root.append(b);
  });
}

function showPalette(){
  $('#paletteBackdrop').hidden=false;$('#paletteInput').value='';renderPalette('');
  requestAnimationFrame(()=>$('#paletteInput').focus());
}

function paletteKeys(e){
  const rows=$$('.palette-item'),root=$('#paletteResults');if(e.key==='Escape'){$('#paletteBackdrop').hidden=true;return}if(!rows.length)return;
  let i=rows.findIndex(x=>x.classList.contains('selected'));
  if(e.key==='ArrowDown'){e.preventDefault();i=(i+1)%rows.length}
  else if(e.key==='ArrowUp'){e.preventDefault();i=(i-1+rows.length)%rows.length}
  else if(e.key==='Enter'){e.preventDefault();const x=root._items[Math.max(0,i)];if(x){$('#paletteBackdrop').hidden=true;x.run()}return}
  else return;
  rows.forEach((x,j)=>x.classList.toggle('selected',j===i));rows[i].scrollIntoView({block:'nearest'});
}

$('#newNoteBtn').onclick=()=>createNote();
$('#commandBtn').onclick=showPalette;
$('#searchInput').oninput=e=>renderTree(e.target.value);
$('#importFilesBtn').onclick=()=>$('#fileImport').click();
$('#importFolderBtn').onclick=()=>$('#folderImport').click();
$('#fileImport').onchange=e=>{importFiles(e.target.files);e.target.value=''};
$('#folderImport').onchange=e=>{importFiles(e.target.files);e.target.value=''};
$('#backupImport').onchange=e=>{if(e.target.files[0])restoreBackup(e.target.files[0]);e.target.value=''};

$('#fileTree').onclick=e=>{const x=e.target.closest('[data-note-id]');if(x)openNote(x.dataset.noteId)};
$('#backlinks').onclick=$('#relatedNotes').onclick=e=>{const x=e.target.closest('[data-note-id]');if(x)openNote(x.dataset.noteId)};
$('#outgoingLinks').onclick=e=>{const x=e.target.closest('[data-note-title]');if(x)openTitle(x.dataset.noteTitle)};

$('#editor').oninput=updateEditor;
$('#titleInput').onfocus=()=>{const n=current();titleSnapshot={id:n.id,title:n.title,path:n.path,content:n.content,createdAt:n.createdAt,updatedAt:n.updatedAt}};
$('#titleInput').oninput=updateTitle;
$('#titleInput').onblur=finalizeTitleRename;

$$('.tab').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$$('.context-tab').forEach(b=>b.onclick=()=>setContext(b.dataset.context));
$('#toggleRight').onclick=()=>document.body.classList.toggle('context-hidden');
$('#graphCurrentOnly').onchange=renderGraph;
$('#graphMode').onchange=renderGraph;
$('#vaultQueryForm').onsubmit=e=>{e.preventDefault();runEvidenceSearch($('#vaultQuery').value)};
$('#evidenceResults').onclick=e=>{const x=e.target.closest('[data-note-id]');if(x){e.preventDefault();openNote(x.dataset.noteId)}};
$('#copyContextBtn').onclick=async()=>{
  if(!lastEvidenceQuery)return;
  try{
    const bundle=await NeuralVaultIntelligence.contextBundle(state.notes,lastEvidenceQuery);
    try{await navigator.clipboard.writeText(bundle);toast('Evidence bundle copied for AI')}
    catch(_){download('NeuralVault-evidence-'+new Date().toISOString().slice(0,10)+'.md',bundle,'text/markdown');toast('Clipboard unavailable; evidence bundle downloaded')}
  }catch(_){toast('Could not build evidence bundle')}
};
$('#brainForm').onsubmit=e=>{e.preventDefault();const q=$('#brainInput').value;$('#brainInput').value='';askBrain(q)};
$('#brainSuggestions').onclick=e=>{const b=e.target.closest('[data-brain-prompt]');if(b)askBrain(b.dataset.brainPrompt)};
$('#brainClear').onclick=clearBrain;
$('#brainCopyPrompt').onclick=copyBrainPrompt;
$('#brainProviderBtn').onclick=openBrainSettings;
$('#closeBrainSettings').onclick=()=>$('#brainSettingsBackdrop').hidden=true;
$('#brainSettingsBackdrop').onclick=e=>{if(e.target===$('#brainSettingsBackdrop'))$('#brainSettingsBackdrop').hidden=true};
$('#brainSaveBackend').onclick=()=>saveBrainBackend(true);
$('#brainTestBackend').onclick=()=>saveBrainBackend(false);
$('#closePatch').onclick=$('#cancelPatch').onclick=()=>{$('#patchBackdrop').hidden=true;pendingPatch=null};
$('#patchBackdrop').onclick=e=>{if(e.target===$('#patchBackdrop')){$('#patchBackdrop').hidden=true;pendingPatch=null}};
$('#applyPatch').onclick=applyPendingPatch;
$('#brainThread').onclick=e=>{
  const note=e.target.closest('[data-brain-note]');if(note){e.preventDefault();openNote(note.dataset.brainNote);return}
  const patch=e.target.closest('[data-brain-patch]');if(patch){openPatchPreview(patch.closest('.brain-message')._brainAnswer?.patch);return}
  const cards=e.target.closest('[data-brain-copy-cards]');if(cards){
    const data=cards.closest('.brain-message')._brainAnswer?.cards||[];
    const json=JSON.stringify(data,null,2);
    navigator.clipboard?.writeText(json).then(()=>toast('Recall cards copied')).catch(()=>download('NeuralVault-recall-cards.json',json,'application/json'));
  }
};
$('#brainInput').onkeydown=e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();$('#brainForm').requestSubmit()}};
$('#graphSvg').onclick=e=>{const x=e.target.closest&&e.target.closest('.graph-node');if(x)openNote(x.dataset.noteId)};
$('#preview').onclick=e=>{const x=e.target.closest('.wiki-link');if(x)openTitle(x.dataset.noteTitle)};

$('#exportBtn').onclick=exportVault;
$('#moreBtn').onclick=e=>{$('#noteMenu').hidden=!$('#noteMenu').hidden;e.stopPropagation()};
$('#noteMenu').onclick=e=>{
  const x=e.target.closest('[data-action]');if(!x)return;$('#noteMenu').hidden=true;
  if(x.dataset.action==='download-note')download(filename(current().title),current().content,'text/markdown');
  if(x.dataset.action==='export-folder')writeVaultToFolder();
  if(x.dataset.action==='import-backup')$('#backupImport').click();
  if(x.dataset.action==='history-note')showHistory();
  if(x.dataset.action==='duplicate-note')duplicate();
  if(x.dataset.action==='delete-note')del();
};
document.addEventListener('click',e=>{if(!e.target.closest('#noteMenu')&&!e.target.closest('#moreBtn'))$('#noteMenu').hidden=true});

$('#paletteBackdrop').onclick=e=>{if(e.target===$('#paletteBackdrop'))$('#paletteBackdrop').hidden=true};
$('#paletteInput').oninput=e=>renderPalette(e.target.value);
$('#paletteInput').onkeydown=paletteKeys;
$('#openSidebar').onclick=openSidebar;
$('#closeSidebar').onclick=closeSidebar;
$('#sidebarScrim').onclick=closeSidebar;
$('#closeHistory').onclick=()=>$('#historyBackdrop').hidden=true;
$('#historyBackdrop').onclick=e=>{if(e.target===$('#historyBackdrop'))$('#historyBackdrop').hidden=true};

document.addEventListener('keydown',e=>{
  const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&k==='k'){e.preventDefault();showPalette()}
  if(mod&&k==='n'){e.preventDefault();createNote()}
  if(mod&&k==='s'){e.preventDefault();save();toast('Vault saved locally')}
  if(mod&&k==='p'){e.preventDefault();setView('preview')}
  if(mod&&e.shiftKey&&k==='g'){e.preventDefault();setView('graph')}
  if(mod&&e.shiftKey&&k==='b'){e.preventDefault();setView('brain')}
  if(e.key==='Escape'){$('#paletteBackdrop').hidden=true;$('#historyBackdrop').hidden=true;$('#brainSettingsBackdrop').hidden=true;$('#patchBackdrop').hidden=true;pendingPatch=null;closeSidebar();$('#noteMenu').hidden=true}
});

window.addEventListener('beforeunload',()=>save());

renderCurrent();
hydrateDurable();
refreshBrainProviders(false);
})();