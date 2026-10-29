// Écrans de séance : démarrage, exercice en cours avec saisie et chronomètre, liste, remplacement, fin.
import { esc, exName, fmtRange, fmtRest, rirText, shortName } from './views.js';
import { formatDateFr } from './dates.js';
import { workoutPlan, slotSets, progress, suggestionFor, prefill, restLeft, summary, slotHistory, eveOfRunWarning } from './workout.js';
import { fmtKg, loadMode, loadLabel, rirFloorWarning, suggest } from './suggest.js';

const kgTxt = (s) => (s.loadKg === null || s.loadKg === undefined ? '' : s.loadKg === 0 ? 'PDC' : `${fmtKg(s.loadKg)} kg`);
export const setTxt = (s) => `${kgTxt(s) ? `${kgTxt(s)} × ` : ''}${s.reps}${s.rir !== null && s.rir !== undefined ? ` · RIR ${s.rir}` : ''}`;
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function renderStart(state) {
  const { program, starting, today } = state;
  const s = program.sessions.find((x) => x.id === starting.sessionId);
  const warm = program.warmup;
  const f = starting.fatigue;
  const eve = eveOfRunWarning(s.id, today);
  return `
    <header class="page-head with-back"><button class="back" data-action="go" data-tab="today">‹ Retour</button><p class="kicker">Séance ${esc(s.id)}</p><h1>${esc(shortName(s))}</h1></header>
    ${eve ? `<div class="notice warn">${esc(eve)}</div>` : ''}
    <h3 class="section">Fatigue aujourd'hui ? <span class="opt">facultatif</span></h3>
    <div class="scale five">${[1, 2, 3, 4, 5].map((n) => `<button class="scale-btn${f === n ? ' on' : ''}" data-action="pick-fatigue" data-value="${n}" aria-pressed="${f === n}">${n}</button>`).join('')}</div>
    <div class="scale-legend"><span>en forme</span><span>épuisé</span></div>
    ${f >= 4 ? `<div class="notice warn"><strong>Règle du programme :</strong> ${esc(program.dayAdjustments.find((d) => d.id === 'high-fatigue').reminder)}. Aucune augmentation de charge ne sera proposée aujourd'hui. L'application ne retire rien d'elle-même : à vous d'ajuster.</div>` : ''}
    <details class="rules" open><summary>Échauffement (~10 min)</summary>
      <p>${esc(warm.cardioMinutes)} min de cardio léger, puis : ${esc(warm.mobility[s.warmup] || '')}</p>
      <p class="muted">${esc(warm.rampSets)}</p>
    </details>
    <button class="btn big" data-action="confirm-start">Démarrer</button>`;
}

function suggestionBox(sug, draft) {
  if (!sug) return '';
  const cls = { increase: 'up', choice: 'up', calibration: 'info', explosive: 'info' }[sug.kind] || 'hold';
  return `
    <div class="sug ${cls}" data-test="suggestion">
      <div class="sug-title">${sug.kind === 'increase' ? '↑ ' : ''}${esc(sug.title)}</div>
      <div class="sug-reason">${esc(sug.reason)}</div>
      ${sug.options.length ? `<div class="sug-opts">${sug.options.map((o, i) => `<button class="chip${draft && draft.option === i ? ' on' : ''}" data-action="pick-option" data-value="${i}">${esc(o.label)}</button>`).join('')}</div>` : ''}
      ${sug.warnings.map((w) => `<div class="sug-warn">${esc(w)}</div>`).join('')}
    </div>`;
}

function lastTime(history) {
  if (!history.length) return '';
  const h = history[0];
  return `<div class="last"><span class="muted">Dernière fois · ${esc(formatDateFr(h.date, { weekday: false }))}</span><div class="last-sets">${h.sets.map((s) => `<span>${esc(setTxt(s))}</span>`).join('')}</div></div>`;
}

function stepper(id, label, value, action, { decimal = false, unit = '' } = {}) {
  return `
    <div class="stepper">
      <div class="stepper-label">${esc(label)}</div>
      <div class="stepper-row">
        <button class="step" data-action="${action}" data-dir="-1" aria-label="Moins">−</button>
        <input id="${id}" class="step-input" inputmode="${decimal ? 'decimal' : 'numeric'}" autocomplete="off" value="${esc(value === null || value === undefined ? '' : decimal ? fmtKg(value) : value)}" placeholder="—" aria-label="${esc(label)}">
        <button class="step" data-action="${action}" data-dir="1" aria-label="Plus">+</button>
      </div>
      ${unit ? `<div class="stepper-unit">${esc(unit)}</div>` : ''}
    </div>`;
}

