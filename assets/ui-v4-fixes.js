(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const choose = (id, value) => {
    const el=$(id); if(!el) return;
    if([...el.options].some(o=>o.value===String(value))) el.value=String(value);
  };

  function coreReady(){
    try{return typeof app!=='undefined' && Array.isArray(app.questions) && app.questions.length>0 && typeof navigate==='function' && !!$('#startCustom');}
    catch{return false;}
  }
  function whenCoreReady(fn, tries=0){
    if(coreReady()){
      document.body.dataset.v4ready='1';
      // One extra frame lets core init finish event binding/rendering.
      requestAnimationFrame(()=>setTimeout(fn,40));
      return;
    }
    if(tries>200)return;
    setTimeout(()=>whenCoreReady(fn,tries+1),50);
  }
  whenCoreReady(()=>{});

  document.addEventListener('keydown', e => {
    if(e.target?.id !== 'v4SearchInput' || e.key !== 'Enter') return;
    const query=e.target.value.trim(); if(!query) return;
    e.preventDefault(); e.stopImmediatePropagation();
    whenCoreReady(()=>{
      navigate('bank');
      setTimeout(()=>{
        const input=$('#bankSearch'); if(!input) return;
        input.value=query;
        input.dispatchEvent(new Event('input',{bubbles:true}));
      },80);
    });
  }, true);

  document.addEventListener('click', e => {
    const btn=e.target.closest?.('[data-v4-quick]'); if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const mode=btn.dataset.v4Quick;
    whenCoreReady(()=>{
      navigate('practice');
      setTimeout(()=>{
        if(mode==='rapid') { choose('#pMode','smart'); choose('#pCount','15'); choose('#pFeedback','instant'); }
        if(mode==='errors') { choose('#pMode','incorrect'); choose('#pCount','15'); choose('#pFeedback','instant'); }
        if(mode==='mock') { choose('#pMode','all'); choose('#pCount','100'); choose('#pFeedback','exam'); choose('#pOrder','random'); }
        if(mode==='smart') { choose('#pMode','smart'); choose('#pCount','25'); choose('#pFeedback','instant'); }
        choose('#pTimer','neetpg');
        $('#startCustom')?.click();
      },100);
    });
  }, true);
})();
