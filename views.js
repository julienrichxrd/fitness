// Écran Aujourd'hui, programme détaillé, navigation, bandeaux. Fonctions pures : état → HTML.
import { resolveSession } from './program.js';
import { cycleInfo, formatDateFr, dayFr, addDays, toDayNumber } from './dates.js';
import { nextSessionToDo, progress, workoutPlan } from './workout.js';
import { esc, icon, nf, nf0, ring, infoBtn } from './ui.js';
import { pendingReview, DECISION_TEXT } from './cycle.js';
import { checkinFor, isWeighDay, dayAdvice, latestWeight } from './body.js';
import { dayTotals, targetsFor } from './nutrition.js';
import { swimPlanFor, MOBILITY, RUN_GUIDE, SWIM_PLANS, fmtDuration } from './endurance.js';

export { esc };

export function fmtRest(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s}` : `${m} min`;
}
export const fmtRange = (r) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`);
export const fmtSetsReps = (x) => `${x.sets} × ${fmtRange(x.reps)}${x.perSide ? ' par côté' : ''}`;

/** Durée estimée (même méthode que l'audit) : séries ~45 s, repos prévus, 1 min de transition par exercice. */
export function estimateMinutes(resolved) {
  let t = 0;
  let exercises = 0;
  const seen = new Set();
  for (const x of resolved) {
    if (x.superset) {
      if (seen.has(x.superset)) continue;
      seen.add(x.superset);
      const [a, b] = resolved.filter((y) => y.superset === x.superset);
      const pairs = Math.min(a.sets, b.sets);
      const extra = Math.max(a.sets, b.sets) - pairs;
      t += pairs * (45 + 45 + x.restSec) + extra * (45 + x.restSec);
    } else {
      const work = x.category === 'explosive' ? 15 : x.perSide ? 80 : 45;
      t += x.sets * (work + x.restSec);
    }
    exercises += 1;
  }
  return Math.round((t + exercises * 60) / 60);
}

export const exName = (lib, id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
export const rirText = (x) => (x.rir ? `RIR ${fmtRange(x.rir)}` : 'explosif');
export const shortName = (s) => s.name.replace(/^Séance [ABC] — /, '');

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LETTER = { monday: 'L', tuesday: 'M', wednesday: 'M', thursday: 'J', friday: 'V', saturday: 'S', sunday: 'D' };
const DAY_KIND = { saturday: 'run', sunday: 'swim', tuesday: 'mob', thursday: 'mob' };

/** Activités enregistrées un jour donné. */
export function dayDone(state, date) {
  const w = (state.workouts || []).filter((x) => x.status === 'done' && x.date === date);
  const e = (state.entries || []).filter((x) => x.date === date && ['run', 'swim', 'mobility'].includes(x.kind));
  return { workouts: w, run: e.find((x) => x.kind === 'run'), swim: e.find((x) => x.kind === 'swim'), mobility: e.find((x) => x.kind === 'mobility') };
}

/** Bande des 7 jours de la semaine réelle : activité prévue, faite, jour courant. */
export function weekStrip(state, calWeek) {
  const { program, today } = state;
  const start = addDays(program.startDate, (calWeek - 1) * 7);
  const cells = DAY_ORDER.map((day, i) => {
    const date = addDays(start, i);
    const entry = program.schedule.find((s) => s.day === day) || {};
    const d = dayDone(state, date);
    const done = entry.session ? d.workouts.length > 0 : day === 'saturday' ? !!d.run : day === 'sunday' ? !!d.swim : !!d.mobility;
    const kind = entry.session ? 'lift' : DAY_KIND[day] || 'mob';
    const label = entry.session || { run: 'Course', swim: 'Nage', mob: 'Mob.' }[kind];
    const cls = ['day', kind, date === today ? 'today' : '', done ? 'done' : '', toDayNumber(date) < toDayNumber(today) && !done ? 'missed' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}"><span class="d-l">${DAY_LETTER[day]}</span><span class="d-n">${Number(date.slice(8))}</span><span class="d-t">${done ? icon('check') : esc(label)}</span></div>`;
  });
  return `<div class="strip" aria-label="Semaine en cours">${cells.join('')}</div>`;
}

function sessionHero(state, sessionId, week, { kicker, deload = false, trial = false }) {
  const { program, lib } = state;
  const s = program.sessions.find((x) => x.id === sessionId);
  const res = resolveSession(program, sessionId, week, { deload });
  const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
  return `
    <section class="hero lift">
      <div class="hero-top"><span class="hero-kicker">${esc(kicker)}</span>${deload ? '<span class="tag">Décharge</span>' : ''}</div>
      <div class="hero-main">
        <span class="hero-letter">${esc(sessionId)}</span>
        <div><h2 class="hero-title">${esc(shortName(s).replace(/, \w+$/, ''))}</h2><p class="hero-sub">${esc(s.objective)}</p></div>
      </div>
      <div class="facts"><span><b>${sets}</b> séries</span><span><b>~${estimateMinutes(res)}</b> min</span><span><b>${res.length}</b> exercices</span></div>
      <details class="ex-preview"><summary>Voir les exercices</summary>
        <ol class="compact">${res.map((x) => `<li><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(exName(lib, x.exercise))}</span><span class="sr">${esc(fmtSetsReps(x))}</span></li>`).join('')}</ol>
        <button class="btn quiet" data-action="open-program" data-session="${esc(sessionId)}" data-week="${week}">Programme détaillé</button>
      </details>
      <button class="btn big" data-action="start-session" data-session="${esc(sessionId)}"${trial ? ' data-trial="1"' : ''}>Commencer la séance ${esc(sessionId)}</button>
    </section>`;
}

