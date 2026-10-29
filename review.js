// Export de bilan pour Claude (cahier des charges : « Export de bilan pour Claude Pro ») et exports CSV.
import { addDays, toDayNumber } from './dates.js';
import { bestSet, isStagnating } from './suggest.js';
import { weights, weeklyAverages, measureSeries } from './body.js';
import { dayTotals } from './nutrition.js';
import { weeklyVolume } from './program.js';

const inP = (d, from, to) => d >= from && d <= to;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Séances prévues de la période : chaque jour de séance du calendrier effectif. */
export function adherence(program, workouts, from, to) {
  const planned = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(`${d}T12:00:00Z`).getUTCDay()];
    if (toDayNumber(d) < toDayNumber(program.startDate)) continue;
    const e = program.schedule.find((s) => s.day === dow && s.session);
    if (e) planned.push({ date: d, sessionId: e.session });
  }
  const done = workouts.filter((w) => w.status === 'done' && inP(w.date, from, to));
  const used = new Set();
  const rows = planned.map((p) => {
    const match = done.find((w) => !used.has(w.id) && w.sessionId === p.sessionId && toDayNumber(w.date) >= toDayNumber(p.date) - 3 && toDayNumber(w.date) <= toDayNumber(p.date) + 3);
    if (match) used.add(match.id);
    return { ...p, status: !match ? 'missed' : match.date === p.date ? 'done' : 'shifted', doneDate: match ? match.date : null };
  });
  return { planned: rows.length, done: rows.filter((r) => r.status === 'done').length, shifted: rows.filter((r) => r.status === 'shifted').length, missed: rows.filter((r) => r.status === 'missed').length, extra: done.length - used.size, rows };
}

