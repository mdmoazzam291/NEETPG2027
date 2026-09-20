const {test}=require('node:test'),assert=require('node:assert/strict'),{summarize,analyze}=require('../assets/exam-analytics.js');
const preset={totalQuestions:180,correctMarks:4,incorrectMarks:-1,questionsPerSection:36,numberOfSections:5,sectionDurationSeconds:2520};
const questions=Array.from({length:180},()=>({correct:'A',subject:'Medicine'}));
for(const [c,w,score] of [[180,0,720],[0,180,-180],[100,50,350],[100,0,400],[0,0,0]])test(`scoring ${c}/${w}`,()=>{
 const responses=questions.map((_,i)=>({selected:i<c?'A':i<c+w?'B':null,review:true}));const r=summarize(questions,responses,preset);assert.equal(r.score,score);assert.equal(r.correct+r.incorrect+r.unattempted,180);assert.ok(Number.isFinite(r.accuracy));
});
test('answered review, changes and unknown telemetry handled without causal claims',()=>{
 const responses=questions.map(()=>({selected:null,timeSpent:0,changes:[]}));responses[0]={selected:'A',review:true,timeSpent:150,changes:[{from:'B',to:'A'},{from:'A',to:'B'},{from:'B',to:'C'}]};
 const a=analyze({status:'completed',preset,questions,responses,result:{score:4},examStartedAt:'2026-01-01T00:00:00Z'});assert.equal(a.sections[0].score,4);assert.equal(a.changes.correctToIncorrect,1);assert.equal(a.changes.incorrectToCorrect,1);assert.equal(a.changes.incorrectToIncorrect,1);assert.equal(a.measuredQuestions,1);assert.equal(a.sections.length,5);
});
test('active attempts cannot expose analysis',()=>assert.throws(()=>analyze({status:'active'})));
