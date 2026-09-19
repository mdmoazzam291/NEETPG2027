(() => {
'use strict';
const KEY='neetpg2027-phase12-planner';
const DAY=86400000;
const DEFAULTS={dailyGoal:50};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const core=()=>{try{return typeof app!=='undefined'?app:null}catch{return null}};
const questions=()=>window.NEETPG_PHASE10?.allQuestions?.()||core()?.questions||[];
const attempts=()=>core()?.attempts||[];
const states=()=>{const s=core()?.states;return s instanceof Map?[...s.values()]:[]};
const qState=id=>{try{return typeof stateFor==='function'?stateFor(id):(core()?.states?.get(id)||{qid:id,attempts:0,lastCorrect:null,dueAt:null})}catch{return{qid:id,attempts:0,lastCorrect:null,dueAt:null}}};
const localDay=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const startOfDay=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()};
const startOfWeek=d=>{const x=new Date(d);x.setHours(0,0,0,0);const day=(x.getDay()+6)%7;x.setDate(x.getDate()-day);return x.getTime()};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function readPrefs(){try{return{...DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return{...DEFAULTS}}}
function writePrefs(p){localStorage.setItem(KEY,JSON.stringify({...DEFAULTS,...p}))}
function profileGoal(){const cloud=Number(window.NEETPG_CLOUD?.profile?.daily_goal);if(Number.isFinite(cloud)&&cloud>0)return clamp(Math.round(cloud),1,1000);return clamp(Math.round(Number(readPrefs().dailyGoal)||50),1,1000)}
function syncCloudGoal(goal){const cloudInput=document.querySelector('#cloudDailyGoal');if(window.NEETPG_CLOUD?.user&&cloudInput){cloudInput.value=String(goal);document.querySelector('#cloudSaveProfile')?.click()}}
function setDailyGoal(n){const goal=clamp(Math.round(Number(n)||50),1,1000),p=readPrefs();p.dailyGoal=goal;writePrefs(p);syncCloudGoal(goal);panel();return goal}
function savePlan(goalValue){const goal=clamp(Math.round(Number(goalValue)||50),1,1000),p=readPrefs();p.dailyGoal=goal;delete p.examDate;writePrefs(p);syncCloudGoal(goal);panel();return{dailyGoal:goal}}
function goalProgress(){const a=attempts(),now=Date.now(),today=startOfDay(now),week=startOfWeek(now),dailyGoal=profileGoal(),weeklyGoal=dailyGoal*7;const todayDone=a.filter(x=>Number(x.ts||new Date(x.created_at||0).getTime())>=today).length;const weekDone=a.filter(x=>Number(x.ts||new Date(x.created_at||0).getTime())>=week).length;return{dailyGoal,weeklyGoal,todayDone,weekDone,todayRemaining:Math.max(0,dailyGoal-todayDone),weekRemaining:Math.max(0,weeklyGoal-weekDone),todayPercent:Math.round(clamp(todayDone/dailyGoal*100,0,100)),weekPercent:Math.round(clamp(weekDone/weeklyGoal*100,0,100))}}
function srsCalendar(days=14){days=clamp(Math.round(days)||14,1,60);const today=startOfDay(Date.now()),rows=Array.from({length:days},(_,i)=>({date:localDay(today+i*DAY),due:0}));let overdue=0;for(const s of states()){if(!s.dueAt)continue;const due=new Date(s.dueAt).getTime();if(!Number.isFinite(due))continue;if(due<today){overdue++;continue}const i=Math.floor((startOfDay(due)-today)/DAY);if(i>=0&&i<days)rows[i].due++}return{overdue,rows,total:overdue+rows.reduce((n,x)=>n+x.due,0)}}
function balanceSrs(days=7){days=clamp(Math.round(days)||7,1,30);const cal=srsCalendar(days),reviewCap=Math.max(5,Math.round(profileGoal()*.4));let carry=cal.overdue;const rows=cal.rows.map((r,i)=>{let available=reviewCap;const overdueAllocated=Math.min(carry,available);carry-=overdueAllocated;available-=overdueAllocated;const scheduledHandled=Math.min(r.due,available);const deferred=Math.max(0,r.due-scheduledHandled);carry+=deferred;return{day:i,date:r.date,scheduled:r.due,overdueAllocated,scheduledHandled,targetReview:overdueAllocated+scheduledHandled,deferredCarry:carry,reviewCap}});return{reviewCap,initialOverdue:cal.overdue,rows,remainingCarry:carry}}
function weakTopicMap(){const rows=window.NEETPG_PHASE11?.weaknessRows?.('topic')||[];return new Map(rows.map(x=>[x.name,x.weakness]))}
function rankedQuestions(){try{if(typeof getFilteredQuestions==='function')return getFilteredQuestions({mode:'smart',order:'adaptive'})}catch{}return [...questions()]}
function dailyMix(count=profileGoal()){
  count=clamp(Math.round(Number(count)||profileGoal()),1,Math.max(1,questions().length));
  const ranked=rankedQuestions(),weak=weakTopicMap(),now=Date.now();
  const pools={
    due:ranked.filter(q=>{const s=qState(q.external_id),t=s.dueAt?new Date(s.dueAt).getTime():0;return t&&t<=now}),
    incorrect:ranked.filter(q=>qState(q.external_id).lastCorrect===false),
    weak:ranked.filter(q=>(weak.get(q.topic)||0)>=45),
    unseen:ranked.filter(q=>!(qState(q.external_id).attempts||0))
  };
  const duePressure=pools.due.length>=Math.max(5,Math.ceil(count*.5));
  const quotas={due:Math.ceil(count*(duePressure ? .5 : .35)),incorrect:Math.ceil(count*.25),weak:Math.ceil(count*.25),unseen:Math.ceil(count*.15)};
  const picked=[],seen=new Set(),composition={due:0,incorrect:0,weak:0,unseen:0,balanced:0},reasons={};
  const add=(name,limit)=>{for(const q of pools[name]){if(picked.length>=count||composition[name]>=limit)break;if(seen.has(q.external_id))continue;seen.add(q.external_id);picked.push(q);composition[name]++;reasons[q.external_id]=name}};
  add('due',quotas.due);add('incorrect',quotas.incorrect);add('weak',quotas.weak);add('unseen',quotas.unseen);
  for(const q of ranked){if(picked.length>=count)break;if(seen.has(q.external_id))continue;seen.add(q.external_id);picked.push(q);composition.balanced++;reasons[q.external_id]='balanced'}
  return{requested:count,questions:picked,composition,reasons,available:picked.length,formula:'Due first, then incorrect, weak topics, unseen coverage, then balanced adaptive fill.'}
}
function studyPlan(minutes){minutes=clamp(Math.round(Number(minutes)||15),5,180);const secondsPerQuestion=75,target=Math.max(1,Math.floor(minutes*60/secondsPerQuestion)),mix=dailyMix(target);return{minutes,secondsPerQuestion,targetQuestions:target,questions:mix.questions,composition:mix.composition,available:mix.available,note:'Uses 63-second exam pace plus ~12 seconds/question for feedback and transition.'}}
function microSession(minutes=5){minutes=clamp(Math.round(Number(minutes)||5),3,14);return studyPlan(minutes)}
function rollingPlan(days=7){days=clamp(Math.round(days)||7,1,30);const g=goalProgress(),srs=balanceSrs(days),today=Date.now();return srs.rows.map((r,i)=>{const target=i===0?Math.max(0,g.todayRemaining):g.dailyGoal;const retrieval=Math.min(target,r.targetReview);return{date:localDay(today+i*DAY),mcqTarget:target,srsTarget:retrieval,adaptiveTarget:Math.max(0,target-retrieval),carry:r.deferredCarry}})}
function reminderEligibility(){const unique=new Set(attempts().map(a=>localDay(a.ts||a.created_at||Date.now()))).size,total=attempts().length,reliable=unique>=7&&total>=50;return{eligible:reliable,enabled:false,studyDays:unique,attempts:total,reason:reliable?'Planning history is stable enough for a future optional reminder layer.':'Reminders stay off until at least 7 study days and 50 attempts establish a reliable schedule.'}}
function startQueue(queue,label='Adaptive plan'){
  if(!queue?.length){try{toast('No questions available for this plan')}catch{}return false}
  try{if(typeof buildSession!=='function')return false;buildSession(queue,{mode:'smart',subject:'all',topic:'all',difficulty:'all',clinical:'all',integrated:'all',count:queue.length,feedback:'instant',timer:'off',seconds:63,order:'adaptive',shuffle:true,phase12:label});return true}catch{return false}
}
function startPlan(minutes){const p=studyPlan(minutes);return startQueue(p.questions,`${p.minutes}-minute plan`)}
function startToday(){const g=goalProgress(),target=Math.max(5,g.todayRemaining||Math.min(g.dailyGoal,15)),mix=dailyMix(target);return startQueue(mix.questions,'Daily adaptive mix')}
function startMicro(minutes=5){const p=microSession(minutes);return startQueue(p.questions,`${p.minutes}-minute micro-session`)}
function injectStyles(){if(document.querySelector('#phase12Styles'))return;const s=document.createElement('style');s.id='phase12Styles';s.textContent=`#v12Planner{margin:16px 0}.p12-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.p12-metric{padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;background:var(--surface2,#f8fafc)}.p12-metric b{display:block;font-size:21px}.p12-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.p12-calendar{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:10px}.p12-day{padding:8px 4px;border-radius:10px;text-align:center;background:var(--surface2,#f8fafc);font-size:11px}.p12-day b{display:block;font-size:15px}.p12-config{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;margin-top:12px}@media(max-width:800px){.p12-grid{grid-template-columns:1fr}.p12-config{grid-template-columns:1fr}.p12-config button{grid-column:1/-1}.p12-calendar{grid-template-columns:repeat(4,1fr)}}`;
  document.head.appendChild(s)}
function panel(){
  const dash=document.querySelector('#view-dashboard');if(!dash)return false;injectStyles();let host=document.querySelector('#v12Planner');if(!host){host=document.createElement('div');host.id='v12Planner';host.className='card';const hero=dash.querySelector('.hero');hero?hero.insertAdjacentElement('afterend',host):dash.prepend(host)}
  const g=goalProgress(),mix=dailyMix(Math.max(1,Math.min(g.todayRemaining||g.dailyGoal,50))),srs=balanceSrs(7),rem=reminderEligibility();const comp=Object.entries(mix.composition).filter(([,v])=>v).map(([k,v])=>`${v} ${k}`).join(' · ')||'balanced';
  host.innerHTML=`<div class="section-title" style="margin-top:0"><div><h3>Planning & adaptive revision v2</h3><p class="muted small">Daily targets, SRS load balancing and interruption-friendly sessions.</p></div><span class="tag">Phase 12</span></div><div class="p12-grid"><div class="p12-metric"><span class="small muted">Daily</span><b>${g.todayDone}/${g.dailyGoal}</b><span class="small">${g.todayRemaining} remaining</span></div><div class="p12-metric"><span class="small muted">Weekly</span><b>${g.weekDone}/${g.weeklyGoal}</b><span class="small">${g.weekPercent}% complete</span></div><div class="p12-metric"><span class="small muted">SRS backlog</span><b>${srs.initialOverdue}</b><span class="small">cap ${srs.reviewCap}/day</span></div></div><div class="p12-config"><div class="field"><label>Daily MCQ goal</label><input id="p12DailyGoal" type="number" min="1" max="1000" value="${g.dailyGoal}"></div><button class="btn" id="p12Save">Save plan</button></div><div style="margin-top:12px"><strong>Today’s automatic mix</strong><p class="small muted">${esc(comp)}. ${esc(mix.formula)}</p></div><div class="p12-actions"><button class="btn primary" data-p12-today>Start today’s mix</button><button class="btn" data-p12-minutes="15">15 min</button><button class="btn" data-p12-minutes="30">30 min</button><button class="btn" data-p12-minutes="60">60 min</button><button class="btn soft" data-p12-micro="5">5-min micro</button><button class="btn soft" data-p12-micro="10">10-min micro</button></div><div style="margin-top:14px"><strong>SRS workload · next 7 days</strong><div class="p12-calendar">${srs.rows.map((r,i)=>`<div class="p12-day"><span>${i===0?'Today':new Date(`${r.date}T00:00:00`).toLocaleDateString([],{weekday:'short'})}</span><b>${r.targetReview}</b><span>${r.deferredCarry?`${r.deferredCarry} carry`:'reviews'}</span></div>`).join('')}</div></div><p class="tiny muted" style="margin-top:12px">${esc(rem.reason)} Browser reminder notifications are intentionally not requested yet.</p>`;
  host.querySelector('#p12Save').onclick=()=>{const goalValue=host.querySelector('#p12DailyGoal').value;savePlan(goalValue);try{toast('Study plan saved')}catch{}};
  host.querySelector('[data-p12-today]').onclick=()=>startToday();host.querySelectorAll('[data-p12-minutes]').forEach(b=>b.onclick=()=>startPlan(Number(b.dataset.p12Minutes)));host.querySelectorAll('[data-p12-micro]').forEach(b=>b.onclick=()=>startMicro(Number(b.dataset.p12Micro)));
  return true
}
function boot(){setTimeout(panel,900);document.addEventListener('click',e=>{if(e.target.closest('[data-view="dashboard"],[data-v4-target="dashboard"],#refreshDashboard'))setTimeout(panel,120)});window.addEventListener('storage',e=>{if(e.key===KEY)panel()});window.NEETPG_PHASE12={KEY,profileGoal,setDailyGoal,savePlan,goalProgress,srsCalendar,balanceSrs,dailyMix,studyPlan,microSession,rollingPlan,reminderEligibility,startPlan,startToday,startMicro,panel}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