export function buildReviewExport({ program, lib, workouts, sets, entries, reviews, settings, from, to, appVersion, now = new Date().toISOString() }) {
  const name = (id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
  const ws = workouts.filter((w) => w.status !== 'in-progress' && inP(w.date, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const sessions = ws.map((w) => {
    const mine = sets.filter((s) => s.workoutId === w.id).sort((a, b) => a.slotId.localeCompare(b.slotId) || a.index - b.index);
    return {
      date: w.date, session: w.sessionId, status: w.status, fatigue: w.fatigue, difficulty: w.difficulty, note: w.note || null,
      minutes: w.endedAt ? Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000) : null,
      backfilled: !!w.backfill,
      sets: mine.map((s) => ({ slot: s.slotId, exercise: name(s.exercise), exerciseId: s.exercise, set: s.index, loadKg: s.loadKg, reps: s.reps, rir: s.rir })),
    };
  });
  // Synthèse par exercice : première et dernière meilleure série, stagnation.
  const byEx = new Map();
  ws.filter((w) => w.status === 'done').forEach((w) => {
    const mine = sets.filter((s) => s.workoutId === w.id);
    [...new Set(mine.map((s) => s.exercise))].forEach((ex) => {
      if (!byEx.has(ex)) byEx.set(ex, []);
      byEx.get(ex).push({ date: w.date, sets: mine.filter((s) => s.exercise === ex) });
    });
  });
  const exercises = [...byEx.entries()].map(([ex, list]) => {
    const first = bestSet(list[0].sets);
    const last = bestSet(list[list.length - 1].sets);
    return { exercise: name(ex), sessions: list.length, firstBest: { date: list[0].date, loadKg: first.loadKg, reps: first.reps }, lastBest: { date: list[list.length - 1].date, loadKg: last.loadKg, reps: last.reps }, stagnation: isStagnating([...list].reverse()) };
  });
  const w = weights(entries).filter((x) => inP(x.date, from, to));
  const checkins = entries.filter((e) => e.kind === 'checkin' && inP(e.date, from, to));
  const days = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const food = days.map((d) => ({ date: d, ...dayTotals(entries, d) })).filter((d) => d.count);
  const ms = measureSeries(entries.filter((e) => inP(e.date, from, to)));
  const runs = entries.filter((e) => e.kind === 'run' && inP(e.date, from, to));
  const swims = entries.filter((e) => e.kind === 'swim' && inP(e.date, from, to));
  return {
    format: 'fitness-app', kind: 'review-export', schemaVersion: 1, exportedAt: now, appVersion, timezone: 'Europe/Paris',
    period: { from, to },
    program: { id: program.id, version: program.version, name: program.name, startDate: program.startDate, weekDecisions: reviews.map((r) => ({ week: r.calWeek, signals: r.signals, decision: r.decision })), content: program },
    adherence: adherence(program, workouts, from, to),
    sessions,
    exerciseSummary: exercises,
    volumePerMuscle: { note: 'Séries par semaine et par muscle : série directe = 1, indirecte = 0,5. À titre indicatif.', week2: Object.fromEntries(Object.entries(weeklyVolume(program, lib, Math.min(2, program.weeks))).map(([m, v]) => [m, v.total])) },
    recovery: {
      responses: checkins.length,
      sleepHours: avg(checkins.map((c) => c.sleepH).filter((x) => typeof x === 'number')),
      sleepQuality: avg(checkins.map((c) => c.sleepQ).filter(Boolean)),
      fatigue: avg([...checkins.map((c) => c.fatigue), ...ws.map((x) => x.fatigue)].filter(Boolean)),
      soreness: avg(checkins.map((c) => c.soreness).filter(Boolean)),
      motivation: avg(checkins.map((c) => c.motivation).filter(Boolean)),
      restingHr: avg(checkins.map((c) => c.restingHr).filter(Boolean)),
      painDays: checkins.filter((c) => c.pain).length,
      difficulty: avg(ws.map((x) => x.difficulty).filter(Boolean)),
    },
    body: {
      weights: w.map((x) => ({ date: x.date, kg: x.kg })),
      weeklyAverages: weeklyAverages(w).map((x) => ({ week: x.monday, kg: Math.round(x.avg * 10) / 10, n: x.n })),
      measurements: ms,
      photos: entries.filter((e) => e.kind === 'photo-meta' && inP(e.date, from, to)).map((e) => ({ date: e.date, pose: e.pose })),
    },
    nutrition: {
      daysLogged: food.length,
      averages: food.length ? { kcal: Math.round(food.reduce((a, d) => a + d.kcal, 0) / food.length), protein: Math.round(food.reduce((a, d) => a + d.p, 0) / food.length), carbs: Math.round(food.reduce((a, d) => a + d.c, 0) / food.length), fat: Math.round(food.reduce((a, d) => a + d.f, 0) / food.length) } : null,
      targets: settings && settings.nutritionTargets ? settings.nutritionTargets : 'estimation automatique',
      days: food.map((d) => ({ date: d.date, kcal: d.kcal, protein: d.p, carbs: d.c, fat: d.f })),
    },
    endurance: {
      runs: runs.map((r) => ({ date: r.date, minutes: r.durationSec ? Math.round(r.durationSec / 6) / 10 : null, km: r.distanceM ? Math.round(r.distanceM / 10) / 100 : null, avgHr: r.avgHr || null, effort: r.rpe || null, note: r.note || null })),
      swims: swims.map((s) => ({ date: s.date, minutes: s.durationSec ? Math.round(s.durationSec / 6) / 10 : null, meters: s.distanceM || null, test400Sec: s.test400Sec || null, strokesPerLength: s.strokes || null, effort: s.rpe || null, note: s.note || null })),
      mobility: entries.filter((e) => e.kind === 'mobility' && inP(e.date, from, to)).map((m) => ({ date: m.date, variant: m.variant })),
    },
  };
}

export const REVIEW_MESSAGE = (from, to) => `Voici l'export de bilan de mon application fitness (${from} → ${to}). Analyse-le selon notre méthode : adhérence, progression des charges, poids et mensurations, récupération, course et natation, nutrition. Puis propose les ajustements du cycle suivant, chacun justifié.`;

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** CSV au format français (point-virgule, virgule décimale) : s'ouvre directement dans Excel. */
export function toCsv(header, rows) {
  const fmt = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
  return `﻿${[header, ...rows].map((r) => r.map((v) => csvCell(fmt(v))).join(';')).join('\r\n')}\r\n`;
}

export function setsCsv({ program, lib, workouts, sets }) {
  const name = (id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
  const ws = new Map(workouts.map((w) => [w.id, w]));
  const rows = sets.filter((s) => ws.has(s.workoutId) && ws.get(s.workoutId).status !== 'in-progress')
    .sort((a, b) => ws.get(a.workoutId).date.localeCompare(ws.get(b.workoutId).date) || a.slotId.localeCompare(b.slotId) || a.index - b.index)
    .map((s) => { const w = ws.get(s.workoutId); return [w.date, w.sessionId, s.slotId, name(s.exercise), s.index, s.loadKg, s.reps, s.rir, w.status === 'abandoned' ? 'abandonnée' : '']; });
  return toCsv(['Date', 'Séance', 'Emplacement', 'Exercice', 'Série', 'Charge (kg)', 'Répétitions', 'RIR', 'Statut'], rows);
}

export function bodyCsv({ entries }) {
  const rows = entries.filter((e) => ['weight', 'measure', 'checkin'].includes(e.kind)).sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, { weight: 'Pesée', measure: 'Mensurations', checkin: 'Ressenti' }[e.kind], e.kg ?? '', e.waist ?? '', e.chest ?? '', e.arm ?? '', e.thigh ?? '', e.sleepH ?? '', e.sleepQ ?? '', e.fatigue ?? '', e.soreness ?? '', e.motivation ?? '', e.restingHr ?? '', e.pain ? 'oui' : '']);
  return toCsv(['Date', 'Type', 'Poids (kg)', 'Taille (cm)', 'Poitrine (cm)', 'Bras (cm)', 'Cuisse (cm)', 'Sommeil (h)', 'Qualité sommeil', 'Fatigue', 'Courbatures', 'Motivation', 'FC repos', 'Douleur'], rows);
}

export function enduranceCsv({ entries }) {
  const rows = entries.filter((e) => e.kind === 'run' || e.kind === 'swim').sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.kind === 'run' ? 'Course' : 'Natation', e.durationSec ? Math.round(e.durationSec / 6) / 10 : '', e.distanceM ?? '', e.avgHr ?? '', e.rpe ?? '', e.note ?? '']);
  return toCsv(['Date', 'Activité', 'Durée (min)', 'Distance (m)', 'FC moyenne', 'Effort (1-10)', 'Note'], rows);
}

export function foodCsv({ entries }) {
  const rows = entries.filter((e) => e.kind === 'food').sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, e.meal, e.name, e.grams ?? '', e.portions ?? '', e.kcal, e.p, e.c, e.f]);
  return toCsv(['Date', 'Repas', 'Aliment', 'Quantité (g)', 'Portions', 'kcal', 'Protéines (g)', 'Glucides (g)', 'Lipides (g)'], rows);
}