export function renderRestBar(workout) {
  const left = restLeft(workout);
  if (left === null) return '';
  const total = workout.restTotalSec || 1;
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  return `
    <div class="rest${left === 0 ? ' over' : ''}" id="rest">
      <div class="rest-bar"><span id="rest-fill" style="width:${pct}%"></span></div>
      <div class="rest-row">
        <div><div class="rest-label" id="rest-label">${left === 0 ? 'Repos terminé' : 'Repos'}</div><div class="rest-time" id="rest-time">${clock(left)}</div></div>
        <div class="rest-btns">
          <button class="btn small secondary" data-action="rest-adjust" data-value="-15">−15 s</button>
          <button class="btn small secondary" data-action="rest-adjust" data-value="15">+15 s</button>
          <button class="btn small" data-action="rest-skip">${left === 0 ? 'OK' : 'Passer'}</button>
        </div>
      </div>
    </div>`;
}

/** Calcule (et garde dans l'état) les valeurs de saisie de l'emplacement courant. */
export function currentContext(state) {
  const { program, active } = state;
  const plan = workoutPlan(program, active.workout);
  const item = plan.find((x) => x.slotId === active.workout.currentSlot) || plan[0];
  const todaySets = slotSets(active.sets, item.slotId);
  const { history, suggestion } = suggestionFor(item, state.workouts || [], state.sets || [], active.workout);
  if (!state.draft || state.draft.slotId !== item.slotId || state.draft.count !== todaySets.length || state.draft.exercise !== item.exercise) {
    state.draft = { slotId: item.slotId, exercise: item.exercise, count: todaySets.length, option: null, ...prefill(item, todaySets, suggestion, history) };
  }
  return { plan, item, todaySets, history, suggestion };
}

