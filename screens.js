// Interface : fonctions pures état → HTML. Aucune donnée n'est insérée sans échappement.
// Deux onglets (Programme, Progrès), une page de séance où tout se saisit dans un tableau, des feuilles pour
// la course, la natation, la démonstration d'un exercice et les réglages.
import { resolveSession } from './program.js';
import { cycleInfo, formatDateFr, addDays, toDayNumber } from './dates.js';
import { workoutPlan, slotSets, suggestionFor, restLeft, setsOf, createWorkout } from './workout.js';
import { fmtKg, loadMode, bestSet } from './suggest.js';
import { hasAnimation, cueOf, viewOf, viewBoxOf } from './anim.js';
import './moves.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (r) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
export const exName = (lib, id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
const shortName = (s) => s.name.replace(/^Séance [ABC] — /, '').replace(/, \w+$/, '');
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const restTxt = (sec) => (!sec ? "—" : sec % 60 ? `${Math.floor(sec / 60)} min ${sec % 60}` : `${sec / 60} min`);
const nf = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: d }));
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// ---------- Durées et allures ----------

/** « 42 », « 41:30 », « 1:02:10 » → secondes. */
export function parseDuration(text) {
  const t = String(text || '').trim().replace(/[hH]/, ':').replace(/\s/g, '');
  if (!t) return null;
  if (/^\d+([.,]\d+)?$/.test(t)) return Math.round(Number(t.replace(',', '.')) * 60);
  const parts = t.split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}
export function fmtDuration(sec) {
  if (!sec && sec !== 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export const fmtPace = (sec) => (sec && Number.isFinite(sec) ? clock(sec) : '—');

// ---------- Icônes ----------

const I = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1.7" class="f"/><circle cx="12" cy="12" r="1.7" class="f"/><circle cx="19" cy="12" r="1.7" class="f"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  play: '<path d="M8 5l11 7-11 7z" class="f"/>',
  lift: '<path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"/>',
  run: '<circle cx="15" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5"/><path d="M6 12l3-4 4 1 2 4 3 1"/>',
  swim: '<path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="16" cy="7" r="1.8"/><path d="M5 13l5-5 3 3 3-1"/>',
  mob: '<circle cx="12" cy="4.5" r="1.8"/><path d="M12 7v6l-4 7M12 13l4 7M5 10l7-1 7 1"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  swap: '<path d="M7 4L3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="M17 20l4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

/** Démonstration : animation dessinée si elle existe, sinon les deux photos qui s'enchaînent. */
export function demo(lib, id, cls = '') {
  const ex = lib.exercises.find((e) => e.id === id);
  if (hasAnimation(id)) return `<div class="demo anim ${cls}"><svg data-anim="${esc(id)}" viewBox="${esc(viewBoxOf(id))}" class="${cls === 'big' ? 'anim-svg' : 'thumb-svg'}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Démonstration : ${esc(ex ? ex.name : id)}"></svg></div>`;
  if (ex && ex.image) return `<div class="demo ${cls}"><img src="./img/${esc(ex.image)}-0.jpg" alt="" loading="lazy"><img src="./img/${esc(ex.image)}-1.jpg" alt="" loading="lazy" class="b"></div>`;
  return `<div class="demo ${cls} empty"></div>`;
}

// ---------- Accueil : « Qu'est-ce qu'on fait aujourd'hui ? » ----------

/** Lundi de la semaine qui contient la date. */
export function mondayOf(date) {
  const d = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}

export const sessionNumber = (program, sid) => program.sessionOrder.indexOf(sid) + 1;
export const sessionTitle = (program, sid) => `Séance ${sessionNumber(program, sid)}`;
export const sessionSub = (program, sid) => shortName(program.sessions.find((x) => x.id === sid));

/** Ce qui a été fait pendant la semaine (lundi → dimanche) qui contient `date`. */
export function weekSummary(state, date = state.today) {
  const start = mondayOf(date);
  const end = addDays(start, 6);
  const inWeek = (d) => d >= start && d <= end;
  const lifts = (state.workouts || []).filter((w) => w.status === 'done' && inWeek(w.date)).sort((x, y) => x.date.localeCompare(y.date));
  const runs = (state.entries || []).filter((e) => e.kind === 'run' && inWeek(e.date));
  const swims = (state.entries || []).filter((e) => e.kind === 'swim' && inWeek(e.date));
  const doneIds = new Set(lifts.map((w) => w.sessionId));
  const todo = state.program.sessionOrder.filter((id) => !doneIds.has(id));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    const marks = [
      ...lifts.filter((w) => w.date === d).map((w) => ({ kind: 'lift', label: String(sessionNumber(state.program, w.sessionId)) })),
      ...runs.filter((e) => e.date === d).map(() => ({ kind: 'run', label: 'C' })),
      ...swims.filter((e) => e.date === d).map(() => ({ kind: 'swim', label: 'N' })),
    ];
    return { date: d, i, marks };
  });
  return { start, end, lifts, runs, swims, doneIds, todo, days };
}

const KM = (m) => nf(m / 1000, 1);

