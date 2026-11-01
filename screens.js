// Écrans de l'application, en fonctions pures : état → HTML. Aucune donnée n'est insérée sans échappement.
// Quatre écrans seulement : accueil, séance (liste des exercices), exercice (saisie), historique ; plus les réglages.
import { resolveSession } from './program.js';
import { cycleInfo, formatDateFr, addDays, toDayNumber } from './dates.js';
import { nextSessionToDo, workoutPlan, slotSets, progress, suggestionFor, prefill, restLeft, summary, setsOf, weekForDate } from './workout.js';
import { fmtKg, loadMode, loadLabel, rirFloorWarning, bestSet } from './suggest.js';
import { hasAnimation, cueOf, viewOf, viewBoxOf } from './anim.js';
import './moves.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (r) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
export const exName = (lib, id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
const shortName = (s) => s.name.replace(/^Séance [ABC] — /, '').replace(/, \w+$/, '');
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const restTxt = (sec) => (!sec ? '—' : sec % 60 ? clock(sec) : `${sec / 60} min`);
const kg = (s) => (s.loadKg === null || s.loadKg === undefined ? '' : s.loadKg === 0 ? 'PDC' : `${fmtKg(s.loadKg)} kg`);
export const setTxt = (s) => `${kg(s) ? `${kg(s)} × ` : ''}${s.reps}${s.rir !== null && s.rir !== undefined ? ` · RIR ${s.rir}` : ''}`;

const I = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" class="f"/><circle cx="4" cy="12" r="1" class="f"/><circle cx="4" cy="18" r="1" class="f"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  swap: '<path d="M7 4L3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="M17 20l4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
};
export const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

/** Démonstration animée : deux photos (position de départ, position d'arrivée) qui s'enchaînent en boucle. */
export function demo(lib, id, cls = '') {
  const ex = lib.exercises.find((e) => e.id === id);
  if (hasAnimation(id)) {
    return `<div class="demo anim ${cls}" role="img" aria-label="Démonstration animée : ${esc(ex ? ex.name : id)}"><svg data-anim="${esc(id)}" viewBox="${esc(viewBoxOf(id))}" class="${cls === 'thumb' ? 'thumb-svg' : 'anim-svg'}" preserveAspectRatio="xMidYMid meet"></svg>${cls === 'hero' ? `<span class="view">${esc(viewOf(id))}</span>` : ''}</div>`;
  }
  if (!ex || !ex.image) return `<div class="demo ${cls} empty"><span>${esc(ex ? ex.name : id)}</span></div>`;
  return `<div class="demo ${cls}" role="img" aria-label="Démonstration : ${esc(ex.name)}">
    <img src="./img/${esc(ex.image)}-0.jpg" alt="" loading="lazy" decoding="async">
    <img src="./img/${esc(ex.image)}-1.jpg" alt="" loading="lazy" decoding="async" class="b">
  </div>`;
}

// ---------- Accueil ----------

