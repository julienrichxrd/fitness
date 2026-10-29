// Sauvegarde et restauration (cahier des charges V1.2) : un fichier JSON complet, une restauration qui
// remplace tout après vérification, aperçu, avertissement et copie de sécurité.
// Schéma 2 : séances et séries, plus le journal (corps, nutrition, endurance, bilans) et, au choix, les photos.
// Les sauvegardes du schéma 1 (version 0.2) restent lisibles.
import { parseJson } from './program.js';
import { toDayNumber, addDays } from './dates.js';

export const BACKUP_SCHEMA = 2;
/** Réglages copiés dans la sauvegarde. Les autres (copie de sécurité, test de stockage…) restent sur l'appareil. */
export const EXPORTED_META = ['cycle-start', 'settings', 'program-store'];
/** Réglages jamais effacés par une restauration. */
export const LOCAL_META = ['restore-safety', 'last-backup', 'data-origin', 'storage-selftest', 'onboarded'];

export const ENTRY_KINDS = ['weight', 'measure', 'checkin', 'food', 'run', 'swim', 'mobility', 'week-review', 'photo-meta'];

export function buildBackup({ workouts, sets, meta, entries = [], photos = null, appVersion, now = new Date().toISOString() }) {
  return {
    format: 'fitness-app',
    kind: 'backup',
    schemaVersion: BACKUP_SCHEMA,
    appVersion,
    createdAt: now,
    counts: { workouts: workouts.length, sets: sets.length, entries: entries.length, photos: photos ? photos.length : 0 },
    data: {
      workouts,
      sets,
      entries,
      meta: meta.filter((m) => EXPORTED_META.includes(m.key)),
      ...(photos ? { photos } : {}),
    },
  };
}

