const RELEASE='2026-09-21-account-delete-v8';
const CACHE_PREFIX='neetpg2027-';
const CACHE=`${CACHE_PREFIX}${RELEASE}`;
const ASSETS=[
  './','./index.html','./manifest.webmanifest','./assets/app-icon.svg','./assets/auth-hero.svg',
  './assets/app.css','./assets/ui-v4.css','./assets/exam-v9.css','./assets/phase13.css','./assets/auth-v2.css','./assets/auth-launch.css',
  './assets/app.js','./assets/review-hotfix.js','./assets/neetpg-timer.js',
  './assets/supabase-config.js','./assets/phase13-preauth.js','./assets/auth-sync.js','./assets/auth-provider-guard.js','./assets/auth-v2.js','./assets/auth-launch.js',
  './assets/ui-v4.js','./assets/exam-analytics.js','./assets/exam-v9.js','./assets/phase10-taxonomy.js','./assets/pyq-metadata.js',
  './assets/phase11-analytics.js','./assets/phase11-exam-overlay.js','./assets/phase12-planning.js','./assets/phase13-hardening.js',
  './data/pyq/manifest.json',
  './neuralvault/index.html','./neuralvault/theme.js','./neuralvault/vault.css','./neuralvault/vault.js','./neuralvault/vault-db.js','./neuralvault/medical.js','./neuralvault/intelligence.js','./neuralvault/brain.js','./neuralvault/provider.js'
];

async function prime(){
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS);
  try{
    const manifestResponse=await fetch('./data/pyq/manifest.json',{cache:'no-store'});
    if(manifestResponse.ok){
      const manifest=await manifestResponse.clone().json();
      const files=Array.isArray(manifest)?manifest:manifest.files;
      await cache.put('./data/pyq/manifest.json',manifestResponse);
      if(Array.isArray(files)&&files.length){
        await cache.addAll(files.map(f=>`./${String(f)}`));
      }
    }
  }catch(e){console.warn('Question bundle pre-cache skipped',e)}
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await prime();

  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function boundedFetch(request,options={}){const control=new AbortController(),timer=setTimeout(()=>control.abort(),3500);try{const r=await fetch(request,{...options,signal:control.signal});if(!r.ok)throw new Error('Resource unavailable');return r}finally{clearTimeout(timer)}}
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);const canonical=new URL(url);canonical.searchParams.delete('v');const cacheKey=canonical.href;
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const neuralVault=url.pathname.endsWith('/neuralvault/')||url.pathname.endsWith('/neuralvault/index.html');
      try{
        const fresh=await boundedFetch(event.request);
        const cache=await caches.open(CACHE);
        cache.put(neuralVault?'./neuralvault/index.html':'./index.html',fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await caches.match(cacheKey)) || (neuralVault?await caches.match('./neuralvault/index.html'):null) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  const freshShell =
    event.request.destination==='script' ||
    event.request.destination==='style' ||
    /\.(?:js|css|webmanifest)$/.test(url.pathname);

  if(freshShell){
    event.respondWith((async()=>{
      try{
        const fresh=await boundedFetch(event.request,{cache:'no-store'});
        if(fresh.ok){
          const cache=await caches.open(CACHE);
          cache.put(cacheKey,fresh.clone()).catch(()=>{});
        }
        return fresh;
      }catch{
        return (await caches.match(cacheKey)) || new Response('Offline resource unavailable',{status:503,statusText:'Offline'});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(cacheKey);
    if(cached)return cached;
    try{
      const fresh=await boundedFetch(event.request);
      if(fresh.ok){
        const cache=await caches.open(CACHE);
        cache.put(cacheKey,fresh.clone()).catch(()=>{});
      }
      return fresh;
    }catch{
      return new Response('Offline resource unavailable',{status:503,statusText:'Offline'});
    }
  })());
});

self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(type==='SKIP_WAITING')self.skipWaiting();
  if(type==='REFRESH_CACHE')event.waitUntil((async()=>{await prime();})());
  if(type==='GET_VERSION')event.source?.postMessage({type:'APP_VERSION',release:RELEASE});
});