export function renderHome(state) {
  const { program, today, lib } = state;
  const info = cycleInfo(program, today);
  const week = info.status === 'during' ? info.week : 1;
  const next = state.active ? null : nextSessionToDo(program, state.workouts || [], today);
  const sessionId = state.active ? state.active.workout.sessionId : next ? next.sessionId : program.sessionOrder[0];
  const s = program.sessions.find((x) => x.id === sessionId);
  const res = resolveSession(program, sessionId, week, { deload: !!info.deload });
  const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
  const rule = program.weekRules.find((r) => r.week === week);
  const doneThisWeek = new Set((state.workouts || []).filter((w) => w.status === 'done' && info.weekStart && toDayNumber(w.date) >= toDayNumber(info.weekStart) && toDayNumber(w.date) <= toDayNumber(info.weekStart) + 6).map((w) => w.sessionId));

  let label;
  if (state.active) label = 'Séance en cours';
  else if (info.status === 'before') label = `Le cycle commence ${formatDateFr(program.startDate)}`;
  else if (info.status === 'after') label = 'Cycle terminé';
  else if (!next) label = 'Les 3 séances de la semaine sont faites';
  else if (next.scheduledToday) label = 'Aujourd\'hui';
  else label = 'Prochaine séance';

  const p = state.active ? progress(workoutPlan(program, state.active.workout), state.active.sets) : null;
  const thumbs = res.slice(0, 4).map((x) => demo(lib, x.exercise, 'thumb')).join('');

  return `
    <header class="top">
      <div><p class="kicker">${esc(formatDateFr(today))}</p><p class="week">${info.status === 'during' ? `Semaine ${info.calWeek || week} sur ${info.totalWeeks || program.weeks} · RIR ${esc(range(rule.rir.compound))}` : esc(program.name)}</p></div>
      <div class="top-actions">
        <button class="icon-btn" data-action="go" data-tab="history" aria-label="Historique">${icon('history')}</button>
        <button class="icon-btn" data-action="go" data-tab="settings" aria-label="Réglages">${icon('gear')}</button>
      </div>
    </header>
    ${state.toast ? `<div class="toast" role="status">${icon('check')}<span>${esc(state.toast)}</span></div>` : ''}
    <section class="today">
      <p class="label">${esc(label)}</p>
      <div class="today-title"><span class="letter">${esc(sessionId)}</span><h1>${esc(shortName(s))}</h1></div>
      <p class="meta">${res.length} exercices · ${sets} séries · ~${estimate(res)} min</p>
      <div class="thumbs">${thumbs}</div>
      ${p ? `<div class="bar"><span style="width:${Math.round((p.done / p.planned) * 100)}%"></span></div><p class="meta">${p.done} séries sur ${p.planned}</p>` : ''}
      <button class="btn big" data-action="${state.active ? 'resume' : 'start'}" data-session="${esc(sessionId)}">${state.active ? 'Reprendre la séance' : `Commencer la séance ${esc(sessionId)}`}</button>
    </section>
    ${state.active ? '' : `
    <div class="others">
      ${program.sessionOrder.map((id) => `<button class="other${id === sessionId ? ' on' : ''}" data-action="start" data-session="${esc(id)}">
        <span class="letter small">${esc(id)}</span><span class="other-main"><b>${esc(shortName(program.sessions.find((x) => x.id === id)))}</b><span>${esc(program.sessions.find((x) => x.id === id).objective)}</span></span>${doneThisWeek.has(id) ? `<span class="done">${icon('check')}</span>` : ''}
      </button>`).join('')}
    </div>`}
    ${backupNudge(state)}`;
}

function estimate(res) {
  let t = 0;
  const seen = new Set();
  for (const x of res) {
    if (x.superset) {
      if (seen.has(x.superset)) continue;
      seen.add(x.superset);
      const [a, b] = res.filter((y) => y.superset === x.superset);
      t += Math.min(a.sets, b.sets) * (90 + x.restSec) + Math.abs(a.sets - b.sets) * (45 + x.restSec);
    } else t += x.sets * ((x.category === 'explosive' ? 15 : x.perSide ? 80 : 45) + x.restSec);
    t += 60;
  }
  return Math.round(t / 60);
}

function backupNudge(state) {
  const done = (state.workouts || []).filter((w) => w.status === 'done');
  if (!done.length) return '';
  const last = state.lastBackup;
  if (last && Date.now() - Date.parse(last.at) < 7 * 86400000) return '';
  return `<button class="nudge" data-action="backup">${last ? 'Dernière sauvegarde il y a plus de 7 jours.' : 'Aucune sauvegarde de vos séances.'} <b>Sauvegarder</b></button>`;
}

// ---------- Séance : la liste des exercices ----------

export function renderSession(state) {
  const { program, lib, active } = state;
  const w = active.workout;
  const plan = workoutPlan(program, w, (state.settings || {}).increments);
  const p = progress(plan, active.sets);
  const s = program.sessions.find((x) => x.id === w.sessionId);
  const allDone = p.done >= p.planned;
  return `
    <header class="bar-top">
      <button class="icon-btn" data-action="go" data-tab="home" aria-label="Accueil">${icon('back')}</button>
      <div class="bar-title"><b>Séance ${esc(s.id)}</b><span id="elapsed"></span></div>
      <span class="icon-btn ghost"></span>
    </header>
    <div class="bar thin"><span style="width:${Math.round((p.done / p.planned) * 100)}%"></span></div>
    <h1 class="h1">${esc(shortName(s))}</h1>
    <ol class="ex-list">
      ${plan.map((x, i) => {
        const n = slotSets(active.sets, x.slotId).length;
        const done = n >= x.sets;
        const group = x.superset ? plan.filter((y) => y.superset === x.superset) : null;
        const pair = group && group[0].slotId === x.slotId ? '<span class="pair">supersérie</span>' : '';
        return `<li><button class="ex-row${done ? ' done' : ''}${x.slotId === w.currentSlot && !done ? ' current' : ''}" data-action="open-slot" data-value="${esc(x.slotId)}">
          ${demo(lib, x.exercise, 'thumb')}
          <span class="ex-row-main"><span class="ex-row-name">${esc(exName(lib, x.exercise))}</span><span class="ex-row-meta">${x.sets} × ${esc(range(x.reps))}${x.perSide ? ' /côté' : ''}${pair}</span></span>
          <span class="count${done ? ' ok' : ''}">${done ? icon('check') : `${n}/${x.sets}`}</span>
        </button></li>`;
      }).join('')}
    </ol>
    ${allDone ? '' : `<button class="btn big" data-action="open-slot" data-value="${esc(w.currentSlot)}">${p.done ? 'Continuer' : 'Commencer'}</button>`}
    <button class="btn ${allDone ? 'big' : 'quiet'}" data-action="finish">Terminer la séance</button>
    <div class="rest-dock" id="rest-dock">${renderRest(w)}</div>`;
}

