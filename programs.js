// Import d'un nouveau programme (par exemple le cycle 2 proposé au bilan), comparaison avant validation,
// et retour à la version précédente. Le programme fourni avec l'application reste toujours disponible.
import { validateProgram, parseJson, resolveSession } from './program.js';

/** Programme actif : le dernier importé et activé, sinon celui fourni avec l'application. */
export function activeProgramFile(bundled, store) {
  if (!store || !Array.isArray(store.files) || store.activeIndex === null || store.activeIndex === undefined) return bundled;
  return store.files[store.activeIndex] || bundled;
}

export function checkProgramText(text, lib, activeVersionOfSameId) {
  const parsed = parseJson(text);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };
  const res = validateProgram(parsed.value, lib, { activeVersion: activeVersionOfSameId ?? null });
  return res.ok ? { ok: true, file: parsed.value, errors: [] } : { ok: false, errors: res.errors };
}

/** Différences lisibles entre deux programmes (semaine 2, réglages complets). */
export function compareProgramFiles(oldFile, newFile, lib) {
  const a = oldFile.program;
  const b = newFile.program;
  const name = (id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
  const lines = [];
  if (a.id !== b.id) lines.push({ type: 'info', text: `Nouveau cycle : « ${b.name} » remplace « ${a.name} ».` });
  if (a.startDate !== b.startDate) lines.push({ type: 'info', text: `Début : ${b.startDate} (avant : ${a.startDate}).` });
  if (a.weeks !== b.weeks) lines.push({ type: 'info', text: `Durée : ${b.weeks} semaines (avant : ${a.weeks}).` });
  const fmt = (x) => `${x.sets} × ${x.reps.min === x.reps.max ? x.reps.min : `${x.reps.min}–${x.reps.max}`}`;
  for (const s of b.sessions) {
    const old = a.sessions.find((x) => x.id === s.id);
    if (!old) { lines.push({ type: 'add', text: `Séance ${s.id} ajoutée : ${s.name}` }); continue; }
    const wa = Math.min(2, a.weeks);
    const wb = Math.min(2, b.weeks);
    const ra = resolveSession(a, s.id, wa);
    const rb = resolveSession(b, s.id, wb);
    rb.forEach((x) => {
      const y = ra.find((z) => z.slotId === x.slotId);
      if (!y) lines.push({ type: 'add', text: `${s.id} ${x.label} ajouté : ${name(x.exercise)} ${fmt(x)}` });
      else if (y.exercise !== x.exercise) lines.push({ type: 'change', text: `${s.id} ${x.label} : ${name(y.exercise)} → ${name(x.exercise)} (${fmt(x)})` });
      else if (fmt(y) !== fmt(x) || y.restSec !== x.restSec) lines.push({ type: 'change', text: `${s.id} ${x.label} ${name(x.exercise)} : ${fmt(y)} → ${fmt(x)}${y.restSec !== x.restSec ? `, repos ${y.restSec} s → ${x.restSec} s` : ''}` });
    });
    ra.filter((y) => !rb.some((x) => x.slotId === y.slotId)).forEach((y) => lines.push({ type: 'remove', text: `${s.id} ${y.label} retiré : ${name(y.exercise)}` }));
  }
  a.sessions.filter((s) => !b.sessions.some((x) => x.id === s.id)).forEach((s) => lines.push({ type: 'remove', text: `Séance ${s.id} retirée` }));
  if (!lines.length) lines.push({ type: 'info', text: 'Aucune différence sur les séances.' });
  return lines;
}

export function addProgram(store, file) {
  const files = [...((store && store.files) || []), file];
  return { files, activeIndex: files.length - 1, previousIndex: store && store.activeIndex !== undefined ? store.activeIndex : null, changedAt: new Date().toISOString() };
}

/** Revenir au programme précédent (null = programme fourni avec l'application). */
export function rollbackProgram(store) {
  if (!store) return store;
  return { ...store, activeIndex: store.previousIndex ?? null, previousIndex: store.activeIndex, changedAt: new Date().toISOString() };
}