export function renderHome(state) {
  const { program, today } = state;
  const wk = weekSummary(state);
  const next = wk.todo[0];
  const liftN = Math.min(3, wk.lifts.length);
  const runM = wk.runs.reduce((n, e) => n + (e.distanceM || 0), 0);
  const swimM = wk.swims.reduce((n, e) => n + (e.distanceM || 0), 0);
  const recent = [
    ...(state.workouts || []).filter((w) => w.status === 'done').map((w) => ({ kind: 'lift', date: w.date, at: w.endedAt || w.startedAt, w })),
    ...(state.entries || []).filter((e) => e.kind === 'run' || e.kind === 'swim').map((e) => ({ kind: e.kind, date: e.date, at: e.createdAt || '', e })),
  ].sort((x, y) => (y.date + y.at).localeCompare(x.date + x.at)).slice(0, 5);
  const monthly = monthlyDue(state);
  const short = (d) => formatDateFr(d, { weekday: true }).split(' ')[0].slice(0, 3) + '.';
  return `
    <header class="top"><div><p class="brand"><img src="./icon-192.png" alt="">JR Athletics</p><h1>Qu'est-ce qu'on fait aujourd'hui ?</h1></div></header>
    ${state.toast ? `<div class="toast">${icon('check')}<span>${esc(state.toast)}</span></div>` : ''}
    ${state.active ? `<button class="resume" data-action="resume">${icon('play')} ${esc(sessionTitle(program, state.active.workout.sessionId))} en cours : reprendre</button>` : ''}
    <section class="week" data-test="week">
      <div class="wk-t"><span>Cette semaine</span><span>${esc(formatDateFr(wk.start, { weekday: false }))} → ${esc(formatDateFr(wk.end, { weekday: false }))}</span></div>
      <div class="wk-goals">
        <div class="wk-g lift"><b>${liftN}<small>/3</small></b><span>Muscu</span><span class="dots">${[0, 1, 2].map((i) => `<i${i < liftN ? ' class="on"' : ''}></i>`).join('')}</span></div>
        <div class="wk-g run"><b>${wk.runs.length}</b><span>Course${wk.runs.length > 1 ? 's' : ''}${runM ? ` · ${KM(runM)} km` : ''}</span></div>
        <div class="wk-g swim"><b>${wk.swims.length}</b><span>Natation${swimM ? ` · ${nf(swimM, 0)} m` : ''}</span></div>
      </div>
      <div class="wk-days">${wk.days.map((d) => `<div class="${d.date === today ? 'today' : ''}"><span>${DAY_SHORT[d.i]}</span><span class="wk-m">${d.marks.length ? d.marks.map((m) => `<u class="${m.kind}">${esc(m.label)}</u>`).join('') : '<u></u>'}</span></div>`).join('')}</div>
    </section>
    ${monthly ? `<button class="month" data-action="log-weight">${icon('chart')}<span><b>Point du mois</b><span>Note ton poids et ton tour de taille : l'appli te dit s'il faut ajuster tes calories.</span></span></button>` : ''}
    <div class="choices">
      <button class="choice lift" data-action="go" data-tab="muscu"><span class="ch-ic">${icon('lift')}</span><span><b>Muscu</b><span>${next ? `${wk.lifts.length}/3 cette semaine · conseillée : ${esc(sessionTitle(program, next))}` : '3/3 cette semaine : bravo. Séance bonus possible'}</span></span></button>
      <button class="choice run" data-action="log-endurance" data-kind="run" data-date="${esc(today)}"><span class="ch-ic">${icon('run')}</span><span><b>Course</b><span>Distance et durée : l'allure se calcule</span></span></button>
      <button class="choice swim" data-action="log-endurance" data-kind="swim" data-date="${esc(today)}"><span class="ch-ic">${icon('swim')}</span><span><b>Natation</b><span>Distance et durée : l'allure aux 100 m se calcule</span></span></button>
    </div>
    ${recent.length ? `<p class="sec-t">Derniers entraînements</p><div class="recent">${recent.map((r) => r.kind === 'lift'
    ? `<div class="rc lift"><i></i><span><b>${esc(sessionTitle(program, r.w.sessionId))}</b> · ${esc(sessionSub(program, r.w.sessionId))}</span><em>${esc(short(r.date))}</em></div>`
    : `<button class="rc ${r.kind}" data-action="edit-endurance" data-id="${esc(r.e.id)}"><i></i><span><b>${esc(r.e.title || (r.kind === 'run' ? 'Course' : 'Natation'))}</b> · ${r.kind === 'run' ? `${KM(r.e.distanceM || 0)} km` : `${nf(r.e.distanceM || 0, 0)} m`}${paceTxt(r.e) ? ` · ${paceTxt(r.e)}` : ''}</span><em>${esc(short(r.date))}</em></button>`).join('')}</div>` : ''}`;
}

const paceOfEntry = (e) => (e.distanceM && e.durationSec ? (e.kind === 'run' ? e.durationSec / (e.distanceM / 1000) : e.durationSec / (e.distanceM / 100)) : null);
const paceTxt = (e) => { const p = paceOfEntry(e); return p ? `${fmtPace(p)}${e.kind === 'run' ? '/km' : '/100 m'}` : ''; };

/** Le point du mois est dû si aucun poids n'a été noté depuis le 1er du mois en cours. */
export function monthlyDue(state) {
  const first = `${state.today.slice(0, 7)}-01`;
  return !(state.entries || []).some((e) => e.kind === 'weight' && e.date >= first);
}

// ---------- Muscu : choisir une des 3 séances ----------

export function renderMuscu(state) {
  const { program, lib } = state;
  const wk = weekSummary(state);
  const rule = program.weekRules.find((r) => r.week === weekForToday(state)) || program.weekRules[0];
  return `
    <header class="sess-top"><button class="icon-btn" data-action="go" data-tab="home" aria-label="Retour">${icon('back')}</button><div class="st-title"><b>Muscu</b><span>${wk.lifts.length}/3 séances cette semaine</span></div><span></span></header>
    <p class="lead">Choisis ta séance. L'ordre est libre : l'important, c'est de faire les trois dans la semaine.</p>
    ${program.sessionOrder.map((sid) => {
    const s = program.sessions.find((x) => x.id === sid);
    const res = resolveSession(program, sid, weekForToday(state));
    const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
    const doneW = wk.lifts.filter((w) => w.sessionId === sid);
    const active = state.active && state.active.workout.sessionId === sid;
    const advised = !active && wk.todo[0] === sid;
    return `<button class="sess-card${doneW.length ? ' done' : ''}${advised ? ' advised' : ''}" data-action="open-session" data-value="${esc(sid)}" data-test="session-${esc(sid)}">
        <span class="sc-head"><span class="sc-num">${sessionNumber(program, sid)}</span><span class="sc-t"><b>${esc(sessionSub(program, sid))}</b><span>${res.length} exercices · ${sets} séries · ~${s.id === 'C' ? 65 : 60} min</span></span>
        <span class="sc-st">${active ? '<em class="pill live">En cours</em>' : doneW.length ? `<em class="pill ok">${icon('check')} ${esc(formatDateFr(doneW[0].date, { weekday: true }).split(' ')[0])}</em>` : advised ? '<em class="pill adv">Conseillée</em>' : ''}</span></span>
        <span class="sc-ex">${res.map((x) => `<span>${demo(lib, x.exercise, 'mini')}</span>`).join('')}</span>
        <span class="sc-obj">${esc(s.objective)}</span>
      </button>`;
  }).join('')}
    <p class="hint small">Semaine ${weekForToday(state)} du cycle : RIR ${esc(range(rule.rir.compound))} sur les gros exercices${rule.setDelta ? ', une série de moins par exercice' : ''}.</p>`;
}

