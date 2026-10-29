// Sauvegarde et restauration (cahier des charges V1.2) : un fichier JSON complet, une restauration qui
// remplace tout après vérification, aperçu, avertissement et copie de sécurité.
// Module pur : la lecture du fichier, l'écriture et le partage sont faits par l'application.
import { parseJson } from './program.js';
import { toDayNumber, addDays } from './dates.js';

export const BACKUP_SCHEMA = 1;
/** Réglages copiés dans la sauvegarde. Les autres (copie de sécurité, test de stockage…) restent sur l'appareil. */
export const EXPORTED_META = ['cycle-start'];
/** Réglages jamais effacés par une restauration. */
export const LOCAL_META = ['restore-safety', 'last-backup', 'data-origin', 'storage-selftest'];

export function buildBackup({ workouts, sets, meta, appVersion, now = new Date().toISOString() }) {
  return {
    format: 'fitness-app',
    kind: 'backup',
    schemaVersion: BACKUP_SCHEMA,
    appVersion,
    createdAt: now,
    counts: { workouts: workouts.length, sets: sets.length },
    data: {
      workouts,
      sets,
      meta: meta.filter((m) => EXPORTED_META.includes(m.key)),
    },
  };
}

export function backupFileName(now = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `fitness-sauvegarde-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}h${p(now.getMinutes())}.json`;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toDayNumber(v) !== null;
const isStamp = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * Vérifie un fichier de sauvegarde avant toute écriture.
 * Retourne { ok, errors, backup, preview: { workouts, sets, from, to, lastDate, createdAt } }.
 */
export function checkBackup(text, { today }) {
  if (typeof text === 'string' && text.length > 10 * 1024 * 1024) return { ok: false, errors: ['Fichier trop volumineux (plus de 10 Mo).'] };
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const b = parsed.value;
  const errors = [];
  if (!isObj(b) || b.format !== 'fitness-app') return { ok: false, errors: ['Ce fichier ne vient pas de l\'application.'] };
  if (b.kind !== 'backup') return { ok: false, errors: [`Fichier de type « ${b.kind} » : une sauvegarde est attendue.`] };
  if (b.schemaVersion !== BACKUP_SCHEMA) return { ok: false, errors: [`Version de sauvegarde ${b.schemaVersion} non reconnue.`] };
  if (!isObj(b.data) || !Array.isArray(b.data.workouts) || !Array.isArray(b.data.sets) || !Array.isArray(b.data.meta)) {
    return { ok: false, errors: ['Sauvegarde incomplète : séances, séries ou réglages absents.'] };
  }
  const maxDay = toDayNumber(addDays(today, 1));
  const minDay = toDayNumber('2020-01-01');
  const ids = new Set();
  b.data.workouts.forEach((w, i) => {
    const where = `Séance n° ${i + 1}`;
    if (!isObj(w) || typeof w.id !== 'string' || !w.id) return errors.push(`${where} : identifiant manquant.`);
    if (ids.has(w.id)) errors.push(`${where} : identifiant en double.`);
    ids.add(w.id);
    if (!isDate(w.date) || toDayNumber(w.date) < minDay || toDayNumber(w.date) > maxDay) errors.push(`${where} : date invalide ou hors période (${w.date}).`);
    if (typeof w.sessionId !== 'string') errors.push(`${where} : séance non précisée.`);
    if (!['in-progress', 'done', 'abandoned'].includes(w.status)) errors.push(`${where} : statut inconnu.`);
    if (!isStamp(w.startedAt)) errors.push(`${where} : heure de début invalide.`);
    if (w.fatigue !== null && w.fatigue !== undefined && !num(w.fatigue, 1, 5)) errors.push(`${where} : fatigue hors bornes.`);
    if (w.difficulty !== null && w.difficulty !== undefined && !num(w.difficulty, 1, 10)) errors.push(`${where} : difficulté hors bornes.`);
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
  });
  b.data.meta.forEach((m) => {
    if (!isObj(m) || !EXPORTED_META.includes(m.key)) errors.push('Réglage inconnu dans la sauvegarde.');
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 8).concat(errors.length > 8 ? [`… et ${errors.length - 8} autre(s) erreur(s).`] : []) };
  return { ok: true, errors: [], backup: b, preview: preview(b.data.workouts, b.data.sets, b.createdAt) };
}

export function preview(workouts, sets, createdAt = null) {
  const dates = workouts.filter((w) => w.status !== 'abandoned').map((w) => w.date).sort();
  return { workouts: workouts.filter((w) => w.status === 'done').length, sets: sets.length, from: dates[0] || null, to: dates[dates.length - 1] || null, lastDate: dates[dates.length - 1] || null, createdAt };
}

/** Séances de l'appareil qui seraient perdues : plus récentes que la dernière séance du fichier, ou absentes du fichier. */
export function lostByRestore(localWorkouts, backup) {
  const inFile = new Set(backup.data.workouts.map((w) => w.id));
  return localWorkouts.filter((w) => w.status !== 'abandoned' && !inFile.has(w.id)).length;
}
