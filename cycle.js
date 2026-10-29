// Bilan de fin de semaine et calendrier effectif du cycle (programme, « progressionGate » et « deload »).
// Règle du programme : on passe aux réglages de la semaine suivante seulement si la récupération suit.
// 0 signal → semaine suivante ; 1 signal → on garde les réglages ; 2 signaux ou plus → semaine de décharge.
// La décision appartient toujours à l'utilisateur : l'application propose.
import { addDays, toDayNumber, cycleInfo } from './dates.js';
import { bestSet } from './suggest.js';

/**
 * Calendrier effectif : une entrée par semaine réelle, { week, deload, decision }.
 * reviews : bilans enregistrés { calWeek, decision: 'progress' | 'maintain' | 'deload' } (décision pour la semaine suivante).
 * Le cycle se termine quand la dernière semaine du programme a été faite.
 */
export function buildCalendar(program, reviews = []) {
  const byWeek = new Map(reviews.map((r) => [r.calWeek, r.decision]));
  const cal = [{ week: 1, deload: false }];
  let lastWorkWeek = 1;
  for (let k = 1; k < 52; k += 1) {
    const cur = cal[k - 1];
    const decision = byWeek.get(k) || 'progress';
    let next;
    if (decision === 'deload') next = { week: lastWorkWeek, deload: true };
    else if (decision === 'maintain') next = { week: lastWorkWeek, deload: false };
    else next = cur.deload ? { week: lastWorkWeek + 1, deload: false } : { week: cur.week + 1, deload: false };
    if (next.week > program.weeks) break;
    if (!next.deload) lastWorkWeek = next.week;
    cal.push(next);
  }
  return cal;
}

/** Nombre de semaines maintenues d'affilée juste avant la semaine réelle calWeek (bilan anticipé au-delà du seuil). */
export function maintainedStreak(calendar, calWeek) {
  let n = 0;
  for (let k = calWeek - 1; k >= 1; k -= 1) {
    if (calendar[k].week === calendar[k - 1].week && !calendar[k].deload) n += 1;
    else break;
  }
  return n;
}

const inWeek = (date, start) => toDayNumber(date) >= toDayNumber(start) && toDayNumber(date) <= toDayNumber(start) + 6;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const score = (s) => (s ? (s.loadKg || 0) * 1000 + s.reps : null);

/**
 * Signaux de récupération d'une semaine réelle, calculés à partir des données (pré-cochés, modifiables).
 * Retourne { signals: { id: { auto, detail } }, stats }.
 */
export function weekSignals(program, { workouts, sets, entries }, calWeek) {
  const start = addDays(program.startDate, (calWeek - 1) * 7);
  const prevStart = addDays(start, -7);
  const checkins = entries.filter((e) => e.kind === 'checkin' && inWeek(e.date, start));
  const doneW = workouts.filter((w) => w.status === 'done' && inWeek(w.date, start));
  const fatigueValues = [...checkins.map((c) => c.fatigue), ...doneW.map((w) => w.fatigue)].filter((x) => typeof x === 'number');
  const fatigue = avg(fatigueValues);
  const soreness = avg(checkins.map((c) => c.soreness).filter((x) => typeof x === 'number'));
  const painDays = checkins.filter((c) => c.pain).length;

  // Performances : meilleure série par exercice, cette semaine contre la précédente.
  const best = (from) => {
    const ids = new Set(workouts.filter((w) => w.status === 'done' && inWeek(w.date, from)).map((w) => w.id));
    const m = new Map();
    for (const s of sets) {
      if (!ids.has(s.workoutId)) continue;
      const k = `${s.slotId}|${s.exercise}`;
      const b = bestSet([...(m.get(k) ? [m.get(k)] : []), s]);
      m.set(k, b);
    }
    return m;
  };
  const now = best(start);
  const before = best(prevStart);
  const drops = [...now.entries()].filter(([k, s]) => before.has(k) && score(s) < score(before.get(k))).map(([k]) => k.split('|')[1]);

  const signals = {
    'fatigue-high': { auto: fatigue !== null && fatigue >= 4, detail: fatigue === null ? 'Pas de donnée de fatigue cette semaine' : `Fatigue moyenne ${fatigue.toFixed(1).replace('.', ',')} sur 5 (${fatigueValues.length} réponse${fatigueValues.length > 1 ? 's' : ''})` },
    'soreness-persistent': { auto: soreness !== null && soreness >= 4, detail: soreness === null ? 'Pas de donnée de courbatures' : `Courbatures moyennes ${soreness.toFixed(1).replace('.', ',')} sur 5` },
    'performance-drop': { auto: drops.length >= 2, detail: before.size ? `${drops.length} exercice${drops.length > 1 ? 's' : ''} en baisse par rapport à la semaine précédente` : 'Pas de semaine précédente à comparer' },
    'joint-pain-recurring': { auto: painDays >= 2, detail: painDays ? `Douleur signalée ${painDays} jour${painDays > 1 ? 's' : ''}` : 'Aucune douleur signalée' },
  };
  return { signals, stats: { workouts: doneW.length, checkins: checkins.length, fatigue, soreness, drops } };
}

/** Recommandation du programme selon le nombre de signaux retenus. */
export function recommend(program, count) {
  if (count >= program.progressionGate.deloadIfSignalsAtLeast) return 'deload';
  if (count >= 1) return 'maintain';
  return 'progress';
}

export const DECISION_TEXT = {
  progress: { title: 'Passer à la semaine suivante', short: 'Semaine suivante', why: 'Aucun signal de fatigue : la récupération suit, on applique les réglages de la semaine suivante.' },
  maintain: { title: 'Refaire les réglages de cette semaine', short: 'Semaine maintenue', why: 'Un signal est présent : on garde les mêmes séries et le même RIR une semaine de plus. Le cycle se décale d\'une semaine.' },
  deload: { title: 'Faire une semaine de décharge', short: 'Décharge', why: 'Deux signaux ou plus : moitié des séries, mêmes charges, RIR 3–4. Course et natation faciles.' },
};

/** Semaine réelle dont le bilan est à faire aujourd'hui (à partir du samedi), ou null. */
export function pendingReview(program, reviews, today) {
  const info = cycleInfo(program, today);
  if (info.status !== 'during') return null;
  const dow = (toDayNumber(today) - toDayNumber(program.startDate)) % 7; // 0 = lundi
  // Samedi ou dimanche : bilan de la semaine en cours. Lundi : bilan de la semaine passée s'il manque.
  const target = dow >= 5 ? info.calWeek : dow === 0 && info.calWeek > 1 ? info.calWeek - 1 : null;
  if (!target) return null;
  if (reviews.some((r) => r.calWeek === target)) return null;
  const cal = program.calendar || [];
  const isLast = (cal[target - 1] || {}).week === program.weeks && !(cal[target - 1] || {}).deload;
  return { calWeek: target, isLast };
}