function weekForToday(state) {
  const info = cycleInfo(state.program, state.today);
  const total = (state.program.calendar || []).length || state.program.weeks;
  const cw = info.status === 'during' ? info.calWeek : info.status === 'before' ? 1 : total;
  const cal = (state.program.calendar || [])[cw - 1];
  return cal ? cal.week : cw;
}

function enduranceRow(e) {
  const pace = e.kind === 'run' ? (e.distanceM && e.durationSec ? e.durationSec / (e.distanceM / 1000) : null) : (e.distanceM && e.durationSec ? e.durationSec / (e.distanceM / 100) : null);
  return `<button class="end-row ${e.kind}" data-action="edit-endurance" data-id="${esc(e.id)}">
    <span class="er-title">${esc(e.title || (e.kind === 'run' ? 'Course' : 'Natation'))}</span>
    <span class="er-vals">
      <span><b>${e.kind === 'run' ? nf((e.distanceM || 0) / 1000, 2) : nf(e.distanceM || 0, 0)}</b> ${e.kind === 'run' ? 'km' : 'm'}</span>
      <span><b>${esc(fmtDuration(e.durationSec) || '—')}</b> durée</span>
      <span><b>${fmtPace(pace)}</b> ${e.kind === 'run' ? '/km' : '/100 m'}</span>
    </span></button>`;
}

// ---------- Séance : tout le programme du jour dans un tableau ----------

export function sessionModel(state) {
  const { program } = state;
  const w = state.active ? state.active.workout : state.draftWorkout;
  const plan = workoutPlan(program, w, (state.settings || {}).increments);
  const sets = state.active ? state.active.sets : [];
  return { w, plan, sets };
}

/** Valeurs proposées pour chaque ligne d'un exercice : série faite, saisie en cours, sinon la suggestion. */
export function rowValues(state, item, sug, history, done) {
  const edits = (state.edits || {})[item.slotId] || {};
  const rows = [];
  for (let i = 0; i < item.sets; i += 1) {
    const s = done[i];
    if (s) { rows.push({ done: true, set: s, kg: s.loadKg, reps: s.reps }); continue; }
    const lastDone = [...rows].reverse().find((r) => r.done);
    const last = history[0] && history[0].sets[i];
    let kg = sug.load ?? (last ? last.loadKg : null);
    let reps = sug.targets && sug.targets[i] !== undefined ? sug.targets[i] : sug.reps ?? (last ? last.reps : item.reps.min);
    if (lastDone) kg = lastDone.kg;
    if (edits[i]) { if ('kg' in edits[i]) kg = edits[i].kg; if ('reps' in edits[i]) reps = edits[i].reps; }
    rows.push({ done: false, kg, reps });
  }
  return rows;
}

/** Une ligne de la séance : un exercice, ou une supersérie (deux exercices liés). */
export function sessionGroups(plan) {
  const out = [];
  for (const item of plan) {
    if (item.superset) {
      const g = out.find((x) => x.superset === item.superset);
      if (g) { g.items.push(item); continue; }
      out.push({ superset: item.superset, items: [item], key: item.slotId });
    } else out.push({ superset: null, items: [item], key: item.slotId });
  }
  return out;
}

export function renderSession(state) {
  const { lib, program } = state;
  const { w, plan, sets } = sessionModel(state);
  const planned = plan.reduce((n, x) => n + x.sets, 0);
  const doneN = plan.reduce((n, x) => n + Math.min(x.sets, slotSets(sets, x.slotId).length), 0);
  const rows = sessionGroups(plan).map((g) => {
    const done = g.items.reduce((n, it) => n + Math.min(it.sets, slotSets(sets, it.slotId).length), 0);
    const total = g.items.reduce((n, it) => n + it.sets, 0);
    const st = done >= total ? 'ok' : done ? 'part' : '';
    return `<button class="ex-row ${st}" data-action="open-ex" data-value="${esc(g.key)}" data-test="ex-row">
      ${g.superset ? `<span class="ss-tag">Supersérie</span>` : ''}
      ${g.items.map((it) => `<span class="er-line">${demo(lib, it.exercise, 'mini')}<span class="er-main"><b>${esc(exName(lib, it.exercise))}</b><span>${it.sets} × ${esc(range(it.reps))}${it.perSide ? ' /côté' : ''}</span></span></span>`).join('')}
      <span class="er-st">${st === 'ok' ? icon('check') : `${done}/${total}`}</span>
    </button>`;
  }).join('');
  return `
    <header class="sess-top">
      <button class="icon-btn" data-action="close-session" aria-label="Retour">${icon('back')}</button>
      <div class="st-title"><b>${esc(sessionTitle(program, w.sessionId))} · ${esc(sessionSub(program, w.sessionId))}</b><span>${doneN}/${planned} séries · <span id="elapsed">${state.active ? '' : 'pas commencée'}</span></span></div>
      <button class="btn small ${doneN ? '' : 'quiet'}" data-action="finish">Terminer</button>
    </header>
    <div class="bar"><span style="width:${Math.round((doneN / planned) * 100)}%"></span></div>
    <label class="date-chip">${icon('cal')}<span>${w.date === state.today ? 'Aujourd\'hui' : esc(formatDateFr(w.date))}</span><input type="date" id="session-date" value="${esc(w.date)}" max="${esc(state.today)}" aria-label="Date de la séance"></label>
    <p class="sess-hint">Touche un exercice pour voir le mouvement et noter tes séries.</p>
    <div class="ex-rows">${rows}</div>
    <button class="btn big" data-action="finish">Terminer la séance</button>
    <div class="rest-dock" id="rest-dock">${state.active ? renderRest(state.active.workout) : ''}</div>`;
}

