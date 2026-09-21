(() => {
  'use strict';

  const $q = s => document.querySelector(s);
  const $qa = s => [...document.querySelectorAll(s)];
  const fmt = n => new Intl.NumberFormat('en-IN').format(Number(n || 0));
  const clampV4 = (n,a,b) => Math.max(a,Math.min(b,n));
  const escapeV4 = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const EXAM_TARGET_KEY='neetpg2027-exam-target';
  const PREFS_UPDATED_KEY='neetpg2027-v2-settings-updated';
  const EXAM_TARGET = {iso: '2027-08-29'};
  try{const date=localStorage.getItem(EXAM_TARGET_KEY);if(/^\d{4}-\d{2}-\d{2}$/.test(date))EXAM_TARGET.iso=date}catch{}
  let examCountdownTimer = null;

  function formatExamTargetLabel(iso){
    const date=new Date(String(iso||'')+'T00:00:00');
    return Number.isNaN(date.getTime())?String(iso||''):date.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }

  function setExamTarget(iso,{persist=true,markChanged=true}={}){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return false;
    EXAM_TARGET.iso=String(iso);
    if(persist){
      try{
        localStorage.setItem(EXAM_TARGET_KEY,EXAM_TARGET.iso);
        if(markChanged)localStorage.setItem(PREFS_UPDATED_KEY,String(Date.now()));
      }catch{
        if(markChanged&&typeof toast==='function')toast('Date could not be saved on this device.');
        return false;
      }
    }
    const host=$q('#v4ExamCountdown');if(host)host.dataset.target=EXAM_TARGET.iso;
    const label=$q('#targetDateLabel');if(label)label.textContent=formatExamTargetLabel(EXAM_TARGET.iso);
    const input=$q('#targetDate');if(input)input.value=EXAM_TARGET.iso;
    renderExamCountdown();
    if(markChanged)window.dispatchEvent(new CustomEvent('neetpg:prefs-change',{detail:{source:'exam-target',iso:EXAM_TARGET.iso}}));
    return true;
  }
  window.NEETPG_V4_SET_EXAM_TARGET=setExamTarget;

  function examTargetTime(){
    // Pin the target to Indian Standard Time so travelling or changing the device timezone
    // cannot silently add/remove hours from the NEET-PG countdown.
    return Date.parse(`${EXAM_TARGET.iso}T00:00:00+05:30`);
  }

  function examCountdownParts(now = Date.now()){
    const remaining = Math.max(0, examTargetTime() - now);
    const days = Math.floor(remaining / 86400000);
    const hours = Math.floor((remaining % 86400000) / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return { remaining, days, hours, minutes, seconds, reached: remaining === 0 };
  }

  function renderExamCountdown(){
    const host=$q('#v4ExamCountdown'); if(!host)return;
    const p=examCountdownParts();
    const set=(id,value)=>{const el=$q(id);if(el)el.textContent=String(value).padStart(2,'0')};
    set('#v4ExamDays',p.days);
    set('#v4ExamHours',p.hours);
    set('#v4ExamMinutes',p.minutes);
    set('#v4ExamSeconds',p.seconds);
    const status=$q('#v4ExamCountdownStatus');
    if(status)status.textContent=p.reached?'Target date reached':'Counting down continuously';
    host.dataset.reached=p.reached?'1':'0';
  }

  function stopExamCountdown(){
    if(examCountdownTimer){clearInterval(examCountdownTimer);examCountdownTimer=null}
  }

  function startExamCountdown(){
    stopExamCountdown();
    renderExamCountdown();
    if(document.visibilityState!=='visible' || !$q('#view-dashboard.active'))return;
    examCountdownTimer=setInterval(renderExamCountdown,1000);
  }

  function syncExamCountdown(){
    if(document.visibilityState==='visible' && $q('#view-dashboard.active'))startExamCountdown();
    else stopExamCountdown();
  }

  const navItems = [
    ['dashboard','⌂','Dashboard'],
    ['bank','▦','QBank'],
    ['review','↻','Revision'],
    ['neuralvault','◇','NeuralVault'],
    ['mock','▣','Mock Exams'],
    ['plan','▤','Study Plan'],
    ['analytics','◎','Analytics'],
    ['settings','⚙','Settings']
  ];

  function currentUserName(){
    const cloud = window.NEETPG_CLOUD;
    const raw = cloud?.profile?.display_name || cloud?.user?.user_metadata?.display_name || cloud?.user?.email?.split('@')[0] || 'Doctor';
    return raw.replace(/[._-]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
  }

  function sidebar(){
    const side = $q('#sidebar'); if(!side) return;
    side.innerHTML = `
      <div class="brand"><div class="v4-brand-row"><span class="v4-brand-mark">♧</span><div><strong>NEETPG<b>2027</b></strong><small>Practice Today. PG Tomorrow.</small></div></div></div>
      <nav class="nav">${navItems.map(([target,icon,label],i)=>`<button class="v4-nav ${i===0?'active':''}" data-v4-target="${target}" data-v4-label="${label}"><span class="v4-nav-icon">${icon}</span><span class="v4-nav-label">${label}</span>${label==='Revision'?'<span class="v4-nav-badge" id="v4NavDue">0</span>':''}</button>`).join('')}</nav>
      <div class="sidebar-footer"><strong>Better Doctors<br>Brighter Tomorrows</strong><div class="v4-footer-mountain"></div><div class="v4-footer-quote">“Discipline today,<br>specialist tomorrow.”</div></div>`;
    side.addEventListener('click',e=>{
      const b=e.target.closest('[data-v4-target]'); if(!b)return;
      if(b.dataset.v4Target==='neuralvault'){ window.location.href='neuralvault/'; return; }
      setNavActive(b.dataset.v4Target);
      if(typeof navigate==='function') navigate(b.dataset.v4Target);
    });
  }

  let durableNotes=null;
  function localVaultNotes(){
    if(durableNotes)return durableNotes;
    try{
      const snapshot=JSON.parse(localStorage.getItem('neuralvault:v1')||'null');
      return Array.isArray(snapshot?.notes)?snapshot.notes:[];
    }catch{return []}
  }

  function searchScore(text,term,exactBoost=0){
    const value=String(text||'').toLowerCase();
    if(!value||!term)return 0;
    if(value===term)return 100+exactBoost;
    if(value.startsWith(term))return 70+exactBoost;
    if(value.includes(term))return 35+exactBoost;
    return 0;
  }

  function globalSearchData(query){
    const term=String(query||'').trim().toLowerCase();
    if(term.length<2)return{topics:[],questions:[],notes:[]};
    let qs=[];try{qs=(typeof app!=='undefined'&&Array.isArray(app.questions))?app.questions:[]}catch{}
    const topicMap=new Map();
    qs.forEach(q=>{
      const topic=String(q.topic||q.subtopic||'').trim();if(!topic)return;
      const key=(q.subject||'')+'|'+topic;
      const score=Math.max(searchScore(topic,term,20),searchScore(q.subject,term,5));
      if(score&&!topicMap.has(key))topicMap.set(key,{topic,subject:q.subject||'',score});
    });
    const topics=[...topicMap.values()].sort((a,b)=>b.score-a.score||a.topic.localeCompare(b.topic)).slice(0,5);
    const questions=qs.map(q=>({
      q,
      score:Math.max(
        searchScore(q.external_id,term,45),
        searchScore(q.topic,term,20),
        searchScore(q.subject,term,10),
        searchScore(q.stem,term,0)
      )
    })).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,5);
    const notes=localVaultNotes().map(note=>({
      note,
      score:Math.max(
        searchScore(note.title,term,35),
        searchScore(note.path,term,15),
        searchScore(note.content,term,0)
      )
    })).filter(x=>x.score).sort((a,b)=>b.score-a.score).slice(0,5);
    return{topics,questions,notes};
  }

  function hideGlobalSearch(){
    const root=$q('#v4SearchResults');if(root)root.hidden=true;
  }

  function addSearchGroup(root,title,items,render){
    if(!items.length)return;
    const head=document.createElement('div');head.className='v4-search-group-title';head.textContent=title;root.append(head);
    items.forEach(item=>root.append(render(item)));
  }

  function searchResultButton(kind,id,title,meta){
    const b=document.createElement('button');b.type='button';b.className='v4-search-result';b.dataset.kind=kind;b.dataset.id=id||'';
    const strong=document.createElement('strong');strong.textContent=title;
    const small=document.createElement('small');small.textContent=meta||'';
    b.append(strong,small);return b;
  }

  function renderGlobalSearch(query){
    const root=$q('#v4SearchResults');if(!root)return;
    const data=globalSearchData(query);root.replaceChildren();
    addSearchGroup(root,'Topics',data.topics,x=>{
      const b=searchResultButton('topic',x.topic,x.topic,x.subject||'Topic');
      b.dataset.subject=x.subject||'';return b;
    });
    addSearchGroup(root,'Questions',data.questions,x=>searchResultButton('question',x.q.external_id,x.q.topic||x.q.subject||'Question',x.q.stem||''));
    addSearchGroup(root,'NeuralVault notes',data.notes,x=>searchResultButton('note',x.note.id,x.note.title,x.note.path||'Vault note'));
    if(!root.children.length){
      const empty=document.createElement('div');empty.className='v4-search-empty';empty.textContent=String(query||'').trim().length<2?'Type at least 2 characters':'No matching questions, topics or local vault notes';root.append(empty);
    }
    root.hidden=false;
  }

  function openBankSearch(term,subject=''){
    if(typeof navigate==='function')navigate('bank');
    for(const el of $qa('#view-bank select'))if([...el.options].some(o=>o.value==='all'))el.value='all';
    const sub=$q('#bankSubject');if(sub&&subject&&[...sub.options].some(o=>o.value===subject))sub.value=subject;
    const input=$q('#bankSearch');if(input){input.value=term;typeof bankFilter==='function'?bankFilter():input.dispatchEvent(new Event('input',{bubbles:true}))}
    hideGlobalSearch();
  }

  function activateGlobalSearchResult(button){
    if(!button)return false;
    const kind=button.dataset.kind,id=button.dataset.id;
    if(kind==='note'){location.href='neuralvault/?note='+encodeURIComponent(id);return true}
    if(kind==='topic'){openBankSearch(id,button.dataset.subject||'');return true}
    if(kind==='question'){
      let q=null;try{q=app.qMap?.get(id)||app.questions?.find(x=>x.external_id===id)}catch{}
      if(q&&typeof buildSession==='function'&&typeof builtInPreset==='function'){
        buildSession([q],{...builtInPreset('rapid'),mode:'single',count:1,feedback:'instant',timer:'off',order:'adaptive'});
        hideGlobalSearch();return true;
      }
      openBankSearch(id);return true;
    }
    return false;
  }

  function moveGlobalSearchSelection(delta){
    const rows=$qa('#v4SearchResults .v4-search-result');if(!rows.length)return;
    let i=rows.findIndex(x=>x.classList.contains('selected'));
    i=i<0?(delta>0?0:rows.length-1):(i+delta+rows.length)%rows.length;
    rows.forEach((x,j)=>x.classList.toggle('selected',j===i));rows[i].scrollIntoView({block:'nearest'});
  }

  function topbar(){
    const bar=$q('.topbar'); if(!bar)return;
    $q('#topTitle')?.remove();
    if(!$q('#v4Search')){
      const search=document.createElement('div'); search.className='v4-search'; search.id='v4Search';search.setAttribute('role','search');
      search.innerHTML='<span>⌕</span><input id="v4SearchInput" aria-label="Search questions, topics and notes" placeholder="Search questions, topics, notes…" autocomplete="off"><kbd>⌘ K</kbd><div class="v4-search-results" id="v4SearchResults" hidden></div>';
      const spacer=$q('.topbar .spacer'); bar.insertBefore(search,spacer||bar.firstChild);
      const input=$q('#v4SearchInput'),results=$q('#v4SearchResults');
      let searchTimer;input?.addEventListener('input',e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>renderGlobalSearch(e.target.value),160)});
      input?.addEventListener('focus',e=>{if(e.target.value.trim())renderGlobalSearch(e.target.value)});
      input?.addEventListener('keydown',e=>{
        if(e.key==='ArrowDown'){e.preventDefault();moveGlobalSearchSelection(1);return}
        if(e.key==='ArrowUp'){e.preventDefault();moveGlobalSearchSelection(-1);return}
        if(e.key==='Escape'){hideGlobalSearch();return}
        if(e.key==='Enter'&&e.target.value.trim()){
          e.preventDefault();
          const selected=results?.querySelector('.v4-search-result.selected');
          if(selected){activateGlobalSearchResult(selected);return}
          openBankSearch(e.target.value.trim());
        }
      });
      results?.addEventListener('mousedown',e=>e.preventDefault());
      results?.addEventListener('click',e=>{const b=e.target.closest('.v4-search-result');if(b)activateGlobalSearchResult(b)});
      document.addEventListener('click',e=>{if(!e.target.closest('#v4Search'))hideGlobalSearch()});
      window.NEETPG_V4_GLOBAL_SEARCH=true;
    }
    const actions=$q('.top-actions');
    if(actions && !$q('#v4SyncPill')){
      const sync=document.createElement('div');sync.className='v4-sync-pill';sync.id='v4SyncPill';
      sync.innerHTML='<span class="v4-sync-dot local"></span><span id="v4SyncText">Local</span>';
      actions.insertBefore(sync,actions.firstChild);
    }
    if($q('#offlineBadge'))$q('#offlineBadge').style.display='none';
  }

  function dashboardMarkup(){
    return `<div class="v4-dashboard simple-dashboard">
      <section class="card compact-countdown" id="v4ExamCountdown" data-target="${EXAM_TARGET.iso}" aria-label="Study target countdown"><div><small>Your target date · <span id="targetDateLabel"></span></small><strong><span id="v4ExamDays">00</span> days <span id="v4ExamHours">00</span>:<span id="v4ExamMinutes">00</span>:<span id="v4ExamSeconds">00</span></strong><span id="v4ExamCountdownStatus" class="sr-only"></span></div><button class="btn small" id="editTarget">Edit date</button><form id="targetForm" hidden><label>Personal target date <input type="date" id="targetDate" required></label><button class="btn small" type="submit">Save date</button></form></section>
      <div class="v4-greeting"><div><h2 id="v4Greeting">Ready to study, Dr.?</h2><p>Small steps. A stronger you.</p></div></div>
      <div class="study-grid"><section class="card study-card"><h3>Continue learning</h3><div id="continueDetail"></div><button class="btn primary" id="continueLearning">Start a session</button><button class="btn small" id="customPractice">Customize practice →</button></section>
      <section class="card study-card"><h3>Today</h3><div id="todaySummary"></div><button class="text-action" data-home-view="plan">View study plan →</button></section>
      <section class="card study-card"><h3>Revision</h3><div class="revision-tabs" role="tablist" aria-label="Revision collections">${[['due','Due'],['incorrect','Incorrect'],['bookmarked','Bookmarks'],['notes','Notes']].map(([key,label],i)=>`<button role="tab" aria-selected="${i===0}" data-home-review="${key}">${label}</button>`).join('')}</div><div id="homeRevision"></div><button class="text-action" id="allRevision">View all →</button></section>
      <section class="card study-card"><h3>Recent notes</h3><div id="homeNotes"></div><a class="text-action" href="neuralvault/">Open vault →</a></section></div></div>`;
  }
  let reviewKind='due';
  function installDashboard(){
    const section=$q('#view-dashboard');if(!section)return;section.innerHTML=dashboardMarkup();
    for(const [id,title] of [['plan','Study Plan'],['mock','Mock Exams']])if(!$q('#view-'+id)){const v=document.createElement('section');v.className='view';v.id='view-'+id;v.innerHTML=`<h2>${title}</h2>`+(id==='plan'?'<section class="card study-card" id="v12Planner" data-dashboard-slot="planner"></section>':'<section class="card study-card"><h3>NEET-PG REAL EXAM SIMULATION</h3><p>180 questions · 720 marks · 3 hours 30 minutes</p><p>5 time-bound sections · 36 questions × 42 minutes · +4 / −1 / 0</p><button class="btn primary exam9-launch" id="openMock">START FULL MOCK</button></section>');section.parentElement.append(v)}
    $q('#openMock').onclick=()=>window.NEETPG_EXAM9?.open();
    $q('#targetDateLabel').textContent=formatExamTargetLabel(EXAM_TARGET.iso);
    $q('#targetDate').value=EXAM_TARGET.iso;$q('#editTarget').onclick=()=>{$q('#targetForm').hidden=!$q('#targetForm').hidden};
    $q('#targetForm').onsubmit=e=>{e.preventDefault();const iso=$q('#targetDate').value;if(!setExamTarget(iso)){toast('Choose a valid target date.');return}$q('#targetForm').hidden=true};
    $q('#continueLearning').onclick=()=>{if(app.session)navigate('practice');else if(app.savedSession)restoreSessionPayload();else window.NEETPG_PHASE12?.startPlan(15)||launchQuick('rapid')};
    $q('#customPractice').onclick=()=>navigate('practice');
    $q('[data-home-view]').onclick=()=>navigate('plan');
    $qa('[data-home-review]').forEach(b=>b.onclick=()=>{reviewKind=b.dataset.homeReview;renderV4Dashboard()});
    $q('#allRevision').onclick=()=>{navigate('review');activateReviewTab(reviewKind==='due'?'quick':reviewKind==='incorrect'?'quick':reviewKind==='bookmarked'?'bookmarks':'notes')};
    const bottom=document.createElement('nav');bottom.className='mobile-bottom';bottom.setAttribute('aria-label','Main navigation');bottom.innerHTML=[['dashboard','⌂','Home'],['bank','▦','QBank'],['review','↻','Revise'],['neuralvault','◇','Vault'],['more','•••','More']].map(([key,icon,label])=>`<button data-mobile-target="${key}"><span>${icon}</span>${label}</button>`).join('');document.body.append(bottom);
    bottom.onclick=e=>{const b=e.target.closest('button');if(!b)return;const target=b.dataset.mobileTarget;if(target==='neuralvault')location.href='neuralvault/';else if(target==='more')$q('#menuBtn').click();else navigate(target)};
    window.NeuralVaultDB?.loadState().then(v=>{durableNotes=v?.notes||localVaultNotes();renderV4Dashboard()}).catch(()=>{});
    syncExamCountdown();window.dispatchEvent(new CustomEvent('neetpg:dashboard-render'));
  }

  function setNavActive(view){
    $qa('.v4-nav').forEach(b=>{
      const active=b.dataset.v4Target===view;
      b.classList.toggle('active',active);
      if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
  }

  function launchQuick(mode){
    if(typeof navigate==='function') navigate('practice');
    const set=(id,val)=>{const el=$q(id);if(el&&[...el.options||[]].some(o=>o.value===String(val)))el.value=String(val)};
    if(mode==='rapid'){set('#pMode','smart');set('#pCount',15);set('#pFeedback','instant');set('#pTimer','neetpg');}
    if(mode==='errors'){set('#pMode','incorrect');set('#pCount',15);set('#pFeedback','instant');set('#pTimer','neetpg');}
    if(mode==='mock'){set('#pMode','all');set('#pCount',100);set('#pFeedback','exam');set('#pTimer','neetpg');set('#pOrder','random');}
    if(mode==='smart'){set('#pMode','smart');set('#pCount',25);set('#pFeedback','instant');set('#pTimer','neetpg');}
    setTimeout(()=>$q('#startCustom')?.click(),0);
  }

  function dayKeyLocal(t){const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

  function heatmap(attempts){
    const counts={};attempts.forEach(a=>{const k=dayKeyLocal(a.ts);counts[k]=(counts[k]||0)+1});
    const cells=[];const today=new Date();today.setHours(0,0,0,0);
    for(let col=11;col>=0;col--){for(let row=0;row<7;row++){const d=new Date(today);d.setDate(d.getDate()-(col*7)+(row-today.getDay()));const c=counts[dayKeyLocal(d)]||0;const level=c===0?0:c<10?1:c<25?2:c<50?3:4;cells.push(`<span class="v4-heat-cell" data-l="${level}" title="${dayKeyLocal(d)} · ${c} attempts"></span>`);}}
    return cells.join('');
  }

  function renderSubjects(){
    const host=$q('#v4SubjectBars');if(!host)return;
    let stats={};try{stats=typeof subjectStats==='function'?subjectStats():{}}catch{}
    const rows=Object.entries(stats).filter(([,v])=>v.attempts>0).map(([name,v])=>({name,acc:Math.round(v.correct/v.attempts*100),n:v.attempts})).sort((a,b)=>b.n-a.n).slice(0,8);
    host.innerHTML=rows.length?rows.map(r=>{const label=r.name.length>14?r.name.slice(0,13)+'…':r.name;return `<div class="v4-subject-row"><span title="${escapeV4(r.name)}">${escapeV4(label)}</span><div class="v4-subject-track"><div class="v4-subject-fill" style="width:${r.acc}%"></div></div><span class="v4-subject-value">${r.acc}%</span></div>`}).join(''):'<div class="muted small">Solve a few questions to unlock subject accuracy.</div>';
  }

  function renderSpark(attempts){
    const host=$q('#v4Spark');if(!host)return;
    const timed=attempts.filter(a=>Number(a.elapsed)>0).slice(-40);
    const groups=[];for(let i=0;i<8;i++){const part=timed.slice(i*5,i*5+5);groups.push(part.length?part.reduce((s,a)=>s+Number(a.elapsed),0)/part.length:0)}
    const nonzero=groups.filter(Boolean);const max=Math.max(90,...nonzero);host.innerHTML=groups.map(v=>`<i style="height:${v?clampV4(v/max*100,12,100):8}%" title="${v?Math.round(v)+' sec':'No data'}"></i>`).join('');
  }

  function reviseNext(){
    const host=$q('#v4ReviseNext');if(!host)return;
    let t={};try{t=typeof topicStats==='function'?topicStats():{}}catch{}
    const rows=Object.entries(t).filter(([,v])=>v.attempts>=1).map(([name,v])=>({name,acc:v.correct/v.attempts,n:v.attempts})).sort((a,b)=>a.acc-b.acc||b.n-a.n).slice(0,4);
    if(!rows.length){host.innerHTML='<div class="muted small">Weak-topic priorities appear after your first attempts.</div>';return;}
    host.innerHTML=rows.map((r,i)=>{const p=r.acc<.5?'High priority':r.acc<.7?'Medium':'Low';const cls=r.acc<.5?'':r.acc<.7?' medium':' low';return `<button class="v4-revise-item" data-topic="${escapeV4(r.name)}" style="border:0;background:transparent;text-align:left;padding:0;cursor:pointer"><span class="v4-rank">${i+1}</span><span><strong>${escapeV4(r.name)}</strong><small>${Math.round(r.acc*100)}% accuracy · ${r.n} attempts</small></span><span class="v4-priority${cls}">${p}</span></button>`}).join('');
    $qa('.v4-revise-item').forEach(b=>b.addEventListener('click',()=>{if(typeof navigate==='function')navigate('bank');const s=$q('#bankSearch');if(s){s.value=b.dataset.topic;s.dispatchEvent(new Event('input',{bubbles:true}));}}));
  }

  function achievements(attempts,streak,subjects){
    const host=$q('#v4AchievementList');if(!host)return;
    const subjectMaster=Object.values(subjects||{}).some(v=>v.attempts>=10&&v.correct/v.attempts>=.8);
    const items=[
      ['🔥',`${streak} Day Streak`,streak>=7],['◎',`${fmt(attempts.length)} Questions`,attempts.length>=100],['▤','Subject Master',subjectMaster],['★','Mock Test Pro',(typeof app!=='undefined'&&app.sessions||[]).some(s=>Number(s.count)>=50)],['♛','Consistent Learner',streak>=14]
    ];
    host.innerHTML=items.map(([icon,label,on])=>`<div class="v4-ach" style="opacity:${on?1:.42}"><div class="v4-ach-icon">${icon}</div><small>${label}</small></div>`).join('');
  }

  function renderV4Dashboard(){
    if(!$q('#continueDetail')||typeof app==='undefined')return;
    const escape=escapeHtml,s=app.session,p=s?sessionSnapshot():app.savedSession;
    const q=p?.qids?.length?app.qMap.get(p.qids[p.pos||0]):null;
    $q('#continueDetail').innerHTML=q?`<div class="study-topic">${escape(q.topic||q.subject)}</div><p class="muted">Question ${(p.pos||0)+1} of ${p.qids.length}</p><progress max="${p.qids.length}" value="${p.pos||0}" aria-label="Session progress"></progress>`:'<div class="study-topic">Your next small step</div><p class="muted">A focused 15-minute mix, tailored to your progress.</p>';
    $q('#continueLearning').textContent=p?'Resume session':'Start learning';
    const today=app.attempts.filter(a=>dayKeyLocal(a.ts)===dayKeyLocal(Date.now())),goal=window.NEETPG_PHASE12?.profileGoal?.()||50,due=dueQuestions().length;
    $q('#todaySummary').innerHTML=`<p><span class="study-symbol">▤</span><strong>${today.length} / ${goal}</strong> questions</p><p><span class="study-symbol">◷</span><strong>${due}</strong> reviews due</p><p><span class="study-symbol">◴</span><strong>${Math.round(today.reduce((n,a)=>n+Number(a.elapsed||0),0)/60)} min</strong> focused</p>`;
    $qa('[data-home-review]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.homeReview===reviewKind)));
    const rows=reviewCollection(reviewKind).slice(0,3);$q('#homeRevision').innerHTML=rows.length?rows.map(q=>`<button class="home-row" data-home-q="${escape(q.external_id)}"><span class="study-symbol">▤</span><span>${escape(q.topic)}<small>${escape(q.subject)}</small></span><span>›</span></button>`).join(''):'<p class="muted empty-home">'+(reviewKind==='due'?'All caught up. New reviews will appear here.':'No items in this collection yet.')+'</p>';
    $qa('[data-home-q]').forEach(b=>b.onclick=()=>{const q=app.qMap.get(b.dataset.homeQ);buildSession([q],{...builtInPreset('rapid'),count:1})});
    const notes=[...localVaultNotes()].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,3);$q('#homeNotes').innerHTML=notes.length?notes.map(n=>`<a class="home-row" href="neuralvault/?note=${encodeURIComponent(n.id)}"><span class="study-symbol">▤</span><span>${escape(n.title)}<small>${escape(n.path||'Vault note')}</small></span><span>›</span></a>`).join(''):'<p class="muted empty-home">Capture your first note in NeuralVault.</p>';
    const revisionBadge=$q('#v4NavDue');if(revisionBadge){revisionBadge.textContent=due;revisionBadge.hidden=due===0;revisionBadge.setAttribute('aria-label',due+` due review${due===1?'':'s'}`)}
    updateSyncPill();
  }
  function updateSyncPill(){const cloud=window.NEETPG_CLOUD,txt=$q('#v4SyncText');if(txt)txt.textContent=!navigator.onLine?'Offline':!cloud?.user?'Saved on device':cloud.error?'Sync failed':cloud.syncing?'Syncing…':cloud.dirty?'Changes pending':cloud.lastSyncAt?'Synced':'Waiting to sync'}

  function renderLifecycle(view='dashboard'){
    setNavActive(view);$qa('[data-mobile-target]').forEach(b=>{const active=b.dataset.mobileTarget===view;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
    if(view==='dashboard'){
      renderV4Dashboard();
      syncExamCountdown();
      window.dispatchEvent(new CustomEvent('neetpg:dashboard-render'));
    }else stopExamCountdown();
  }

  function init(){
    if(window.__NEETPG_UI_V4_BOOTED)return;
    window.__NEETPG_UI_V4_BOOTED=true;
    try{const stored=localStorage.getItem(EXAM_TARGET_KEY);if(/^\d{4}-\d{2}-\d{2}$/.test(stored||''))EXAM_TARGET.iso=stored}catch{}
    document.body.classList.add('ui-v4');sidebar();topbar();installDashboard();
    renderLifecycle($q('.view.active')?.id?.replace('view-','')||'dashboard');
    window.addEventListener('neetpg:route-change',e=>renderLifecycle(e.detail?.view||'dashboard'));
    window.addEventListener('neetpg:data-change',()=>{if($q('#view-dashboard')?.classList.contains('active'))renderLifecycle('dashboard')});
    window.addEventListener('neetpg:core-ready',()=>{document.body.dataset.v4ready='1';renderLifecycle($q('.view.active')?.id?.replace('view-','')||'dashboard')});
    if(document.body.dataset.coreReady==='1')document.body.dataset.v4ready='1';
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$q('#v4SearchInput')?.focus();}});
    window.addEventListener('neetpg:cloud-status',updateSyncPill);window.addEventListener('online',updateSyncPill);window.addEventListener('offline',updateSyncPill);
    setInterval(()=>{if(document.visibilityState==='visible'&&$q('#view-dashboard.active'))renderV4Dashboard()},60000);
  }

  document.addEventListener('visibilitychange',syncExamCountdown);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,60));else setTimeout(init,60);
})();

