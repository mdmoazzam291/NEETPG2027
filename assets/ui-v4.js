(() => {
  'use strict';

  const $q = s => document.querySelector(s);
  const $qa = s => [...document.querySelectorAll(s)];
  const fmt = n => new Intl.NumberFormat('en-IN').format(Number(n || 0));
  const clampV4 = (n,a,b) => Math.max(a,Math.min(b,n));
  const EXAM_TARGET = Object.freeze({ year: 2027, monthIndex: 7, day: 29, iso: '2027-08-29', label: '29 Aug 2027' });
  let examCountdownTimer = null;

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
    ['practice','▣','Practice'],
    ['bank','▦','Question Bank'],
    ['review','↻','Revision'],
    ['neuralvault','◇','NeuralVault'],
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
      syncExamCountdown();
    });
  }

  function localVaultNotes(){
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
    requestAnimationFrame(()=>{
      const sub=$q('#bankSubject');if(sub&&subject&&[...sub.options].some(o=>o.value===subject))sub.value=subject;
      const input=$q('#bankSearch');if(input){input.value=term;typeof bankFilter==='function'?bankFilter():input.dispatchEvent(new Event('input',{bubbles:true}))}
    });
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
      input?.addEventListener('input',e=>renderGlobalSearch(e.target.value));
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

  function legacyIds(){
    return `<div class="v4-legacy" aria-hidden="true">
      <span id="statTotal"></span><span id="statAttempted"></span><span id="statCoverage"></span><span id="statAccuracy"></span><span id="statDue"></span><span id="statStreak"></span><span id="statBookmarks"></span><span id="navDue"></span>
      <div id="smartDescription"></div><div id="smartMix"></div><div id="weakSubjects"></div><div id="activityChart"></div><div id="activityCaption"></div><div id="todayPlan"></div><div id="recentActivity"></div>
    </div>`;
  }

  function dashboardMarkup(){
    return `<div class="v4-dashboard">
      <section class="card v4-exam-countdown" id="v4ExamCountdown" data-target="2027-08-29" aria-label="NEET-PG exam countdown to 29 August 2027">
        <div class="v4-exam-copy">
          <span class="v4-exam-kicker">NEET-PG 2027 TARGET</span>
          <strong>29 Aug 2027</strong>
          <small id="v4ExamCountdownStatus">Counting down continuously</small>
        </div>
        <div class="v4-exam-clock" aria-label="Time remaining">
          <div><strong id="v4ExamDays">00</strong><span>Days</span></div>
          <i>:</i>
          <div><strong id="v4ExamHours">00</strong><span>Hours</span></div>
          <i>:</i>
          <div><strong id="v4ExamMinutes">00</strong><span>Minutes</span></div>
          <i>:</i>
          <div><strong id="v4ExamSeconds">00</strong><span>Seconds</span></div>
        </div>
      </section>
      <div class="v4-greeting"><div><h2 id="v4Greeting">Good morning, Doctor!</h2><p>Small consistent steps lead to big results. Keep going.</p></div><div class="v4-quote">“Excellence in medicine is built one question at a time.”</div></div>
      <div class="v4-kpis">
        <div class="card v4-kpi"><span class="v4-kpi-icon teal">◎</span><div><div class="v4-kpi-label">Total Questions Solved</div><div class="v4-kpi-value" id="v4Solved">0</div><div class="v4-kpi-note" id="v4SolvedNote">Start your first session</div></div></div>
        <div class="card v4-kpi"><span class="v4-kpi-icon purple">♨</span><div><div class="v4-kpi-label">Current Streak</div><div class="v4-kpi-value"><span id="v4Streak">0</span> days</div><div class="v4-kpi-note">Consistency compounds</div></div></div>
        <div class="card v4-kpi"><span class="v4-kpi-icon gold">★</span><div><div class="v4-kpi-label">Your XP</div><div class="v4-kpi-value" id="v4Xp">0</div><div class="v4-kpi-note" id="v4XpNote">Level 1</div></div></div>
        <div class="card v4-kpi"><span class="v4-kpi-icon blue">▥</span><div><div class="v4-kpi-label">Readiness Score</div><div class="v4-kpi-value" id="v4Readiness">0%</div><div class="v4-kpi-note">Personal progress estimate</div></div></div>
      </div>
      <div class="v4-analytics-row">
        <div class="card v4-card-pad"><div class="v4-card-title"><h3>▣ Weekly Study Heatmap</h3><small>Past 12 weeks</small></div><div class="v4-heatmap" id="v4Heatmap"></div><div class="v4-heat-foot"><span>12 weeks ago</span><span>Less ▪ ▪ ▪ ▪ More</span><span>Today</span></div></div>
        <div class="card v4-card-pad"><div class="v4-card-title"><h3>◎ Subject-wise Accuracy</h3><small>Attempted subjects</small></div><div class="v4-subject-bars" id="v4SubjectBars"></div></div>
        <div class="card v4-card-pad"><div class="v4-card-title"><h3>◷ Time per Question</h3><small>Recent pace</small></div><div class="v4-time-main"><div><strong id="v4AvgTime">—</strong><div><span>Avg. seconds / question</span></div></div><span id="v4PaceNote">63 sec NEET-PG pace</span></div><div class="v4-spark" id="v4Spark"></div><div class="v4-confidence"><div class="v4-ring" id="v4ConfRing" style="--ring:0%"><strong id="v4ConfPct">—</strong></div><div class="v4-conf-copy"><b>Confidence Calibration</b><br><span id="v4ConfCopy">Answer with confidence ratings to calibrate certainty.</span></div></div></div>
      </div>
      <div class="card v4-quick"><div class="v4-quick-head"><strong>🚀 Quick Start</strong><span>Choose a mode and get started</span></div><div class="v4-quick-grid">
        <button class="v4-quick-btn teal" data-v4-quick="rapid"><span><b>Rapid 15</b><small>15 Qs · mixed · timed</small></span><span>→</span></button>
        <button class="v4-quick-btn indigo" data-v4-quick="errors"><span><b>Error Drill</b><small>Attack your weak areas</small></span><span>→</span></button>
        <button class="v4-quick-btn gold" data-v4-quick="mock"><span><b>Mock Test</b><small>Exam-style practice</small></span><span>→</span></button>
        <button class="v4-quick-btn purple" data-v4-quick="smart"><span><b>Smart Session</b><small>Adaptive mixed practice</small></span><span>→</span></button>
      </div></div>
      <div class="v4-bottom">
        <div class="card v4-card-pad"><div class="v4-card-title"><h3>▥ Revise Next</h3><small>Performance + forgetting curve</small></div><div class="v4-revise-list" id="v4ReviseNext"></div></div>
        <div class="card v4-card-pad"><div class="v4-card-title"><h3>↻ Review Queue</h3><small>Spaced repetition</small></div><div class="v4-review-counters"><div class="v4-review-box"><strong id="v4DueToday">0</strong><small>Due Today</small></div><div class="v4-review-box"><strong id="v4Incorrect">0</strong><small>Incorrect</small></div><div class="v4-review-box"><strong id="v4Bookmarks">0</strong><small>Bookmarks</small></div></div><button class="btn v4-review-start" id="v4StartReview">Start Reviewing →</button></div>
        <div class="card v4-card-pad" id="v4Achievements"><div class="v4-card-title"><h3>♕ Achievements</h3><small>Your milestones</small></div><div class="v4-achievements" id="v4AchievementList"></div></div>
      </div>
      ${legacyIds()}
    </div>`;
  }

  function installDashboard(){
    const section=$q('#view-dashboard');if(!section)return;
    section.innerHTML=dashboardMarkup();
    section.addEventListener('click',e=>{
      const quick=e.target.closest('[data-v4-quick]'); if(quick) launchQuick(quick.dataset.v4Quick);
    });
    $q('#v4StartReview')?.addEventListener('click',()=>{if(typeof navigate==='function')navigate('review');setTimeout(()=>$q('#startDue')?.click(),0)});
    syncExamCountdown();
  }

  function setNavActive(view){
    $qa('.v4-nav').forEach(b=>b.classList.toggle('active', b.dataset.v4Target===view));
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
    host.innerHTML=rows.length?rows.map(r=>`<div class="v4-subject-row"><span title="${r.name}">${r.name.length>14?r.name.slice(0,13)+'…':r.name}</span><div class="v4-subject-track"><div class="v4-subject-fill" style="width:${r.acc}%"></div></div><span class="v4-subject-value">${r.acc}%</span></div>`).join(''):'<div class="muted small">Solve a few questions to unlock subject accuracy.</div>';
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
    host.innerHTML=rows.map((r,i)=>{const p=r.acc<.5?'High priority':r.acc<.7?'Medium':'Low';const cls=r.acc<.5?'':r.acc<.7?' medium':' low';return `<button class="v4-revise-item" data-topic="${r.name.replace(/"/g,'&quot;')}" style="border:0;background:transparent;text-align:left;padding:0;cursor:pointer"><span class="v4-rank">${i+1}</span><span><strong>${r.name}</strong><small>${Math.round(r.acc*100)}% accuracy · ${r.n} attempts</small></span><span class="v4-priority${cls}">${p}</span></button>`}).join('');
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
    if(!$q('#v4Solved')||typeof app==='undefined')return;
    const attempts=app.attempts||[];const states=app.states||new Map();const total=app.questions?.length||0;
    const correct=attempts.filter(a=>a.correct).length;const acc=attempts.length?correct/attempts.length:0;const coverage=[...states.values()].filter(s=>s.attempts).length;
    let streak=0;try{streak=typeof calcStreak==='function'?calcStreak():0}catch{}
    let due=0,wrong=0,bm=0;try{due=typeof dueQuestions==='function'?dueQuestions().length:0;wrong=typeof incorrectQuestions==='function'?incorrectQuestions().length:0;bm=typeof bookmarkedQuestions==='function'?bookmarkedQuestions().length:0}catch{}
    const xp=attempts.length*10+correct*5+(app.sessions?.length||0)*25;const level=Math.max(1,Math.floor(xp/2000)+1);const readiness=total?Math.round((acc*.65+(coverage/total)*.35)*100):0;
    $q('#v4Greeting').textContent=`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${currentUserName()}!`;
    $q('#v4Solved').textContent=fmt(attempts.length);$q('#v4Streak').textContent=streak;$q('#v4Xp').textContent=fmt(xp);$q('#v4XpNote').textContent=`Level ${level}`;$q('#v4Readiness').textContent=`${readiness}%`;
    const weekAgo=Date.now()-7*86400000;const recent=attempts.filter(a=>a.ts>=weekAgo).length;$q('#v4SolvedNote').textContent=recent?`+${recent} in the last 7 days`:'Start your first session';
    $q('#v4Heatmap').innerHTML=heatmap(attempts);renderSubjects();renderSpark(attempts);reviseNext();
    $q('#v4DueToday').textContent=due;$q('#v4Incorrect').textContent=wrong;$q('#v4Bookmarks').textContent=bm;if($q('#v4NavDue'))$q('#v4NavDue').textContent=due;
    const timed=attempts.filter(a=>Number(a.elapsed)>0);const avg=timed.length?Math.round(timed.reduce((s,a)=>s+Number(a.elapsed),0)/timed.length):null;$q('#v4AvgTime').textContent=avg??'—';$q('#v4PaceNote').textContent=avg?avg<=63?'On NEET-PG pace':'Target: 63 sec':'63 sec NEET-PG pace';
    const confident=attempts.filter(a=>Number(a.confidence)>=4);const confAcc=confident.length?Math.round(confident.filter(a=>a.correct).length/confident.length*100):0;$q('#v4ConfRing').style.setProperty('--ring',`${confAcc}%`);$q('#v4ConfPct').textContent=confident.length?`${confAcc}%`:'—';$q('#v4ConfCopy').textContent=confident.length?`${confAcc}% of high-confidence answers were correct across ${confident.length} attempts.`:'Answer with confidence ratings to calibrate certainty.';
    let subjects={};try{subjects=typeof subjectStats==='function'?subjectStats():{}}catch{}achievements(attempts,streak,subjects);
    const cloud=window.NEETPG_CLOUD;const dot=$q('#v4SyncPill .v4-sync-dot'),txt=$q('#v4SyncText');if(dot&&txt){const signed=!!cloud?.user;dot.classList.toggle('local',!signed);txt.textContent=signed?(cloud.syncing?'Syncing':'Synced'):'Local';}
  }

  function wrapCore(){
    try{
      if(typeof navigate==='function'&&!navigate.__v4){const core=navigate;const wrapped=function(view){const out=core(view);setNavActive(view);if(view==='dashboard')setTimeout(()=>{renderV4Dashboard();syncExamCountdown()},0);else stopExamCountdown();return out};wrapped.__v4=true;navigate=wrapped;}
      if(typeof renderDashboard==='function'&&!renderDashboard.__v4){const core=renderDashboard;const wrapped=function(){const out=core();renderV4Dashboard();return out};wrapped.__v4=true;renderDashboard=wrapped;}
      if(typeof renderAll==='function'&&!renderAll.__v4){const core=renderAll;const wrapped=function(){const out=core();if($q('#view-dashboard')?.classList.contains('active'))renderV4Dashboard();return out};wrapped.__v4=true;renderAll=wrapped;}
    }catch(e){console.warn('UI v4 wrapper skipped',e)}
  }

  function init(){
    document.body.classList.add('ui-v4');sidebar();topbar();installDashboard();wrapCore();
    setNavActive('dashboard');
    try{if(typeof renderDashboard==='function')renderDashboard();else renderV4Dashboard();}catch(e){console.warn('v4 initial dashboard render',e);renderV4Dashboard();}
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$q('#v4SearchInput')?.focus();}});
    setInterval(()=>{if($q('#view-dashboard')?.classList.contains('active'))renderV4Dashboard()},15000);
  }

  document.addEventListener('visibilitychange',syncExamCountdown);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,60));else setTimeout(init,60);
})();
