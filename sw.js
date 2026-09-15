const RELEASE='2026-09-15-phase13-1';
const CACHE_PREFIX='neetpg2027-';
const CACHE=`${CACHE_PREFIX}${RELEASE}`;
const ASSETS=[
  './','./index.html','./manifest.webmanifest','./assets/app-icon.svg',
  './assets/app.css','./assets/ui-v4.css','./assets/exam-v9.css','./assets/phase13.css',
  './assets/app.js','./assets/ui-v4-core-compat.js','./assets/neetpg-timer.js',
  './assets/supabase-config.js','./assets/phase13-preauth.js','./assets/auth-sync.js','./assets/auth-provider-guard.js',
  './assets/ui-v4.js','./assets/ui-v4-fixes.js','./assets/exam-v9.js','./assets/phase10-taxonomy.js',
  './assets/phase11-analytics.js','./assets/phase11-exam-overlay.js','./assets/phase12-planning.js','./assets/phase13-hardening.js',
  './data/high_yield_100/part01.json','./data/high_yield_100/part02.json','./data/high_yield_100/part03.json','./data/high_yield_100/part04.json'
];

async function prime(){
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS);
}

self.addEventListener('install',event=>{
  event.waitUntil(prime());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;

  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(event.request);
        const cache=await caches.open(CACHE);
        cache.put('./index.html',fresh.clone()).catch(()=>{});
        return fresh;
      }catch{
        return (await caches.match(event.request)) || (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    try{
      const fresh=await fetch(event.request);
      if(fresh.ok){
        const cache=await caches.open(CACHE);
        cache.put(event.request,fresh.clone()).catch(()=>{});
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
  if(type==='REFRESH_CACHE')event.waitUntil((async()=>{await caches.delete(CACHE);await prime();})());
  if(type==='GET_VERSION')event.source?.postMessage({type:'APP_VERSION',release:RELEASE});
});
