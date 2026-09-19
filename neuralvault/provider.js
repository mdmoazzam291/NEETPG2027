(() => {
  'use strict';

  const KEY='neuralvault:brain-provider-v1';
  const TOKEN_KEY='neuralvault:brain-gateway-token';

  function settings(){
    try{
      const raw=JSON.parse(localStorage.getItem(KEY)||'{}');
      return { backendUrl:String(raw.backendUrl||'').trim().replace(/\/$/,'') };
    }catch(_){
      return { backendUrl:'' };
    }
  }

  function save(next){
    const clean={backendUrl:String(next.backendUrl||'').trim().replace(/\/$/,'')};
    localStorage.setItem(KEY,JSON.stringify(clean));
    if(Object.prototype.hasOwnProperty.call(next,'accessToken')){
      const token=String(next.accessToken||'');
      if(token)sessionStorage.setItem(TOKEN_KEY,token);
      else sessionStorage.removeItem(TOKEN_KEY);
    }
    return clean;
  }

  function accessToken(){
    return sessionStorage.getItem(TOKEN_KEY)||'';
  }

  function configuredBase(){
    const saved=settings().backendUrl;
    if(saved)return saved;
    if(location.hostname==='localhost'||location.hostname==='127.0.0.1')return location.origin;
    return '';
  }

  async function fetchWithTimeout(url,options={},timeout=8000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      return await fetch(url,{...options,signal:controller.signal});
    }finally{
      clearTimeout(timer);
    }
  }

  async function providers(){
    const base=configuredBase();
    if(!base)return {base:'',local_evidence:true,providers:[]};
    try{
      const r=await fetchWithTimeout(base+'/ai/providers',{headers:{Accept:'application/json'}},6000);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const data=await r.json();
      return {
        base,
        local_evidence:true,
        gateway_ready:Boolean(data.gateway_ready),
        providers:Array.isArray(data.providers)?data.providers:[]
      };
    }catch(e){
      return {base,local_evidence:true,gateway_ready:false,providers:[],error:e.name==='AbortError'?'timeout':String(e.message||e)};
    }
  }

  async function generate(provider,prompt,maxOutputTokens=1200){
    const base=configuredBase();
    if(!base)throw new Error('No Brain backend configured');
    const token=accessToken();
    if(!token)throw new Error('Brain gateway token is required for remote models');
    const r=await fetchWithTimeout(base+'/ai/generate',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Accept':'application/json',
        'X-NeuralVault-Token':token
      },
      body:JSON.stringify({
        provider,
        prompt:String(prompt||'').slice(0,50000),
        max_output_tokens:maxOutputTokens
      })
    },60000);
    let data={};
    try{data=await r.json()}catch(_){}
    if(!r.ok)throw new Error(data.detail||('Provider HTTP '+r.status));
    if(!data.text)throw new Error('Provider returned no text');
    return data;
  }

  window.NeuralVaultProvider={settings,save,accessToken,configuredBase,providers,generate};
})();