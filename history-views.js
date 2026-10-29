// Journal : toutes les activités et mesures, de la plus récente à la plus ancienne ; détail d'une séance
// avec correction des séries.
import { esc, exName, shortName } from './views.js';
import { formatDateFr, mondayOf, addDays } from './dates.js';
import { setsOf, weekForDate, workoutPlan } from './workout.js';
import { icon, nf, nf0 } from './ui.js';
import { setTxt } from './workout-views.js';
import { fmtDuration, fmtPace, paceSecPerKm, paceSecPer100 } from './endurance.js';

const minutes = (w) => (w.endedAt ? Math.max(1, Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000)) : null);

const FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'lift', label: 'Muscu' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'body', label: 'Corps' },
];

/** Éléments du journal, normalisés pour l'affichage. */
export function journalItems(state) {
  const { program } = state;
  const items = [];
  (state.workouts || []).filter((w) => w.status !== 'in-progress').forEach((w) => {
    const s = program.sessions.find((x) => x.id === w.sessionId);
    const n = setsOf(state.sets || [], w.id).length;
    items.push({
      date: w.date, at: w.startedAt, group: 'lift', cls: 'lift', ic: 'lift', action: 'open-workout', id: w.id,
      title: `Séance ${w.sessionId}${s ? `, ${shortName(s).replace(/, \w+$/, '').toLowerCase()}` : ''}`,
      sub: [`${n} séries`, minutes(w) ? `${minutes(w)} min` : null, w.difficulty ? `difficulté ${w.difficulty}/10` : null, w.status === 'abandoned' ? 'abandonnée' : null, w.backfill ? 'saisie après coup' : null].filter(Boolean).join(', '),
    });
  });
  (state.entries || []).forEach((e) => {
    const base = { date: e.date, at: e.createdAt || '', id: e.id, action: 'edit-entry' };
    if (e.kind === 'run') items.push({ ...base, group: 'endurance', cls: 'run', ic: 'run', title: 'Course', sub: [fmtDuration(e.durationSec), e.distanceM ? `${nf(e.distanceM / 1000, 2)} km` : null, e.distanceM && e.durationSec ? `${fmtPace(paceSecPerKm(e.durationSec, e.distanceM / 1000))} /km` : null, e.avgHr ? `${e.avgHr} bpm` : null].filter(Boolean).join(', ') });
    if (e.kind === 'swim') items.push({ ...base, group: 'endurance', cls: 'swim', ic: 'swim', title: 'Natation', sub: [e.distanceM ? `${nf0(e.distanceM)} m` : null, fmtDuration(e.durationSec), e.test400Sec ? `400 m en ${fmtDuration(e.test400Sec)}` : null].filter(Boolean).join(', ') });
    if (e.kind === 'mobility') items.push({ ...base, group: 'endurance', cls: 'mob', ic: 'mobility', title: `Mobilité ${e.variant || ''}`, sub: e.minutes ? `${e.minutes} min` : 'Faite' });
    if (e.kind === 'weight') items.push({ ...base, group: 'body', cls: 'body', ic: 'scale', title: 'Pesée', sub: `${nf(e.kg)} kg` });
    if (e.kind === 'measure') items.push({ ...base, group: 'body', cls: 'body', ic: 'body', title: 'Mensurations', sub: [['waist', 'taille'], ['chest', 'poitrine'], ['arm', 'bras'], ['thigh', 'cuisse']].filter(([k]) => typeof e[k] === 'number').map(([k, l]) => `${l} ${nf(e[k])}`).join(', ') });
    if (e.kind === 'checkin') items.push({ ...base, group: 'body', cls: 'body', ic: 'moon', title: 'Ressenti du matin', sub: [typeof e.sleepH === 'number' ? `${nf(e.sleepH)} h de sommeil` : null, e.fatigue ? `fatigue ${e.fatigue}/5` : null, e.pain ? 'douleur' : null].filter(Boolean).join(', ') });
    if (e.kind === 'photo-meta') items.push({ ...base, group: 'body', cls: 'body', ic: 'camera', title: 'Photo de suivi', sub: { face: 'Face', profil: 'Profil', dos: 'Dos' }[e.pose] || '', action: 'open-photos' });
  });
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
}

