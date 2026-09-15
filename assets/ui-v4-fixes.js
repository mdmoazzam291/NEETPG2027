(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const choose = (id, value) => {
    const el=$(id); if(!el) return;
    if([...el.options].some(o=>o.value===String(value))) el.value=String(value);
  };

  // Run search after the target view's renderer has completed, so renderBank cannot
  // overwrite the query we are carrying from the global search bar.
  document.addEventListener('keydown', e => {
    if(e.target?.id !== 'v4SearchInput' || e.key !== 'Enter') return;
    const query=e.target.value.trim(); if(!query) return;
    setTimeout(() => {
      if(typeof navigate==='function') navigate('bank');
      requestAnimationFrame(() => {
        const input=$('#bankSearch'); if(!input) return;
        input.value=query;
        input.dispatchEvent(new Event('input',{bubbles:true}));
      });
    }, 0);
  }, true);

  // Capture quick-start taps before the decorative dashboard handler. This makes
  // launching deterministic on iPad/Safari and while timer enhancements initialize.
  document.addEventListener('click', e => {
    const btn=e.target.closest?.('[data-v4-quick]'); if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const mode=btn.dataset.v4Quick;
    if(typeof navigate==='function') navigate('practice');
    setTimeout(() => {
      if(mode==='rapid') { choose('#pMode','smart'); choose('#pCount','15'); choose('#pFeedback','instant'); }
      if(mode==='errors') { choose('#pMode','incorrect'); choose('#pCount','15'); choose('#pFeedback','instant'); }
      if(mode==='mock') { choose('#pMode','all'); choose('#pCount','100'); choose('#pFeedback','exam'); choose('#pOrder','random'); }
      if(mode==='smart') { choose('#pMode','smart'); choose('#pCount','25'); choose('#pFeedback','instant'); }
      choose('#pTimer','neetpg');
      const start=$('#startCustom');
      if(start) start.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
    }, 80);
  }, true);
})();
