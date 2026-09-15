(() => {
  'use strict';

  const SYSTEM_RULES = [
    [/cardio|heart|vascular|hypertension|ecg|shock|aortic|coronary/i,'Cardiovascular'],
    [/respir|pulmon|lung|asthma|copd|pleura|oxygen/i,'Respiratory'],
    [/renal|kidney|neph|urinary|bladder|prostate/i,'Renal & Genitourinary'],
    [/gastro|liver|hepatic|biliary|pancrea|bowel|colon|stomach|esoph|inguinal/i,'Gastrointestinal & Hepatobiliary'],
    [/neuro|brain|cranial|cavernous|brachial|spinal|seiz|stroke|mening/i,'Nervous System'],
    [/endocr|thyroid|adrenal|pituitary|diabet|insulin|calcium/i,'Endocrine'],
    [/hemat|blood|anemia|leuk|lymph|coag|platelet|amyloid|myeloproliferative/i,'Hematology & Oncology'],
    [/repro|obstet|gynec|pregnan|uter|ovary|test|breast/i,'Reproductive'],
    [/musculo|bone|joint|fracture|ortho|rheum/i,'Musculoskeletal'],
    [/skin|dermat|cutaneous/i,'Dermatology'],
    [/eye|ophthal|retina|glaucoma/i,'Ophthalmology'],
    [/ear|nose|throat|ent|laryn/i,'ENT'],
    [/infection|micro|bacter|virus|fung|paras|tubercul|immun/i,'Infectious Disease & Immunology'],
    [/metabol|enzyme|vitamin|nutrition|urea|purine|amino acid|hmp/i,'Metabolism & Nutrition']
  ];

  const inferSystem = q => {
    if (q.system) return String(q.system).trim();
    const hay = `${q.subject||''} ${q.topic||''} ${q.stem||''}`;
    const hit = SYSTEM_RULES.find(([rx]) => rx.test(hay));
    return hit ? hit[1] : 'General / Cross-system';
  };

  const enrich = q => {
    q.system = inferSystem(q);
    q.subtopic = String(q.subtopic || q.topic || 'General').trim();
    q.verification_status = q.verification_status || (/medically unverified/i.test(q.reference_text||'') ? 'unverified' : 'unverified');
    q.provenance = q.provenance || {
      origin: q.source === 'custom' ? 'custom_import' : 'repository_authored',
      source_kind: /not a recalled pyq/i.test(q.reference_text||'') ? 'original_exam_style' : 'unspecified',
      content_version: q.content_version || 1,
      reviewed_by: null,
      reviewed_at: null
    };
    return q;
  };

  function optionList(values, label) {
    return `<option value="all">All ${label}</option>` + values.map(v=>`<option>${escapeHtml(v)}</option>`).join('');
  }

  function installControls(){
    const pTopic = document.querySelector('#pTopic');
    if (pTopic && !document.querySelector('#pSystem')) {
      const wrap=document.createElement('div'); wrap.className='field';
      wrap.innerHTML='<label>System</label><select id="pSystem"><option value="all">All systems</option></select>';
      pTopic.closest('.field').before(wrap);
    }
    const bankSubject=document.querySelector('#bankSubject');
    if (bankSubject && !document.querySelector('#bankSystem')) {
      const el=document.createElement('select'); el.id='bankSystem'; el.innerHTML='<option value="all">All systems</option>';
      bankSubject.after(el);
    }
  }

  function repopulateSystems(){
    if (!window.app?.questions?.length) return;
    app.questions.forEach(enrich);
    const systems=[...new Set(app.questions.map(q=>q.system))].sort();
    for(const id of ['pSystem','bankSystem']){
      const el=document.querySelector(`#${id}`); if(!el) continue;
      const cur=el.value; el.innerHTML=optionList(systems,'systems');
      if([...el.options].some(o=>o.value===cur)) el.value=cur;
    }
  }

  function updateDependentTopics(){
    const sub=document.querySelector('#pSubject')?.value || 'all';
    const sys=document.querySelector('#pSystem')?.value || 'all';
    const el=document.querySelector('#pTopic'); if(!el) return;
    const cur=el.value;
    const topics=[...new Set(app.questions.filter(q=>(sub==='all'||q.subject===sub)&&(sys==='all'||q.system===sys)).map(q=>q.topic))].sort();
    el.innerHTML=optionList(topics,'topics');
    if([...el.options].some(o=>o.value===cur)) el.value=cur;
  }

  function patchCore(){
    if(typeof window.sessionConfigFromForm==='function'){
      const original=window.sessionConfigFromForm;
      window.sessionConfigFromForm=function(){return {...original(),system:document.querySelector('#pSystem')?.value||'all'};};
    }
    if(typeof window.getFilteredQuestions==='function'){
      const original=window.getFilteredQuestions;
      window.getFilteredQuestions=function(cfg={}){let qs=original(cfg);if(cfg.system&&cfg.system!=='all')qs=qs.filter(q=>enrich(q).system===cfg.system);return qs;};
    }
    if(typeof window.builtInPreset==='function'){
      const original=window.builtInPreset;
      window.builtInPreset=function(name){return {...original(name),system:'all'};};
    }
    if(typeof window.setPracticeForm==='function'){
      const original=window.setPracticeForm;
      window.setPracticeForm=function(c){original(c);const el=document.querySelector('#pSystem');if(el)el.value=c.system||'all';updateDependentTopics();};
    }
    if(typeof window.bankFilter==='function'){
      const original=window.bankFilter;
      window.bankFilter=function(){
        original();
        const sys=document.querySelector('#bankSystem')?.value||'all';
        if(sys==='all')return;
        app.filteredBank=app.filteredBank.filter(q=>enrich(q).system===sys);
        const ids=new Set(app.filteredBank.map(q=>q.external_id));
        document.querySelectorAll('#bankBody tr').forEach(tr=>{const btn=tr.querySelector('[data-practice-q]');if(btn&&!ids.has(btn.dataset.practiceQ))tr.remove();});
        const count=document.querySelector('#bankCount');if(count)count.textContent=`${app.filteredBank.length} of ${app.questions.length} questions`;
      };
    }
  }

  function boot(){
    installControls(); patchCore();
    const wait=setInterval(()=>{
      if(!window.app?.questions?.length)return;
      clearInterval(wait);repopulateSystems();updateDependentTopics();
      document.querySelector('#pSubject')?.addEventListener('change',updateDependentTopics);
      document.querySelector('#pSystem')?.addEventListener('change',updateDependentTopics);
      document.querySelector('#bankSystem')?.addEventListener('input',()=>window.bankFilter?.());
      window.bankFilter?.();
      window.NEETPG_PHASE10={version:1,enrich,inferSystem,repopulateSystems};
    },50);
    setTimeout(()=>clearInterval(wait),10000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
