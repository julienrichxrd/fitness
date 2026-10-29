// Stockage local (IndexedDB). Étape 1 : uniquement les réglages (collection « meta »).
// Les séances arriveront à l'étape 2, dans la même base, par une montée de version.

const DB_NAME = 'fitness-app';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible sur ce navigateur.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Ouverture de la base impossible.'));
    req.onblocked = () => reject(new Error('Base bloquée par un autre onglet ouvert.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction('meta', mode);
    const store = t.objectStore('meta');
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Écriture annulée.'));
  }));
}

const wrap = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export async function getMeta(key) {
  return tx('readonly', (s) => wrap(s.get(key))).then((row) => (row ? row.value : undefined));
}

export async function setMeta(key, value) {
  return tx('readwrite', (s) => { s.put({ key, value, updatedAt: new Date().toISOString() }); });
}

/** Écrit puis relit une valeur témoin : prouve que le stockage fonctionne vraiment. */
export async function selfTest() {
  const stamp = new Date().toISOString();
  await setMeta('storage-selftest', stamp);
  return (await getMeta('storage-selftest')) === stamp;
}

/** État du stockage, affiché tel quel dans l'écran Données. */
export async function storageStatus() {
  const status = { indexedDb: false, persisted: null, persistRequested: null, usageKb: null, quotaMb: null, error: null };
  try {
    status.indexedDb = await selfTest();
  } catch (e) {
    status.error = e.message;
  }
  const sm = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (sm && sm.persisted) {
    try {
      status.persisted = await sm.persisted();
      if (!status.persisted && sm.persist) {
        status.persistRequested = true;
        status.persisted = await sm.persist();
      }
    } catch { /* navigateur qui refuse la question : on garde null */ }
  }
  if (sm && sm.estimate) {
    try {
      const est = await sm.estimate();
      status.usageKb = Math.round((est.usage || 0) / 1024);
      status.quotaMb = est.quota ? Math.round(est.quota / 1024 / 1024) : null;
    } catch { /* ignoré */ }
  }
  return status;
}
