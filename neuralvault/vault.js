
(function(){
'use strict';
var KEY='neuralvault:v1';
var $=function(s){return document.querySelector(s)};
var $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var iso=function(){return new Date().toISOString()};
var stop=new Set(['the','and','for','that','with','this','from','are','was','were','into','your','you','not','but','has','have','had','can','will','about','what','when','where','which','than','then','them','its','our','out','all','any','use','using','used','also','more','most','very','may','should','of','to','in','on','is','a','an','as','at','by','or','be','if','it','we','i']);

function sampleNotes(){
  var t=iso();
  return [
    {id:'welcome',title:'Welcome to NeuralVault',path:'Inbox/Welcome to NeuralVault.md',createdAt:t,updatedAt:t,content:'---\ntype: dashboard\nstatus: active\nsubject: General\nmastery: 0\n---\n\n# Welcome to NeuralVault\n\nThis is your local-first medical knowledge layer.\n\n## Start here\n\n- Create a note with **Cmd/Ctrl + N**\n- Link notes with [[Myocardial Infarction]]\n- Import your existing Obsidian Markdown files\n- Use **Backlinks** to see reverse connections\n- Open **Graph** to visualize the vault\n- Keep exam performance in the existing NEETPG2027 Study Engine\n\n## Design rule\n\nYour Markdown stays portable. NeuralVault adds intelligence around it without trapping the notes.'},
    {id:'mi',title:'Myocardial Infarction',path:'Medicine/Cardiology/Myocardial Infarction.md',createdAt:t,updatedAt:t,content:'---\ntype: disease\nsubject: Medicine\nsystem: Cardiovascular\nexam: NEET-PG\nmastery: 62\nstatus: learning\n---\n\n# Myocardial Infarction\n\nAcute myocardial necrosis due to ischemia, usually from plaque rupture and thrombosis.\n\n## Connections\n\n- [[Acute Coronary Syndrome]]\n- [[Troponin]]\n- [[Aspirin]]\n\n#cardiology #emergency'},
    {id:'acs',title:'Acute Coronary Syndrome',path:'Medicine/Cardiology/Acute Coronary Syndrome.md',createdAt:t,updatedAt:t,content:'---\ntype: syndrome\nsubject: Medicine\nsystem: Cardiovascular\nmastery: 55\n---\n\n# Acute Coronary Syndrome\n\nSpectrum containing unstable angina, NSTEMI and STEMI.\n\nRelated: [[Myocardial Infarction]], [[Aspirin]], [[Troponin]].\n\n#cardiology'},
    {id:'aspirin',title:'Aspirin',path:'Pharmacology/Antiplatelets/Aspirin.md',createdAt:t,updatedAt:t,content:'---\ntype: drug\nsubject: Pharmacology\nsystem: Cardiovascular\nmastery: 74\n---\n\n# Aspirin\n\nIrreversibly inhibits platelet COX-1 and reduces thromboxane A2 synthesis.\n\nUsed in [[Acute Coronary Syndrome]] and [[Myocardial Infarction]].\n\n#pharmacology #antiplatelet'},
    {id:'troponin',title:'Troponin',path:'Pathology/Biomarkers/Troponin.md',createdAt:t,updatedAt:t,content:'---\ntype: investigation\nsubject: Pathology\nsystem: Cardiovascular\nmastery: 68\n---\n\n# Troponin\n\nCardiac troponins are biomarkers of myocardial injury.\n\nLinked concepts: [[Myocardial Infarction]], [[Acute Coronary Syndrome]].\n\n#pathology #biomarker'}
  ];
}
function load(){
  try{
    var x=JSON.parse(localStorage.getItem(KEY)||'null');
    if(x&&Array.isArray(x.notes)&&x.notes.length)return x;
  }catch(e){}
  return {version:1,notes:sampleNotes(),currentId:'welcome'};
}
var state=load(),currentId=state.notes.some(function(n){return n.id===state.currentId})?state.currentId:state.notes[0].id;
var view='editor',saveTimer=null,toastTimer=null,titleSnapshot=null,medicalToken=0;

function save(){
  state.currentId=currentId;
  state.savedAt=Date.now();
  localStorage.setItem(KEY,JSON.stringify(state));
  if(window.NeuralVaultDB) NeuralVaultDB.saveState(state).then(function(){
    $('#storageStatus').textContent='IndexedDB + local cache';
  }).catch(function(){
    $('#storageStatus').textContent='Local cache only';
  });
  $('#saveState').textContent='Saved locally';
}
function current(){return state.notes.find(function(n){return n.id===currentId})||state.notes[0]}
function id(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():'note-'+Date.now()+'-'+Math.random().toString(16).slice(2)}
function norm(s){return String(s||'').trim().toLowerCase()}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
function filename(s){return (String(s||'Untitled').replace(/[\\/:*?"<>|]+/g,'-').trim()||'Untitled')+'.md'}
function folder(n){var p=String(n.path||'').split('/');return p.length>1?p.slice(0,-1).join('/'):'Inbox'}
function stripFM(c){c=String(c||'');if(c.indexOf('---\n')!==0)return c;var e=c.indexOf('\n---',4);return e<0?c:c.slice(e+4).replace(/^\n/,'')}
function props(c){
  c=String(c||'');var out={};if(c.indexOf('---\n')!==0)return out;var e=c.indexOf('\n---',4);if(e<0)return out;
  c.slice(4,e).split('\n').forEach(function(line){var i=line.indexOf(':');if(i<1)return;var k=line.slice(0,i).trim(),v=line.slice(i+1).trim();if(/^\d+(\.\d+)?$/.test(v))v=Number(v);out[k]=v});
  return out;
}
function links(c){var out=[],re=/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g,m;while((m=re.exec(String(c||''))))out.push(m[1].trim());return Array.from(new Set(out))}
function tags(c){var m=String(c||'').match(/(^|\s)#([a-zA-Z][\w/-]*)/g)||[];return Array.from(new Set(m.map(function(x){return x.trim().slice(1)})))}
function byTitle(t){t=norm(t);return state.notes.find(function(n){return norm(n.title)===t})}
function countWords(c){return (stripFM(c).replace(/[^\p{L}\p{N}\s]/gu,' ').match(/[\p{L}\p{N}]+/gu)||[]).length}
function ago(x){var m=Math.floor(Math.max(0,Date.now()-new Date(x).getTime())/60000);if(m<1)return'just now';if(m<60)return m+'m ago';var h=Math.floor(m/60);return h<24?h+'h ago':Math.floor(h/24)+'d ago'}

function inline(s){
  s=esc(s);
  s=s.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g,function(_,target,alias){
    return '<button class="wiki-link" data-note-title="'+esc(target.trim())+'">'+esc((alias||target).trim())+'</button>';
  });
  s=s.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/(^|\s)#([a-zA-Z][\w/-]*)/g,'$1<span class="tag-link">#$2</span>');
  return s;
}
function markdown(c){
  var lines=stripFM(c).split(/\r?\n/),o=[],ul=false,code=false,buf=[];
  function close(){if(ul){o.push('</ul>');ul=false}}
  lines.forEach(function(line){
    if(line.trim().indexOf('~~~')===0){close();if(!code){code=true;buf=[]}else{o.push('<pre><code>'+esc(buf.join('\n'))+'</code></pre>');code=false}return}
    if(code){buf.push(line);return}
    if(!line.trim()){close();o.push('');return}
    if(/^###\s+/.test(line)){close();o.push('<h3>'+inline(line.replace(/^###\s+/,''))+'</h3>');return}
    if(/^##\s+/.test(line)){close();o.push('<h2>'+inline(line.replace(/^##\s+/,''))+'</h2>');return}
    if(/^#\s+/.test(line)){close();o.push('<h1>'+inline(line.replace(/^#\s+/,''))+'</h1>');return}
    if(/^>\s?/.test(line)){close();o.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');return}
    if(/^---+$/.test(line.trim())){close();o.push('<hr>');return}
    if(/^\s*[-*]\s+/.test(line)){if(!ul){o.push('<ul>');ul=true}o.push('<li>'+inline(line.replace(/^\s*[-*]\s+/,''))+'</li>');return}
    close();o.push('<p>'+inline(line)+'</p>');
  });
  close();if(code)o.push('<pre><code>'+esc(buf.join('\n'))+'</code></pre>');
  return o.join('\n');
}

function renderTree(q){
  q=norm(q);var root=$('#fileTree');root.innerHTML='';
  var notes=state.notes.filter(function(n){return !q||norm(n.title+' '+n.path+' '+n.content).indexOf(q)>=0}).sort(function(a,b){return a.path.localeCompare(b.path)});
  var groups={};notes.forEach(function(n){var f=folder(n);(groups[f]=groups[f]||[]).push(n)});
  if(!notes.length)root.innerHTML='<div class="empty-tree">No notes match this search.</div>';
  Object.keys(groups).sort().forEach(function(f){
    var w=document.createElement('div');w.className='tree-folder';
    var h=document.createElement('div');h.className='tree-folder-title';h.textContent=f;w.appendChild(h);
    groups[f].forEach(function(n){
      var b=document.createElement('button');b.className='note-row'+(n.id===currentId?' active':'');b.dataset.noteId=n.id;
      b.innerHTML='<span class="note-icon">◇</span><span class="note-name">'+esc(n.title)+'</span>';w.appendChild(b);
    });root.appendChild(w);
  });
  $('#noteCount').textContent=state.notes.length+(state.notes.length===1?' note':' notes');
}
function item(n,subtitle){
  var b=document.createElement('button');b.className='context-item';b.dataset.noteId=n.id;
  var x=subtitle||stripFM(n.content).replace(/[#*_\[\]]/g,' ').replace(/\s+/g,' ').trim().slice(0,130)||folder(n);
  b.innerHTML='<strong>'+esc(n.title)+'</strong><p>'+esc(x)+'</p>';return b;
}
function renderBacklinks(){
  var n=current(),t=norm(n.title),a=state.notes.filter(function(x){return x.id!==n.id&&links(x.content).some(function(v){return norm(v)===t})});
  $('#backlinkCount').textContent=a.length;var r=$('#backlinks');r.innerHTML='';
  if(!a.length) r.innerHTML='<div class="context-empty">No backlinks yet. Link this note from another note with double brackets.</div>';
  else a.forEach(function(x){r.appendChild(item(x))});
  renderOutgoing();
}
function renderOutgoing(){
  var n=current(),list=links(n.content),r=$('#outgoingLinks');
  $('#outgoingCount').textContent=list.length;r.innerHTML='';
  if(!list.length){r.innerHTML='<div class="context-empty">No outgoing wiki links in this note.</div>';return}
  list.forEach(function(title){
    var target=byTitle(title),b=document.createElement('button');
    b.className='context-item outgoing-link'+(target?'':' broken');
    b.dataset.noteTitle=title;
    b.innerHTML='<strong>'+esc(title)+'</strong><span class="link-state">'+(target?'linked':'create')+'</span>';
    r.appendChild(b);
  });
}
function tokens(n){
  return new Set((n.title+' '+stripFM(n.content)).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu,' ').split(/\s+/).filter(function(x){return x.length>3&&!stop.has(x)}));
}
function renderRelated(){
  var n=current(),a=tokens(n),rank=state.notes.filter(function(x){return x.id!==n.id}).map(function(x){
    var b=tokens(x),s=0;a.forEach(function(w){if(b.has(w))s++});if(links(n.content).some(function(t){return norm(t)===norm(x.title)}))s+=4;return {n:x,s:s};
  }).filter(function(x){return x.s>0}).sort(function(a,b){return b.s-a.s}).slice(0,6);
  var r=$('#relatedNotes');r.innerHTML='';if(!rank.length){r.innerHTML='<div class="context-empty">No strong local connection yet.</div>';return}
  rank.forEach(function(x){r.appendChild(item(x.n,x.s+' shared connection points'))});
}
function renderProps(){
  var n=current(),p=props(n.content),data=Object.assign({path:n.path,created:new Date(n.createdAt).toLocaleDateString(),updated:new Date(n.updatedAt).toLocaleDateString(),links:links(n.content).length,tags:tags(n.content).join(', ')||'—'},p);
  var r=$('#properties');r.innerHTML='';Object.keys(data).forEach(function(k){var d=document.createElement('div');d.className='property-row';d.innerHTML='<span class="property-key">'+esc(k)+'</span><span class="property-value">'+esc(data[k])+'</span>';r.appendChild(d)});
}
function renderCurrent(){
  var n=current();if(!n)return;
  $('#titleInput').value=n.title;$('#editor').value=n.content;$('#pathLabel').textContent=folder(n);$('#breadcrumbs').textContent='Vault / '+folder(n)+' / '+n.title;
  $('#wordCount').textContent=countWords(n.content)+' words';$('#updatedLabel').textContent=ago(n.updatedAt);$('#preview').innerHTML=markdown(n.content);
  renderTree($('#searchInput').value);renderBacklinks();renderRelated();renderProps();renderMedical();if(view==='graph')renderGraph();
}
function schedule(){
  $('#saveState').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(function(){
    save();renderBacklinks();renderRelated();renderProps();renderMedical();if(view==='preview')$('#preview').innerHTML=markdown(current().content);
    if(window.NeuralVaultDB) NeuralVaultDB.checkpoint(current(),'autosave').catch(function(){});
  },220);
}
function openNote(i){
  if(!state.notes.some(function(n){return n.id===i}))return;
  if(window.NeuralVaultDB) NeuralVaultDB.checkpoint(current(),'navigation').catch(function(){});
  currentId=i;save();renderCurrent();setView('editor');closeSidebar();
}
function createNote(title){
  title=title||'Untitled';var n={id:id(),title:title,path:'Inbox/'+filename(title),content:'---\ntype: note\nstatus: learning\n---\n\n# '+title+'\n\n',createdAt:iso(),updatedAt:iso()};
  state.notes.push(n);currentId=n.id;save();renderCurrent();setView('editor');$('#titleInput').focus();$('#titleInput').select();toast('New note created');
}
function openTitle(t){var n=byTitle(t);if(n)openNote(n.id);else{createNote(t);toast('Created linked note')}}
function updateEditor(){var n=current();n.content=$('#editor').value;n.updatedAt=iso();$('#wordCount').textContent=countWords(n.content)+' words';$('#updatedLabel').textContent='just now';schedule()}
function updateTitle(){var n=current(),v=$('#titleInput').value.trim()||'Untitled',parts=n.path.split('/');n.title=v;parts[parts.length-1]=filename(v);n.path=parts.join('/');n.updatedAt=iso();$('#breadcrumbs').textContent='Vault / '+folder(n)+' / '+v;renderTree($('#searchInput').value);schedule()}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\\]\\]/g,'\\function renderCurrent(){
  var n=current();if(!n)return;
  $('#titleInput').value=n.title;$('#editor').value=n.content;$('#pathLabel').textContent=folder(n);$('#breadcrumbs').textContent='Vault / '+folder(n)+' / '+n.title;
  $('#wordCount').textContent=countWords(n.content)+' words';$('#updatedLabel').textContent=ago(n.updatedAt);$('#preview').innerHTML=markdown(n.content);
  renderTree($('#searchInput').value);renderBacklinks();renderRelated();renderProps();if(view==='graph')renderGraph();
}
function schedule(){
  $('#saveState').textContent='Saving…';clearTimeout(saveTimer);saveTimer=setTimeout(function(){save();renderBacklinks();renderRelated();renderProps();if(view==='preview')$('#preview').innerHTML=markdown(current().content)},180);
}
function openNote(i){if(!state.notes.some(function(n){return n.id===i}))return;currentId=i;save();renderCurrent();setView('editor');closeSidebar()}
function createNote(title){
  title=title||'Untitled';var n={id:id(),title:title,path:'Inbox/'+filename(title),content:'---\ntype: note\nstatus: learning\n---\n\n# '+title+'\n\n',createdAt:iso(),updatedAt:iso()};
  state.notes.push(n);currentId=n.id;save();renderCurrent();setView('editor');$('#titleInput').focus();$('#titleInput').select();toast('New note created')
}
function openTitle(t){var n=byTitle(t);if(n)openNote(n.id);else{createNote(t);toast('Created linked note')}}
function updateEditor(){var n=current();n.content=$('#editor').value;n.updatedAt=iso();$('#wordCount').textContent=countWords(n.content)+' words';$('#updatedLabel').textContent='just now';schedule()}
function updateTitle(){var n=current(),v=$('#titleInput').value.trim()||'Untitled',parts=n.path.split('/');n.title=v;parts[parts.length-1]=filename(v);n.path=parts.join('/');n.updatedAt=iso();$('#breadcrumbs').textContent='Vault / '+folder(n)+' / '+v;renderTree($('#searchInput').value);schedule()}')}
function finalizeTitleRename(){
  var n=current();if(!titleSnapshot||titleSnapshot.id!==n.id)return;
  var oldTitle=titleSnapshot.title,newTitle=n.title;
  if(norm(oldTitle)!==norm(newTitle)){
    if(window.NeuralVaultDB) NeuralVaultDB.checkpoint(titleSnapshot,'before-rename').catch(function(){});
    var re=new RegExp('\\\\[\\\\['+escapeRegExp(oldTitle)+'(?=[#|\\\\]])','gi'),changed=0;
    state.notes.forEach(function(x){if(x.id===n.id)return;var next=x.content.replace(re,'[['+newTitle);if(next!==x.content){x.content=next;x.updatedAt=iso();changed++}});
    save();renderCurrent();toast('Renamed note and updated '+changed+' linked '+(changed===1?'note':'notes'));
  }
  titleSnapshot=null;
}

async function hydrateDurable(){
  if(!window.NeuralVaultDB)return;
  try{
    var durable=await NeuralVaultDB.loadState();
    if(durable&&Array.isArray(durable.notes)&&durable.notes.length&&Number(durable.savedAt||0)>Number(state.savedAt||0)){
      state=durable;currentId=state.notes.some(function(n){return n.id===state.currentId})?state.currentId:state.notes[0].id;localStorage.setItem(KEY,JSON.stringify(state));renderCurrent();
    }else await NeuralVaultDB.saveState(state);
    $('#storageStatus').textContent='IndexedDB + local cache';
  }catch(e){$('#storageStatus').textContent='Local cache only';}
}
async function renderMedical(){
  if(!window.NeuralVaultMedical)return;
  var token=++medicalToken,n=current(),note={title:n.title,content:n.content,properties:props(n.content)},root=$('#medicalQuestions');
  $('#medicalCount').textContent='…';$('#medicalSummary').textContent='Matching this note against the existing NEET-PG PYQ bank…';root.innerHTML='';
  try{
    var summary=await NeuralVaultMedical.summary(note);if(token!==medicalToken)return;
    $('#medicalCount').textContent=summary.count;$('#medicalOpenAll').href=NeuralVaultMedical.topicUrl(note);
    $('#medicalSummary').textContent=summary.count?(summary.count+' related PYQ matches across '+summary.years.length+' exam year'+(summary.years.length===1?'':'s')+'.'):'No strong PYQ match yet. Add subject/system properties or use the exam topic name.';
    summary.matches.slice(0,12).forEach(function(x){var q=x.q,a=document.createElement('a');a.className='context-item medical-question';a.href=NeuralVaultMedical.questionUrl(q);a.innerHTML='<strong>'+esc(q.topic||q.subtopic||'Question')+'</strong><p>'+esc(q.stem)+'</p><div class="medical-meta"><span class="medical-chip">'+esc(q.exam_year||'PYQ')+'</span><span class="medical-chip">'+esc(q.subject||'')+'</span><span class="medical-chip">'+esc(q.system||'')+'</span></div>';root.appendChild(a)});
    if(!summary.matches.length)root.innerHTML='<div class="context-empty">No matching PYQs found for this note.</div>';
  }catch(e){if(token!==medicalToken)return;$('#medicalCount').textContent='!';$('#medicalSummary').textContent='PYQ index is unavailable offline until it has been cached once.';root.innerHTML='<div class="context-empty">Open the Study Engine once online to cache the bundled question bank.</div>';}
}
async function restoreBackup(file){
  try{var data=JSON.parse(await file.text()),notes=Array.isArray(data)?data:data.notes;if(!Array.isArray(notes)||!notes.length)throw new Error('No notes found');
    var clean=notes.filter(function(n){return n&&n.title&&typeof n.content==='string'}).map(function(n){return{id:n.id||id(),title:String(n.title),path:String(n.path||('Imported/'+filename(n.title))),content:n.content,createdAt:n.createdAt||iso(),updatedAt:n.updatedAt||iso()}});
    if(!clean.length)throw new Error('No valid notes found');if(!confirm('Replace this browser vault with '+clean.length+' notes from the backup?'))return;
    state={version:2,notes:clean,currentId:clean[0].id,savedAt:Date.now()};currentId=clean[0].id;save();renderCurrent();toast('Backup restored: '+clean.length+' notes');
  }catch(e){toast('Backup restore failed: '+e.message);}
}
async function writeVaultToFolder(){
  if(!window.showDirectoryPicker){toast('Direct folder writing is not supported here. Use JSON backup or Markdown import/export.');return;}
  try{var root=await window.showDirectoryPicker({mode:'readwrite'});for(const n of state.notes){var parts=n.path.split('/').filter(Boolean),dir=root;for(var i=0;i<parts.length-1;i++)dir=await dir.getDirectoryHandle(parts[i],{create:true});var fh=await dir.getFileHandle(parts[parts.length-1]||filename(n.title),{create:true}),w=await fh.createWritable();await w.write(n.content);await w.close()}toast('Wrote '+state.notes.length+' Markdown notes to folder');}catch(e){if(e&&e.name!=='AbortError')toast('Folder export failed: '+e.message);}
}
async function showHistory(){
  if(!window.NeuralVaultDB){toast('Version history unavailable');return;}var n=current();await NeuralVaultDB.checkpoint(n,'manual');var rows=await NeuralVaultDB.revisions(n.id),root=$('#historyList');$('#historyNoteTitle').textContent=n.title;root.innerHTML='';
  if(!rows.length)root.innerHTML='<div class="context-empty">No earlier versions yet.</div>';
  rows.forEach(function(row){var d=document.createElement('div');d.className='history-row';d.innerHTML='<div><strong>'+esc(new Date(row.savedAt).toLocaleString())+'</strong><p>'+esc(row.reason||'saved')+' · '+countWords(row.content)+' words</p></div>';var b=document.createElement('button');b.textContent='Restore';b.onclick=function(){if(!confirm('Restore this version? The current note will be checkpointed first.'))return;NeuralVaultDB.checkpoint(current(),'before-restore').then(function(){var x=current();x.title=row.title;x.path=row.path;x.content=row.content;x.updatedAt=iso();save();renderCurrent();$('#historyBackdrop').hidden=true;toast('Version restored')})};d.appendChild(b);root.appendChild(d)});
  $('#historyBackdrop').hidden=false;
}
function graphData(){
  var map=new Map(state.notes.map(function(n){return[norm(n.title),n]})),e=[];
  state.notes.forEach(function(n){links(n.content).forEach(function(t){var to=map.get(norm(t));if(to&&to.id!==n.id)e.push({from:n.id,to:to.id})})});
  return {notes:state.notes,edges:e};
}
function renderGraph(){
  var svg=$('#graphSvg');svg.innerHTML='';var d=graphData(),ns=d.notes,es=d.edges;
  if($('#graphCurrentOnly').checked){var ids=new Set([currentId]);es.forEach(function(e){if(e.from===currentId)ids.add(e.to);if(e.to===currentId)ids.add(e.from)});ns=ns.filter(function(n){return ids.has(n.id)});es=es.filter(function(e){return ids.has(e.from)&&ids.has(e.to)})}
  $('#graphStats').textContent=ns.length+' nodes · '+es.length+' links';
  var NS='http://www.w3.org/2000/svg',cx=600,cy=380,rad=Math.min(300,120+ns.length*15),pos=new Map();
  ns.forEach(function(n,i){var a=Math.PI*2*i/Math.max(1,ns.length)-Math.PI/2,j=(i%3)*18;pos.set(n.id,{x:cx+Math.cos(a)*(rad-j),y:cy+Math.sin(a)*(rad-j)})});
  es.forEach(function(e){var a=pos.get(e.from),b=pos.get(e.to);if(!a||!b)return;var l=document.createElementNS(NS,'line');l.setAttribute('x1',a.x);l.setAttribute('y1',a.y);l.setAttribute('x2',b.x);l.setAttribute('y2',b.y);l.setAttribute('class','graph-edge');svg.appendChild(l)});
  ns.forEach(function(n){var p=pos.get(n.id),g=document.createElementNS(NS,'g'),c=document.createElementNS(NS,'circle'),t=document.createElementNS(NS,'text');g.setAttribute('class','graph-node'+(n.id===currentId?' current':''));g.dataset.noteId=n.id;c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',n.id===currentId?11:8);t.setAttribute('x',p.x+14);t.setAttribute('y',p.y+4);t.textContent=n.title.length>28?n.title.slice(0,26)+'…':n.title;g.appendChild(c);g.appendChild(t);svg.appendChild(g)})
}
function setView(v){view=v;$$('.tab').forEach(function(x){x.classList.toggle('active',x.dataset.view===v)});$$('.editor-view,.preview-view,.graph-view').forEach(function(x){x.classList.remove('active')});$('#view-'+v).classList.add('active');if(v==='preview')$('#preview').innerHTML=markdown(current().content);if(v==='graph')renderGraph()}
function setContext(v){$$('.context-tab').forEach(function(x){x.classList.toggle('active',x.dataset.context===v)});$$('.context-view').forEach(function(x){x.classList.remove('active')});$('#context-'+v).classList.add('active')}

function download(name,text,type){var b=new Blob([text],{type:type||'text/plain'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},500)}
function exportVault(){download('NeuralVault-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({app:'NeuralVault',version:1,exportedAt:iso(),notes:state.notes},null,2),'application/json');toast('Vault backup exported')}
function importFiles(files){
  var a=Array.from(files).filter(function(f){return /\.md$/i.test(f.name)});if(!a.length){toast('Choose Markdown .md files');return}
  Promise.all(a.map(function(f){return f.text().then(function(text){var path=f.webkitRelativePath||('Imported/'+f.name),title=f.name.replace(/\.md$/i,''),x=state.notes.find(function(n){return n.path===path});if(x){x.content=text;x.title=title;x.updatedAt=iso()}else state.notes.push({id:id(),title:title,path:path,content:text,createdAt:iso(),updatedAt:iso()})})})).then(function(){currentId=state.notes[state.notes.length-1].id;save();renderCurrent();toast(a.length+' Markdown '+(a.length===1?'note':'notes')+' imported')})
}
function duplicate(){var n=current(),x=Object.assign({},n,{id:id(),title:n.title+' Copy',path:'Inbox/'+filename(n.title+' Copy'),createdAt:iso(),updatedAt:iso()});state.notes.push(x);currentId=x.id;save();renderCurrent();toast('Note duplicated')}
function del(){if(state.notes.length<2){toast('Keep at least one note');return}var n=current();if(!confirm('Delete "'+n.title+'"?'))return;var i=state.notes.findIndex(function(x){return x.id===n.id});state.notes.splice(i,1);currentId=state.notes[Math.max(0,i-1)].id;save();renderCurrent();toast('Note deleted')}
function toast(m){var e=$('#toast');e.textContent=m;e.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){e.classList.remove('show')},1700)}
function openSidebar(){document.body.classList.add('sidebar-open')}function closeSidebar(){document.body.classList.remove('sidebar-open')}

var commands=[
  ['New note','Cmd N',function(){createNote()}],['Open graph','Cmd Shift G',function(){setView('graph')}],['Preview note','Cmd P',function(){setView('preview')}],['Edit note','',function(){setView('editor')}],
  ['Import Markdown files','',function(){$('#fileImport').click()}],['Import Obsidian folder','',function(){$('#folderImport').click()}],['Export vault backup','',exportVault],
  ['Toggle context panel','',function(){document.body.classList.toggle('context-hidden')}],['Open NEETPG2027 Study Engine','',function(){location.href='../'}]
];
function palette(q){
  q=norm(q);var items=commands.filter(function(c){return !q||norm(c[0]).indexOf(q)>=0}).map(function(c){return {name:c[0],hint:c[1],run:c[2],kind:'cmd'}})
  .concat(state.notes.filter(function(n){return !q||norm(n.title+' '+n.path).indexOf(q)>=0}).slice(0,12).map(function(n){return{name:n.title,hint:folder(n),run:function(){openNote(n.id)},kind:'note'}})).slice(0,18);
  var r=$('#paletteResults');r.innerHTML='';r._items=items;items.forEach(function(x,i){var b=document.createElement('button');b.className='palette-item'+(i===0?' selected':'');b.innerHTML='<span>'+(x.kind==='note'?'◇':'⌘')+'</span><span>'+esc(x.name)+'</span><small>'+esc(x.hint)+'</small>';b.onclick=function(){$('#paletteBackdrop').hidden=true;x.run()};r.appendChild(b)})
}
function showPalette(){$('#paletteBackdrop').hidden=false;$('#paletteInput').value='';palette('');setTimeout(function(){$('#paletteInput').focus()},0)}
function paletteKeys(e){var rows=$$('.palette-item'),r=$('#paletteResults');if(e.key==='Escape'){$('#paletteBackdrop').hidden=true;return}if(!rows.length)return;var i=rows.findIndex(function(x){return x.classList.contains('selected')});if(e.key==='ArrowDown'){e.preventDefault();i=(i+1)%rows.length}else if(e.key==='ArrowUp'){e.preventDefault();i=(i-1+rows.length)%rows.length}else if(e.key==='Enter'){e.preventDefault();var x=r._items[Math.max(0,i)];if(x){$('#paletteBackdrop').hidden=true;x.run()}return}else return;rows.forEach(function(x,j){x.classList.toggle('selected',j===i)});rows[i].scrollIntoView({block:'nearest'})}

$('#newNoteBtn').onclick=function(){createNote()};
$('#commandBtn').onclick=showPalette;
$('#searchInput').oninput=function(e){renderTree(e.target.value)};
$('#importFilesBtn').onclick=function(){$('#fileImport').click()};
$('#importFolderBtn').onclick=function(){$('#folderImport').click()};
$('#fileImport').onchange=function(e){importFiles(e.target.files);e.target.value=''};
$('#folderImport').onchange=function(e){importFiles(e.target.files);e.target.value=''};
$('#fileTree').onclick=function(e){var x=e.target.closest('[data-note-id]');if(x)openNote(x.dataset.noteId)};
$('#backlinks').onclick=$('#relatedNotes').onclick=function(e){var x=e.target.closest('[data-note-id]');if(x)openNote(x.dataset.noteId)};
$('#editor').oninput=updateEditor;$('#titleInput').oninput=updateTitle;
$$('.tab').forEach(function(b){b.onclick=function(){setView(b.dataset.view)}});
$$('.context-tab').forEach(function(b){b.onclick=function(){setContext(b.dataset.context)}});
$('#toggleRight').onclick=function(){document.body.classList.toggle('context-hidden')};
$('#graphCurrentOnly').onchange=renderGraph;
$('#graphSvg').onclick=function(e){var x=e.target.closest&&e.target.closest('.graph-node');if(x)openNote(x.dataset.noteId)};
$('#preview').onclick=function(e){var x=e.target.closest('.wiki-link');if(x)openTitle(x.dataset.noteTitle)};
$('#exportBtn').onclick=exportVault;
$('#moreBtn').onclick=function(e){$('#noteMenu').hidden=!$('#noteMenu').hidden;e.stopPropagation()};
$('#noteMenu').onclick=function(e){var x=e.target.closest('[data-action]');if(!x)return;$('#noteMenu').hidden=true;if(x.dataset.action==='download-note')download(filename(current().title),current().content,'text/markdown');if(x.dataset.action==='duplicate-note')duplicate();if(x.dataset.action==='delete-note')del()};
document.onclick=function(e){if(!e.target.closest('#noteMenu')&&!e.target.closest('#moreBtn'))$('#noteMenu').hidden=true};
$('#paletteBackdrop').onclick=function(e){if(e.target===$('#paletteBackdrop'))$('#paletteBackdrop').hidden=true};
$('#paletteInput').oninput=function(e){palette(e.target.value)};$('#paletteInput').onkeydown=paletteKeys;
$('#openSidebar').onclick=openSidebar;$('#closeSidebar').onclick=closeSidebar;$('#sidebarScrim').onclick=closeSidebar;
document.addEventListener('keydown',function(e){var m=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();if(m&&k==='k'){e.preventDefault();showPalette()}if(m&&k==='n'){e.preventDefault();createNote()}if(m&&k==='s'){e.preventDefault();save();toast('Vault saved locally')}if(m&&k==='p'){e.preventDefault();setView('preview')}if(m&&e.shiftKey&&k==='g'){e.preventDefault();setView('graph')}if(e.key==='Escape'){$('#paletteBackdrop').hidden=true;closeSidebar();$('#noteMenu').hidden=true}});
window.addEventListener('beforeunload',save);

renderCurrent();save();
})();