function resumeCard(state) {
  const { active, program } = state;
  const plan = workoutPlan(program, active.workout, (state.settings || {}).increments);
  const p = progress(plan, active.sets);
  const s = program.sessions.find((x) => x.id === active.workout.sessionId);
  const pct = Math.round((p.done / p.planned) * 100);
  return `
    <section class="hero lift resume">
      <div class="hero-top"><span class="hero-kicker">Séance en cours</span></div>
      <div class="hero-main"><span class="hero-letter">${esc(s.id)}</span><div><h2 class="hero-title">${esc(shortName(s).replace(/, \w+$/, ''))}</h2><p class="hero-sub">${p.done} séries sur ${p.planned}</p></div></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <button class="btn big" data-action="resume">Reprendre la séance</button>
    </section>`;
}

function runHero(state, info, done) {
  const plan = (state.program.enduranceReminders.saturday || {})[String(info.week)] || 'Course facile';
  const strides = /accélérations/.test(plan);
  return `
    <section class="hero run">
      <div class="hero-top"><span class="hero-kicker">Aujourd'hui</span>${infoBtn('easy-run')}</div>
      <div class="hero-main"><span class="hero-letter">${icon('run')}</span><div><h2 class="hero-title">${esc(plan.replace(/^Course : /, ''))}</h2><p class="hero-sub">${esc(RUN_GUIDE.effort)}</p></div></div>
      ${strides ? `<p class="hint">${esc(RUN_GUIDE.strides)}</p>` : ''}
      ${done ? `<div class="done-line">${icon('check')} Course notée : ${esc(fmtDuration(done.durationSec))}${done.distanceM ? ` · ${nf(done.distanceM / 1000, 2)} km` : ''}</div>`
        : `<button class="btn big run" data-action="sheet" data-value="run">Noter la course</button><button class="btn quiet" data-action="sheet" data-value="import" data-kind="run">${icon('watch')} Importer depuis la montre</button>`}
    </section>`;
}

function swimHero(state, info, done) {
  const p = swimPlanFor(info.week);
  return `
    <section class="hero swim">
      <div class="hero-top"><span class="hero-kicker">Aujourd'hui</span>${infoBtn('swim')}</div>
      <div class="hero-main"><span class="hero-letter">${icon('swim')}</span><div><h2 class="hero-title">Natation technique</h2><p class="hero-sub">${esc(p.title)}, ~${nf0(p.meters)} m en bassin de 25 m</p></div></div>
      <details class="ex-preview"><summary>Voir la séance</summary>
        <ol class="blocks">${p.blocks.map((b) => `<li><b>${esc(b.name)}</b><span>${esc(b.what)}</span><em>${esc(b.why)}${b.rest !== '—' ? ` · récup. ${esc(b.rest)}` : ''}</em></li>`).join('')}</ol>
        ${info.week === state.program.weeks && p.test ? `<p class="hint">${esc(p.test)}</p>` : ''}
        <p class="hint warn">${esc(SWIM_PLANS.safety)}</p>
      </details>
      ${done ? `<div class="done-line">${icon('check')} Natation notée : ${done.distanceM ? `${nf0(done.distanceM)} m` : ''} ${esc(fmtDuration(done.durationSec))}</div>`
        : `<button class="btn big swim" data-action="sheet" data-value="swim">Noter la séance</button><button class="btn quiet" data-action="sheet" data-value="import" data-kind="swim">${icon('watch')} Importer depuis la montre</button>`}
    </section>`;
}