// ---------- Exercice : démonstration et saisie ----------

export function exerciseContext(state) {
  const { program, active } = state;
  const plan = workoutPlan(program, active.workout, (state.settings || {}).increments);
  const item = plan.find((x) => x.slotId === active.workout.currentSlot) || plan[0];
  const todaySets = slotSets(active.sets, item.slotId);
  const { history, suggestion } = suggestionFor(item, state.workouts || [], state.sets || [], active.workout);
  if (!state.draft || state.draft.slotId !== item.slotId || state.draft.count !== todaySets.length || state.draft.exercise !== item.exercise) {
    state.draft = { slotId: item.slotId, exercise: item.exercise, count: todaySets.length, option: null, ...prefill(item, todaySets, suggestion, history) };
  }
  return { plan, item, todaySets, history, suggestion };
}

function stepper(id, label, value, action, { decimal = false, unit = '' } = {}) {
  return `
    <div class="stepper">
      <span class="stepper-label">${esc(label)}</span>
      <div class="stepper-row">
        <button class="step" data-action="${action}" data-dir="-1" aria-label="Moins">−</button>
        <input id="${id}" class="step-input" inputmode="${decimal ? 'decimal' : 'numeric'}" autocomplete="off" value="${esc(value === null || value === undefined ? '' : decimal ? fmtKg(value) : value)}" placeholder="—" aria-label="${esc(label)}">
        <button class="step" data-action="${action}" data-dir="1" aria-label="Plus">+</button>
      </div>
      ${unit ? `<span class="stepper-unit">${esc(unit)}</span>` : ''}
    </div>`;
}

export function renderRest(w) {
  const left = restLeft(w);
  if (left === null) return '';
  const pct = Math.max(0, Math.min(100, (left / (w.restTotalSec || 1)) * 100));
  return `
    <div class="rest${left === 0 ? ' over' : ''}">
      <div class="rest-bar"><span id="rest-fill" style="width:${pct}%"></span></div>
      <div class="rest-row">
        <div><span class="rest-label" id="rest-label">${left === 0 ? 'C\'est reparti' : 'Repos'}</span><span class="rest-time" id="rest-time">${clock(left)}</span></div>
        <div class="rest-btns">
          <button class="btn small quiet" data-action="rest-adjust" data-value="-15">−15</button>
          <button class="btn small quiet" data-action="rest-adjust" data-value="15">+15</button>
          <button class="btn small" data-action="rest-skip">${left === 0 ? 'OK' : 'Passer'}</button>
        </div>
      </div>
    </div>`;
}

