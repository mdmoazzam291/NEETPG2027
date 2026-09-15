(() => {
'use strict';
const PACE=63;
function examQuestionIds(){
  const e=window.NEETPG_EXAM9?.state;
  return e?.sections?.flatMap(s=>s.questions||[])||[];
}
function latestAttempt(qid,sessionId){
  try{
    if(typeof app==='undefined'||!Array.isArray(app.attempts))return null;
    return [...app.attempts].reverse().find(a=>a.qid===qid&&(!sessionId||a.sessionId===sessionId))||null;
  }catch{return null;}
}
function apply(){
  const review=document.querySelector('.exam9-review');
  if(!review)return false;
  const e=window.NEETPG_EXAM9?.state, ids=examQuestionIds();
  review.querySelectorAll('.exam9-review-card').forEach((card,i)=>{
    if(card.querySelector('.phase11-exam-overlay'))return;
    const a=latestAttempt(ids[i],e?.id), sec=Number(a?.elapsed||a?.elapsed_seconds||0), conf=a?.confidence;
    const result=card.classList.contains('correct')?'Correct':card.classList.contains('skipped')?'Skipped':'Incorrect';
    const pace=sec?`${sec}s · ${sec<=PACE?'within 63s pace':'over 63s pace'}`:'timing not captured';
    const confidence=conf?`confidence ${conf}/5`:'confidence not captured in exam mode';
    const el=document.createElement('div');
    el.className='phase11-exam-overlay';
    el.style.cssText='margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(15,118,110,.08);font-size:12px';
    el.textContent=`Analytics: ${result} · ${pace} · ${confidence}`;
    card.appendChild(el);
  });
  return true;
}
const observer=new MutationObserver(()=>apply());
function boot(){
  const body=document.querySelector('#exam9Body')||document.body;
  observer.observe(body,{childList:true,subtree:true});
  apply();
  window.NEETPG_PHASE11_EXAM={apply,PACE};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