export function renderWorkout(state) {
  const { program, lib, active, draft: _d, ui } = state;
  const { plan, item, todaySets, history, suggestion } = currentContext(state);
  const draft = state.draft;
  const w = active.workout;
  const s = program.sessions.find((x) => x.id === w.sessionId);
  const p = progress(plan, active.sets);
  const idx = plan.indexOf(item);
  const mode = loadMode(item, item.increment);
  const group = item.superset ? plan.filter((x) => x.superset === item.superset) : null;
  const partner = group ? group.find((x) => x.slotId !== item.slotId) : null;
  const complete = todaySets.length >= item.sets;
  const raw = item.raw;
  const cue = raw.cueRef ? program.sessions.flatMap((z) => z.slots).find((z) => z.id === raw.cueRef).cue : raw.cue;
  const floorWarn = rirFloorWarning(item, draft.rir);
  const rows = [];
  for (let i = 0; i < Math.max(item.sets, todaySets.length); i += 1) {
    const done = todaySets[i];
    if (done) rows.push(`<li class="set done"><span class="set-n">${i + 1}</span><span class="set-v">${esc(setTxt(done))}${done.exercise !== item.planned ? ` <em>${esc(exName(lib, done.exercise))}</em>` : ''}</span><button class="icon-btn" data-action="delete-set" data-id="${esc(done.id)}" aria-label="Supprimer la série ${i + 1}">✕</button></li>`);
    else rows.push(`<li class="set${i === todaySets.length ? ' now' : ''}"><span class="set-n">${i + 1}</span><span class="set-v muted">${i === todaySets.length ? 'à faire' : ''}</span></li>`);
  }
  const fb = ui.fallback;
  const fbBlock = fb ? `
    <div class="sug hold" data-test="fallback">
      <div class="sug-title">Moins de ${fb.belowReps} répétitions</div>
      <div class="sug-reason">Le programme prévoit de finir les ${fb.remaining} série${fb.remaining > 1 ? 's' : ''} restante${fb.remaining > 1 ? 's' : ''} sur un exercice de repli (${esc(fmtRange(fb.reps))} répétitions).</div>
      <div class="sug-opts">${fb.exercises.map((id) => `<button class="chip" data-action="accept-fallback" data-value="${esc(id)}">${esc(exName(lib, id))}</button>`).join('')}<button class="chip" data-action="refuse-fallback">Non, continuer</button></div>
    </div>` : '';

  const input = complete ? `
      <div class="done-box">
        <strong>${item.sets} série${item.sets > 1 ? 's' : ''} faite${item.sets > 1 ? 's' : ''}.</strong>
        <button class="btn secondary" data-action="extra-set">Ajouter une série</button>
      </div>` : `
      <div class="inputs${mode === 'none' ? ' single' : ''}">
        ${mode === 'none' ? '' : stepper('in-load', mode === 'added' ? 'Lest' : 'Charge', draft.loadKg, 'step-load', { decimal: true, unit: loadLabel(item, item.increment) })}
        ${stepper('in-reps', item.perSide ? 'Répétitions par côté' : 'Répétitions', draft.reps, 'step-reps', { unit: `objectif ${fmtRange(item.reps)}` })}
      </div>
      ${item.rir ? `
      <div class="rir">
        <div class="stepper-label">RIR · répétitions en réserve <span class="muted">(cible ${esc(fmtRange(item.rir))})</span></div>
        <div class="scale six">${[0, 1, 2, 3, 4, 5].map((n) => `<button class="scale-btn${draft.rir === n ? ' on' : ''}${item.rir && n >= item.rir.min && n <= item.rir.max ? ' target' : ''}" data-action="pick-rir" data-value="${n}" aria-pressed="${draft.rir === n}">${n}</button>`).join('')}</div>
        ${floorWarn ? `<div class="sug-warn">${esc(floorWarn)}</div>` : ''}
      </div>` : ''}
      ${state.inputError ? `<div class="msg-err" role="alert">${esc(state.inputError)}</div>` : ''}
      <button class="btn big" data-action="validate-set" data-test="validate">Valider la série ${todaySets.length + 1}/${item.sets}</button>`;

  return `
    <header class="wk-top">
      <button class="back" data-action="go" data-tab="today" aria-label="Accueil">‹</button>
      <div class="wk-title"><div>Séance ${esc(s.id)} · S${item.week}</div><div class="muted" id="elapsed"></div></div>
      <button class="btn small secondary" data-action="open-sheet" data-value="list">Exercices</button>
    </header>
    <div class="bar thin"><span style="width:${Math.round((p.done / p.planned) * 100)}%"></span></div>

    <section class="ex">
      <div class="ex-kicker"><span class="lbl">${esc(item.label)}</span> Exercice ${idx + 1}/${plan.length}${partner ? ` · supersérie avec ${esc(partner.label)}` : ''}</div>
      <h1 class="ex-name">${esc(exName(lib, item.exercise))}</h1>
      ${item.swap ? `<div class="pill swap">${item.swap.kind === 'fallback' ? 'Repli' : 'Remplace'} : ${esc(exName(lib, item.planned))}</div>` : ''}
      <div class="ex-target"><span>${item.sets} × ${esc(fmtRange(item.reps))}${item.perSide ? ' /côté' : ''}</span><span>${esc(rirText(item))}</span><span>${!group ? `repos ${esc(fmtRest(item.restSec))}` : group[0].slotId === item.slotId ? `puis ${esc(partner.label)} sans repos` : `repos ${esc(fmtRest(item.restSec))} après le tour`}</span></div>
      ${item.note ? `<div class="slot-note">${esc(item.note)}</div>` : ''}
      ${fbBlock}
      ${suggestionBox(suggestion, draft)}
      ${lastTime(history)}
      <ol class="sets">${rows.join('')}</ol>
      ${input}
      <div class="ex-links">
        <button class="link" data-action="open-sheet" data-value="swap">Remplacer l'exercice</button>
        <details><summary>Consigne</summary><p>${esc(cue)}</p></details>
      </div>
    </section>

    <div class="wk-nav">
      <button class="btn secondary" data-action="goto-slot" data-value="${esc(plan[(idx - 1 + plan.length) % plan.length].slotId)}">‹ Précédent</button>
      <button class="btn secondary" data-action="goto-slot" data-value="${esc(plan[(idx + 1) % plan.length].slotId)}">Suivant ›</button>
    </div>
    <button class="btn ghost" data-action="finish">Terminer la séance</button>
    ${ui.sheet ? renderSheet(state, plan, item) : ''}
    <div class="rest-dock" id="rest-dock">${renderRestBar(w)}</div>`;
}