export function renderExercise(state) {
  const { program, lib, active, ui } = state;
  const { plan, item, todaySets, history, suggestion } = exerciseContext(state);
  const d = state.draft;
  const w = active.workout;
  const idx = plan.indexOf(item);
  const mode = loadMode(item, item.increment);
  const group = item.superset ? plan.filter((x) => x.superset === item.superset) : null;
  const partner = group ? group.find((x) => x.slotId !== item.slotId) : null;
  const complete = todaySets.length >= item.sets;
  const raw = item.raw;
  const cue = raw.cueRef ? program.sessions.flatMap((z) => z.slots).find((z) => z.id === raw.cueRef).cue : raw.cue;
  const floorWarn = rirFloorWarning(item, d.rir);
  const up = suggestion.kind === 'increase' || suggestion.kind === 'choice';

  const rows = [];
  for (let i = 0; i < Math.max(item.sets, todaySets.length); i += 1) {
    const s = todaySets[i];
    if (s) rows.push(`<li class="set done"><span class="n">${icon('check')}</span><span class="v">${esc(setTxt(s))}</span><button class="x" data-action="delete-set" data-id="${esc(s.id)}" aria-label="Supprimer la série ${i + 1}">${icon('close')}</button></li>`);
    else if (i !== todaySets.length) rows.push(`<li class="set"><span class="n">${i + 1}</span><span class="v muted">Série ${i + 1}</span></li>`);
    else rows.push(`<li class="set now"><span class="n">${i + 1}</span><span class="v">Série ${i + 1}</span></li>`);
  }

  const fb = ui.fallback;
  return `
    <header class="bar-top">
      <button class="icon-btn" data-action="go" data-tab="session" aria-label="Liste des exercices">${icon('list')}</button>
      <div class="bar-title"><b>${idx + 1} / ${plan.length}</b><span id="elapsed"></span></div>
      <button class="icon-btn" data-action="open-slot" data-value="${esc(plan[(idx + 1) % plan.length].slotId)}" aria-label="Exercice suivant">${icon('next')}</button>
    </header>
    ${demo(lib, item.exercise, 'hero')}
    ${cueOf(item.exercise) ? `<p class="cue" data-test="cue">${esc(cueOf(item.exercise))}</p>` : ''}
    <section class="ex">
      <h1 class="h1">${esc(exName(lib, item.exercise))}</h1>
      <div class="chips">
        <span>${item.sets} séries</span><span>${esc(range(item.reps))} reps${item.perSide ? ' /côté' : ''}</span>
        ${item.rir ? `<span>RIR ${esc(range(item.rir))}</span>` : '<span>explosif</span>'}
        <span>${group && group[0].slotId === item.slotId ? 'enchaîner sans repos' : `repos ${restTxt(item.restSec)}`}</span>
      </div>
      ${partner ? `<p class="pair-note">Supersérie avec ${esc(exName(lib, partner.exercise))}</p>` : ''}
      ${item.swap ? `<p class="swap-note">${item.swap.kind === 'fallback' ? 'Repli' : 'Remplace'} : ${esc(exName(lib, item.planned))}</p>` : ''}
      ${item.note ? `<p class="swap-note">${esc(item.note)}</p>` : ''}

      ${fb ? `<div class="sug warn" data-test="fallback"><b>Moins de ${fb.belowReps} répétitions</b><span>Le programme prévoit de finir sur un exercice plus facile.</span>
        <div class="opts">${fb.exercises.map((id) => `<button class="chip-btn" data-action="accept-fallback" data-value="${esc(id)}">${esc(exName(lib, id))}</button>`).join('')}<button class="chip-btn" data-action="refuse-fallback">Non, continuer</button></div></div>` : ''}

      <div class="sug${up ? ' up' : ''}" data-test="suggestion">
        <b>${up ? icon('up') : ''}${esc(suggestion.title)}</b>
        <span>${esc(suggestion.reason)}</span>
        ${suggestion.options.length ? `<div class="opts">${suggestion.options.map((o, i) => `<button class="chip-btn${d.option === i ? ' on' : ''}" data-action="pick-option" data-value="${i}">${esc(o.label)}</button>`).join('')}</div>` : ''}
        ${history.length ? `<span class="last">Dernière fois : ${history[0].sets.map((s) => esc(setTxt(s).replace(/ · RIR \d+/, ''))).join(', ')}</span>` : ''}
      </div>

      <ol class="sets">${rows.join('')}</ol>

      ${complete ? `
        <div class="done-box"><b>${icon('check')} Exercice terminé</b>
          <button class="btn big" data-action="next-exercise">Exercice suivant</button>
          <button class="btn quiet" data-action="extra-set">Ajouter une série</button>
        </div>` : `
        <div class="entry">
          <div class="inputs${mode === 'none' ? ' single' : ''}">
            ${mode === 'none' ? '' : stepper('in-load', mode === 'added' ? 'Lest' : 'Poids', d.loadKg, 'step-load', { decimal: true, unit: loadLabel(item, item.increment) })}
            ${stepper('in-reps', 'Répétitions', d.reps, 'step-reps', { unit: `objectif ${range(item.reps)}` })}
          </div>
          ${item.rir ? `<div class="rir"><span class="stepper-label">Répétitions en réserve (RIR)</span>
            <div class="rir-row">${[0, 1, 2, 3, 4, 5].map((n) => `<button class="rir-btn${d.rir === n ? ' on' : ''}${n >= item.rir.min && n <= item.rir.max ? ' target' : ''}" data-action="pick-rir" data-value="${n}">${n}</button>`).join('')}</div>
            ${floorWarn ? `<span class="warn-txt">${esc(floorWarn)}</span>` : ''}</div>` : ''}
          ${state.inputError ? `<div class="err" role="alert">${esc(state.inputError)}</div>` : ''}
          <button class="btn big" data-action="validate-set" data-test="validate">Valider la série ${todaySets.length + 1}</button>
        </div>`}

      <details class="how"><summary>Comment faire</summary><p>${esc(cue)}</p></details>
      <button class="link" data-action="swap-open">${icon('swap')} Machine prise ? Remplacer l'exercice</button>
    </section>
    ${ui.sheet === 'swap' ? swapSheet(state, item) : ''}
    <div class="rest-dock" id="rest-dock">${renderRest(w)}</div>`;
}