/** Page d'un exercice (ou d'une supersérie) : le mouvement en grand, l'objectif, le tableau des séries. */
export function renderExercisePage(state) {
  const { lib, program } = state;
  const { w, plan, sets } = sessionModel(state);
  const g = sessionGroups(plan).find((x) => x.key === state.exKey) || sessionGroups(plan)[0];
  const allDone = g.items.every((it) => slotSets(sets, it.slotId).length >= it.sets);
  const first = g.items[0];
  const restRound = g.superset ? (program.sessions.find((s) => s.id === w.sessionId).supersets.find((x) => x.id === g.superset) || {}).restAfterRoundSec : null;
  return `
    <header class="sess-top">
      <button class="icon-btn" data-action="back-to-session" aria-label="Retour à la séance">${icon('back')}</button>
      <div class="st-title"><b>${g.superset ? 'Supersérie' : esc(exName(lib, first.exercise))}</b><span>${esc(sessionTitle(program, w.sessionId))} · ${esc(sessionSub(program, w.sessionId))}</span></div>
      <span></span>
    </header>
    ${g.superset ? `<p class="ss-explain">Enchaîne <b>${esc(exName(lib, g.items[0].exercise))}</b> puis <b>${esc(exName(lib, g.items[1].exercise))}</b> sans repos, puis ${esc(restTxt(restRound))} de repos. Répète ${g.items[0].sets} fois.</p>` : ''}
    ${g.items.map((it) => `${demo(lib, it.exercise, 'big')}${cueOf(it.exercise) ? `<p class="cue" data-test="cue">${esc(cueOf(it.exercise))}</p>` : ''}${exerciseCard(state, it, sets, w)}`).join('')}
    <button class="btn big${allDone ? '' : ' quiet'}" data-action="back-to-session" data-test="back-to-session">${allDone ? `${icon('check')} Exercice terminé : retour à la séance` : 'Retour à la séance'}</button>
    <div class="rest-dock" id="rest-dock">${state.active ? renderRest(state.active.workout) : ''}</div>`;
}

