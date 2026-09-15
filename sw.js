const CACHE='neetpg2027-v9-2026-09-15-exam1';
const ASSETS=['./','./index.html','./assets/app.css','./assets/ui-v4.css','./assets/app.js','./assets/ui-v4-core-compat.js','./assets/neetpg-timer.js','./assets/supabase-config.js','./assets/auth-sync.js','./assets/auth-provider-guard.js','./assets/ui-v4.js','./assets/ui-v4-fixes.js','./assets/exam-v9.css','./assets/exam-v9.js','./manifest.webmanifest','./data/high_yield_100/part01.json','./data/high_yield_100/part02.json','./data/high_yield_100/part03.json','./data/high_yield_100/part04.json'];
async function prime(){const c=await caches.open(CACHE);await c.addAll(ASSETS)}
self.addEventListener('install',e=>{e.waitUntil(prime().then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k.startsWith('neetpg2027-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match('./index.html'))))});
self.addEventListener('message',e=>{if(e.data?.type==='REFRESH_CACHE')e.waitUntil(caches.delete(CACHE).then(prime))});
