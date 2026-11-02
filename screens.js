// Interface : fonctions pures état → HTML. Aucune donnée n'est insérée sans échappement.
// Deux onglets (Programme, Progrès), une page de séance où tout se saisit dans un tableau, des feuilles pour
// la course, la natation, la démonstration d'un exercice et les réglages.
import { resolveSession } from './program.js';
import { cycleInfo, formatDateFr, addDays, toDayNumber } from './dates.js';
import { workoutPlan, slotSets, suggestionFor, restLeft, setsOf } from './workout.js';
import { fmtKg, loadMode, bestSet } from './suggest.js';
import { hasAnimation, cueOf, viewOf, viewBoxOf } from './anim.js';
import './moves.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const range = (r) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
export const exName = (lib, id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
const shortName = (s) => s.name.replace(/^Séance [ABC] — /, '').replace(/, \w+$/, '');
const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const restTxt = (sec) => (!sec ? '—' : sec % 60 ? clock(sec) : `${sec / 60} min`);
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

// ---------- Programme de la semaine ----------

/** Ce qui est prévu chaque jour de la semaine réelle calWeek. */
export function weekPlan(state, calWeek) {
  const { program } = state;
  const start = addDays(program.startDate, (calWeek - 1) * 7);
  const cal = (program.calendar || [])[calWeek - 1] || { week: calWeek };
  return DAYS.map((day, i) => {
    const date = addDays(start, i);
    const entry = program.schedule.find((s) => s.day === day) || {};
    let kind = 'rest';
    let title = entry.reminder || 'Repos';
    if (entry.session) { kind = 'lift'; title = `Séance ${entry.session}`; }
    else if (day === 'saturday') { kind = 'run'; title = ((program.enduranceReminders || {}).saturday || {})[String(cal.week)] || 'Course facile'; }
    else if (day === 'sunday') { kind = 'swim'; title = ((program.enduranceReminders || {}).sunday || {})[String(cal.week)] || 'Natation'; }
    else if (/Mobilité/.test(title)) kind = 'mob';
    const end = addDays(start, 6);
    const done = kind === 'lift'
      ? (state.workouts || []).some((w) => w.status === 'done' && w.sessionId === entry.session && w.date >= start && w.date <= end)
      : (state.entries || []).some((e) => e.date === date && e.kind === { run: 'run', swim: 'swim', mob: 'mobility' }[kind]);
    return { day, i, date, kind, title: title.replace(/^(Course|Natation) : /, ''), session: entry.session || null, done, week: cal.week, deload: !!cal.deload };
  });
}

const KIND_ICON = { lift: 'lift', run: 'run', swim: 'swim', mob: 'mob', rest: 'cal' };

export function shownWeek(state) {
  const info = cycleInfo(state.program, state.today);
  const totalWeeks = (state.program.calendar || []).length || state.program.weeks;
  const calWeek = state.viewWeek || (info.status === 'during' ? info.calWeek : info.status === 'before' ? 1 : totalWeeks);
  return { info, totalWeeks, calWeek };
}

export function renderProgram(state) {
  const { program, today, lib } = state;
  const { info, totalWeeks, calWeek } = shownWeek(state);
  const days = weekPlan(state, calWeek);
  const sel = state.selDate && days.some((d) => d.date === state.selDate) ? state.selDate : (days.find((d) => d.date === today) || days[0]).date;
  const d = days.find((x) => x.date === sel);
  const rule = program.weekRules.find((r) => r.week === d.week);

  const strip = days.map((x) => `<button class="day ${x.kind}${x.date === sel ? ' sel' : ''}${x.date === today ? ' today' : ''}${x.done ? ' done' : ''}" data-action="pick-day" data-value="${x.date}">
      <span class="dl">${DAY_SHORT[x.i]}</span><span class="dn">${Number(x.date.slice(8))}</span><span class="di">${x.done ? icon('check') : x.kind === 'lift' ? esc(x.session) : x.kind === 'rest' ? '' : icon(KIND_ICON[x.kind])}</span>
    </button>`).join('');

  let card = '';
  if (d.kind === 'lift' || state.pickSession) {
    const sid = state.pickSession || d.session;
    const s = program.sessions.find((x) => x.id === sid);
    const res = resolveSession(program, sid, d.week, { deload: d.deload });
    const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
    const active = state.active && state.active.workout.sessionId === sid;
    card = `
      <section class="plan lift">
        <div class="plan-head"><span class="badge lift">${esc(sid)}</span><div><h2>${esc(shortName(s))}</h2><p>${res.length} exercices · ${sets} séries · RIR ${esc(range(rule.rir.compound))}${d.deload ? ' · décharge' : ''}</p></div></div>
        <ol class="plan-list">${res.map((x) => `<li><button class="plan-ex" data-action="show-demo" data-value="${esc(x.exercise)}">${demo(lib, x.exercise, 'mini')}<span class="pe-main"><b>${esc(exName(lib, x.exercise))}</b><span>${x.sets} × ${esc(range(x.reps))}${x.perSide ? ' /côté' : ''}${x.superset ? ' · supersérie' : ''}</span></span></button></li>`).join('')}</ol>
        <button class="btn big" data-action="open-session" data-value="${esc(sid)}" data-date="${esc(d.date)}">${icon('play')} ${active ? 'Reprendre la séance' : d.done ? 'Refaire la séance' : 'Commencer la séance'}</button>
        <div class="alt">${program.sessionOrder.map((id) => `<button class="chip${id === sid ? ' on' : ''}" data-action="pick-session" data-value="${esc(id)}">Séance ${esc(id)}</button>`).join('')}</div>
      </section>`;
  } else if (d.kind === 'run' || d.kind === 'swim') {
    const kind = d.kind;
    const logged = (state.entries || []).filter((e) => e.kind === kind && e.date === d.date);
    card = `
      <section class="plan ${kind}">
        <div class="plan-head"><span class="badge ${kind}">${icon(kind)}</span><div><h2>${kind === 'run' ? 'Course' : 'Natation'}</h2><p>${esc(d.title)}</p></div></div>
        ${logged.length ? logged.map((e) => enduranceRow(e)).join('') : `<p class="hint">${kind === 'run' ? 'Allure facile : vous pouvez parler en phrases complètes.' : 'Technique avant tout : expirez sous l\'eau, respirez sur le côté.'}</p>`}
        <button class="btn big ${kind}" data-action="log-endurance" data-kind="${kind}" data-date="${esc(d.date)}" data-title="${esc(d.title)}">${icon('plus')} ${logged.length ? 'Ajouter une autre' : `Noter ${kind === 'run' ? 'ma course' : 'ma séance'}`}</button>
      </section>`;
  } else if (d.kind === 'mob') {
    card = `
      <section class="plan mob">
        <div class="plan-head"><span class="badge mob">${icon('mob')}</span><div><h2>Mobilité</h2><p>${esc(d.title)}</p></div></div>
        <button class="btn big ${d.done ? 'quiet' : 'mob'}" data-action="toggle-mobility" data-date="${esc(d.date)}">${d.done ? `${icon('check')} Faite` : 'Marquer comme faite'}</button>
      </section>`;
  } else {
    card = `<section class="plan"><h2>Repos</h2></section>`;
  }

  const extra = (state.entries || []).filter((e) => e.date === d.date && (e.kind === 'run' || e.kind === 'swim') && !(e.kind === d.kind && !state.pickSession));
  return `
    <header class="top">
      <div><p class="brand"><img src="./icon-192.png" alt="">JR Athletics</p><p class="kicker">${esc(info.status === 'before' ? `Début ${formatDateFr(program.startDate)}` : `${program.name}`)}</p>
      <h1>Semaine ${calWeek}<small> / ${totalWeeks}</small></h1></div>
      <div class="top-actions">
        <button class="icon-btn" data-action="week" data-value="-1" aria-label="Semaine précédente"${calWeek <= 1 ? ' disabled' : ''}>${icon('back')}</button>
        <button class="icon-btn flip" data-action="week" data-value="1" aria-label="Semaine suivante"${calWeek >= totalWeeks ? ' disabled' : ''}>${icon('back')}</button>
        <button class="icon-btn" data-action="settings" aria-label="Réglages">${icon('gear')}</button>
      </div>
    </header>
    ${state.toast ? `<div class="toast">${icon('check')}<span>${esc(state.toast)}</span></div>` : ''}
    <nav class="strip" aria-label="Jours de la semaine">${strip}</nav>
    <p class="day-title">${esc(formatDateFr(d.date))}${d.date === today ? ' · aujourd\'hui' : ''}</p>
    ${state.active && !(d.kind === 'lift' && state.active.workout.sessionId === (state.pickSession || d.session)) ? `<button class="resume" data-action="resume">${icon('play')} Séance ${esc(state.active.workout.sessionId)} en cours : reprendre</button>` : ''}
    ${card}
    ${extra.length ? `<section class="extra"><p class="day-title">Aussi ce jour-là</p>${extra.map((e) => enduranceRow(e)).join('')}</section>` : ''}`;
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

export function renderSession(state) {
  const { lib, program } = state;
  const { w, plan, sets } = sessionModel(state);
  const s = program.sessions.find((x) => x.id === w.sessionId);
  const planned = plan.reduce((n, x) => n + x.sets, 0);
  const doneN = plan.reduce((n, x) => n + Math.min(x.sets, slotSets(sets, x.slotId).length), 0);
  const cards = [];
  for (let k = 0; k < plan.length; k += 1) {
    const item = plan[k];
    const group = item.superset ? plan.filter((x) => x.superset === item.superset) : null;
    if (group && group[1].slotId === item.slotId) continue;
    const members = group || [item];
    const inner = members.map((it) => exerciseCard(state, it, sets, w)).join('');
    cards.push(group ? `<div class="superset"><span class="ss-label">Supersérie : enchaînez les deux, puis repos ${esc(restTxt(group[0].restSec))}</span>${inner}</div>` : inner);
  }
  return `
    <header class="sess-top">
      <button class="icon-btn" data-action="close-session" aria-label="Retour au programme">${icon('back')}</button>
      <div class="st-title"><b>Séance ${esc(s.id)} · ${esc(shortName(s))}</b><span>${doneN}/${planned} séries · <span id="elapsed">${state.active ? '' : 'pas commencée'}</span></span></div>
      <button class="btn small ${doneN ? '' : 'quiet'}" data-action="finish">Terminer</button>
    </header>
    <div class="bar"><span style="width:${Math.round((doneN / planned) * 100)}%"></span></div>
    <p class="sess-hint">Touchez <span class="tick-demo">${icon('check')}</span> pour valider une série. Modifiez le poids ou les répétitions avant si besoin.</p>
    ${cards.join('')}
    <button class="btn big" data-action="finish">Terminer la séance</button>
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
        <button class="ex-thumb" data-action="show-demo" data-value="${esc(item.exercise)}" aria-label="Voir la démonstration">${demo(lib, item.exercise, 'thumb')}</button>
        <div class="ex-info">
          <h3>${esc(exName(lib, item.exercise))}</h3>
          <p>${item.sets} × ${esc(range(item.reps))}${item.perSide ? ' /côté' : ''}${item.rir ? ` · RIR ${esc(range(item.rir))}` : ''}${item.superset ? '' : ` · repos ${esc(restTxt(item.restSec))}`}</p>
          ${item.swap ? `<p class="swap-note">Remplace : ${esc(exName(lib, item.planned))}</p>` : ''}
        </div>
        <button class="icon-btn ghost" data-action="ex-menu" data-value="${esc(item.slotId)}" aria-label="Options">${icon('more')}</button>
      </div>
      ${state.menu === item.slotId ? `<div class="ex-menu">
        <button data-action="show-demo" data-value="${esc(item.exercise)}">${icon('play')} Voir la démonstration</button>
        ${[item.planned, ...item.raw.alternatives].filter((id) => id !== item.exercise).map((id) => `<button data-action="swap" data-slot="${esc(item.slotId)}" data-value="${esc(id)}">${icon('swap')} ${esc(exName(lib, id))}${id === item.planned ? ' (prévu)' : ''}</button>`).join('')}
      </div>` : ''}
      <div class="goal${up ? ' up' : ''}">${up ? icon('up') : ''}<span><b>${esc(suggestion.title)}</b>${last ? ` · dernière fois ${last.sets.map((x) => esc(`${x.loadKg ? `${fmtKg(x.loadKg)}×` : ''}${x.reps}`)).join(', ')}` : ''}</span></div>
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
  const seg = [['lift', 'Muscu'], ['run', 'Course'], ['swim', 'Natation']].map(([id, l]) => `<button class="chip${tab === id ? ' on' : ''}" data-action="progress-tab" data-value="${id}">${l}</button>`).join('');
  let body = '';
  if (tab === 'lift') {
    const list = exerciseHistory(state).sort((a, b) => b.sessions.length - a.sessions.length);
    body = list.length ? `<div class="prog-list">${list.map((r) => {
      const f = r.sessions[0].best; const l = r.sessions[r.sessions.length - 1].best;
      const dKg = (l.loadKg || 0) - (f.loadKg || 0); const dR = l.reps - f.reps;
      const delta = r.sessions.length < 2 ? '' : dKg ? `${dKg > 0 ? '+' : ''}${fmtKg(dKg)} kg` : dR ? `${dR > 0 ? '+' : ''}${dR} rép.` : '=';
      return `<button class="prog-row" data-action="open-exercise" data-value="${esc(r.exercise)}">${demo(state.lib, r.exercise, 'mini')}<span class="pr-main"><b>${esc(exName(state.lib, r.exercise))}</b><span>${l.loadKg ? `${fmtKg(l.loadKg)} kg × ${l.reps}` : `${l.reps} rép.`} · ${r.sessions.length} séance${r.sessions.length > 1 ? 's' : ''}</span></span><span class="delta${dKg > 0 || (!dKg && dR > 0) ? ' up' : ''}">${esc(delta)}</span></button>`;
    }).join('')}</div>` : '<p class="empty">Vos exercices apparaîtront ici après votre première séance.</p>';
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
      ${pts.length >= 2 ? `<div class="card"><p class="card-t">Allure ${kind === 'run' ? 'au km' : 'aux 100 m'} <span>plus haut = plus rapide</span></p>${lineChart(pts, { fmt: (v) => fmtPace(v), invert: true, cls: kind })}</div>` : ''}
      <button class="btn ${kind}" data-action="log-endurance" data-kind="${kind}" data-date="${esc(state.today)}" data-title="${kind === 'run' ? 'Course' : 'Natation'}">${icon('plus')} Noter ${kind === 'run' ? 'une course' : 'une séance de natation'}</button>
      ${list.length ? `<div class="end-list">${list.map((e) => `<p class="end-date">${esc(formatDateFr(e.date))}</p>${enduranceRow(e)}`).join('')}</div>` : '<p class="empty">Aucune séance notée pour l\'instant.</p>'}`;
  }
  return `<header class="top"><div><p class="brand"><img src="./icon-192.png" alt="">JR Athletics</p><h1>Progrès</h1></div><div class="top-actions"><button class="icon-btn" data-action="settings" aria-label="Réglages">${icon('gear')}</button></div></header>
    <div class="seg">${seg}</div>${body}`;
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
  } else if (sh.type === 'settings') {
    body = renderSettings(state);
  }
  return `<div class="sheet-back" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><button class="icon-btn ghost sheet-x" data-action="close-sheet" aria-label="Fermer">${icon('close')}</button>${body}</div>`;
}

