(() => {
  'use strict';

  const cfg = window.NEETPG_SUPABASE || {};
  const configured = Boolean(cfg.url && cfg.anonKey);
  const cloud = {
    configured,
    client: null,
    session: null,
    user: null,
    profile: null,
    syncing: false,
    dirty: false,
    syncTimer: null,
    periodicTimer: null,
    lastSyncAt: null,
    resumePayload: null
  };
  window.NEETPG_CLOUD = cloud;

  const PULL_KEY = uid => `neetpg2027-cloud-last-pull:${uid}`;
  const PUSH_KEY = uid => `neetpg2027-cloud-last-push:${uid}`;
  const PREFS_UPDATED_KEY = 'neetpg2027-v2-settings-updated';
  const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ms = value => value ? new Date(value).getTime() : 0;
  const toIso = value => value ? new Date(value).toISOString() : null;
  const chunks = (arr, size=250) => { const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; };
  const attemptKey = a => `${a.sessionId || 'none'}:${a.qid}:${a.ts}:${a.selected || 'skip'}`;

  function injectStyles(){
    if(document.getElementById('cloudStyles')) return;
    const style=document.createElement('style');
    style.id='cloudStyles';
    style.textContent=`
      .account-btn{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:12px}
      .account-avatar{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--accent,#0f766e);color:white;font-size:12px;font-weight:800}
      .auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
      .auth-tabs button.active{background:var(--accent,#0f766e);color:white;border-color:transparent}
      .auth-stack{display:grid;gap:10px}
      .auth-divider{display:flex;align-items:center;gap:10px;color:var(--muted,#6b7280);font-size:12px;margin:4px 0}
      .auth-divider:before,.auth-divider:after{content:'';height:1px;background:var(--line,#e5e7eb);flex:1}
      .cloud-status-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .cloud-dot{width:9px;height:9px;border-radius:50%;background:#9ca3af;box-shadow:0 0 0 4px rgba(156,163,175,.12)}
      .cloud-dot.online{background:#10b981;box-shadow:0 0 0 4px rgba(16,185,129,.12)}
      .cloud-dot.syncing{background:#f59e0b;box-shadow:0 0 0 4px rgba(245,158,11,.12)}
      .cloud-dot.error{background:#ef4444;box-shadow:0 0 0 4px rgba(239,68,68,.12)}
      .cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .cloud-profile{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
      .cloud-resume{margin-top:12px;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:12px;background:var(--surface2,#f8fafc)}
      #authModal .modal{max-width:430px}
      .auth-error{color:#b91c1c;font-size:13px;min-height:18px}
      .auth-success{color:#047857;font-size:13px;min-height:18px}
      @media(max-width:640px){.account-label{display:none}.cloud-profile{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUi(){
    injectStyles();
    const topActions=document.querySelector('.top-actions');
    if(topActions && !document.getElementById('accountBtn')){
      const btn=document.createElement('button');
      btn.id='accountBtn'; btn.className='btn account-btn';
      btn.innerHTML='<span class="account-avatar" id="accountAvatar">G</span><span class="account-label" id="accountLabel">Sign in</span>';
      topActions.insertBefore(btn, topActions.firstChild);
    }

    const settings=document.querySelector('.settings-grid');
    if(settings && !document.getElementById('cloudAccountCard')){
      const card=document.createElement('div');
      card.className='card'; card.id='cloudAccountCard';
      card.innerHTML=`
        <h3>Account & cloud sync</h3>
        <div class="cloud-status-row"><span class="cloud-dot" id="cloudDot"></span><strong id="cloudStatus">Local-only mode</strong><span class="tag" id="cloudPlan">Supabase</span></div>
        <p class="muted small" id="cloudDetail">Sign in to sync progress, SRS, notes, bookmarks and sessions across devices. Offline practice continues to use IndexedDB.</p>
        <div id="cloudProfile" class="cloud-profile hidden">
          <div class="field"><label>Display name</label><input id="cloudDisplayName" placeholder="Your name"></div>
          <div class="field"><label>Daily MCQ goal</label><input id="cloudDailyGoal" type="number" min="1" max="1000" value="50"></div>
        </div>
        <div id="cloudResume"></div>
        <div class="cloud-actions">
          <button class="btn primary" id="cloudSignIn">Sign in</button>
          <button class="btn hidden" id="cloudSyncNow">Sync now</button>
          <button class="btn hidden" id="cloudSaveProfile">Save profile</button>
          <button class="btn hidden" id="cloudSignOut">Sign out</button>
        </div>`;
      settings.prepend(card);
    }

    if(!document.getElementById('authModal')){
      const wrap=document.createElement('div'); wrap.className='modal-backdrop'; wrap.id='authModal';
      wrap.innerHTML=`<div class="modal">
        <div class="modal-head"><div><h3 style="margin:0">NEETPG2027 account</h3><p class="muted small" style="margin:4px 0 0">Cloud sync powered by Supabase</p></div><button class="btn icon" id="authClose">×</button></div>
        <div class="auth-tabs"><button class="btn active" data-auth-tab="signin">Sign in</button><button class="btn" data-auth-tab="signup">Create account</button></div>
        <div class="auth-stack">
          <div class="field" id="authNameField" style="display:none"><label>Display name</label><input id="authName" autocomplete="name" placeholder="Your name"></div>
          <div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>
          <div class="field"><label>Password</label><input id="authPassword" type="password" autocomplete="current-password" minlength="8" placeholder="At least 8 characters"></div>
          <button class="btn primary" id="authSubmit">Sign in</button>
          <div class="auth-divider">or</div>
          <button class="btn" id="authGoogle">Continue with Google</button>
          <div class="auth-error" id="authError"></div><div class="auth-success" id="authSuccess"></div>
          <p class="muted tiny" style="margin:0">Your private study rows are protected with Supabase Row Level Security. The browser contains only the public anon/publishable key, never the service-role key.</p>
        </div>
      </div>`;
      document.body.appendChild(wrap);
    }
  }

  function setAuthTab(mode){
    document.querySelectorAll('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b.dataset.authTab===mode));
    const signup=mode==='signup';
    const name=document.getElementById('authNameField'); if(name) name.style.display=signup?'block':'none';
    const submit=document.getElementById('authSubmit'); if(submit) submit.textContent=signup?'Create account':'Sign in';
    const pass=document.getElementById('authPassword'); if(pass) pass.autocomplete=signup?'new-password':'current-password';
    const modal=document.getElementById('authModal'); if(modal) modal.dataset.mode=mode;
    setAuthMessage('','');
  }

  function setAuthMessage(error='', success=''){
    const e=document.getElementById('authError'), s=document.getElementById('authSuccess');
    if(e)e.textContent=error; if(s)s.textContent=success;
  }

  function openAuth(){
    if(!configured){
      const e=document.getElementById('authError');
      document.getElementById('authModal')?.classList.add('show');
      if(e)e.textContent='Supabase backend is not connected yet. The app remains fully usable in local mode.';
      return;
    }
    setAuthTab('signin');
    document.getElementById('authModal')?.classList.add('show');
  }
  function closeAuth(){ document.getElementById('authModal')?.classList.remove('show'); }

  function initials(user){
    const label=cloud.profile?.display_name || user?.user_metadata?.display_name || user?.email || 'U';
    return label.split(/\s+|@/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('') || 'U';
  }

  function updateCloudUi(state='idle', detail=''){
    window.dispatchEvent(new CustomEvent('neetpg:cloud-status')); 
    const user=cloud.user;
    const label=document.getElementById('accountLabel'), avatar=document.getElementById('accountAvatar');
    const status=document.getElementById('cloudStatus'), dot=document.getElementById('cloudDot'), d=document.getElementById('cloudDetail');
    const signIn=document.getElementById('cloudSignIn'), sync=document.getElementById('cloudSyncNow'), signOut=document.getElementById('cloudSignOut'), saveProfile=document.getElementById('cloudSaveProfile'), profile=document.getElementById('cloudProfile');
    if(dot){ dot.className='cloud-dot'+(state==='syncing'?' syncing':state==='error'?' error':user?' online':''); }
    if(user){
      if(label)label.textContent=cloud.profile?.display_name || user.email?.split('@')[0] || 'Account';
      if(avatar)avatar.textContent=initials(user);
      if(status)status.textContent=state==='error'?'Sync failed':state==='syncing'?'Syncing…':cloud.dirty?'Changes pending':cloud.lastSyncAt?'Synced':'Waiting to sync';
      if(d)d.textContent=detail || `${user.email || 'Signed in'}${cloud.lastSyncAt?` · Last sync ${new Date(cloud.lastSyncAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:''}`;
      signIn?.classList.add('hidden'); sync?.classList.remove('hidden'); signOut?.classList.remove('hidden'); saveProfile?.classList.remove('hidden'); profile?.classList.remove('hidden');
      const n=document.getElementById('cloudDisplayName'), goal=document.getElementById('cloudDailyGoal');
      if(n && document.activeElement!==n)n.value=cloud.profile?.display_name || '';
      if(goal && document.activeElement!==goal)goal.value=cloud.profile?.daily_goal || 50;
    }else{
      if(label)label.textContent='Sign in'; if(avatar)avatar.textContent='G';
      if(status)status.textContent=configured?'Local-only mode':'Supabase setup pending';
      if(d)d.textContent=detail || (configured?'Sign in to sync progress across devices. Local/offline study still works without an account.':'The frontend is ready for Supabase. Connect the backend to enable login and cloud sync.');
      signIn?.classList.remove('hidden'); sync?.classList.add('hidden'); signOut?.classList.add('hidden'); saveProfile?.classList.add('hidden'); profile?.classList.add('hidden');
    }
  }

  function loadSdk(){
    if(!configured) return Promise.resolve(null);
    if(window.supabase?.createClient) return Promise.resolve(window.supabase);
    return new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[src="${CDN}"]`);
      if(existing){ existing.addEventListener('load',()=>resolve(window.supabase),{once:true}); existing.addEventListener('error',()=>reject(new Error('Supabase SDK failed to load')),{once:true}); return; }
      const script=document.createElement('script'); script.src=CDN; script.async=true;
      script.onload=()=>resolve(window.supabase); script.onerror=()=>reject(new Error('Supabase SDK failed to load'));
      document.head.appendChild(script);
    });
  }

  async function loadProfile(){
    if(!cloud.user) return;
    const {data,error}=await cloud.client.from('profiles').select('display_name,target_exam,daily_goal,updated_at').eq('id',cloud.user.id).maybeSingle();
    if(error) throw error;
    cloud.profile=data || {display_name:'',target_exam:'NEET-PG 2027',daily_goal:50};
  }

  async function saveProfile(){
    if(!cloud.user) return;
    const display_name=(document.getElementById('cloudDisplayName')?.value || '').trim();
    const daily_goal=Math.max(1,Math.min(1000,Number(document.getElementById('cloudDailyGoal')?.value)||50));
    const row={id:cloud.user.id,display_name,daily_goal,target_exam:'NEET-PG 2027',updated_at:new Date().toISOString()};
    const {error}=await cloud.client.from('profiles').upsert(row,{onConflict:'id'}); if(error)throw error;
    cloud.profile={...(cloud.profile||{}),...row}; updateCloudUi();
    if(typeof toast==='function')toast('Profile saved');
  }

  async function signIn(){
    const email=document.getElementById('authEmail')?.value.trim(), password=document.getElementById('authPassword')?.value || '';
    if(!email || password.length<8){setAuthMessage('Enter a valid email and a password of at least 8 characters.');return;}
    const btn=document.getElementById('authSubmit'); if(btn)btn.disabled=true; setAuthMessage();
    try{
      const {error}=await cloud.client.auth.signInWithPassword({email,password}); if(error)throw error;
      closeAuth();
    }catch(e){setAuthMessage(e.message || 'Sign in failed.');}finally{if(btn)btn.disabled=false;}
  }

  async function signUp(){
    const email=document.getElementById('authEmail')?.value.trim(), password=document.getElementById('authPassword')?.value || '', display_name=document.getElementById('authName')?.value.trim() || '';
    if(!email || password.length<8){setAuthMessage('Enter a valid email and a password of at least 8 characters.');return;}
    const btn=document.getElementById('authSubmit'); if(btn)btn.disabled=true; setAuthMessage();
    try{
      const {data,error}=await cloud.client.auth.signUp({email,password,options:{data:{display_name},emailRedirectTo:cfg.redirectUrl || location.href}}); if(error)throw error;
      if(data.session)closeAuth(); else setAuthMessage('', 'Account created. Check your email to confirm the address, then sign in.');
    }catch(e){setAuthMessage(e.message || 'Account creation failed.');}finally{if(btn)btn.disabled=false;}
  }

  async function googleSignIn(){
    try{
      const {error}=await cloud.client.auth.signInWithOAuth({provider:'google',options:{redirectTo:cfg.redirectUrl || location.href}}); if(error)throw error;
    }catch(e){setAuthMessage(e.message || 'Google sign-in failed. Enable the Google provider in Supabase first.');}
  }

  function qToCloud(s, uid){
    return {user_id:uid,qid:s.qid,attempts:s.attempts||0,correct:s.correct||0,incorrect:s.incorrect||0,last_correct:s.lastCorrect??null,bookmarked:!!s.bookmarked,flagged:!!s.flagged,note:s.note||'',due_at:s.dueAt?toIso(s.dueAt):null,interval_days:Number(s.intervalDays||0),ease:Number(s.ease||2.5),streak:Number(s.streak||0),updated_at:toIso(s.updatedAt||Date.now())};
  }
  function qFromCloud(r){ return {qid:r.qid,attempts:r.attempts||0,correct:r.correct||0,incorrect:r.incorrect||0,lastCorrect:r.last_correct,bookmarked:!!r.bookmarked,flagged:!!r.flagged,note:r.note||'',dueAt:r.due_at?ms(r.due_at):null,intervalDays:Number(r.interval_days||0),ease:Number(r.ease||2.5),streak:Number(r.streak||0),updatedAt:ms(r.updated_at)}; }
  function aToCloud(a,uid){return {user_id:uid,client_key:attemptKey(a),qid:a.qid,correct:!!a.correct,selected:a.selected||null,confidence:a.confidence?Number(a.confidence):null,mistake:a.mistake||'',note:a.note||'',skipped:!!a.skipped,happened_at:toIso(a.ts),elapsed_seconds:Number(a.elapsed||0),session_id:a.sessionId||'',subject:a.subject||null,difficulty:a.difficulty?Number(a.difficulty):null};}
  function aFromCloud(r){return {qid:r.qid,correct:!!r.correct,selected:r.selected||null,confidence:r.confidence||null,mistake:r.mistake||'',note:r.note||'',skipped:!!r.skipped,ts:ms(r.happened_at),elapsed:Number(r.elapsed_seconds||0),sessionId:r.session_id||'',subject:r.subject||'',difficulty:r.difficulty||2};}
  function sToCloud(s,uid){return {user_id:uid,session_id:s.id,started_at:toIso(s.startedAt),ended_at:s.endedAt?toIso(s.endedAt):null,question_count:Number(s.count||0),correct_count:Number(s.correct||0),accuracy:Number(s.accuracy||0),mode:s.mode||'',feedback:s.feedback||'',subjects:s.subjects||[],payload:{},updated_at:toIso(s.endedAt||s.startedAt||Date.now())};}
  function sFromCloud(r){return {id:r.session_id,startedAt:ms(r.started_at),endedAt:r.ended_at?ms(r.ended_at):null,count:r.question_count||0,correct:r.correct_count||0,accuracy:r.accuracy||0,mode:r.mode||'',feedback:r.feedback||'',subjects:r.subjects||[]};}

  async function paged(table, build){
    const all=[]; let from=0; const size=1000;
    while(true){
      let q=build(cloud.client.from(table).select('*')).range(from,from+size-1);
      const {data,error}=await q; if(error)throw error;
      all.push(...(data||[])); if(!data || data.length<size)break; from+=size;
    }
    return all;
  }

  async function pullCloud(){
    const uid=cloud.user.id, since=localStorage.getItem(PULL_KEY(uid));
    const qrows=await paged('question_state', q=>q.eq('user_id',uid).order('qid',{ascending:true}));
    for(const r of qrows){
      const remote=qFromCloud(r), local=typeof stateFor==='function'?stateFor(remote.qid):null;
      if(!local || ms(remote.updatedAt)>ms(local.updatedAt)){ await dbPut('qstate',remote); app.states.set(remote.qid,remote); }
    }

    const arows=await paged('attempts', q=>q.eq('user_id',uid).order('client_key',{ascending:true}));
    cloud.remoteAttemptKeys=new Set(arows.map(r=>r.client_key));
    const localKeys=new Set((app.attempts||[]).map(attemptKey));
    for(const r of arows){
      const a=aFromCloud(r), key=attemptKey(a); if(localKeys.has(key))continue;
      const id=await dbAdd('attempts',a); a.id=id; app.attempts.push(a); localKeys.add(key);
    }

    const srows=await paged('study_sessions', q=>q.eq('user_id',uid).order('session_id',{ascending:true}));
    const sessionMap=new Map((app.sessions||[]).map(x=>[x.id,x]));
    for(const r of srows){ const remote=sFromCloud(r), local=sessionMap.get(remote.id); if(!local || ms(r.updated_at)>ms(local.endedAt||local.startedAt)){await dbPut('sessions',remote);sessionMap.set(remote.id,remote);} }
    app.sessions=[...sessionMap.values()].sort((a,b)=>b.startedAt-a.startedAt);

    const {data:settings,error:settingsError}=await cloud.client.from('user_settings').select('settings,updated_at').eq('user_id',uid).maybeSingle();
    if(settingsError)throw settingsError;
    if(settings?.settings){
      const localExists=Boolean(localStorage.getItem(SETTINGS_KEY));
      const localUpdated=Number(localStorage.getItem(PREFS_UPDATED_KEY)||0);
      if(!localExists || ms(settings.updated_at)>localUpdated){ app.prefs={...DEFAULTS,...settings.settings}; localStorage.setItem(SETTINGS_KEY,JSON.stringify(app.prefs)); localStorage.setItem(PREFS_UPDATED_KEY,String(ms(settings.updated_at))); if(typeof applyPrefs==='function')applyPrefs(); }
    }

    const {data:active,error:activeError}=await cloud.client.from('active_sessions').select('session_id,payload,updated_at').eq('user_id',uid).maybeSingle();
    if(activeError)throw activeError;
    cloud.resumePayload=active?.payload || null; renderResumeCard();

    await loadState();
    if(typeof renderSettings==='function')renderSettings();
    if(typeof renderAll==='function')renderAll();
    localStorage.setItem(PULL_KEY(uid),new Date().toISOString());
  }

  async function pushCloud(){
    const uid=cloud.user.id, since=localStorage.getItem(PUSH_KEY(uid)), sinceMs=ms(since);
    const qrows=[...app.states.values()].map(x=>qToCloud(x,uid));
    for(const part of chunks(qrows)){const {error}=await cloud.client.from('question_state').upsert(part,{onConflict:'user_id,qid'});if(error)throw error;}

    const arows=(app.attempts||[]).filter(x=>!cloud.remoteAttemptKeys?.has(attemptKey(x))).map(x=>aToCloud(x,uid));
    for(const part of chunks(arows)){const {error}=await cloud.client.from('attempts').upsert(part,{onConflict:'user_id,client_key',ignoreDuplicates:true});if(error)throw error;}

    const srows=(app.sessions||[]).map(x=>sToCloud(x,uid));
    for(const part of chunks(srows)){const {error}=await cloud.client.from('study_sessions').upsert(part,{onConflict:'user_id,session_id'});if(error)throw error;}

    const settingsRow={user_id:uid,settings:app.prefs,updated_at:new Date(Number(localStorage.getItem(PREFS_UPDATED_KEY)||Date.now())).toISOString()};
    const {error:settingsError}=await cloud.client.from('user_settings').upsert(settingsRow,{onConflict:'user_id'}); if(settingsError)throw settingsError;

    await pushActiveSession();
    localStorage.setItem(PUSH_KEY(uid),new Date().toISOString());
  }

  function activePayload(){
    const s=app.session; if(!s || s.ended)return null;
    return typeof sessionSnapshot==='function'?sessionSnapshot():null;
  }
  async function pushActiveSession(){
    if(!cloud.user)return;
    const payload=activePayload();
    if(payload){
      const {error}=await cloud.client.from('active_sessions').upsert({user_id:cloud.user.id,session_id:payload.sessionId,payload,updated_at:new Date().toISOString()},{onConflict:'user_id'}); if(error)throw error;
    }else{
      const {error}=await cloud.client.from('active_sessions').delete().eq('user_id',cloud.user.id); if(error)throw error;
    }
  }

  function renderResumeCard(){
    const host=document.getElementById('cloudResume'); if(!host)return;
    const p=cloud.resumePayload;
    if(!p?.qids?.length){host.innerHTML='';return;}
    host.innerHTML=`<div class="cloud-resume"><strong>Cloud session available</strong><p class="muted small" style="margin:5px 0 10px">${Math.min((p.pos||0)+1,p.qids.length)} / ${p.qids.length} questions · saved ${p.savedAt?new Date(p.savedAt).toLocaleString():'recently'}</p><button class="btn small primary" id="cloudResumeBtn">Resume session</button></div>`;
    document.getElementById('cloudResumeBtn')?.addEventListener('click',resumeCloudSession);
  }

  function resumeCloudSession(){
    const p=cloud.resumePayload; if(!p)return;
    if(!restoreSessionPayload(p))return;
    if(typeof toast==='function')toast('Cloud session resumed');
  }

  async function syncNow({initial=false}={}){
    if(!cloud.user || cloud.syncing || !navigator.onLine)return;
    const version=cloud.changeVersion||0;cloud.syncing=true; updateCloudUi('syncing');
    try{
      await pullCloud();
      await pushCloud();
      cloud.dirty=cloud.changeVersion!==version;cloud.error=null; cloud.lastSyncAt=Date.now(); updateCloudUi('idle');
    }catch(e){cloud.error=e.message||String(e);console.error('Cloud sync failed',e);updateCloudUi('error',`Sync failed: ${e.message || e}`);}
    finally{cloud.syncing=false;window.dispatchEvent(new CustomEvent('neetpg:cloud-status'));}
  }

  function markDirty(){
    cloud.dirty=true;cloud.changeVersion=(cloud.changeVersion||0)+1;
    clearTimeout(cloud.syncTimer);
    cloud.syncTimer=setTimeout(()=>syncNow(),2500);
  }

  async function setSession(session){
    cloud.session=session; cloud.user=session?.user || null; cloud.profile=null; cloud.resumePayload=null;
    if(cloud.user){
      try{await loadProfile();updateCloudUi();await syncNow({initial:true});}
      catch(e){console.error(e);updateCloudUi('error',e.message || 'Cloud initialization failed');}
    }else updateCloudUi();
  }

  window.addEventListener('neetpg:prefs-change',markDirty);window.addEventListener('neetpg:progress-saved',markDirty);
  function bindUi(){
    document.getElementById('accountBtn')?.addEventListener('click',()=>cloud.user?navigate('settings'):openAuth());
    document.getElementById('cloudSignIn')?.addEventListener('click',openAuth);
    document.getElementById('cloudSyncNow')?.addEventListener('click',()=>syncNow());
    document.getElementById('cloudSaveProfile')?.addEventListener('click',()=>saveProfile().catch(e=>updateCloudUi('error',e.message)));
    document.getElementById('cloudSignOut')?.addEventListener('click',async()=>{if(cloud.client)await cloud.client.auth.signOut();});
    document.getElementById('authClose')?.addEventListener('click',closeAuth);
    document.getElementById('authModal')?.addEventListener('click',e=>{if(e.target.id==='authModal')closeAuth();});
    document.querySelectorAll('[data-auth-tab]').forEach(b=>b.addEventListener('click',()=>setAuthTab(b.dataset.authTab)));
    document.getElementById('authSubmit')?.addEventListener('click',()=>document.getElementById('authModal')?.dataset.mode==='signup'?signUp():signIn());
    document.getElementById('authGoogle')?.addEventListener('click',()=>configured?googleSignIn():setAuthMessage('Supabase backend is not connected yet.'));
    document.getElementById('authPassword')?.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('authSubmit')?.click();});

    document.addEventListener('click',e=>{
      if(!cloud.user)return;
      if(e.target.closest('#qSubmit,#qNext,#qSkip,#qBookmark,#qFlag,[data-rating],#saveSettings,#newSession'))markDirty();
    },true);
    document.addEventListener('change',e=>{if(cloud.user && e.target.closest('#mistakeCategory,#attemptNote,#questionNote,#cloudDisplayName,#cloudDailyGoal'))markDirty();},true);
    window.addEventListener('online',()=>{updateCloudUi();if(cloud.user)syncNow();});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&cloud.user&&cloud.dirty)syncNow();});
  }

  async function initCloud(){
    injectUi(); bindUi(); updateCloudUi();
    if(!localStorage.getItem(PREFS_UPDATED_KEY) && localStorage.getItem(SETTINGS_KEY))localStorage.setItem(PREFS_UPDATED_KEY,String(Date.now()));
    if(!configured)return;
    try{
      const sdk=await loadSdk();
      cloud.client=sdk.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'neetpg2027-auth'}});
      const {data:{session},error}=await cloud.client.auth.getSession(); if(error)throw error;
      await setSession(session);
      cloud.client.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>setSession(next),0);});
      cloud.periodicTimer=setInterval(()=>{if(document.visibilityState==='visible' && cloud.user && (cloud.dirty || app.session))syncNow();},30000);
    }catch(e){console.error('Supabase init failed',e);updateCloudUi('error',`Supabase unavailable: ${e.message || e}`);}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(initCloud,0));
  else setTimeout(initCloud,0);
})();