export function backupFileName(now = new Date(), prefix = 'fitness-sauvegarde') {
  const p = (x) => String(x).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}h${p(now.getMinutes())}.json`;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const optNum = (v, lo, hi) => v === null || v === undefined || num(v, lo, hi);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toDayNumber(v) !== null;
const isStamp = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function checkEntry(e, i, errors, dateOk) {
  const where = `Élément du journal n° ${i + 1}`;
  if (!isObj(e) || typeof e.id !== 'string' || !e.id) return errors.push(`${where} : identifiant manquant.`);
  if (!ENTRY_KINDS.includes(e.kind)) return errors.push(`${where} : type inconnu « ${e.kind} ».`);
  if (e.kind !== 'week-review' && !dateOk(e.date)) errors.push(`${where} : date invalide ou hors période (${e.date}).`);
  const bad = (field, lo, hi) => { if (!optNum(e[field], lo, hi)) errors.push(`${where} : ${field} hors bornes.`); };
  if (e.kind === 'weight') { if (!num(e.kg, 30, 300)) errors.push(`${where} : poids hors bornes (30 à 300 kg).`); }
  if (e.kind === 'measure') ['waist', 'chest', 'arm', 'thigh'].forEach((f) => bad(f, 10, 250));
  if (e.kind === 'checkin') { bad('sleepH', 0, 24); ['sleepQ', 'fatigue', 'soreness', 'motivation'].forEach((f) => bad(f, 1, 5)); bad('restingHr', 25, 150); bad('steps', 0, 100000); }
  if (e.kind === 'food') { if (!num(e.kcal, 0, 10000)) errors.push(`${where} : calories hors bornes.`); ['p', 'c', 'f'].forEach((f) => bad(f, 0, 1000)); }
  if (e.kind === 'run' || e.kind === 'swim') { bad('durationSec', 0, 86400); bad('distanceM', 0, 300000); bad('avgHr', 25, 250); bad('rpe', 1, 10); }
  return null;
}

/**
 * Vérifie un fichier de sauvegarde avant toute écriture.
 * Retourne { ok, errors, backup, preview }.
 */
export function checkBackup(text, { today }) {
  if (typeof text === 'string' && text.length > 60 * 1024 * 1024) return { ok: false, errors: ['Fichier trop volumineux (plus de 60 Mo).'] };
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const b = parsed.value;
  const errors = [];
  if (!isObj(b) || b.format !== 'fitness-app') return { ok: false, errors: ['Ce fichier ne vient pas de l\'application.'] };
  if (b.kind !== 'backup') return { ok: false, errors: [`Fichier de type « ${b.kind} » : une sauvegarde est attendue.`] };
  if (b.schemaVersion !== 1 && b.schemaVersion !== BACKUP_SCHEMA) return { ok: false, errors: [`Version de sauvegarde ${b.schemaVersion} non reconnue.`] };
  if (!isObj(b.data) || !Array.isArray(b.data.workouts) || !Array.isArray(b.data.sets) || !Array.isArray(b.data.meta)) {
    return { ok: false, errors: ['Sauvegarde incomplète : séances, séries ou réglages absents.'] };
  }
  if (b.data.entries === undefined) b.data.entries = [];
  if (!Array.isArray(b.data.entries)) return { ok: false, errors: ['Sauvegarde incomplète : journal illisible.'] };
  const maxDay = toDayNumber(addDays(today, 1));
  const minDay = toDayNumber('2020-01-01');
  const dateOk = (d) => isDate(d) && toDayNumber(d) >= minDay && toDayNumber(d) <= maxDay;
  const ids = new Set();
  b.data.workouts.forEach((w, i) => {
    const where = `Séance n° ${i + 1}`;
    if (!isObj(w) || typeof w.id !== 'string' || !w.id) return errors.push(`${where} : identifiant manquant.`);
    if (ids.has(w.id)) errors.push(`${where} : identifiant en double.`);
    ids.add(w.id);
    if (!dateOk(w.date)) errors.push(`${where} : date invalide ou hors période (${w.date}).`);
    if (typeof w.sessionId !== 'string') errors.push(`${where} : séance non précisée.`);
    if (!['in-progress', 'done', 'abandoned'].includes(w.status)) errors.push(`${where} : statut inconnu.`);
    if (!isStamp(w.startedAt)) errors.push(`${where} : heure de début invalide.`);
    if (!optNum(w.fatigue, 1, 5)) errors.push(`${where} : fatigue hors bornes.`);
    if (!optNum(w.difficulty, 1, 10)) errors.push(`${where} : difficulté hors bornes.`);
    return null;
  });
  const setIds = new Set();
  b.data.sets.forEach((s, i) => {
    const where = `Série n° ${i + 1}`;
    if (!isObj(s) || typeof s.id !== 'string' || !s.id) return errors.push(`${where} : identifiant manquant.`);
    if (setIds.has(s.id)) errors.push(`${where} : identifiant en double.`);
    setIds.add(s.id);
    if (!ids.has(s.workoutId)) errors.push(`${where} : séance inconnue.`);
    if (typeof s.exercise !== 'string' || typeof s.slotId !== 'string') errors.push(`${where} : exercice non précisé.`);
    if (s.loadKg !== null && !num(s.loadKg, 0, 500)) errors.push(`${where} : charge hors bornes (0 à 500 kg).`);
    if (!num(s.reps, 0, 100)) errors.push(`${where} : répétitions hors bornes (0 à 100).`);
    if (s.rir !== null && s.rir !== undefined && !num(s.rir, 0, 10)) errors.push(`${where} : RIR hors bornes (0 à 10).`);
    if (!isStamp(s.doneAt)) errors.push(`${where} : heure invalide.`);
    return null;
  });
  const entryIds = new Set();
  b.data.entries.forEach((e, i) => {
    checkEntry(e, i, errors, dateOk);
    if (e && entryIds.has(e.id)) errors.push(`Élément du journal n° ${i + 1} : identifiant en double.`);
    if (e) entryIds.add(e.id);
  });
  b.data.meta.forEach((m) => {
    if (!isObj(m) || !EXPORTED_META.includes(m.key)) errors.push('Réglage inconnu dans la sauvegarde.');
  });
  if (b.data.photos !== undefined) {
    if (!Array.isArray(b.data.photos)) errors.push('Photos illisibles.');
    else b.data.photos.forEach((p, i) => {
      if (!isObj(p) || typeof p.id !== 'string' || !dateOk(p.date) || typeof p.dataUrl !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(p.dataUrl)) errors.push(`Photo n° ${i + 1} invalide.`);
    });
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 8).concat(errors.length > 8 ? [`… et ${errors.length - 8} autre(s) erreur(s).`] : []) };
  return { ok: true, errors: [], backup: b, preview: preview(b.data.workouts, b.data.sets, b.createdAt, b.data.entries, b.data.photos) };
}

export function preview(workouts, sets, createdAt = null, entries = [], photos = undefined) {
  const dates = workouts.filter((w) => w.status !== 'abandoned').map((w) => w.date).sort();
  return {
    workouts: workouts.filter((w) => w.status === 'done').length,
    sets: sets.length,
    entries: entries.length,
    photos: photos ? photos.length : null,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    lastDate: dates[dates.length - 1] || null,
    createdAt,
  };
}

/** Séances de l'appareil qui seraient perdues : absentes du fichier. */
export function lostByRestore(localWorkouts, backup) {
  const inFile = new Set(backup.data.workouts.map((w) => w.id));
  return localWorkouts.filter((w) => w.status !== 'abandoned' && !inFile.has(w.id)).length;
}
