(() => {
  'use strict';
  const $ = s => document.querySelector(s);

  // Core navigate() updates #topTitle on every route. UI v4 visually replaces that
  // heading, but the legacy function still needs a harmless target to write into.
  function ensureCoreTitle(){
    if($('#topTitle')) return;
    const title=document.createElement('h1');
    title.id='topTitle';
    title.hidden=true;
    title.setAttribute('aria-hidden','true');
    ($('.topbar')||document.body).appendChild(title);
  }
  ensureCoreTitle();

  const choose = (id, value) => {
    const el=$(id); if(!el) return;
    if([...el.options].some(o=>o.value===String(value))) el.value=String(value);
  };

  function coreReady(){
    try{
      ensureCoreTitle();
      return typeof app!=='undefined' && Array.isArray(app.questions) && app.questions.length>0 &&
        typeof navigate==='function' && typeof bankFilter==='function' &&
        typeof sessionConfigFromForm==='function' && typeof startSessionFromConfig==='function';
    }catch{return false;}
  }
  function whenCoreReady(fn, tries=0){
    if(coreReady()){
      document.body.dataset.v4ready='1';
      requestAnimationFrame(()=>setTimeout(fn,30));
      return;
    }
    if(tries>200)return;
    setTimeout(()=>whenCoreReady(fn,tries+1),50);
  }
  whenCoreReady(()=>{});

  document.addEventListener('keydown', e => {
    if(e.target?.id !== 'v4SearchInput' || e.key !== 'Enter' || window.NEETPG_V4_GLOBAL_SEARCH) return;
    const query=e.target.value.trim(); if(!query) return;
    e.preventDefault(); e.stopImmediatePropagation();
    whenCoreReady(()=>{
      ensureCoreTitle();
      navigate('bank');
      const input=$('#bankSearch'); if(!input)return;
      input.value=query;
      bankFilter();
    });
  }, true);

  document.addEventListener('click', e => {
    const btn=e.target.closest?.('[data-v4-quick]'); if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const mode=btn.dataset.v4Quick;
    whenCoreReady(()=>{
      ensureCoreTitle();
      navigate('practice');
      if(mode==='rapid') { choose('#pMode','smart'); choose('#pCount','15'); choose('#pFeedback','instant'); }
      if(mode==='errors') { choose('#pMode','incorrect'); choose('#pCount','15'); choose('#pFeedback','instant'); }
      if(mode==='mock') { choose('#pMode','all'); choose('#pCount','100'); choose('#pFeedback','exam'); choose('#pOrder','random'); }
      if(mode==='smart') { choose('#pMode','smart'); choose('#pCount','25'); choose('#pFeedback','instant'); }
      choose('#pTimer','neetpg');
      startSessionFromConfig(sessionConfigFromForm());
    });
  }, true);
})();
