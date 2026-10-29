// Déroulement d'une séance : plan du jour, enchaînement des exercices et des superséries, repos,
// séance suivante dans l'ordre A → B → C, historique d'un exercice, résumé.
// Module pur : aucune écriture ici, l'application enregistre ce que ces fonctions calculent.
import { resolveSession } from './program.js';
import { cycleInfo, addDays, dayKey, toDayNumber } from './dates.js';
import { suggest, bestSet } from './suggest.js';

export function newId(prefix, now = Date.now()) {
  return `${prefix}-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Semaine du cycle d'une date. Avant le début : S1 (séance d'essai) ; après la fin : dernière semaine. */
export function weekForDate(program, date) {
  const info = cycleInfo(program, date);
  if (info.status === 'during') return info.week;
  return info.status === 'before' ? 1 : program.weeks;
}

/** Semaine de décharge décidée au bilan (calendrier effectif). */
export function deloadForDate(program, date) {
  const info = cycleInfo(program, date);
  return info.status === 'during' && !!info.deload;
}

export function rawSlot(program, sessionId, slotId) {
  return program.sessions.find((s) => s.id === sessionId).slots.find((x) => x.id === slotId);
}

export function createWorkout(program, sessionId, { date, now = new Date().toISOString(), fatigue = null, backfill = false } = {}) {
  const plan = resolveSession(program, sessionId, weekForDate(program, date), { deload: deloadForDate(program, date) });
  return {
    id: newId('w'),
    programId: program.id,
    programVersion: program.version,
    sessionId,
    date,
    startedAt: now,
    endedAt: null,
    status: 'in-progress',
    fatigue,
    difficulty: null,
    note: '',
    swaps: {},
    currentSlot: plan[0].slotId,
    backfill,
    restEndsAt: null,
    restTotalSec: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Plan de la séance, avec les remplacements choisis :
 * swaps[slotId] = { exercise, kind: 'alternative' | 'fallback', fromSet } (repli : seulement les séries restantes).
 */
export function workoutPlan(program, workout, increments = null) {
  const week = weekForDate(program, workout.date);
  const deload = deloadForDate(program, workout.date);
  return resolveSession(program, workout.sessionId, week, { deload }).map((x) => {
    const raw = rawSlot(program, workout.sessionId, x.slotId);
    const sw = workout.swaps && workout.swaps[x.slotId];
    const extra = (workout.extraSets && workout.extraSets[x.slotId]) || 0;
    const override = increments && increments[x.slotId];
    const increment = override && raw.increment && raw.increment.type !== 'none' ? { ...raw.increment, ...(raw.increment.type === 'bodyweight' ? { loadStepKg: override } : { stepKg: override }) } : raw.increment;
    const item = { ...x, sets: x.sets + extra, plannedSets: x.sets, planned: x.exercise, increment, raw, week, deload };
    if (sw) {
      item.exercise = sw.exercise;
      item.swap = sw;
      if (sw.kind === 'fallback' && raw.fallback) item.reps = { ...raw.fallback.reps };
    }
    return item;
  });
}

export const setsOf = (sets, workoutId) => sets.filter((s) => s.workoutId === workoutId).sort((a, b) => a.index - b.index || a.doneAt.localeCompare(b.doneAt));
export const slotSets = (sets, slotId) => sets.filter((s) => s.slotId === slotId);

export function progress(plan, sets) {
  const planned = plan.reduce((n, x) => n + x.sets, 0);
  const done = plan.reduce((n, x) => n + Math.min(x.sets, slotSets(sets, x.slotId).length), 0);
  return { planned, done, extra: sets.length - done };
}

const firstIncomplete = (plan, sets, fromIdx) => {
  for (let k = 1; k <= plan.length; k += 1) {
    const x = plan[(fromIdx + k) % plan.length];
    if (slotSets(sets, x.slotId).length < x.sets) return x;
  }
  return null;
};

/**
 * Après la validation d'une série sur slotId : où aller, et combien de repos.
 * Supersérie : a → b sans repos, puis repos après le tour et retour à a.
 */
export function afterSet(plan, sets, slotId) {
  const idx = plan.findIndex((x) => x.slotId === slotId);
  const item = plan[idx];
  const done = (x) => slotSets(sets, x.slotId).length;
  if (item.superset) {
    const [a, b] = plan.filter((x) => x.superset === item.superset);
    if (slotId === a.slotId) {
      if (done(b) < b.sets) return { next: b.slotId, restSec: 0, reason: 'superset' };
      if (done(a) < a.sets) return { next: a.slotId, restSec: item.restSec, reason: 'same' };
    } else {
      if (done(a) < a.sets) return { next: a.slotId, restSec: item.restSec, reason: 'round' };
      if (done(b) < b.sets) return { next: b.slotId, restSec: item.restSec, reason: 'same' };
    }
  } else if (done(item) < item.sets) {
    return { next: item.slotId, restSec: item.restSec, reason: 'same' };
  }
  const nx = firstIncomplete(plan, sets, idx);
  if (!nx) return { next: null, restSec: 0, reason: 'finished' };
  return { next: nx.slotId, restSec: item.restSec, reason: 'next-exercise' };
}

/** Le repli (tractions) est proposé si la série passe sous le seuil et qu'il reste des séries. */
export function fallbackOffer(item, sets, lastReps) {
  const fb = item.raw && item.raw.fallback;
  if (!fb || item.swap || lastReps >= fb.belowReps) return null;
  const remaining = item.sets - slotSets(sets, item.slotId).length;
  return remaining > 0 ? { exercises: fb.exercises, remaining, reps: fb.reps, belowReps: fb.belowReps } : null;
}

/** Secondes de repos restantes, calculées sur l'heure de fin : juste même après un écran verrouillé. */
export function restLeft(workout, nowMs = Date.now()) {
  if (!workout || !workout.restEndsAt) return null;
  return Math.max(0, Math.ceil((workout.restEndsAt - nowMs) / 1000));
}

/** Séances terminées d'une semaine du cycle. */
export function weekWorkouts(program, workouts, calWeek) {
  const start = toDayNumber(addDays(program.startDate, (calWeek - 1) * 7));
  return workouts.filter((w) => w.status === 'done' && toDayNumber(w.date) >= start && toDayNumber(w.date) <= start + 6);
}

/**
 * Séance à proposer : celle du jour si elle n'est pas faite, sinon la première de l'ordre A → B → C
 * qui manque cette semaine. null si toutes sont faites.
 */
export function nextSessionToDo(program, workouts, today) {
  const info = cycleInfo(program, today);
  if (info.status === 'after') return null;
  if (info.status === 'before') return { sessionId: program.sessionOrder[0], week: 1, trial: true };
  const done = new Set(weekWorkouts(program, workouts, info.calWeek).map((w) => w.sessionId));
  const todays = program.schedule.find((s) => s.day === info.dayKey && s.session);
  const base = { week: info.week, calWeek: info.calWeek, deload: info.deload };
  if (todays && !done.has(todays.session)) return { ...base, sessionId: todays.session, scheduledToday: true };
  const missing = program.sessionOrder.find((id) => !done.has(id));
  return missing ? { ...base, sessionId: missing, late: true } : null;
}

/** Séance B la veille de la course (samedi) : avertissement du programme. */
export function eveOfRunWarning(sessionId, date) {
  return sessionId === 'B' && dayKey(addDays(date, 1)) === 'saturday'
    ? 'Séance jambes la veille de la course : courez facile demain, ou décalez la course.'
    : null;
}

/**
 * Historique d'un exercice à un emplacement : séances passées (hors séance en cours), la plus récente d'abord.
 */
export function slotHistory(workouts, sets, { slotId, exercise, excludeWorkoutId = null, limit = 5 }) {
  const byId = new Map(workouts.map((w) => [w.id, w]));
  const groups = new Map();
  for (const s of sets) {
    if (s.slotId !== slotId || s.exercise !== exercise || s.workoutId === excludeWorkoutId || s.kind === 'warmup') continue;
    const w = byId.get(s.workoutId);
    if (!w || w.status === 'abandoned') continue;
    if (!groups.has(w.id)) groups.set(w.id, { workoutId: w.id, date: w.date, startedAt: w.startedAt, sets: [] });
    groups.get(w.id).sets.push(s);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, sets: g.sets.sort((a, b) => a.index - b.index) }))
    .sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt))
    .slice(0, limit);
}

/** Suggestion pour un élément du plan, à partir de l'historique enregistré. */
export function suggestionFor(item, workouts, sets, workout) {
  const history = slotHistory(workouts, sets, { slotId: item.slotId, exercise: item.exercise, excludeWorkoutId: workout ? workout.id : null });
  return { history, suggestion: suggest({ item, increment: item.increment, history, fatigue: workout ? workout.fatigue : null, deload: !!item.deload }) };
}

/** Valeurs pré-remplies de la prochaine série. */
export function prefill(item, todaySets, sug, history) {
  const rir = item.rir ? item.rir.min : null;
  const prev = todaySets[todaySets.length - 1];
  const n = todaySets.length;
  const target = sug.targets && sug.targets[n] !== undefined ? sug.targets[n] : null;
  if (prev) return { loadKg: prev.loadKg, reps: target ?? prev.reps, rir: prev.rir ?? rir };
  return { loadKg: sug.load, reps: target ?? sug.reps ?? item.reps.min, rir };
}

/** Résumé de fin de séance. */
export function summary(plan, sets, workout, nowIso = new Date().toISOString()) {
  const p = progress(plan, sets);
  const end = workout.endedAt || nowIso;
  const minutes = Math.max(1, Math.round((Date.parse(end) - Date.parse(workout.startedAt)) / 60000));
  const perSlot = plan.map((x) => {
    const done = slotSets(sets, x.slotId);
    return { item: x, done, best: done.length ? bestSet(done) : null };
  });
  return { ...p, minutes, perSlot };
}
