// Stockage local (IndexedDB), base « fitness-app ».
// v1 : « meta » (réglages). v2 : + « workouts » (séances) et « sets » (séries).
// v3 : + « entries » (journal : pesées, mensurations, ressenti, repas, course, natation, mobilité, bilans)
//      et « photos » (images de suivi, gardées uniquement sur l'appareil). Chaque montée garde les données existantes.

const DB_NAME = 'fitness-app';
const DB_VERSION = 3;
export const STORES = ['meta', 'workouts', 'sets', 'entries'];

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
      if (!db.objectStoreNames.contains('workouts')) {
        const w = db.createObjectStore('workouts', { keyPath: 'id' });
        w.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('sets')) {
        const s = db.createObjectStore('sets', { keyPath: 'id' });
        s.createIndex('workoutId', 'workoutId');
      }
      if (!db.objectStoreNames.contains('entries')) {
        const e = db.createObjectStore('entries', { keyPath: 'id' });
        e.createIndex('kind', 'kind');
        e.createIndex('date', 'date');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const p = db.createObjectStore('photos', { keyPath: 'id' });
        p.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Une nouvelle version de l'application ouverte ailleurs : on libère la base.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('Ouverture de la base impossible.'));
    req.onblocked = () => reject(new Error('Base bloquée par un autre onglet ouvert : fermez-le puis rouvrez l\'application.'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/** Transaction sur un ou plusieurs magasins ; se résout quand l'écriture est réellement terminée. */
function tx(stores, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn((name) => t.objectStore(name))).then((r) => { result = r; }, (e) => { try { t.abort(); } catch { /* déjà terminée */ } reject(e); });
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
  return tx(['meta'], 'readonly', (s) => wrap(s('meta').get(key))).then((row) => (row ? row.value : undefined));
}

export async function setMeta(key, value) {
  return tx(['meta'], 'readwrite', (s) => { s('meta').put({ key, value, updatedAt: new Date().toISOString() }); });
}

export async function getAll(store) {
  return tx([store], 'readonly', (s) => wrap(s(store).getAll()));
}

export async function putRecord(store, record) {
  return tx([store], 'readwrite', (s) => { s(store).put(record); });
}

/** Écrit une série et met à jour sa séance dans la même transaction (tout ou rien). */
export async function saveSetAndWorkout(set, workout) {
  return tx(['sets', 'workouts'], 'readwrite', (s) => {
    s('sets').put(set);
    s('workouts').put(workout);
  });
}

export async function deleteSet(id, workout) {
  return tx(['sets', 'workouts'], 'readwrite', (s) => {
    s('sets').delete(id);
    if (workout) s('workouts').put(workout);
  });
}

/** Supprime une séance et toutes ses séries. */
export async function deleteWorkout(id) {
  return tx(['sets', 'workouts'], 'readwrite', async (s) => {
    const keys = await wrap(s('sets').index('workoutId').getAllKeys(id));
    keys.forEach((k) => s('sets').delete(k));
    s('workouts').delete(id);
  });
}

export async function deleteRecord(store, id) {
  return tx([store], 'readwrite', (s) => { s(store).delete(id); });
}

export async function readEverything({ withPhotos = false } = {}) {
  const names = withPhotos ? [...STORES, 'photos'] : STORES;
  return tx(names, 'readonly', async (s) => {
    const [meta, workouts, sets, entries, photos] = await Promise.all(names.map((n) => wrap(s(n).getAll())));
    return { meta, workouts, sets, entries, ...(withPhotos ? { photos } : {}) };
  });
}

/**
 * Remplace toutes les séances, séries et réglages exportables, en une seule transaction :
 * en cas d'erreur, rien n'est modifié. keepMeta : clés de réglages à ne jamais effacer.
 */
export async function replaceAll({ workouts, sets, meta, entries = [], photos = null }, { keepMeta = [] } = {}) {
  return tx([...STORES, 'photos'], 'readwrite', async (s) => {
    s('workouts').clear();
    s('sets').clear();
    s('entries').clear();
    const metaKeys = await wrap(s('meta').getAllKeys());
    metaKeys.filter((k) => !keepMeta.includes(k)).forEach((k) => s('meta').delete(k));
    workouts.forEach((w) => s('workouts').put(w));
    sets.forEach((x) => s('sets').put(x));
    entries.forEach((x) => s('entries').put(x));
    meta.filter((m) => !keepMeta.includes(m.key)).forEach((m) => s('meta').put(m));
    // Photos : remplacées seulement si la sauvegarde en contient ; sinon celles de l'appareil sont gardées.
    if (photos) {
      s('photos').clear();
      photos.forEach((p) => s('photos').put(p));
    }
  });
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