function renderSheet(state, plan, item) {
  const { lib, active, ui } = state;
  let body = '';
  if (ui.sheet === 'list') {
    body = `<h2>Exercices</h2><ol class="sheet-list">${plan.map((x) => {
      const n = slotSets(active.sets, x.slotId).length;
      const st = n >= x.sets ? 'ok' : n ? 'part' : '';
      return `<li><button class="sheet-item ${st}${x.slotId === item.slotId ? ' cur' : ''}" data-action="goto-slot" data-value="${esc(x.slotId)}"><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(exName(lib, x.exercise))}</span><span class="cnt">${n}/${x.sets}${n >= x.sets ? ' ✓' : ''}</span></button></li>`;
    }).join('')}</ol>`;
  } else if (ui.sheet === 'swap') {
    const opts = [item.planned, ...item.raw.alternatives];
    body = `<h2>Remplacer « ${esc(exName(lib, item.planned))} »</h2>
      <p class="muted">Pour les séries restantes de cette séance. Chaque exercice garde son propre historique.</p>
      <div class="sheet-list">${opts.map((id) => `<button class="sheet-item${id === item.exercise ? ' cur' : ''}" data-action="swap-exercise" data-value="${esc(id)}"><span class="nm">${esc(exName(lib, id))}${id === item.planned ? ' <span class="muted">(prévu)</span>' : ''}</span></button>`).join('')}</div>`;
  }
  return `<div class="sheet-back" data-action="close-sheet"></div><div class="sheet" role="dialog">${body}<button class="btn secondary" data-action="close-sheet">Fermer</button></div>`;
}

export function renderFinish(state) {
  const { program, lib, active, finish } = state;
  const w = active.workout;
  const plan = workoutPlan(program, w);
  const sum = summary(plan, active.sets, w);
  const s = program.sessions.find((x) => x.id === w.sessionId);
  const allSets = [...(state.sets || []).filter((x) => x.workoutId !== w.id), ...active.sets];
  const allWorkouts = [...(state.workouts || []).filter((x) => x.id !== w.id), { ...w, status: 'done' }];
  const nextTime = sum.perSlot.filter((x) => x.done.length && x.item.category !== 'explosive').map((x) => {
    const history = slotHistory(allWorkouts, allSets, { slotId: x.item.slotId, exercise: x.item.exercise });
    const sug = suggest({ item: x.item, increment: x.item.increment, history });
    return `<li><span class="nm">${esc(exName(lib, x.item.exercise))}</span><span class="next ${sug.kind === 'increase' || sug.kind === 'choice' ? 'up' : ''}">${esc(sug.title)}</span></li>`;
  });
  const d = finish.difficulty;
  return `
    <header class="page-head with-back"><button class="back" data-action="resume">‹ Revenir à la séance</button><p class="kicker">Fin de séance</p><h1>Séance ${esc(s.id)} — ${esc(shortName(s))}</h1></header>
    <div class="stats">
      <div><span class="stat">${sum.done}<small>/${sum.planned}</small></span><span class="stat-label">séries</span></div>
      <div><span class="stat">${sum.minutes}</span><span class="stat-label">minutes</span></div>
      <div><span class="stat">${sum.perSlot.filter((x) => x.done.length).length}</span><span class="stat-label">exercices</span></div>
    </div>
    ${sum.done < sum.planned ? `<div class="notice warn">${sum.planned - sum.done} série${sum.planned - sum.done > 1 ? 's' : ''} non faite${sum.planned - sum.done > 1 ? 's' : ''}. Vous pouvez revenir à la séance ou l'enregistrer telle quelle.</div>` : ''}
    <h3 class="section">Meilleures séries</h3>
    <ul class="best">${sum.perSlot.filter((x) => x.best).map((x) => `<li><span class="lbl">${esc(x.item.label)}</span><span class="nm">${esc(exName(lib, x.best.exercise))}</span><span class="v">${esc(setTxt(x.best))}</span></li>`).join('') || '<li class="muted">Aucune série enregistrée.</li>'}</ul>
    ${nextTime.length ? `<h3 class="section">La prochaine fois</h3><ul class="best next-list">${nextTime.join('')}</ul>` : ''}
    <h3 class="section">Difficulté de la séance ? <span class="opt">facultatif</span></h3>
    <div class="scale ten">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="scale-btn${d === n ? ' on' : ''}" data-action="pick-difficulty" data-value="${n}">${n}</button>`).join('')}</div>
    <div class="scale-legend"><span>très facile</span><span>maximale</span></div>
    <label class="field"><span class="stepper-label">Note <span class="opt">facultatif</span></span><textarea id="finish-note" rows="2" placeholder="Douleur, matériel occupé, sensations…">${esc(finish.note || '')}</textarea></label>
    <button class="btn big" data-action="save-workout" data-test="save-workout">Enregistrer la séance</button>
    <button class="btn ghost danger-text" data-action="abandon-workout">Abandonner la séance</button>`;
}
