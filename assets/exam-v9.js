/* Original NEETPG2027 exam shell. Supabase owns every strict attempt and deadline. */
(() => {
'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FULL='neetpg-180-v1', DRILL='neetpg-drill-v1';
let retryAfter=0,pausedStudy=null,studyPausedAt=0;
let exam=null,open=false,busy=false,clock=null,heartbeat=null,anchor=null,owner=null,lastFocus=null,reviewFilter='all',reviewIndex=0,palette=false,tutorial=false;
let syncBusy=false,channel=typeof BroadcastChannel==='function'?new BroadcastChannel('neetpg-exam-v10'):null;
const fmt=sec=>{sec=Math.max(0,Math.ceil(sec));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;};
const pct=n=>`${Number(n||0).toFixed(1)}%`;
const cloud=()=>window.NEETPG_CLOUD;
function message(text){const el=$('#exam9Notice');if(el){el.textContent=text;el.hidden=!text;}}
function storage(key,value){try{if(value===undefined)return localStorage.getItem(key);localStorage.setItem(key,value);}catch{}return null;}
function key(){return `neetpg-exam-active:${owner}`;}
function client(){const c=cloud();if(!c?.client||!c.user?.id)throw new Error('Sign in through Account to start or resume a server-timed mock.');return c;}
function attach(){
 if($('#exam9Backdrop'))return;
 const host=document.createElement('section');host.id='exam9Backdrop';host.className='exam9-backdrop';host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label','NEET-PG Real Exam Simulation');host.tabIndex=-1;
 host.innerHTML=`<div class="exam9-shell"><header class="exam9-head"><div class="exam9-brand"><img src="assets/app-icon.svg" alt="NEETPG2027" width="32" height="32"><div><strong>NEET-PG REAL EXAM SIMULATION</strong><span id="exam9HeaderSub">Practice simulator</span></div></div><div class="exam9-head-actions"><span id="exam9SaveStatus" role="status"></span><div id="exam9Clock" class="exam9-clock" aria-label="Section time">42:00</div><button id="exam9Close" class="exam9-btn">Exit</button></div></header><div id="exam9Notice" class="exam9-notice" role="alert" hidden></div><nav id="exam9Sections" class="exam9-sections" aria-label="Exam sections"></nav><div class="exam9-work"><main id="exam9Body" class="exam9-body"></main><aside id="exam9Side" class="exam9-side" aria-label="Question palette"></aside></div><footer id="exam9Actions" class="exam9-actions"></footer></div>`;
 document.body.appendChild(host);$('#exam9Close').onclick=exit;
 host.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Escape'){if(palette){palette=false;$('#exam9Side').classList.remove('expanded');$('#exam9PaletteToggle')?.focus();}else exit();}
  if(e.key==='Tab'){
   const els=[...host.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]')].filter(x=>x.getClientRects().length);
   if(!els.length)return;
   if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}
   else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}
  }
 });
}
function show(){attach();if(!open){lastFocus=document.activeElement;if(typeof app!=='undefined'&&app.session&&!app.session.ended){pausedStudy=app.session;studyPausedAt=Date.now();clearInterval(pausedStudy.timerId);}}open=true;document.body.classList.add('exam9-open');$('#exam9Backdrop').classList.add('show');document.querySelector('.app')?.setAttribute('inert','');$('#exam9Backdrop').focus();}
function close(){open=false;stopClock();if(pausedStudy&&typeof app!=='undefined'&&app.session===pausedStudy){const delta=Date.now()-studyPausedAt;for(const k of ['startedAt','currentStart','_neetSectionStartedAt'])if(Number.isFinite(pausedStudy[k]))pausedStudy[k]+=delta;startTimer();saveActiveSession();}pausedStudy=null;document.body.classList.remove('exam9-open');$('#exam9Backdrop')?.classList.remove('show');document.querySelector('.app')?.removeAttribute('inert');lastFocus?.focus();}
function exit(){
 if(exam?.status==='active'&&!tutorial){
  const dialog=document.createElement('dialog');dialog.className='exam9-dialog';dialog.innerHTML='<h2>Your mock examination is still running.</h2><p>Leaving this screen will not pause the timer.</p><div><button class="exam9-btn primary" data-stay>STAY IN EXAM</button> <button class="exam9-btn" data-leave>EXIT ANYWAY</button></div>';
  document.body.appendChild(dialog);dialog.showModal();dialog.querySelector('[data-stay]').onclick=()=>{dialog.close();dialog.remove();};dialog.querySelector('[data-leave]').onclick=()=>{dialog.close();dialog.remove();close();};dialog.oncancel=()=>dialog.remove();
 }else close();
}
function stopClock(){clearInterval(clock);clearInterval(heartbeat);clock=null;heartbeat=null;}
function timeNow(){return anchor?anchor.server+(performance.now()-anchor.mono):Date.now();}
async function rpc(action,payload={},id=exam?.id){
 const c=client();if(owner&&owner!==c.user.id){exam=null;stopClock();throw new Error('Account changed. Reopen Mock Exams.');}owner=c.user.id;
 const {data,error}=await c.client.rpc('exam_call',{action,attempt_id:id||null,expected_version:exam?.version??null,payload});
 if(error)throw new Error(error.message||'Exam service is unavailable.');
 if(cloud()?.user?.id!==owner)throw new Error('Account changed during save.');
 anchor={server:Date.parse(data.serverNow),mono:performance.now()};
 if(data.attempt){exam=data.attempt;storage(key(),exam.id);}
 if(data.error)message(data.error==='STALE_VERSION'?'Another tab changed this attempt. Latest saved responses restored; retry your action.':data.error==='SECTION_LOCKED'?'That section has expired. Your attempt is now on the scheduled section.':'This attempt is complete and cannot be edited.');
 return data;
}
function saving(on,label='Saved'){busy=on;$('#exam9Backdrop')?.classList.toggle('saving',on);const field=$('.exam9-options');if(field)field.disabled=on;const s=$('#exam9SaveStatus');if(s)s.textContent=on?'Saving…':label;}
async function action(payload){
 if(busy||exam?.status!=='active')return false;
 if(timeNow()>=Date.parse(exam.sectionExpiresAt)){await reconcile();return false;}
 const focusId=document.activeElement?.id,oldPosition=exam.currentPosition;saving(true);message('');
 try{
  const data=await rpc('mutate',{position:oldPosition,visible:!document.hidden,...payload});channel?.postMessage({id:exam.id});render();
  if(exam.currentPosition===oldPosition&&focusId)document.getElementById(focusId)?.focus();else $('#exam9QuestionTitle')?.focus();
  const confirmed=!data.error;saving(false,confirmed?'Saved':'Synced latest');return confirmed;
 }catch(e){
  render();message(`Save not confirmed. ${e.message} Reconnect, then use Retry sync. The timer continues.`);saving(false,'Not confirmed');return false;
 }
}
async function reconcile(actionName='get'){
 if(busy||!open||!exam||tutorial)return;
 saving(true);const before=`${exam.status}:${exam.activeSection}:${exam.version}`;
 try{await rpc(actionName,{visible:!document.hidden});message('');if(actionName==='get'||before!==`${exam.status}:${exam.activeSection}:${exam.version}`)render();else tick();saving(false,'Saved');}
 catch(e){message(`Connection lost: ${e.message} The timer continues. Retry sync to restore server state.`);saving(false,'Offline');}
}
function tick(){
 if(!exam||exam.status!=='active')return;
 const r=(Date.parse(exam.sectionExpiresAt)-timeNow())/1000,el=$('#exam9Clock');el.textContent=fmt(r);el.classList.toggle('warning',r<=300);el.classList.toggle('critical',r<=60);el.setAttribute('aria-label',`Section time remaining ${fmt(r)}`);
 $('#exam9Backdrop').classList.toggle('expired',r<=0);
 if(r<=0&&!busy&&performance.now()>=retryAfter){retryAfter=performance.now()+5000;reconcile();}
}
function startClock(){stopClock();tick();clock=setInterval(tick,1000);heartbeat=setInterval(()=>{if(!document.hidden)reconcile('heartbeat');},15000);}
function resetScreen(title){stopClock();$('#exam9HeaderSub').textContent=title;$('#exam9Sections').innerHTML='';$('#exam9Side').innerHTML='';$('#exam9Side').classList.remove('expanded');$('#exam9Actions').innerHTML='';$('#exam9Clock').textContent='';$('#exam9Clock').className='exam9-clock';$('#exam9Backdrop').classList.remove('expired');}
async function openStart(){
 show();tutorial=false;owner=cloud()?.user?.id||null;exam=null;resetScreen('Full-Length Mock');message('');lobby();
 try{const data=await rpc('active');if(data.attempt)exam=data.attempt;else{const id=storage(key());if(id){try{await rpc('get',{},id);}catch{}}}lobby();}
 catch(e){message(e.message);}
}
function lobby(){
 resetScreen('Practice simulator · Not affiliated with or endorsed by NBEMS');
 $('#exam9Body').innerHTML=`<div class="exam9-lobby"><span class="exam9-eyebrow">EXAMINATION · FOCUSED PRACTICE</span><h1>NEET-PG<br>Real Exam Simulation</h1><p class="exam9-intro">Five consecutive blocks. One immutable paper. Every section closes on schedule.</p><div class="exam9-facts"><div><strong>180</strong><span>Questions</span></div><div><strong>720</strong><span>Maximum marks</span></div><div><strong>3h 30m</strong><span>Total duration</span></div><div><strong>5 × 42m</strong><span>Time-bound sections</span></div></div><p>36 questions per section · +4 correct · −1 incorrect · 0 unattempted</p><p class="exam9-muted">Simulation preset v1. Current primary-source rule verification is pending; these settings follow the requested 180-question specification.</p>${exam?.status==='active'?'<button id="exam9Resume" class="exam9-btn primary large">RESUME ACTIVE MOCK</button>':exam?.status==='completed'?'<button id="exam9Last" class="exam9-btn">View latest result</button>':''}<div class="exam9-start-actions"><button id="exam9Full" class="exam9-btn primary large" ${exam?.status==='active'?'disabled':''}>START FULL MOCK</button><button id="exam9Drill" class="exam9-btn" ${exam?.status==='active'?'disabled':''}>Section Drill · 36 Q / 42 min</button></div><div class="exam9-links"><button id="exam9Custom" class="exam9-btn">Custom Test</button><button id="exam9History" class="exam9-btn">Previous Mocks & Performance</button><button id="exam9Tutorial" class="exam9-btn">Try tutorial</button></div><p class="exam9-muted">An internet connection confirms responses. A disconnect never pauses the timer. Unconfirmed responses cannot be backdated into an expired section.</p></div>`;
 $('#exam9Full').onclick=()=>rules(FULL);$('#exam9Drill').onclick=()=>rules(DRILL);$('#exam9Resume')?.addEventListener('click',async()=>{await reconcile();render();});$('#exam9Last')?.addEventListener('click',render);
 $('#exam9History').onclick=history;$('#exam9Tutorial').onclick=runTutorial;$('#exam9Custom').onclick=()=>{close();navigate('practice');};
}
function rules(version){
 const full=version===FULL,n=full?180:36;resetScreen('Read the simulation rules');
 $('#exam9Body').innerHTML=`<div class="exam9-lobby"><h1>${full?'Full mock':'Section drill'} rules</h1><ul class="exam9-rules"><li>${n} questions · ${full?5:1} time-bound section${full?'s':''}</li><li>36 questions and 42 minutes per section</li><li>No pause, early section exit, or time carry-forward</li><li>Completed sections cannot be reopened</li><li>Answered questions marked for review are evaluated normally</li><li>+4 correct · −1 incorrect · 0 unattempted</li><li>The timer continues during refresh, backgrounding and disconnection</li><li>Your answers are saved to your account. Multiple tabs share one attempt.</li></ul><label class="exam9-consent"><input id="exam9Consent" type="checkbox"> I understand the simulation rules</label><button id="exam9Begin" class="exam9-btn primary large" disabled>START MOCK</button><p><button id="exam9Back" class="exam9-btn">Back</button></p></div>`;
 $('#exam9Consent').onchange=e=>$('#exam9Begin').disabled=!e.target.checked;
 $('#exam9Begin').onclick=async()=>{if(busy)return;saving(true);message('');try{await rpc('start',{presetVersion:version},null);render();saving(false,'Saved');}catch(e){message(e.message);saving(false,'Not started');}};
 $('#exam9Back').onclick=lobby;
}
const status=r=>r.selected!=null?(r.review?'answered-review':'answered'):(r.review?'review':r.visited?'unanswered':'unvisited');
const names={'answered-review':'Answered + marked for review',answered:'Answered',review:'Marked for review',unanswered:'Not answered',unvisited:'Not visited'};
const symbols={'answered-review':'✓◆',answered:'✓',review:'◆',unanswered:'−',unvisited:'○'};
function render(){
 if(!exam)return lobby();if(exam.status==='completed')return results();
 const p=exam.preset,offset=exam.activeSection*p.questionsPerSection,index=exam.currentPosition-offset,q=exam.questions[index],r=exam.responses[index];
 if(!q||!r){message('Question data unavailable. Retry sync to recover your paper.');return;}
 $('#exam9HeaderSub').textContent=`${p.mode==='drill'?'Section Drill · ':''}SECTION ${String.fromCharCode(65+exam.activeSection)} OF ${p.numberOfSections}`;
 $('#exam9Sections').innerHTML=Array.from({length:p.numberOfSections},(_,i)=>`<span class="${i===exam.activeSection?'active':''}">${String.fromCharCode(65+i)} <small>${i<exam.activeSection?'LOCKED':i===exam.activeSection?'ACTIVE':'PENDING'}</small></span>`).join('');
 $('#exam9Body').innerHTML=`<div class="exam9-question-heading"><h2 id="exam9QuestionTitle" tabindex="-1">Question ${index+1} of ${p.questionsPerSection}</h2><button id="exam9PaletteToggle" class="exam9-btn" aria-expanded="${palette}" aria-controls="exam9Side">Question palette</button></div><div class="exam9-stem">${esc(q.stem)}</div>${table(q.table)}<div id="exam9Image"></div><fieldset class="exam9-options"><legend class="sr-only">Select one answer</legend>${q.options.map((o,i)=>`<label class="exam9-option ${r.selected===o.label?'selected':''}"><input id="exam9Option${i}" type="radio" name="examAnswer" value="${esc(o.label)}" ${r.selected===o.label?'checked':''}><span class="exam9-letter">${String.fromCharCode(65+i)}.</span><span>${esc(o.text)}</span></label>`).join('')}</fieldset>`;
 $('#exam9Body').querySelectorAll('input').forEach(el=>el.onchange=()=>action({selected:el.value}));renderImage(q.image);
 $('#exam9Actions').innerHTML=`<button id="exam9Clear" class="exam9-btn">Clear Response</button><button id="exam9Mark" class="exam9-btn">Mark for Review & Next</button>${r.review?'<button id="exam9Unmark" class="exam9-btn">Remove review mark</button>':''}<span class="exam9-spacer"></span><button id="exam9Previous" class="exam9-btn" ${index===0?'disabled':''}>Previous</button><button id="exam9Save" class="exam9-btn primary">Save & Next</button><button id="exam9Retry" class="exam9-btn">Retry sync</button>`;
 const next=Math.min(offset+p.questionsPerSection-1,exam.currentPosition+1);
 $('#exam9Clear').onclick=()=>action({selected:null});$('#exam9Mark').onclick=()=>action({review:true,navigate:next});$('#exam9Unmark')?.addEventListener('click',()=>action({review:false}));$('#exam9Previous').onclick=()=>action({navigate:exam.currentPosition-1});$('#exam9Save').onclick=async()=>{const confirmed=await action({navigate:next});if(confirmed&&index===p.questionsPerSection-1)message('You are at the last question. Review this section until the timer expires.');};$('#exam9Retry').onclick=()=>reconcile();
 const counts=Object.fromEntries(Object.keys(names).map(k=>[k,exam.responses.filter(r=>status(r)===k).length]));
 $('#exam9Side').innerHTML=`<div class="exam9-palette-title"><h3>SECTION ${String.fromCharCode(65+exam.activeSection)}</h3><button id="exam9PaletteClose" class="exam9-btn">Close palette</button></div><div class="exam9-palette">${exam.questions.map((q,i)=>{const s=status(exam.responses[i]);return `<button class="exam9-q ${s} ${i===index?'current':''}" data-pos="${offset+i}" aria-label="Question ${i+1}, ${names[s]}" ${i===index?'aria-current="true"':''}><span>${String(i+1).padStart(2,'0')}</span><small aria-hidden="true">${symbols[s]}</small></button>`;}).join('')}</div><dl class="exam9-legend">${Object.entries(names).map(([s,name])=>`<div><dt><span class="exam9-status ${s}" aria-hidden="true">${symbols[s]}</span>${name}</dt><dd>${counts[s]}</dd></div>`).join('')}</dl><p class="exam9-muted">Review freely within this section. The next section opens only when its scheduled time begins.</p>`;
 $('#exam9Side').classList.toggle('expanded',palette);
 $('#exam9PaletteToggle').onclick=()=>{palette=!palette;$('#exam9Side').classList.toggle('expanded',palette);$('#exam9PaletteToggle').setAttribute('aria-expanded',String(palette));if(palette)$('#exam9PaletteClose').focus();};$('#exam9PaletteClose').onclick=()=>{palette=false;$('#exam9Side').classList.remove('expanded');$('#exam9PaletteToggle').setAttribute('aria-expanded','false');$('#exam9PaletteToggle').focus();};
 $('#exam9Side').querySelectorAll('[data-pos]').forEach(b=>b.onclick=()=>{palette=false;action({navigate:Number(b.dataset.pos)});});
 startClock();
}
function table(data){if(!Array.isArray(data)||!data.every(Array.isArray))return '';return `<div class="exam9-table-wrap"><table><caption>Question data</caption><tbody>${data.map(row=>'<tr>'+row.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>').join('')}</tbody></table></div>`;}
let imageEpoch=0,imageUrl=null;
async function renderImage(source){
 const epoch=++imageEpoch;if(imageUrl){URL.revokeObjectURL(imageUrl);imageUrl=null;}if(!source)return;
 const el=$('#exam9Image');el.textContent='Loading question image…';
 try{
  // Only opaque media identifiers are allowed in exam question snapshots.
  const url=new URL(String(source),location.href);
  if(!/\/exam-media\/[a-f0-9-]{16,}\.(png|jpe?g|webp)$/i.test(url.pathname))throw new Error('Image requires an anonymized exam-media asset.');
  const response=await fetch(url);if(!response.ok)throw new Error('Image unavailable');const blob=await response.blob();if(!/^image\//.test(blob.type))throw new Error('Invalid image');
  if(epoch!==imageEpoch)return;imageUrl=URL.createObjectURL(blob);el.innerHTML=`<button id="exam9ImageOpen" class="exam9-image-button" aria-label="Enlarge question image"><img alt="Question image" src="${imageUrl}"></button>`;$('#exam9ImageOpen').onclick=()=>{
   const dialog=document.createElement('dialog');dialog.className='exam9-dialog exam9-image-dialog';dialog.innerHTML=`<button class="exam9-btn" data-close>Close image</button> <label>Zoom <input type="range" min="100" max="300" value="100" aria-label="Image zoom"></label><div class="exam9-image-pan"><img alt="Question image enlarged" src="${imageUrl}"></div>`;document.body.appendChild(dialog);dialog.showModal();dialog.querySelector('input').oninput=e=>dialog.querySelector('img').style.width=e.target.value+'%';dialog.querySelector('[data-close]').onclick=()=>{dialog.close();dialog.remove();};dialog.oncancel=()=>dialog.remove();
  };
 }catch{if(epoch===imageEpoch)el.innerHTML='<p role="alert">Question image could not load. Your timer continues.</p><button class="exam9-btn" id="exam9ImageRetry">Retry image</button>';$('#exam9ImageRetry')?.addEventListener('click',()=>renderImage(source));}
}
function resultStats(a){const r=a.result,p=a.preset;return `<div class="exam9-score"><span>MARKS OBTAINED</span><strong>${r.score} <small>/ ${p.maximumMarks}</small></strong></div><div class="exam9-facts"><div><strong>${r.correct}</strong><span>Correct</span></div><div><strong>${r.incorrect}</strong><span>Incorrect</span></div><div><strong>${r.unattempted}</strong><span>Unattempted</span></div><div><strong>${pct(r.accuracy)}</strong><span>Accuracy</span></div></div><p>Positive marks <b>+${r.correct*p.correctMarks}</b> · Negative marks <b>${r.incorrect*p.incorrectMarks}</b> · Attempt rate <b>${pct(r.attemptRate)}</b></p>`;}
function results(){
 resetScreen(exam.preset.mode==='drill'?'Section Drill Result':'NEET-PG Mock Result');message('');
 $('#exam9Body').innerHTML=`<div class="exam9-results"><h1>NEET-PG MOCK RESULT</h1>${resultStats(exam)}<div class="exam9-links"><button class="exam9-btn primary" data-review="incorrect">Review Incorrect</button><button class="exam9-btn" data-review="marked">Review Marked</button><button class="exam9-btn" data-review="unattempted">Review Unattempted</button><button class="exam9-btn" data-review="all">Review All</button></div><div id="exam9Analysis"></div></div>`;
 $('#exam9Body').querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>{reviewFilter=b.dataset.review;reviewIndex=0;review();});
 $('#exam9Actions').innerHTML='<button id="exam9History" class="exam9-btn">Mock History & Trends</button><button id="exam9Done" class="exam9-btn primary">Done</button><button id="exam9SyncResult" class="exam9-btn">Sync to study analytics</button>';$('#exam9History').onclick=history;$('#exam9Done').onclick=close;$('#exam9SyncResult').onclick=syncStudy;
 try{
  const a=window.NEETPG_EXAM_ANALYTICS.analyze(exam);
  const group=field=>`<details><summary>${esc(field==='exam_type'?'Question type':field)} performance</summary><div class="exam9-table-wrap"><table><thead><tr><th>Category</th><th>Correct / attempted</th><th>Accuracy</th><th>Observed time</th></tr></thead><tbody>${Object.entries(a.groups[field]).map(([name,g])=>`<tr><th>${esc(name)}</th><td>${g.correct} / ${g.attempted}</td><td>${g.attempted?pct(100*g.correct/g.attempted):'—'}</td><td>${Math.round(g.time)}s</td></tr>`).join('')}</tbody></table></div></details>`;
  $('#exam9Analysis').innerHTML=`<h2>Section-wise marks</h2><div class="exam9-table-wrap"><table><thead><tr><th>Section</th><th>Marks</th><th>Correct</th><th>Incorrect</th><th>Unattempted</th><th>Accuracy</th><th>Attempt rate</th><th>Mean observed time</th><th>Reviewed</th><th>Answer changes</th><th>Last 5m accuracy</th><th>Final 2m answers</th></tr></thead><tbody>${a.sections.map((s,i)=>`<tr><th>${String.fromCharCode(65+i)}</th><td>${s.score} / ${s.maximumMarks}</td><td>${s.correct}</td><td>${s.incorrect}</td><td>${s.unattempted}</td><td>${pct(s.accuracy)}</td><td>${pct(s.attemptRate)}</td><td>${Math.round(s.timeSpent/s.total)}s</td><td>${s.reviewCount}</td><td>${s.answerChanges}</td><td>${s.last5Count?pct(s.last5Correct/s.last5Count*100):'—'}</td><td>${s.final2Attempts}</td></tr>`).join('')}</tbody></table></div><h2>Review decisions</h2><p>Correct → incorrect: <b>${a.changes.correctToIncorrect}</b> · Incorrect → correct: <b>${a.changes.incorrectToCorrect}</b> · Incorrect → incorrect: <b>${a.changes.incorrectToIncorrect}</b></p><h2>Observed question time</h2><p>${Object.entries(a.buckets).map(([b,n])=>`${b}: <b>${n}</b>`).join(' · ')}</p><p class="exam9-muted">Time is measured during visible, connected use. Background and disconnected intervals are unknown, not assigned to a question. Timing alone does not establish why an error occurred.</p><p>${a.timeSinks.length?'Longer than twice your typical time (minimum 120s): '+a.timeSinks.map(x=>`Q${x.position+1} (${Math.round(x.seconds)}s)`).join(', '):'No measured time sinks above the threshold.'}</p>${['subject','system','topic','exam_type','difficulty'].map(group).join('')}`;
 }catch{ $('#exam9Analysis').innerHTML='<p>Detailed analysis is unavailable. Your saved result is intact.</p>';}
 syncStudy();
}
async function syncStudy(){
 if(syncBusy||exam?.status!=='completed'||typeof app==='undefined'||!app.db)return;
 const a=exam;if(app.sessions.some(s=>s.id===a.id))return;syncBusy=true;
 try{
  // One transaction makes retry idempotent; qstate/SRS are only changed by explicit revision actions.
  await new Promise((resolve,reject)=>{
   const tx=app.db.transaction(['sessions','attempts'],'readwrite'),sessions=tx.objectStore('sessions'),get=sessions.get(a.id);
   get.onsuccess=()=>{if(get.result)return;const ended=Date.parse(a.completedAt);sessions.put({id:a.id,startedAt:Date.parse(a.examStartedAt),endedAt:ended,updatedAt:Date.now(),count:a.preset.totalQuestions,correct:a.result.correct,accuracy:a.result.accuracy,score:a.result.score,mode:`Mock · ${a.preset.mode}`,feedback:'exam'});
    a.questions.forEach((q,i)=>{const r=a.responses[i];tx.objectStore('attempts').add({qid:q.id,correct:r.selected===q.correct,selected:r.selected,skipped:r.selected==null,ts:ended,updatedAt:Date.now(),elapsed:r.timeSpent||0,sessionId:a.id,subject:q.subject,difficulty:q.difficulty,confidence:null,mistake:'',note:''});});
   };tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
  });
  await loadState();window.dispatchEvent(new CustomEvent('neetpg:progress-saved'));renderAll();
 }catch{message('Result saved securely. Study analytics sync failed; use “Sync to study analytics” to retry.');}finally{syncBusy=false;}
}
function review(){
 resetScreen('Post-mock review');const indices=exam.questions.map((q,i)=>i).filter(i=>{const r=exam.responses[i];return reviewFilter==='all'||reviewFilter==='marked'&&r.review||reviewFilter==='unattempted'&&r.selected==null||reviewFilter==='incorrect'&&r.selected!=null&&r.selected!==exam.questions[i].correct;});
 $('#exam9Actions').innerHTML='<button id="exam9Results" class="exam9-btn">Back to Result</button>';$('#exam9Results').onclick=results;
 if(!indices.length){$('#exam9Body').innerHTML='<h2>No questions in this review group.</h2>';return;}
 reviewIndex=Math.min(reviewIndex,indices.length-1);const i=indices[reviewIndex],q=exam.questions[i],r=exam.responses[i],answer=label=>label==null?'Unattempted':q.options.find(o=>o.label===label)?.text||label;
 $('#exam9Body').innerHTML=`<h2>Review ${reviewIndex+1} of ${indices.length} · Question ${i+1}</h2><div class="exam9-stem">${esc(q.stem)}</div><div id="exam9Image"></div><ol type="A">${q.options.map(o=>`<li>${esc(o.text)}</li>`).join('')}</ol><p>Your answer: <b>${esc(answer(r.selected))}</b></p><p>Correct answer: <b>${esc(answer(q.correct))}</b></p><p>${esc(q.answer_explanation||'No explanation available.')}</p><p class="exam9-muted">${esc(q.subject)} · ${esc(q.system)} · ${esc(q.topic)} · Difficulty ${esc(q.difficulty)} · ${esc(q.pyq_status||'Unclassified provenance')} · Verification: ${esc(q.verification_status||'unverified')}</p><p>Observed time: ${Math.round(r.timeSpent||0)}s · Answer changes: ${(r.changes||[]).filter(h=>h.from!=null&&h.to!=null).length}</p><p>${esc(q.reference_text||'')}</p><div class="exam9-links"><button id="exam9AddRevision" class="exam9-btn">Add this question to Revision</button><button id="exam9Bookmark" class="exam9-btn">Bookmark this question</button></div><label>My note<textarea id="exam9Note" rows="4">${esc(typeof stateFor==='function'?stateFor(q.id).note:'')}</textarea></label><button id="exam9SaveNote" class="exam9-btn">Save note</button>`;renderImage(q.image);
 $('#exam9Actions').insertAdjacentHTML('beforeend',`<button id="exam9ReviewPrev" class="exam9-btn" ${reviewIndex===0?'disabled':''}>Previous</button><button id="exam9ReviewNext" class="exam9-btn primary" ${reviewIndex===indices.length-1?'disabled':''}>Next</button>`);
 $('#exam9ReviewPrev').onclick=()=>{reviewIndex--;review();};$('#exam9ReviewNext').onclick=()=>{reviewIndex++;review();};
 async function integrate(fields){try{await persistQState({...stateFor(q.id),...fields});renderAll();message('Saved to your study workspace.');}catch{message('Study save failed. Your mock result is unchanged.');}}
 $('#exam9AddRevision').onclick=()=>integrate({dueAt:Date.now(),intervalDays:0});$('#exam9Bookmark').onclick=()=>integrate({bookmarked:true});$('#exam9SaveNote').onclick=()=>integrate({note:$('#exam9Note').value});
}
async function history(){
 resetScreen('Mock history · Full mocks and drills are tracked separately');message('');$('#exam9Body').innerHTML='<p>Loading saved mocks…</p>';
 try{
  const {history:rows}=await rpc('history',{},null),completed=rows.filter(x=>x.status==='completed'),full=completed.filter(x=>x.preset.mode==='full').reverse();
  $('#exam9Body').innerHTML=`<h1>Mock history & trends</h1><p>${full.length?'Full-mock score trend (oldest → newest): '+full.map(x=>`${x.result.score}/${x.preset.maximumMarks}`).join(' → '):'Complete a full mock to build your score trend.'}</p><div class="exam9-table-wrap"><table><thead><tr><th>Date / mode</th><th>Marks</th><th>C / I / U</th><th>Accuracy</th><th>Attempt rate</th><th>Negative marks</th><th></th></tr></thead><tbody>${completed.map(x=>`<tr><th>${esc(new Date(x.started_at).toLocaleString())}<br>${x.preset.mode==='full'?'Full mock':'Section drill'}</th><td>${x.result.score} / ${x.preset.maximumMarks}</td><td>${x.result.correct} / ${x.result.incorrect} / ${x.result.unattempted}</td><td>${pct(x.result.accuracy)}</td><td>${pct(x.result.attemptRate)}</td><td>${x.result.incorrect*x.preset.incorrectMarks}</td><td><button class="exam9-btn" data-result="${x.id}">View analysis</button></td></tr>`).join('')}</tbody></table></div>${!completed.length?'<p>No completed mocks yet.</p>':''}`;
  $('#exam9Body').querySelectorAll('[data-result]').forEach(b=>b.onclick=async()=>{try{await rpc('get',{},b.dataset.result);render();}catch(e){message(e.message);}});
 }catch(e){message(e.message);$('#exam9Body').innerHTML='<h1>Mock history unavailable</h1><p>Reconnect and retry. Saved attempts remain on your account.</p>';}
 $('#exam9Actions').innerHTML='<button id="exam9Back" class="exam9-btn primary">Back to Mock Exams</button>';$('#exam9Back').onclick=openStart;
}
function runTutorial(){
 tutorial=true;resetScreen('Tutorial · Dummy question · No analytics');let selected=null,marked=false;
 $('#exam9Body').innerHTML='<h1>Try the exam controls</h1><p>Dummy question: Which number equals 2 + 2?</p><fieldset class="exam9-options"><legend>Select one answer</legend>'+['3','4','5','6'].map((s,i)=>`<label class="exam9-option"><input type="radio" name="dummy" value="${i}">${String.fromCharCode(65+i)}. ${s}</label>`).join('')+'</fieldset><p id="exam9TutorialState" role="status">Not answered</p><p>Selection saves a neutral response. Mark for Review keeps the answer. Clear Response keeps the review mark. Save & Next advances within the active section. The palette shows all five response states; its outline identifies the current question. Sections lock only at their scheduled boundary.</p><label><input id="exam9SkipTutorial" type="checkbox"> Don’t show again</label>';
 const update=()=>$('#exam9TutorialState').textContent=names[status({selected,review:marked,visited:true})];$('#exam9Body').querySelectorAll('[name=dummy]').forEach(x=>x.onchange=()=>{selected=x.value;update();});
 $('#exam9Actions').innerHTML='<button id="exam9Clear" class="exam9-btn">Clear Response</button><button id="exam9Mark" class="exam9-btn">Mark for Review & Next</button><button id="exam9Save" class="exam9-btn primary">Save & Next</button><button id="exam9Back" class="exam9-btn">Finish tutorial</button>';
 $('#exam9Clear').onclick=()=>{selected=null;$('#exam9Body').querySelectorAll('[name=dummy]').forEach(x=>x.checked=false);update();};$('#exam9Mark').onclick=()=>{marked=true;update();};$('#exam9Save').onclick=()=>message('In a real mock this saves and visits the next question. No tutorial response is recorded.');$('#exam9Back').onclick=()=>{storage('neetpg-exam-tutorial-hidden',String($('#exam9SkipTutorial').checked));tutorial=false;lobby();};
}
window.addEventListener('beforeunload',e=>{if(open&&exam?.status==='active'&&!tutorial){e.preventDefault();e.returnValue='';}});
window.addEventListener('online',()=>reconcile());document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcile();});
channel?.addEventListener('message',e=>{if(e.data?.id===exam?.id&&open)reconcile();});
window.NEETPG_EXAM9={open:openStart,startFull:()=>{show();rules(FULL);},startAvailable:()=>{show();rules(DRILL);},get state(){return exam?structuredClone(exam):null;}};
})();