function mobilityHero(variant, done) {
  const m = MOBILITY[variant];
  return `
    <section class="hero mob">
      <div class="hero-top"><span class="hero-kicker">Aujourd'hui · 30 min chez vous</span></div>
      <div class="hero-main"><span class="hero-letter">${icon('mobility')}</span><div><h2 class="hero-title">${esc(m.title.replace(/^Mobilité (\w) : /, 'Mobilité $1 · '))}</h2><p class="hero-sub">${esc(MOBILITY.walk)}</p></div></div>
      <details class="ex-preview"${done ? '' : ' open'}><summary>Les 8 mouvements</summary>
        <ol class="blocks">${m.items.map(([n, d, w]) => `<li><b>${esc(n)}</b><span>${esc(d)}</span><em>${esc(w)}</em></li>`).join('')}</ol>
      </details>
      ${done ? `<div class="done-line">${icon('check')} Mobilité faite</div>` : `<button class="btn big mob" data-action="log-mobility" data-value="${variant}">C'est fait</button>`}
    </section>`;
}

function morningBlock(state) {
  const { today, entries = [], settings = {}, program } = state;
  const c = checkinFor(entries, today);
  const weighDay = isWeighDay(settings, today);
  const wToday = entries.find((e) => e.kind === 'weight' && e.date === today);
  const advice = dayAdvice(program, c);
  const rows = [];
  rows.push(c
    ? `<button class="row" data-action="sheet" data-value="checkin"><span class="row-ic body">${icon('moon')}</span><span class="row-main"><b>Ressenti du matin</b><span>${typeof c.sleepH === 'number' ? `${nf(c.sleepH)} h de sommeil · ` : ''}fatigue ${c.fatigue || '—'}/5 · motivation ${c.motivation || '—'}/5</span></span><span class="row-end ok">${icon('check')}</span></button>`
    : `<button class="row todo" data-action="sheet" data-value="checkin"><span class="row-ic body">${icon('moon')}</span><span class="row-main"><b>Ressenti du matin</b><span>Sommeil, fatigue, courbatures : 30 secondes</span></span><span class="row-end">${icon('chevron')}</span></button>`);
  if (weighDay || wToday) {
    rows.push(wToday
      ? `<button class="row" data-action="sheet" data-value="weight"><span class="row-ic body">${icon('scale')}</span><span class="row-main"><b>Pesée</b><span>${nf(wToday.kg)} kg</span></span><span class="row-end ok">${icon('check')}</span></button>`
      : `<button class="row todo" data-action="sheet" data-value="weight"><span class="row-ic body">${icon('scale')}</span><span class="row-main"><b>Pesée du matin</b><span>Au réveil, avant de manger ou boire</span></span><span class="row-end">${icon('chevron')}</span></button>`);
  }
  return `
    <div class="group">${rows.join('')}</div>
    ${advice.map((a) => `<div class="notice warn"><b>${esc(a.title)}.</b> ${esc(a.text)}</div>`).join('')}`;
}

function nutritionMini(state) {
  const { today, entries = [], settings = {} } = state;
  const lw = latestWeight(entries);
  const t = targetsFor(settings, lw ? lw.kg : null);
  const d = dayTotals(entries, today);
  return `
    <button class="food-mini" data-action="go" data-tab="nutrition">
      <span class="ring-wrap">${ring(d.kcal, t.kcal, { size: 64, stroke: 7 })}</span>
      <span class="row-main"><b>${nf0(d.kcal)} <small>/ ${nf0(t.kcal)} kcal</small></b><span>Protéines ${nf0(d.p)} / ${nf0(t.protein)} g · ${d.count ? `${d.count} aliment${d.count > 1 ? 's' : ''} noté${d.count > 1 ? 's' : ''}` : 'rien de noté aujourd\'hui'}</span></span>
      <span class="row-end">${icon('chevron')}</span>
    </button>`;
}

export function needsBackup(state) {
  const done = (state.workouts || []).filter((w) => w.status === 'done');
  if (!done.length && !(state.entries || []).length) return false;
  const last = state.lastBackup;
  if (!last) return true;
  return Date.now() - Date.parse(last.at) > 7 * 86400000;
}

function backupNudge(state) {
  if (!needsBackup(state)) return '';
  return `<div class="notice">
    <b>${state.lastBackup ? 'Dernière sauvegarde il y a plus de 7 jours.' : 'Aucune sauvegarde pour l\'instant.'}</b> Une sauvegarde protège vos données si l'iPhone est effacé ou perdu.
    <button class="btn quiet" data-action="backup">${icon('download')} Sauvegarder maintenant</button></div>`;
}

export function renderToday(state) {
  const { program, today } = state;
  const workouts = state.workouts || [];
  const info = cycleInfo(program, today);
  const rule = info.status === 'during' ? program.weekRules.find((r) => r.week === info.week) : null;
  const kicker = info.status === 'during'
    ? `Semaine ${info.calWeek} sur ${info.totalWeeks}${info.deload ? ' · décharge' : info.calWeek !== info.week ? ` · réglages de S${info.week}` : ''}`
    : info.status === 'before' ? program.name : 'Cycle terminé';
  const head = `<header class="page-head"><p class="kicker">${esc(kicker)}</p><h1 class="display">${esc(formatDateFr(today))}</h1></header>`;
  const toast = '';

  if (info.status === 'after') {
    return `${head}${toast}${state.active ? resumeCard(state) : ''}
      <section class="hero lift"><div class="hero-top"><span class="hero-kicker">Cycle terminé ${esc(formatDateFr(info.endDate))}</span></div>
        <h2 class="hero-title">C'est l'heure du bilan</h2>
        <p class="hero-sub">Créez le fichier de bilan et envoyez-le à Claude : il analyse le cycle et propose le suivant, que vous importerez ici.</p>
        <button class="btn big" data-action="go" data-tab="review-export">Préparer le bilan</button></section>
      ${morningBlock(state)}${nutritionMini(state)}${backupNudge(state)}`;
  }

  const review = pendingReview(program, state.reviews || [], today);
  const reviewCard = review ? `
    <button class="review-card" data-action="open-review" data-value="${review.calWeek}">
      <span class="row-ic">${icon('flag')}</span>
      <span class="row-main"><b>${review.isLast ? 'Fin du cycle : bilan de la dernière semaine' : `Bilan de la semaine ${review.calWeek}`}</b><span>4 questions pour décider de la semaine prochaine</span></span>
      <span class="row-end">${icon('chevron')}</span>
    </button>` : '';

  let main = '';
  if (state.active) {
    main = resumeCard(state);
  } else if (info.status === 'before') {
    main = `<div class="notice"><b>Le cycle commence ${esc(formatDateFr(program.startDate))}</b>, dans ${info.daysUntilStart} jour${info.daysUntilStart > 1 ? 's' : ''}. Vous pouvez faire une séance d'essai : elle restera dans le journal et servira de point de départ aux suggestions.</div>
      ${sessionHero(state, program.sessionOrder[0], 1, { kicker: `Première séance, ${formatDateFr(program.startDate)}`, trial: true })}`;
  } else {
    const entry = program.schedule.find((s) => s.day === info.dayKey) || {};
    const d = dayDone(state, today);
    const next = nextSessionToDo(program, workouts, today);
    let todayHero = '';
    if (info.dayKey === 'saturday') todayHero = runHero(state, info, d.run);
    else if (info.dayKey === 'sunday') todayHero = swimHero(state, info, d.swim);
    else if (info.dayKey === 'tuesday') todayHero = mobilityHero('A', d.mobility);
    else if (info.dayKey === 'thursday') todayHero = mobilityHero('B', d.mobility);
    const doneToday = d.workouts[0];
    if (entry.session && doneToday) {
      todayHero = `<section class="hero lift done"><div class="hero-top"><span class="hero-kicker">Aujourd'hui</span></div>
        <div class="hero-main"><span class="hero-letter">${icon('check')}</span><div><h2 class="hero-title">Séance ${esc(doneToday.sessionId)} faite</h2><p class="hero-sub">Récupération : mangez, dormez, et à la prochaine.</p></div></div></section>`;
    }
    const gym = next ? (() => {
      const s = program.sessions.find((x) => x.id === next.sessionId);
      const planned = addDays(info.weekStart, DAY_ORDER.indexOf(s.day));
      const k = next.scheduledToday ? 'Aujourd\'hui' : toDayNumber(planned) < toDayNumber(today) ? `À rattraper, prévue ${formatDateFr(planned)}` : `Prochaine séance, ${formatDateFr(planned)}`;
      return sessionHero(state, next.sessionId, info.week, { kicker: k, deload: info.deload });
    })() : '';
    if (!next && !todayHero) {
      todayHero = `<section class="hero lift done"><div class="hero-main"><span class="hero-letter">${icon('check')}</span><div><h2 class="hero-title">Semaine de musculation bouclée</h2><p class="hero-sub">Les 3 séances sont faites. Endurance et mobilité jusqu'à lundi.</p></div></div></section>`;
    }
    // Jour de séance : la séance en premier. Autre jour : l'activité du jour, puis la prochaine séance si elle est en retard.
    let nextRow = '';
    if (next && !entry.session) {
      const s = program.sessions.find((x) => x.id === next.sessionId);
      const planned = addDays(info.weekStart, DAY_ORDER.indexOf(s.day));
      if (toDayNumber(planned) < toDayNumber(today)) todayHero += gym;
      else nextRow = `<div class="group"><button class="row" data-action="open-program" data-session="${esc(s.id)}" data-week="${info.week}"><span class="row-ic lift"><b>${esc(s.id)}</b></span><span class="row-main"><b>Prochaine séance, ${esc(formatDateFr(planned))}</b><span>Séance ${esc(s.id)} : ${esc(shortName(s).replace(/, \w+$/, ''))}</span></span><span class="row-end">${icon('chevron')}</span></button></div>`;
    }
    main = entry.session ? (todayHero && doneToday ? todayHero : gym || todayHero) : `${todayHero}${nextRow}`;
  }

  const weekBlock = info.status === 'during' || info.status === 'before' ? `
    <section class="week">
      <div class="week-head"><h3>Cette semaine</h3>${rule ? `<span class="muted small">${esc(rule.label)}</span>` : ''}</div>
      ${weekStrip(state, info.status === 'during' ? info.calWeek : 1)}
      ${rule ? `<div class="week-rir"><span>Polyarticulaires <b>RIR ${esc(fmtRange(info.deload ? program.deload.rir : rule.rir.compound))}</b></span><span>Isolation <b>RIR ${esc(fmtRange(info.deload ? program.deload.rir : rule.rir.isolation))}</b></span>${infoBtn('rir')}</div>` : ''}
    </section>` : '';

  return `${head}${toast}${reviewCard}${main}
    <h3 class="section">Ce matin</h3>${morningBlock(state)}
    <h3 class="section">Nutrition</h3>${nutritionMini(state)}
    ${weekBlock}
    ${state.active ? '' : `<div class="other"><span class="muted small">Faire une autre séance</span>${program.sessionOrder.map((id) => `<button class="chip" data-action="start-session" data-session="${esc(id)}">${esc(id)}</button>`).join('')}</div>`}
    ${backupNudge(state)}`;
}

