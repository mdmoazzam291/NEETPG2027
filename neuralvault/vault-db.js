(() => {
  'use strict';

  const DB_NAME = 'neuralvault-v2';
  const DB_VERSION = 2;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', {keyPath:'id'});
        if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('revisions')) {
          const store = db.createObjectStore('revisions', { keyPath: 'id', autoIncrement: true });
          store.createIndex('noteId', 'noteId', { unique: false });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      req.onsuccess = () => {req.result.onversionchange=()=>req.result.close();resolve(req.result)};
      req.onerror = () => {dbPromise=null;reject(req.error)};
    });
    return dbPromise;
  }

  async function request(storeName, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = action(store);
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Storage transaction failed"));
    });
  }

  let writeQueue=Promise.resolve();
  async function loadState() {
    const meta=await request('vault','readonly',s=>s.get('metadata'));
    if(meta){const notes=await request('notes','readonly',s=>s.getAll());const byId=new Map(notes.map(n=>[n.id,n]));return {...meta.state,notes:meta.ids.map(id=>byId.get(id)).filter(Boolean)}}
    const row=await request('vault','readonly',s=>s.get('primary'));
    return row?.state||null;
  }
  function saveState(state) {
    const snapshot=structuredClone(state);snapshot.savedAt=Date.now();
    const work=async()=>{
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(['notes','vault'],'readwrite'),notes=tx.objectStore('notes'),vault=tx.objectStore('vault');
        const req=notes.getAll();
        req.onsuccess=()=>{const old=new Map(req.result.map(n=>[n.id,n]));for(const note of snapshot.notes||[]){if(JSON.stringify(old.get(note.id))!==JSON.stringify(note))notes.put(note);old.delete(note.id)}for(const id of old.keys())notes.delete(id);const {notes:_,...metadata}=snapshot;vault.put({key:'metadata',state:metadata,ids:(snapshot.notes||[]).map(n=>n.id)})};
        tx.oncomplete=()=>resolve(snapshot.savedAt);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Vault save failed'));
      });
    };
    writeQueue=writeQueue.catch(()=>{}).then(work);return writeQueue;
  }
  async function exportRevisions(){return request('revisions','readonly',s=>s.getAll())}
  async function importRevisions(rows){const existing=await exportRevisions(),key=r=>[r.noteId,r.savedAt,r.content].join('|'),known=new Set(existing.map(key));for(const r of rows||[]){if(!r.noteId||known.has(key(r)))continue;const {id,...row}=r;await request('revisions','readwrite',s=>s.add(row));known.add(key(r))}}

  async function checkpoint(note, reason = 'autosave') {
    if (!note || !note.id) return;
    const lastKey = 'nv:last-revision:' + note.id;
    const last = Number(sessionStorage.getItem(lastKey) || 0);
    const t = Date.now();
    if (reason === 'autosave' && t - last < 5 * 60 * 1000) return;
    await request('revisions', 'readwrite', store => store.add({
      noteId: note.id,
      title: note.title,
      path: note.path,
      content: note.content,
      savedAt: t,
      reason
    }));
    sessionStorage.setItem(lastKey, String(t));
    await trimRevisions(note.id, 30);
  }

  async function revisions(noteId) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('revisions', 'readonly');
      const index = tx.objectStore('revisions').index('noteId');
      const req = index.getAll(IDBKeyRange.only(noteId));
      req.onsuccess = () => resolve((req.result || []).sort((a,b) => b.savedAt - a.savedAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function trimRevisions(noteId, keep) {
    const rows = await revisions(noteId);
    const stale = rows.slice(keep);
    if (!stale.length) return;
    const db = await open();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('revisions', 'readwrite');
      const store = tx.objectStore('revisions');
      stale.forEach(row => store.delete(row.id));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clear() {
    const db = await open();
    await Promise.all(['vault','notes','revisions'].map(name => new Promise((resolve,reject) => {
      const tx = db.transaction(name,'readwrite');
      const req = tx.objectStore(name).clear();
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    })));
  }

  window.NeuralVaultDB = { open, loadState, saveState, checkpoint, revisions, exportRevisions, importRevisions, clear };
})();