export function renderJournal(state) {
  const filter = state.journalFilter || 'all';
  // Le ressenti quotidien n'apparaît que dans « Corps », pour garder « Tout » lisible.
  const items = journalItems(state).filter((i) => (filter === 'all' ? i.ic !== 'moon' : i.group === filter));
  const head = `<header class="page-head row-head"><div><h1 class="display">Journal</h1></div><button class="btn small" data-action="sheet" data-value="add">${icon('plus')} Ajouter</button></header>
    <div class="seg" role="group" aria-label="Filtre">${FILTERS.map((f) => `<button class="chip${f.id === filter ? ' on' : ''}" data-action="journal-filter" data-value="${f.id}">${esc(f.label)}</button>`).join('')}</div>`;
  if (!items.length) {
    return `${head}<div class="empty">${filter === 'all' ? 'Rien pour l\'instant. Vos séances, courses, nages, pesées et mesures apparaîtront ici.' : 'Rien dans cette catégorie pour l\'instant.'}
      <button class="btn quiet" data-action="sheet" data-value="add">${icon('plus')} Ajouter quelque chose</button></div>`;
  }
  // Regroupement par semaine (lundi).
  const weeks = new Map();
  items.forEach((i) => { const k = mondayOf(i.date); if (!weeks.has(k)) weeks.set(k, []); weeks.get(k).push(i); });
  return `${head}${[...weeks.entries()].map(([monday, list]) => `
    <h3 class="section">Semaine du ${esc(formatDateFr(monday, { weekday: false }))} au ${esc(formatDateFr(addDays(monday, 6), { weekday: false }))}</h3>
    <div class="group">${list.map((i) => `
      <button class="row" data-action="${i.action}" data-id="${esc(i.id)}">
        <span class="row-ic ${i.cls}">${icon(i.ic)}</span>
        <span class="row-main"><b>${esc(i.title)}</b><span>${esc(formatDateFr(i.date, { weekday: true }))}${i.sub ? `, ${esc(i.sub)}` : ''}</span></span>
        <span class="row-end">${icon('chevron')}</span>
      </button>`).join('')}</div>`).join('')}`;
}

export function renderWorkoutDetail(state) {
  const { program, lib } = state;
  const w = (state.workouts || []).find((x) => x.id === state.detailId);
  if (!w) return '<div class="empty">Séance introuvable.</div>';
  const s = program.sessions.find((x) => x.id === w.sessionId);
  const sets = setsOf(state.sets || [], w.id);
  const plan = workoutPlan(program, w, (state.settings || {}).increments);
  const blocks = plan.map((x) => {
    const mine = sets.filter((y) => y.slotId === x.slotId);
    const names = mine.length ? [...new Set(mine.map((y) => y.exercise))].map((id) => exName(lib, id)).join(' puis ') : exName(lib, x.exercise);
    return `<li class="det"><div class="det-head"><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(names)}</span></div>
      ${mine.length ? `<div class="set-chips">${mine.map((y) => `<button class="set-chip" data-action="edit-set" data-id="${esc(y.id)}">${esc(setTxt(y))}</button>`).join('')}</div>` : '<div class="muted small">Non fait</div>'}</li>`;
  }).join('');
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Journal</button><p class="kicker">${esc(formatDateFr(w.date, { year: true }))}, semaine ${weekForDate(program, w.date)} du programme</p><h1 class="display">Séance ${esc(w.sessionId)}</h1><p class="muted">${esc(s ? shortName(s) : '')}</p></header>
    <div class="facts">${[`<span><b>${sets.length}</b> séries</span>`, minutes(w) && !w.backfill ? `<span><b>${minutes(w)}</b> min</span>` : '', w.fatigue ? `<span>fatigue <b>${w.fatigue}</b>/5</span>` : '', w.difficulty ? `<span>difficulté <b>${w.difficulty}</b>/10</span>` : ''].join('')}</div>
    ${w.status === 'abandoned' ? '<div class="notice warn">Séance abandonnée : elle ne compte pas pour les suggestions.</div>' : ''}
    ${w.note ? `<div class="card"><div class="card-kicker">Note</div><p>${esc(w.note)}</p></div>` : ''}
    <p class="muted small">Touchez une série pour la corriger ou la supprimer.</p>
    <ol class="details">${blocks}</ol>
    <button class="btn ghost danger-text" data-action="delete-workout" data-id="${esc(w.id)}">${icon('trash')} Supprimer cette séance</button>`;
}

export { minutes, paceSecPer100 };