function swapSheet(state, item) {
  const { lib } = state;
  const opts = [item.planned, ...item.raw.alternatives];
  return `<div class="sheet-back" data-action="swap-close"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <h2>Remplacer par</h2>
      <div class="swap-list">${opts.map((id) => `<button class="swap-item${id === item.exercise ? ' on' : ''}" data-action="swap" data-value="${esc(id)}">${demo(lib, id, 'thumb')}<span>${esc(exName(lib, id))}${id === item.planned ? '<em>prévu</em>' : ''}</span></button>`).join('')}</div>
      <button class="btn quiet" data-action="swap-close">Annuler</button>
    </div>`;
}

// ---------- Fin de séance ----------

export function renderFinish(state) {
  const { program, lib, active } = state;
  const w = active.workout;
  const plan = workoutPlan(program, w, (state.settings || {}).increments);
  const sum = summary(plan, active.sets, w);
  return `
    <header class="bar-top">
      <button class="icon-btn" data-action="go" data-tab="session" aria-label="Revenir à la séance">${icon('back')}</button>
      <div class="bar-title"><b>Fin de séance</b></div><span class="icon-btn ghost"></span>
    </header>
    <h1 class="h1">Séance ${esc(w.sessionId)} terminée</h1>
    <div class="stats"><div><b>${sum.done}</b><span>séries sur ${sum.planned}</span></div><div><b>${sum.minutes}</b><span>minutes</span></div></div>
    <ul class="recap">${sum.perSlot.filter((x) => x.best).map((x) => `<li><span>${esc(exName(lib, x.best.exercise))}</span><b>${esc(setTxt(x.best).replace(/ · RIR \d+/, ''))}</b></li>`).join('') || '<li class="muted">Aucune série enregistrée.</li>'}</ul>
    <button class="btn big" data-action="save-workout" data-test="save-workout">Enregistrer la séance</button>
    <button class="btn ghost danger" data-action="abandon-workout">Abandonner sans enregistrer</button>`;
}

// ---------- Historique ----------

export function renderHistory(state) {
  const { program, lib } = state;
  const list = (state.workouts || []).filter((w) => w.status === 'done').sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));
  const open = state.historyOpen;
  return `
    <header class="bar-top">
      <button class="icon-btn" data-action="go" data-tab="home" aria-label="Accueil">${icon('back')}</button>
      <div class="bar-title"><b>Historique</b></div><span class="icon-btn ghost"></span>
    </header>
    ${list.length ? `<ul class="hist">${list.map((w) => {
      const sets = setsOf(state.sets || [], w.id);
      const s = program.sessions.find((x) => x.id === w.sessionId);
      const isOpen = open === w.id;
      const plan = isOpen ? workoutPlan(program, w) : [];
      return `<li class="hist-item${isOpen ? ' open' : ''}">
        <button class="hist-head" data-action="toggle-history" data-value="${esc(w.id)}">
          <span class="letter small">${esc(w.sessionId)}</span>
          <span class="hist-main"><b>${esc(formatDateFr(w.date))}</b><span>${esc(s ? shortName(s) : '')} · ${sets.length} série${sets.length > 1 ? 's' : ''}</span></span>
        </button>
        ${isOpen ? `<div class="hist-body">${plan.map((x) => {
          const mine = sets.filter((y) => y.slotId === x.slotId);
          if (!mine.length) return '';
          return `<div class="hist-ex"><span>${esc(exName(lib, mine[0].exercise))}</span><span class="hist-sets">${mine.map((y) => esc(setTxt(y).replace(/ · RIR \d+/, ''))).join(' · ')}</span></div>`;
        }).join('')}<button class="link danger" data-action="delete-workout" data-id="${esc(w.id)}">Supprimer cette séance</button></div>` : ''}
      </li>`;
    }).join('')}</ul>` : '<p class="empty">Vos séances apparaîtront ici.</p>'}`;
}

