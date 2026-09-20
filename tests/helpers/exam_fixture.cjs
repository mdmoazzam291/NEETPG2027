// API contract fixture. Server enforcement is tested separately by exam_server.sql.
const {expect}=require('@playwright/test');
async function fixture(context){
 let state=null,now=Date.now(),offline=false;
 const p={version:'neetpg-180-v1',mode:'full',totalQuestions:180,maximumMarks:720,numberOfSections:5,questionsPerSection:36,sectionDurationSeconds:2520,totalDurationSeconds:12600,correctMarks:4,incorrectMarks:-1};
 const questions=Array.from({length:180},(_,i)=>({id:`fixture-${i}`,stem:`Synthetic clinical test question ${i+1}: choose the best option.`,correct:'A',subject:'Medicine',system:'Clinical',topic:'Test topic',difficulty:2,exam_type:'Management',options:['A','B','C','D'].map(label=>({label,text:`Option ${label}`})),answer_explanation:'Test explanation.'}));
 function view(){
  if(!state)return null;const sec=Math.min(p.numberOfSections,Math.floor((now-state.start)/(p.sectionDurationSeconds*1000)));
  if(sec!==state.activeSection){state.activeSection=sec;state.currentPosition=Math.min(sec*36,p.totalQuestions-1);state.version++;}
  if(sec===p.numberOfSections){state.status='completed';const c=state.responses.filter(r=>r.selected==='A').length,w=state.responses.filter(r=>r.selected!=null&&r.selected!=='A').length;state.result={score:4*c-w,correct:c,incorrect:w,unattempted:p.totalQuestions-c-w,accuracy:c+w?100*c/(c+w):0,attemptRate:100*(c+w)/p.totalQuestions};}
  const completed=state.status==='completed';const offset=sec*36;
  return {...state,preset:{...p},examStartedAt:new Date(state.start).toISOString(),examExpiresAt:new Date(state.start+p.totalDurationSeconds*1000).toISOString(),sectionExpiresAt:new Date(state.start+Math.min(sec+1,p.numberOfSections)*2520000).toISOString(),completedAt:completed?new Date(state.start+p.totalDurationSeconds*1000).toISOString():null,
   questions:completed?questions.slice(0,p.totalQuestions):questions.slice(offset,offset+36).map(({correct,subject,topic,system,difficulty,exam_type,answer_explanation,...q},i)=>({...q,position:offset+i})),responses:completed?state.responses:state.responses.slice(offset,offset+36)};
 }
 await context.route('**/__exam_rpc',async route=>{
  if(offline)return route.abort();const {action,payload,expected_version}=route.request().postDataJSON();let error=null;
  if(action==='start'&&!state){if(payload.presetVersion.includes('drill'))Object.assign(p,{mode:'drill',totalQuestions:36,maximumMarks:144,numberOfSections:1,totalDurationSeconds:2520});state={id:'fixture-attempt',start:now,status:'active',activeSection:0,currentPosition:0,version:0,responses:Array.from({length:p.totalQuestions},()=>({selected:null,visited:false,review:false,timeSpent:0,changes:[]}))};state.responses[0].visited=true;}
  view();
  if(action==='mutate'){
   if(state.status==='completed')error='ATTEMPT_COMPLETED';else if(expected_version!==state.version)error='STALE_VERSION';
   else if(Math.floor(payload.position/36)!==state.activeSection)error='SECTION_LOCKED';else{
    const r=state.responses[payload.position];if('selected'in payload){r.changes.push({from:r.selected,to:payload.selected,at:new Date(now).toISOString()});r.selected=payload.selected;r.answeredAt=new Date(now).toISOString();}if('review'in payload)r.review=payload.review;
    r.visited=true;state.currentPosition=payload.navigate??payload.position;state.responses[state.currentPosition].visited=true;state.version++;
   }
  }
  const output={attempt:view(),serverNow:new Date(now).toISOString(),error};
  if(action==='history'){delete output.attempt;output.history=state?[{id:state.id,preset:p,status:state.status,result:state.result,started_at:new Date(state.start).toISOString()}]:[];}
  await route.fulfill({json:output});
 });
 return {advance:seconds=>{now=state.start+seconds*1000;},offline:value=>offline=value,get:()=>view()};
}
async function connect(page,{built=false}={}){
 await page.goto('/');await expect.poll(()=>page.evaluate(()=>typeof app!=='undefined'?app.questions.length:0)).toBeGreaterThan(0);
 if(!built){await page.addStyleTag({url:'/assets/exam-v9.css'});await page.addScriptTag({url:'/assets/exam-analytics.js'});await page.addScriptTag({url:'/assets/exam-v9.js'});}
 await page.evaluate(()=>Object.defineProperty(window,'NEETPG_CLOUD',{configurable:true,value:{user:{id:'fixture-user'},client:{rpc:async(name,params)=>{const response=await fetch('/__exam_rpc',{method:'POST',body:JSON.stringify(params)});return {data:await response.json(),error:null};}}}}));
 await page.evaluate(()=>window.NEETPG_EXAM9.open());await expect(page.locator('#exam9Full')).toBeVisible();
}
async function begin(page,drill=false){await page.click(drill?'#exam9Drill':'#exam9Full');await expect(page.locator('#exam9Begin')).toBeDisabled();await page.check('#exam9Consent');await page.click('#exam9Begin');await expect(page.locator('#exam9QuestionTitle')).toHaveText('Question 1 of 36');}
module.exports={fixture,connect,begin};