function exerciseCard(state, item, sets, w) {
  const { lib } = state;
  const done = slotSets(sets, item.slotId).sort((a, b) => a.index - b.index);
  const { history, suggestion } = suggestionFor(item, state.workouts || [], state.sets || [], w);
  const rows = rowValues(state, item, suggestion, history, done);
  const mode = loadMode(item, item.increment);
  const up = suggestion.kind === 'increase' || suggestion.kind === 'choice';
  const complete = done.length >= item.sets;
  const nextIdx = rows.findIndex((r) => !r.done);
  const last = history[0];
  const fb = state.fallback && state.fallback.slotId === item.slotId ? state.fallback : null;
  return `
    <article class="ex-card${complete ? ' complete' : ''}" id="ex-${esc(item.slotId)}">
      <div class="ex-head">
        <div class="ex-info">
          <h3>${esc(exName(lib, item.exercise))}</h3>
          <p>${item.sets} × ${esc(range(item.reps))}${item.perSide ? ' /côté' : ''}${item.rir ? ` · RIR ${esc(range(item.rir))}` : ''}${item.superset ? '' : ` · repos ${esc(restTxt(item.restSec))}`}</p>
          ${item.swap ? `<p class="swap-note">Remplace : ${esc(exName(lib, item.planned))}</p>` : ''}
        </div>
        <button class="icon-btn ghost" data-action="ex-menu" data-value="${esc(item.slotId)}" aria-label="Options">${icon('more')}</button>
      </div>
      ${state.menu === item.slotId ? `<div class="ex-menu">
        ${[item.planned, ...item.raw.alternatives].filter((id) => id !== item.exercise).map((id) => `<button data-action="swap" data-slot="${esc(item.slotId)}" data-value="${esc(id)}">${icon('swap')} ${esc(exName(lib, id))}${id === item.planned ? ' (prévu)' : ''}</button>`).join('')}
      </div>` : ''}
      <div class="goal${up ? ' up' : ''}" data-test="suggestion">${up ? icon('up') : ''}<span><b>${esc(suggestion.title)}</b>${last ? ` · dernière fois ${last.sets.map((x) => esc(`${x.loadKg ? `${fmtKg(x.loadKg)}×` : ''}${x.reps}`)).join(', ')}` : ''}</span></div>
      ${suggestion.options.length ? `<div class="opts">${suggestion.options.map((o, i) => `<button class="chip small" data-action="pick-option" data-slot="${esc(item.slotId)}" data-value="${i}">${esc(o.label)}</button>`).join('')}</div>` : ''}
      ${fb ? `<div class="fallback" data-test="fallback">Moins de ${fb.belowReps} répétitions : finir sur ${fb.exercises.map((id) => `<button class="chip small" data-action="accept-fallback" data-slot="${esc(item.slotId)}" data-value="${esc(id)}">${esc(exName(lib, id))}</button>`).join('')}<button class="chip small" data-action="refuse-fallback">Non</button></div>` : ''}
      <table class="sets">
        <thead><tr><th>Série</th>${mode === 'none' ? '' : `<th>${mode === 'added' ? 'Lest' : 'kg'}</th>`}<th>Reps</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr class="${r.done ? 'done' : i === nextIdx ? 'next' : ''}">
            <td class="n">${i + 1}</td>
            ${mode === 'none' ? '' : `<td><input class="num" inputmode="decimal" data-slot="${esc(item.slotId)}" data-i="${i}" data-f="kg" value="${r.kg === null || r.kg === undefined ? '' : esc(fmtKg(r.kg))}" placeholder="kg"${r.done ? ' disabled' : ''} aria-label="Poids série ${i + 1}"></td>`}
            <td><input class="num" inputmode="numeric" data-slot="${esc(item.slotId)}" data-i="${i}" data-f="reps" value="${r.reps === null || r.reps === undefined ? '' : esc(r.reps)}" placeholder="reps"${r.done ? ' disabled' : ''} aria-label="Répétitions série ${i + 1}"></td>
            <td><button class="tick${r.done ? ' on' : ''}" data-action="${r.done ? 'undo-set' : 'do-set'}" data-slot="${esc(item.slotId)}" data-i="${i}" ${r.done ? `data-id="${esc(r.set.id)}"` : ''} aria-label="${r.done ? 'Annuler' : 'Valider'} la série ${i + 1}">${icon('check')}</button></td>
          </tr>`).join('')}</tbody>
      </table>
      <button class="add-set" data-action="add-set" data-value="${esc(item.slotId)}">${icon('plus')} Ajouter une série</button>
    </article>`;
}

export function renderRest(w) {
  const left = restLeft(w);
  if (left === null) return '';
  const pct = Math.max(0, Math.min(100, (left / (w.restTotalSec || 1)) * 100));
  return `<div class="rest${left === 0 ? ' over' : ''}">
    <div class="rest-bar"><span id="rest-fill" style="width:${pct}%"></span></div>
    <div class="rest-row">
      <div><span class="rest-label">${left === 0 ? 'C\'est reparti' : 'Repos'}</span><span class="rest-time" id="rest-time">${clock(left)}</span></div>
      <div class="rest-btns"><button class="btn small quiet" data-action="rest-adjust" data-value="-15">−15</button><button class="btn small quiet" data-action="rest-adjust" data-value="15">+15</button><button class="btn small" data-action="rest-skip">${left === 0 ? 'OK' : 'Passer'}</button></div>
    </div></div>`;
}

// ---------- Progrès ----------

function lineChart(points, { fmt = (v) => nf(v), invert = false, cls = 'lift' } = {}) {
  if (points.length < 2) return '';
  const W = 340; const H = 150; const Lp = 40; const R = 10; const T = 12; const B = 22;
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  let y0 = Math.min(...ys); let y1 = Math.max(...ys);
  const span = y1 - y0 || Math.abs(y1) * 0.1 || 1;
  y0 -= span * 0.15; y1 += span * 0.15;
  const X = (x) => Lp + ((x - x0) / (x1 - x0 || 1)) * (W - Lp - R);
  const Y = (y) => { const k = (y - y0) / (y1 - y0); return T + (invert ? k : 1 - k) * (H - T - B); };
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.15, (y0 + y1) / 2, y1 - (y1 - y0) * 0.15];
  const date = (n) => formatDateFr(new Date(n * 86400000).toISOString().slice(0, 10), { weekday: false }).replace(/(\d+ \w{3})\w*/, '$1.');
  return `<svg class="chart ${cls}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution">
    ${ticks.map((t) => `<line x1="${Lp}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="grid"/><text x="${Lp - 6}" y="${(Y(t) + 4).toFixed(1)}" class="yt">${esc(fmt(t))}</text>`).join('')}
    <path d="${d}" class="line"/>${points.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" class="dot"/>`).join('')}
    <text x="${Lp}" y="${H - 5}" class="xt">${esc(date(x0))}</text><text x="${W - R}" y="${H - 5}" class="xt" text-anchor="end">${esc(date(x1))}</text>
  </svg>`;
}

export function exerciseHistory(state) {
  const ws = new Map((state.workouts || []).filter((w) => w.status === 'done').map((w) => [w.id, w]));
  const by = new Map();
  for (const s of state.sets || []) {
    const w = ws.get(s.workoutId);
    if (!w) continue;
    if (!by.has(s.exercise)) by.set(s.exercise, new Map());
    const m = by.get(s.exercise);
    if (!m.has(w.id)) m.set(w.id, { date: w.date, at: w.startedAt, sets: [] });
    m.get(w.id).sets.push(s);
  }
  return [...by.entries()].map(([exercise, m]) => ({ exercise, sessions: [...m.values()].sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at)).map((x) => ({ ...x, best: bestSet(x.sets) })) }));
}

export function renderProgress(state) {
  const tab = state.progressTab || 'lift';
  const seg = [['lift', 'Muscu'], ['run', 'Course'], ['swim', 'Natation'], ['weight', 'Poids']].map(([id, l]) => `<button class="chip${tab === id ? ' on' : ''}" data-action="progress-tab" data-value="${id}">${l}</button>`).join('');
  let body = '';
  if (tab === 'weight') {
    body = renderWeight(state);
  } else if (tab === 'lift') {
    const list = exerciseHistory(state).sort((a, b) => b.sessions.length - a.sessions.length);
    const ups = nextLoads(state);
    body = (ups.length ? `<p class="sec-t">À la prochaine séance</p><div class="ups" data-test="next-loads">${ups.map((u) => `<div class="up-row${u.up ? ' up' : ''}"><span><b>${esc(exName(state.lib, u.exercise))}</b><span>${esc(sessionTitle(state.program, u.sid))}</span></span><em>${esc(u.text)}</em></div>`).join('')}</div><p class="sec-t">Tous les exercices</p>` : '') + (list.length ? `<div class="prog-list">${list.map((r) => {
      const f = r.sessions[0].best; const l = r.sessions[r.sessions.length - 1].best;
      const dKg = (l.loadKg || 0) - (f.loadKg || 0); const dR = l.reps - f.reps;
      const delta = r.sessions.length < 2 ? '' : dKg ? `${dKg > 0 ? '+' : ''}${fmtKg(dKg)} kg` : dR ? `${dR > 0 ? '+' : ''}${dR} rép.` : '=';
      return `<button class="prog-row" data-action="open-exercise" data-value="${esc(r.exercise)}">${demo(state.lib, r.exercise, 'mini')}<span class="pr-main"><b>${esc(exName(state.lib, r.exercise))}</b><span>${l.loadKg ? `${fmtKg(l.loadKg)} kg × ${l.reps}` : `${l.reps} rép.`} · ${r.sessions.length} séance${r.sessions.length > 1 ? 's' : ''}</span></span><span class="delta${dKg > 0 || (!dKg && dR > 0) ? ' up' : ''}">${esc(delta)}</span></button>`;
    }).join('')}</div>` : '<p class="empty">Tes exercices apparaîtront ici après ta première séance.</p>');
  } else {
    const kind = tab;
    const list = (state.entries || []).filter((e) => e.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
    const paceOf = (e) => (e.distanceM && e.durationSec ? (kind === 'run' ? e.durationSec / (e.distanceM / 1000) : e.durationSec / (e.distanceM / 100)) : null);
    const pts = [...list].reverse().filter(paceOf).map((e) => ({ x: toDayNumber(e.date), y: paceOf(e) }));
    const totalM = list.reduce((n, e) => n + (e.distanceM || 0), 0);
    const best = pts.length ? Math.min(...pts.map((p) => p.y)) : null;
    body = `
      <div class="kpis ${kind}">
        <div><b>${list.length}</b><span>séance${list.length > 1 ? 's' : ''}</span></div>
        <div><b>${kind === 'run' ? nf(totalM / 1000, 1) : nf(totalM, 0)}</b><span>${kind === 'run' ? 'km au total' : 'm au total'}</span></div>
        <div><b>${fmtPace(best)}</b><span>meilleure allure ${kind === 'run' ? '/km' : '/100 m'}</span></div>
      </div>
      ${pts.length >= 2 ? `<div class="card"><p class="card-t">Allure ${kind === 'run' ? 'au km' : 'aux 100 m'} <span>plus haut = plus rapide</span></p>${kind === 'run' ? '<p class="hint small">Compare des sorties de même type : une sortie longue et facile est normalement plus lente.</p>' : ''}${lineChart(pts, { fmt: (v) => fmtPace(v), invert: true, cls: kind })}</div>` : ''}
      <button class="btn ${kind}" data-action="log-endurance" data-kind="${kind}" data-date="${esc(state.today)}" data-title="${kind === 'run' ? 'Course' : 'Natation'}">${icon('plus')} Noter ${kind === 'run' ? 'une course' : 'une séance de natation'}</button>
      ${list.length ? `<div class="end-list">${list.map((e) => `<p class="end-date">${esc(formatDateFr(e.date))}</p>${enduranceRow(e)}`).join('')}</div>` : '<p class="empty">Aucune séance notée pour l\'instant.</p>'}`;
  }
  return `<header class="top"><div><p class="brand"><img src="./icon-192.png" alt="">JR Athletics</p><h1>Progrès</h1></div></header>
    ${state.toast ? `<div class="toast">${icon('check')}<span>${esc(state.toast)}</span></div>` : ''}
    <div class="seg">${seg}</div>${body}`;
}


/** Pour chaque exercice déjà travaillé : ce que l'appli proposera à la prochaine séance. */
export function nextLoads(state) {
  const out = [];
  const seen = new Set();
  for (const sid of state.program.sessionOrder) {
    const w = createWorkout(state.program, sid, { date: state.today });
    for (const item of workoutPlan(state.program, w, (state.settings || {}).increments)) {
      if (seen.has(item.exercise) || item.category === 'explosive') continue;
      const { history, suggestion } = suggestionFor(item, state.workouts || [], state.sets || [], w);
      if (!history.length) continue;
      seen.add(item.exercise);
      const up = suggestion.kind === 'increase' || suggestion.kind === 'choice';
      const text = up && suggestion.load !== null && suggestion.load !== undefined
        ? (loadMode(item, item.increment) === 'added' ? `lest ${fmtKg(suggestion.load)} kg` : `${fmtKg(suggestion.load)} kg`)
        : up ? 'monter' : suggestion.kind === 'progress' || suggestion.kind === 'consolidate' ? '+1 rép.' : '=';
      out.push({ exercise: item.exercise, sid, up, text, title: suggestion.title });
    }
  }
  return out.sort((a, b) => Number(b.up) - Number(a.up));
}

/** Verdict du mois : comparer la moyenne des pesées du dernier mois à celle du mois d'avant. */
export function weightVerdict(entries) {
  const ws = entries.filter((e) => e.kind === 'weight').sort((a, b) => a.date.localeCompare(b.date));
  if (ws.length < 2) return null;
  const last = ws[ws.length - 1];
  const prev = [...ws].reverse().find((e) => toDayNumber(last.date) - toDayNumber(e.date) >= 21);
  if (!prev) return null;
  const days = toDayNumber(last.date) - toDayNumber(prev.date);
  const perMonth = ((last.kg - prev.kg) / days) * 30;
  const waist = last.waist && prev.waist ? ((last.waist - prev.waist) / days) * 30 : null;
  let advice; let tone;
  if (perMonth < 0.5) { advice = 'Ajoute environ 150 kcal par jour (un fruit et un yaourt).'; tone = 'up'; }
  else if (perMonth > 1.4 || (waist !== null && waist > 1.5)) { advice = 'Enlève environ 150 kcal par jour : tu prends trop vite.'; tone = 'down'; }
  else { advice = 'Continue comme ça : le rythme est bon.'; tone = 'ok'; }
  return { perMonth, waist, advice, tone, from: prev, to: last };
}

function renderWeight(state) {
  const ws = (state.entries || []).filter((e) => e.kind === 'weight').sort((a, b) => b.date.localeCompare(a.date));
  const v = weightVerdict(state.entries || []);
  const pts = [...ws].reverse().map((e) => ({ x: toDayNumber(e.date), y: e.kg }));
  return `
    <p class="hint">Objectif : environ +0,8 kg par mois, sans que le tour de taille s'envole. Pèse-toi le matin à jeun.</p>
    ${v ? `<div class="verdict ${v.tone}" data-test="verdict"><b>${esc(v.advice)}</b><span>${v.perMonth >= 0 ? '+' : ''}${nf(v.perMonth, 1)} kg par mois${v.waist !== null ? ` · taille ${v.waist >= 0 ? '+' : ''}${nf(v.waist, 1)} cm par mois` : ''}, depuis le ${esc(formatDateFr(v.from.date, { weekday: false }))}</span></div>` : ws.length ? '<p class="muted">Le verdict apparaît avec deux pesées espacées d\'au moins 3 semaines.</p>' : ''}
    ${pts.length >= 2 ? `<div class="card"><p class="card-t">Poids (kg)</p>${lineChart(pts, { fmt: (x) => nf(x, 1) })}</div>` : ''}
    <button class="btn" data-action="log-weight">${icon('plus')} Noter mon poids</button>
    ${ws.length ? `<ul class="recap">${ws.map((e) => `<li><span>${esc(formatDateFr(e.date))}</span><span><b>${nf(e.kg, 1)} kg</b>${e.waist ? ` · ${nf(e.waist, 1)} cm` : ''} <button class="icon-btn ghost" data-action="delete-entry" data-id="${esc(e.id)}" aria-label="Supprimer">${icon('trash')}</button></span></li>`).join('')}</ul>` : '<p class="empty">Aucune pesée pour l\'instant.</p>'}`;
}

export function renderExerciseDetail(state) {
  const id = state.exerciseId;
  const r = exerciseHistory(state).find((x) => x.exercise === id);
  const pts = r ? r.sessions.map((x) => ({ x: toDayNumber(x.date), y: x.best.loadKg || x.best.reps })) : [];
  const usesLoad = r && r.sessions.some((x) => x.best.loadKg);
  return `
    <header class="sess-top"><button class="icon-btn" data-action="go" data-tab="progress" aria-label="Retour">${icon('back')}</button><div class="st-title"><b>${esc(exName(state.lib, id))}</b></div><span></span></header>
    ${demo(state.lib, id, 'big')}
    ${cueOf(id) ? `<p class="cue">${esc(cueOf(id))}</p>` : ''}
    ${pts.length >= 2 ? `<div class="card"><p class="card-t">${usesLoad ? 'Meilleure charge (kg)' : 'Meilleures répétitions'}</p>${lineChart(pts, { fmt: (v) => nf(v, 1) })}</div>` : ''}
    ${r ? `<div class="card"><table class="hist-t"><thead><tr><th>Date</th><th>Séries</th></tr></thead><tbody>${[...r.sessions].reverse().map((x) => `<tr><td>${esc(formatDateFr(x.date, { weekday: false }))}</td><td>${x.sets.sort((a, b) => a.index - b.index).map((s) => esc(`${s.loadKg ? `${fmtKg(s.loadKg)}×` : ''}${s.reps}`)).join('  ·  ')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">Pas encore de séance sur cet exercice.</p>'}`;
}

// ---------- Feuilles ----------

export function renderSheet(state) {
  const sh = state.sheet;
  if (!sh) return '';
  let body = '';
  if (sh.type === 'demo') {
    const raw = state.program.sessions.flatMap((s) => s.slots).find((x) => x.exercise === sh.id);
    const cue = raw ? (raw.cueRef ? state.program.sessions.flatMap((s) => s.slots).find((z) => z.id === raw.cueRef).cue : raw.cue) : null;
    body = `<h2>${esc(exName(state.lib, sh.id))}</h2>${demo(state.lib, sh.id, 'big')}${hasAnimation(sh.id) ? `<p class="view">${esc(viewOf(sh.id))}</p>` : ''}
      ${cueOf(sh.id) ? `<p class="cue">${esc(cueOf(sh.id))}</p>` : ''}${cue ? `<p class="tech"><b>Technique :</b> ${esc(cue)}</p>` : ''}`;
  } else if (sh.type === 'endurance') {
    const d = sh.draft;
    const run = d.kind === 'run';
    body = `<h2>${run ? 'Course' : 'Natation'}</h2>
      <form class="form" data-form="endurance">
        <label class="field"><span>Intitulé</span><input name="title" value="${esc(d.title || '')}" placeholder="${run ? 'Footing 40 min' : 'Technique crawl'}" autocomplete="off"></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(d.date)}" max="${esc(state.today)}"></label>
        <div class="trio">
          <label class="field"><span>Distance (${run ? 'km' : 'm'})</span><input name="dist" class="big-in" inputmode="decimal" value="${d.distanceM ? esc(run ? String(Math.round(d.distanceM / 10) / 100).replace('.', ',') : d.distanceM) : ''}" placeholder="${run ? '6,5' : '1100'}" data-calc="dist"></label>
          <label class="field"><span>Durée</span><input name="dur" class="big-in" inputmode="decimal" value="${esc(fmtDuration(d.durationSec))}" placeholder="${run ? '40:00' : '45:00'}" data-calc="dur"></label>
          <label class="field"><span>Allure ${run ? '/km' : '/100 m'}</span><input name="pace" class="big-in" inputmode="decimal" value="${d.distanceM && d.durationSec ? esc(fmtPace(run ? d.durationSec / (d.distanceM / 1000) : d.durationSec / (d.distanceM / 100))) : ''}" placeholder="${run ? '6:10' : '2:30'}" data-calc="pace"></label>
        </div>
        <p class="hint small">Remplissez deux des trois cases : la troisième se calcule seule.</p>
        <label class="field"><span>Note <em>facultatif</em></span><input name="note" value="${esc(d.note || '')}" placeholder="${run ? 'Jambes légères, 4 accélérations' : 'Respiration tous les 3 temps'}" autocomplete="off"></label>
        ${sh.error ? `<p class="err">${esc(sh.error)}</p>` : ''}
        <button class="btn big ${d.kind}" type="submit">Enregistrer</button>
        ${sh.editId ? `<button class="btn ghost danger" type="button" data-action="delete-endurance" data-id="${esc(sh.editId)}">${icon('trash')} Supprimer</button>` : ''}
      </form>`;
  } else if (sh.type === 'finish') {
    const { plan, sets } = sessionModel(state);
    const planned = plan.reduce((n, x) => n + x.sets, 0);
    body = `<h2>Terminer la séance ?</h2>
      <p class="muted">${sets.length} série${sets.length > 1 ? 's' : ''} validée${sets.length > 1 ? 's' : ''} sur ${planned}.</p>
      <ul class="recap">${plan.filter((x) => slotSets(sets, x.slotId).length).map((x) => { const b = bestSet(slotSets(sets, x.slotId)); return `<li><span>${esc(exName(state.lib, b.exercise))}</span><b>${b.loadKg ? `${fmtKg(b.loadKg)} kg × ` : ''}${b.reps}</b></li>`; }).join('')}</ul>
      ${sets.length ? '<button class="btn big" data-action="save-workout" data-test="save-workout">Enregistrer la séance</button>' : ''}
      <button class="btn quiet" data-action="close-sheet">Continuer la séance</button>
      ${state.active ? '<button class="btn ghost danger" data-action="abandon-workout">Abandonner sans enregistrer</button>' : ''}`;
  } else if (sh.type === 'weight') {
    body = `<h2>Point poids</h2>
      <form class="form" data-form="weight">
        <label class="field"><span>Date</span><input type="date" name="date" value="${esc(state.today)}" max="${esc(state.today)}"></label>
        <div class="trio duo">
          <label class="field"><span>Poids (kg)</span><input name="kg" class="big-in" inputmode="decimal" placeholder="79,0" required></label>
          <label class="field"><span>Tour de taille (cm)</span><input name="waist" class="big-in" inputmode="decimal" placeholder="82"></label>
        </div>
        <p class="hint small">Tour de taille : au niveau du nombril, ventre relâché, le matin.</p>
        ${sh.error ? `<p class="err">${esc(sh.error)}</p>` : ''}
        <button class="btn big" type="submit">Enregistrer</button>
      </form>`;
  }
  return `<div class="sheet-back" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><button class="icon-btn ghost sheet-x" data-action="close-sheet" aria-label="Fermer">${icon('close')}</button>${body}</div>`;
}

const stamp = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function renderSettings(state) {
  const { program, fileProgram, sw } = state;
  const r = state.restore;
  const changed = program.startDate !== fileProgram.startDate;
  const doneW = (state.workouts || []).filter((w) => w.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
  return `<header class="top"><div><p class="brand"><img src="./icon-192.png" alt="">JR Athletics</p><h1>Réglages</h1></div></header>
    <section class="set-block"><h3>Sauvegarde</h3>
      <p class="muted">Tes données sont sur cet appareil. ${state.lastBackup ? `Dernière sauvegarde : ${esc(stamp(state.lastBackup.at))}.` : 'Aucune sauvegarde pour l\'instant.'}</p>
      <button class="btn" data-action="backup">Sauvegarder</button>
      <label class="btn quiet">Restaurer un fichier<input type="file" id="restore-input" hidden></label>
      ${state.hasSafetyCopy ? '<button class="btn ghost" data-action="undo-restore">Annuler la dernière restauration</button>' : ''}
      ${state.backupMsg ? `<p class="${state.backupMsg.ok ? 'ok' : 'err'}">${esc(state.backupMsg.text)}</p>` : ''}
      ${r && r.errors ? `<p class="err"><b>Fichier refusé, rien n'a été modifié.</b><br>${r.errors.map(esc).join('<br>')}</p>` : ''}
      ${r && r.preview ? `<div class="confirm" data-test="restore-preview"><b>Remplacer vos données par ce fichier ?</b><span>${r.preview.workouts} séances, ${r.preview.sets} séries.</span>${r.lost ? `<span class="err-t">${r.lost} séance(s) de cet iPhone seront perdues.</span>` : ''}<button class="btn danger-btn" data-action="restore-confirm">Remplacer</button><button class="btn quiet" data-action="restore-cancel">Annuler</button></div>` : ''}
    </section>
    <section class="set-block"><h3>Séances enregistrées</h3>
      ${doneW.length ? `<ul class="recap">${doneW.slice(0, 12).map((w) => `<li><span>${esc(formatDateFr(w.date))} · ${esc(sessionTitle(program, w.sessionId))}</span><button class="icon-btn ghost" data-action="delete-workout" data-id="${esc(w.id)}" aria-label="Supprimer">${icon('trash')}</button></li>`).join('')}</ul>` : '<p class="muted">Aucune.</p>'}
    </section>
    <section class="set-block"><h3>Début du cycle</h3>
      <p class="muted"><b data-test="start-date">${esc(formatDateFr(program.startDate, { year: true }))}${changed ? ' (modifiée)' : ''}</b></p>
      ${changed ? `<button class="btn quiet" data-action="reset-start">Revenir au ${esc(formatDateFr(fileProgram.startDate))}</button>` : ''}
      <form class="row-form" data-form="start-date"><input type="date" name="start" value="${esc(program.startDate)}"><button class="btn small" type="submit">Changer</button></form>
      ${state.startMsg ? `<p class="${state.startMsg.ok ? 'ok' : 'err'}">${esc(state.startMsg.text)}${state.startMsg.suggestion ? ` <button class="link" data-action="use-suggestion" data-value="${esc(state.startMsg.suggestion)}">Utiliser le ${esc(formatDateFr(state.startMsg.suggestion))}</button>` : ''}</p>` : ''}
    </section>
    <section class="set-block"><h3>Application</h3>
      <p class="muted">Version <b data-test="app-version">${esc(state.appVersion)}</b> · <span data-test="offline">${sw.offline && sw.offline.ready ? `hors ligne prêt (${sw.offline.cached}/${sw.offline.total})` : 'hors ligne en préparation'}</span></p>
      <button class="btn quiet" data-action="check-update">${sw.checking ? 'Vérification…' : 'Vérifier les mises à jour'}</button>
    </section>`;
}

export function renderNav(tab) {
  const t = (id, label, ic) => `<button class="tab${tab === id ? ' on' : ''}" data-action="go" data-tab="${id}">${icon(ic)}<span>${label}</span></button>`;
  return `${t('home', 'Accueil', 'play')}${t('progress', 'Progrès', 'chart')}${t('settings', 'Réglages', 'gear')}`;
}

export function renderBanners(state) {
  if (state.sw.updateReady) return `<div class="banner"><span>Nouvelle version disponible.</span><button class="btn small" data-action="apply-update">Mettre à jour</button></div>`;
  if (state.isIOS && state.standalone === false) return '<div class="banner warn"><span>Ouvrez l\'application depuis son icône sur l\'écran d\'accueil : dans Safari, les données peuvent être effacées.</span></div>';
  return '';
}

export { setsOf };