export function renderProgram(state) {
  const { program, lib, view } = state;
  const sid = view.session;
  const week = view.week;
  const s = program.sessions.find((x) => x.id === sid);
  const res = resolveSession(program, sid, week);
  const rule = program.weekRules.find((r) => r.week === week);
  const groups = Object.fromEntries(s.supersets.map((g) => [g.id, g]));
  const rawSlots = Object.fromEntries(s.slots.map((x) => [x.id, x]));

  const items = res.map((x) => {
    const sl = rawSlots[x.slotId];
    const g = x.superset ? groups[x.superset] : null;
    const notes = [];
    if (x.note) notes.push(x.note);
    if (g) {
      const [a, b] = g.slots.map((id) => rawSlots[id].label);
      notes.push(g.slots[0] === x.slotId ? `Supersérie avec ${b} : enchaîner sans repos` : `Fin de la supersérie ${a} + ${b} : repos ${fmtRest(g.restAfterRoundSec)}`);
    }
    if (x.rirFloor !== null) notes.push(`Jamais en dessous de RIR ${x.rirFloor} sur ce cycle`);
    if (sl.fallback) notes.push(`Sous ${sl.fallback.belowReps} répétitions au RIR demandé : finir les séries restantes en ${sl.fallback.exercises.map((id) => exName(lib, id)).join(' ou ')} (${fmtRange(sl.fallback.reps)})`);
    if (sl.increment && sl.increment.type === 'bodyweight' && sl.increment.addLoadWhenAllSetsReach) notes.push(`Lest de ${String(sl.increment.loadStepKg).replace('.', ',')} kg quand toutes les séries atteignent ${sl.increment.addLoadWhenAllSetsReach} répétitions`);
    if (sl.increment && sl.increment.note) notes.push(sl.increment.note);
    if (sl.stopIf) notes.push(`À supprimer si : ${sl.stopIf.toLowerCase()}`);
    const cue = sl.cueRef ? program.sessions.flatMap((z) => z.slots).find((z) => z.id === sl.cueRef).cue : sl.cue;
    return `
      <li class="slot${g ? ' in-superset' : ''}">
        <div class="slot-head"><span class="lbl">${esc(x.label)}</span><button class="nm link-plain" data-action="open-exercise" data-value="${esc(x.exercise)}">${esc(exName(lib, x.exercise))}</button></div>
        <div class="slot-line">${esc(fmtSetsReps(x))} · ${esc(rirText(x))}${g ? '' : ` · repos ${esc(fmtRest(x.restSec))}`}</div>
        ${notes.map((n) => `<div class="slot-note">${esc(n)}</div>`).join('')}
        <details><summary>Consigne et alternatives</summary>
          <p>${esc(cue)}</p>
          <p class="muted">Si occupé : ${esc(sl.alternatives.map((id) => exName(lib, id)).join(', '))}</p>
        </details>
      </li>`;
  }).join('');

  const chips = (list, current, action, label) => list.map((v) => `<button class="chip${v === current ? ' on' : ''}" data-action="${action}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(label(v))}</button>`).join('');
  const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
  const gate = program.progressionGate;

  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Retour</button><h1 class="display">Programme</h1></header>
    <div class="seg" role="group" aria-label="Séance">${chips(program.sessionOrder, sid, 'pick-session', (v) => `Séance ${v}`)}</div>
    <div class="chips" role="group" aria-label="Semaine">${chips(program.weekRules.map((r) => r.week), week, 'pick-week', (v) => `S${v}`)}</div>
    <div class="card">
      <h2 class="card-title">${esc(s.name)}</h2>
      <p class="muted">${esc(rule.label)}${rule.setDelta ? ` · une série de moins par exercice (minimum ${rule.minSets})` : ''}</p>
      <div class="facts"><span><b>${sets}</b> séries</span><span><b>~${estimateMinutes(res)}</b> min + échauffement</span></div>
    </div>
    <ol class="slots">${items}</ol>
    <details class="rules"><summary>Passage à la semaine suivante</summary>
      <p>${esc(gate.principle)}</p>
      <ul>${gate.maintainIfAnySignal.map((x) => `<li>${esc(x.label)}</li>`).join('')}</ul>
      <p>Un signal : on garde les réglages. Deux ou plus : décharge (moitié des séries, mêmes charges, RIR ${esc(fmtRange(program.deload.rir))}).</p>
    </details>
    <details class="rules"><summary>Ajustements du jour</summary>
      <ul>${program.dayAdjustments.map((x) => `<li><b>${esc(x.when)}</b> : ${esc(x.reminder)}</li>`).join('')}</ul>
    </details>`;
}

export function renderNav(tab) {
  const t = (id, label, ic) => `<button class="tab${tab === id ? ' on' : ''}" data-action="go" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">${icon(ic)}<span>${label}</span></button>`;
  return `${t('today', 'Aujourd\'hui', 'today')}${t('journal', 'Journal', 'journal')}${t('progress', 'Progrès', 'progress')}${t('nutrition', 'Nutrition', 'food')}${t('more', 'Plus', 'more')}`;
}

export function renderBanners(state) {
  const out = [];
  if (state.sw.updateReady) {
    out.push(`<div class="banner"><span>Nouvelle version disponible.</span><button class="btn small" data-action="apply-update">Mettre à jour</button></div>`);
  }
  if (state.isIOS && state.standalone === false) {
    out.push(`<div class="banner warn"><span>Ouvrez l'application depuis son icône sur l'écran d'accueil. Dans un onglet Safari, les données peuvent être effacées après 7 jours sans visite.</span></div>`);
  }
  return out.join('');
}

export { DECISION_TEXT };
