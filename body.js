// Corps et récupération : pesées (tendance), mensurations, ressenti du matin.
// Protocoles du programme : 3 pesées par semaine au réveil, on regarde la moyenne de la semaine ;
// mensurations en S1 puis S5, au réveil, même côté, même mètre ruban.
import { addDays, toDayNumber, mondayOf } from './dates.js';

export const MEASURES = [
  { id: 'waist', label: 'Tour de taille', how: 'Au nombril, en fin d\'expiration normale.' },
  { id: 'chest', label: 'Tour de poitrine', how: 'Au niveau des mamelons, bras relâchés.' },
  { id: 'arm', label: 'Tour de bras', how: 'Bras relâché, au plus gros. Toujours le même côté.' },
  { id: 'thigh', label: 'Tour de cuisse', how: 'À mi-distance entre la hanche et le genou. Même côté.' },
];

export const CHECKIN_SCALES = [
  { id: 'sleepQ', label: 'Qualité du sommeil', low: 'mauvaise', high: 'excellente' },
  { id: 'fatigue', label: 'Fatigue', low: 'en forme', high: 'épuisé' },
  { id: 'soreness', label: 'Courbatures', low: 'aucune', high: 'fortes' },
  { id: 'motivation', label: 'Motivation', low: 'aucune', high: 'au top' },
];

const byDate = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '');

/** Pesées triées, une valeur par jour (la première du jour, prise au réveil). */
export function weights(entries) {
  const out = new Map();
  entries.filter((e) => e.kind === 'weight' && typeof e.kg === 'number').sort(byDate).forEach((e) => { if (!out.has(e.date)) out.set(e.date, e); });
  return [...out.values()];
}

/** Moyenne mobile sur 7 jours glissants (tendance, insensible aux variations d'eau d'un jour). */
export function trend(points, days = 7) {
  return points.map((p) => {
    const d = toDayNumber(p.date);
    const win = points.filter((q) => toDayNumber(q.date) > d - days && toDayNumber(q.date) <= d);
    return { date: p.date, kg: p.kg, avg: win.reduce((n, q) => n + q.kg, 0) / win.length };
  });
}

/** Moyennes par semaine (lundi → dimanche). */
export function weeklyAverages(points) {
  const m = new Map();
  points.forEach((p) => {
    const k = mondayOf(p.date);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p.kg);
  });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monday, xs]) => ({ monday, n: xs.length, avg: xs.reduce((a, b) => a + b, 0) / xs.length }));
}

/**
 * Lecture de la tendance pour l'objectif « prise de muscle propre » (recomposition ou léger surplus).
 * Repère : environ +0,1 à +0,25 kg par semaine. Retourne { rate, text, tone }.
 */
export function trendReading(points) {
  const w = weeklyAverages(points).filter((x) => x.n >= 2);
  if (w.length < 2) return { rate: null, tone: 'info', text: 'Il faut au moins deux semaines avec deux pesées pour lire une tendance.' };
  const recent = w.slice(-3);
  const weeks = (toDayNumber(recent[recent.length - 1].monday) - toDayNumber(recent[0].monday)) / 7;
  const rate = (recent[recent.length - 1].avg - recent[0].avg) / weeks;
  const r = Math.round(rate * 100) / 100;
  const txt = `${r > 0 ? '+' : ''}${String(r).replace('.', ',')} kg par semaine`;
  if (rate > 0.35) return { rate, tone: 'warn', text: `${txt} : prise rapide. Si le tour de taille monte aussi, retirez environ 150 kcal par jour.` };
  if (rate >= 0.05) return { rate, tone: 'ok', text: `${txt} : dans la zone visée pour prendre du muscle en restant sec.` };
  if (rate > -0.15) return { rate, tone: 'info', text: `${txt} : poids stable. C'est une recomposition ; si les charges stagnent, ajoutez environ 150 kcal par jour.` };
  return { rate, tone: 'warn', text: `${txt} : le poids baisse. Ce n'est pas l'objectif de ce cycle : ajoutez environ 200 kcal par jour.` };
}

export function latestWeight(entries) {
  const w = weights(entries);
  return w.length ? w[w.length - 1] : null;
}

/** Mensurations : la série de chaque mesure, la plus ancienne d'abord. */
export function measureSeries(entries) {
  const list = entries.filter((e) => e.kind === 'measure').sort(byDate);
  return Object.fromEntries(MEASURES.map((m) => [m.id, list.filter((e) => typeof e[m.id] === 'number').map((e) => ({ date: e.date, value: e[m.id] }))]));
}

export function checkinFor(entries, date) {
  return entries.find((e) => e.kind === 'checkin' && e.date === date) || null;
}

/** Ajustement du jour selon le ressenti (règles d'ajustement du programme). */
export function dayAdvice(program, checkin) {
  if (!checkin) return [];
  const out = [];
  const adj = (id) => program.dayAdjustments.find((d) => d.id === id);
  if (typeof checkin.sleepH === 'number' && checkin.sleepH < 6 && adj('bad-night')) out.push({ id: 'bad-night', title: 'Nuit courte', text: adj('bad-night').reminder });
  if (checkin.fatigue >= 4 && adj('high-fatigue')) out.push({ id: 'high-fatigue', title: 'Fatigue élevée', text: adj('high-fatigue').reminder });
  if (checkin.soreness >= 4 && adj('strong-soreness')) out.push({ id: 'strong-soreness', title: 'Courbatures fortes', text: adj('strong-soreness').reminder });
  if (checkin.pain) out.push({ id: 'pain', title: 'Douleur signalée', text: 'Douleur articulaire ou localisée : arrêtez l\'exercice qui la provoque et passez à une alternative indolore. Si elle dure plus de 7 jours, consultez.' });
  return out;
}

/** Jours de pesée (0 = lundi). Par défaut lundi, mercredi, vendredi. */
export function isWeighDay(settings, date) {
  const days = (settings && settings.weighDays) || [0, 2, 4];
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return days.includes(dow);
}

export function weekRange(date) {
  const m = mondayOf(date);
  return { start: m, end: addDays(m, 6) };
}
