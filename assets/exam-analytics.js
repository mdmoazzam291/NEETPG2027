/* Pure post-submission analytics; never invoked for an active paper. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.NEETPG_EXAM_ANALYTICS=api;})(typeof window==='undefined'?globalThis:window,()=>{
 'use strict';
 function summarize(questions,responses,preset){
  let correct=0,incorrect=0,unattempted=0;
  questions.forEach((q,i)=>{const s=responses[i]?.selected;if(s==null)unattempted++;else if(s===q.correct)correct++;else incorrect++;});
  const attempted=correct+incorrect,total=questions.length;
  return {correct,incorrect,unattempted,total,score:correct*preset.correctMarks+incorrect*preset.incorrectMarks,maximumMarks:total*preset.correctMarks,
   accuracy:attempted?100*correct/attempted:0,attemptRate:total?100*attempted/total:0};
 }
 function analyze(a){
  if(a.status!=='completed')throw new Error('Results are unavailable during the examination');
  const p=a.preset,qs=a.questions,rs=a.responses,overall=summarize(qs,rs,p);
  if(overall.total!==p.totalQuestions||overall.score!==a.result.score)throw new Error('Result consistency check failed');
  const sections=[],groups={},buckets={'0–30 sec':0,'31–60 sec':0,'61–90 sec':0,'91–120 sec':0,'>120 sec':0},changes={correctToIncorrect:0,incorrectToCorrect:0,incorrectToIncorrect:0};
  const measured=rs.map(r=>r.timeSpent||0).filter(t=>t>0).sort((x,y)=>x-y),median=measured.length?measured[Math.floor(measured.length/2)]:0;
  const timeSinks=[];
  qs.forEach((q,i)=>{
   const r=rs[i],s=r.selected,sec=Math.floor(i/p.questionsPerSection),time=r.timeSpent||0;
   if(!sections[sec])sections[sec]={...summarize(qs.slice(sec*p.questionsPerSection,(sec+1)*p.questionsPerSection),rs.slice(sec*p.questionsPerSection,(sec+1)*p.questionsPerSection),p),reviewCount:0,answerChanges:0,timeSpent:0,last5Count:0,last5Correct:0,final2Attempts:0};
   const x=sections[sec];x.reviewCount+=r.review?1:0;x.timeSpent+=time;
   const end=Date.parse(a.examStartedAt)+(sec+1)*p.sectionDurationSeconds*1000;
   const last=Date.parse(r.answeredAt||'');
   if(s!=null&&last>=end-300000){x.last5Count++;if(s===q.correct)x.last5Correct++;}
   if(s!=null&&last>=end-120000)x.final2Attempts++;
   for(const h of r.changes||[]){if(h.from==null||h.to==null)continue;x.answerChanges++;
    if(h.from===q.correct&&h.to!==q.correct)changes.correctToIncorrect++;
    else if(h.from!==q.correct&&h.to===q.correct)changes.incorrectToCorrect++;
    else if(h.from!==q.correct&&h.to!==q.correct)changes.incorrectToIncorrect++;
   }
   if(time>0){buckets[time<=30?'0–30 sec':time<=60?'31–60 sec':time<=90?'61–90 sec':time<=120?'91–120 sec':'>120 sec']++;
    if(time>Math.max(120,median*2))timeSinks.push({position:i,seconds:time});}
   for(const field of ['subject','system','topic','exam_type','difficulty']){
    groups[field]??={};const name=String(q[field]??'Unclassified');const g=groups[field][name]??={total:0,attempted:0,correct:0,time:0};
    g.total++;g.time+=time;if(s!=null){g.attempted++;if(s===q.correct)g.correct++;}
   }
  });
  return {overall,sections,groups,buckets,changes,timeSinks,measuredQuestions:measured.length};
 }
 return {summarize,analyze};
});