const stamp = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function renderSettings(state) {
  const { program, fileProgram, sw } = state;
  const r = state.restore;
  const changed = program.startDate !== fileProgram.startDate;
  const doneW = (state.workouts || []).filter((w) => w.status === 'done').sort((a, b) => b.date.localeCompare(a.date));
  return `<h2>Réglages</h2>
    <section class="set-block"><h3>Sauvegarde</h3>
      <p class="muted">Vos données sont sur cet iPhone. ${state.lastBackup ? `Dernière sauvegarde : ${esc(stamp(state.lastBackup.at))}.` : 'Aucune sauvegarde pour l\'instant.'}</p>
      <button class="btn" data-action="backup">Sauvegarder</button>
      <label class="btn quiet">Restaurer un fichier<input type="file" id="restore-input" hidden></label>
      ${state.hasSafetyCopy ? '<button class="btn ghost" data-action="undo-restore">Annuler la dernière restauration</button>' : ''}
      ${state.backupMsg ? `<p class="${state.backupMsg.ok ? 'ok' : 'err'}">${esc(state.backupMsg.text)}</p>` : ''}
      ${r && r.errors ? `<p class="err"><b>Fichier refusé, rien n'a été modifié.</b><br>${r.errors.map(esc).join('<br>')}</p>` : ''}
      ${r && r.preview ? `<div class="confirm" data-test="restore-preview"><b>Remplacer vos données par ce fichier ?</b><span>${r.preview.workouts} séances, ${r.preview.sets} séries.</span>${r.lost ? `<span class="err-t">${r.lost} séance(s) de cet iPhone seront perdues.</span>` : ''}<button class="btn danger-btn" data-action="restore-confirm">Remplacer</button><button class="btn quiet" data-action="restore-cancel">Annuler</button></div>` : ''}
    </section>
    <section class="set-block"><h3>Séances enregistrées</h3>
      ${doneW.length ? `<ul class="recap">${doneW.slice(0, 12).map((w) => `<li><span>${esc(formatDateFr(w.date))} · Séance ${esc(w.sessionId)}</span><button class="icon-btn ghost" data-action="delete-workout" data-id="${esc(w.id)}" aria-label="Supprimer">${icon('trash')}</button></li>`).join('')}</ul>` : '<p class="muted">Aucune.</p>'}
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
  return `${t('program', 'Programme', 'cal')}${t('progress', 'Progrès', 'chart')}`;
}

export function renderBanners(state) {
  if (state.sw.updateReady) return `<div class="banner"><span>Nouvelle version disponible.</span><button class="btn small" data-action="apply-update">Mettre à jour</button></div>`;
  if (state.isIOS && state.standalone === false) return '<div class="banner warn"><span>Ouvrez l\'application depuis son icône sur l\'écran d\'accueil : dans Safari, les données peuvent être effacées.</span></div>';
  return '';
}

export { setsOf };
