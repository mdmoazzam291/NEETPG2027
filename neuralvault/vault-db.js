(() => {
  'use strict';

  const DB_NAME = 'neuralvault-v2';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('vault')) db.createObjectStore('vault', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('revisions')) {
          const store = db.createObjectStore('revisions', { keyPath: 'id', autoIncrement: true });
          store.createIndex('noteId', 'noteId', { unique: false });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error("Storage transaction failed"));
    });
    return dbPromise;
  }

  async function request(storeName, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = action(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function loadState() {
    const row = await request('vault', 'readonly', store => store.get('primary'));
    return row ? row.state : null;
  }

  async function saveState(state) {
    const snapshot = JSON.parse(JSON.stringify(state));
    snapshot.savedAt = Date.now();
    await request('vault', 'readwrite', store => store.put({ key: 'primary', state: snapshot }));
    return snapshot.savedAt;
  }

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
    await Promise.all(['vault','revisions'].map(name => new Promise((resolve,reject) => {
      const tx = db.transaction(name,'readwrite');
      const req = tx.objectStore(name).clear();
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    })));
  }

  window.NeuralVaultDB = { open, loadState, saveState, checkpoint, revisions, clear };
})();