// ---------- Réglages ----------

const stamp = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function renderSettings(state) {
  const { program, fileProgram, sw } = state;
  const r = state.restore;
  const changed = program.startDate !== fileProgram.startDate;
  return `
    <header class="bar-top">
      <button class="icon-btn" data-action="go" data-tab="home" aria-label="Accueil">${icon('back')}</button>
      <div class="bar-title"><b>Réglages</b></div><span class="icon-btn ghost"></span>
    </header>
    <section class="card">
      <h2>Sauvegarde</h2>
      <p class="muted">Vos séances sont sur cet iPhone. Une sauvegarde les protège s'il est effacé ou perdu. ${state.lastBackup ? `Dernière : ${esc(stamp(state.lastBackup.at))}.` : 'Aucune pour l\'instant.'}</p>
      <button class="btn" data-action="backup">Sauvegarder</button>
      <label class="btn quiet file-btn">Restaurer un fichier<input type="file" id="restore-input" hidden></label>
      ${state.hasSafetyCopy ? '<button class="btn ghost" data-action="undo-restore">Annuler la dernière restauration</button>' : ''}
      ${state.backupMsg ? `<div class="${state.backupMsg.ok ? 'ok' : 'err'}" role="status">${esc(state.backupMsg.text)}</div>` : ''}
      ${r && r.errors ? `<div class="err"><b>Fichier refusé, rien n'a été modifié.</b><br>${r.errors.map(esc).join('<br>')}</div>` : ''}
      ${r && r.preview ? `<div class="confirm" data-test="restore-preview"><b>Remplacer vos données par ce fichier ?</b>
        <span>${r.preview.workouts} séances, ${r.preview.sets} séries${r.preview.from ? `, du ${esc(formatDateFr(r.preview.from, { weekday: false }))} au ${esc(formatDateFr(r.preview.to, { weekday: false }))}` : ''}.</span>
        ${r.lost ? `<span class="err-txt">${r.lost} séance(s) de cet iPhone absente(s) du fichier seront perdues.</span>` : ''}
        <button class="btn danger-btn" data-action="restore-confirm">Remplacer</button><button class="btn quiet" data-action="restore-cancel">Annuler</button></div>` : ''}
    </section>
    <section class="card">
      <h2>Début du cycle</h2>
      <p class="muted">Actuellement : <b data-test="start-date">${esc(formatDateFr(program.startDate, { year: true }))}${changed ? ' (modifiée)' : ''}</b></p>
      ${changed ? `<button class="btn quiet" data-action="reset-start">Revenir au ${esc(formatDateFr(fileProgram.startDate))}</button>` : ''}
      <form class="row-form" data-form="start-date"><input type="date" name="start" value="${esc(program.startDate)}" required><button class="btn small" type="submit">Changer</button></form>
      ${state.startMsg ? `<div class="${state.startMsg.ok ? 'ok' : 'err'}">${esc(state.startMsg.text)}${state.startMsg.suggestion ? ` <button class="link" data-action="use-suggestion" data-value="${esc(state.startMsg.suggestion)}">Utiliser le ${esc(formatDateFr(state.startMsg.suggestion))}</button>` : ''}</div>` : ''}
    </section>
    <section class="card">
      <h2>Application</h2>
      <p class="muted">Version <b data-test="app-version">${esc(state.appVersion)}</b> · ${sw.offline && sw.offline.ready ? `<span data-test="offline">hors ligne prêt (${sw.offline.cached}/${sw.offline.total})</span>` : '<span data-test="offline">hors ligne en préparation</span>'}</p>
      <button class="btn quiet" data-action="check-update">${sw.checking ? 'Vérification…' : 'Vérifier les mises à jour'}</button>
      <p class="fine">${esc(state.lib.imageCredit || '')}</p>
    </section>`;
}

export function renderBanners(state) {
  if (state.sw.updateReady) return `<div class="banner"><span>Nouvelle version disponible.</span><button class="btn small" data-action="apply-update">Mettre à jour</button></div>`;
  if (state.isIOS && state.standalone === false) return '<div class="banner warn"><span>Ouvrez l\'application depuis son icône sur l\'écran d\'accueil : dans Safari, les données peuvent être effacées.</span></div>';
  return '';
}

export { bestSet, weekForDate, addDays };
