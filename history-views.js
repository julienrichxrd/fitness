// Historique des séances et progrès par exercice.
import { esc, exName, shortName } from './views.js';
import { formatDateFr } from './dates.js';
import { setsOf, weekForDate, workoutPlan } from './workout.js';
import { bestSet, isStagnating, fmtKg } from './suggest.js';
import { setTxt } from './workout-views.js';

const minutes = (w) => (w.endedAt ? Math.max(1, Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000)) : null);

export function renderHistory(state) {
  const { program } = state;
  const list = (state.workouts || []).filter((w) => w.status !== 'in-progress')
    .sort((a, b) => (b.date + b.startedAt).localeCompare(a.date + a.startedAt));
  if (!list.length) {
    return `<header class="page-head"><h1>Historique</h1></header>
      <div class="empty">Aucune séance enregistrée pour l'instant.<br>Vos séances apparaîtront ici dès la première terminée.</div>`;
  }
  return `<header class="page-head"><h1>Historique</h1></header>
    <ul class="hist">${list.map((w) => {
      const s = program.sessions.find((x) => x.id === w.sessionId);
      const n = setsOf(state.sets || [], w.id).length;
      const meta = [`${n} séries`, minutes(w) ? `${minutes(w)} min` : null, w.fatigue ? `fatigue ${w.fatigue}/5` : null, w.difficulty ? `difficulté ${w.difficulty}/10` : null].filter(Boolean).join(' · ');
      return `<li><button class="hist-item" data-action="open-workout" data-id="${esc(w.id)}">
        <span class="hero-letter small">${esc(w.sessionId)}</span>
        <span class="hist-main"><span class="hist-date">${esc(formatDateFr(w.date))}${w.status === 'abandoned' ? ' · abandonnée' : ''}</span><span class="hist-name">${esc(s ? shortName(s) : w.sessionId)} · S${weekForDate(program, w.date)}</span><span class="muted small">${esc(meta)}</span></span>
        <span class="chev">›</span></button></li>`;
    }).join('')}</ul>`;
}

export function renderWorkoutDetail(state) {
  const { program, lib } = state;
  const w = (state.workouts || []).find((x) => x.id === state.detailId);
  if (!w) return '<div class="empty">Séance introuvable.</div>';
  const s = program.sessions.find((x) => x.id === w.sessionId);
  const sets = setsOf(state.sets || [], w.id);
  const plan = workoutPlan(program, w);
  const blocks = plan.map((x) => {
    const mine = sets.filter((y) => y.slotId === x.slotId);
    if (!mine.length) return `<li class="det"><div class="det-head"><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(exName(lib, x.exercise))}</span></div><div class="muted small">Non fait</div></li>`;
    const names = [...new Set(mine.map((y) => y.exercise))].map((id) => exName(lib, id)).join(' puis ');
    return `<li class="det"><div class="det-head"><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(names)}</span></div><div class="last-sets">${mine.map((y) => `<span>${esc(setTxt(y))}</span>`).join('')}</div></li>`;
  }).join('');
  return `
    <header class="page-head with-back"><button class="back" data-action="go" data-tab="history">‹ Historique</button><p class="kicker">${esc(formatDateFr(w.date, { year: true }))} · S${weekForDate(program, w.date)}</p><h1>Séance ${esc(w.sessionId)} — ${esc(s ? shortName(s) : '')}</h1></header>
    <div class="pills">${[`${sets.length} séries`, minutes(w) ? `${minutes(w)} min` : null, w.fatigue ? `Fatigue ${w.fatigue}/5` : null, w.difficulty ? `Difficulté ${w.difficulty}/10` : null, w.status === 'abandoned' ? 'Abandonnée' : null].filter(Boolean).map((t) => `<span class="pill">${esc(t)}</span>`).join('')}</div>
    ${w.note ? `<div class="card"><div class="card-kicker">Note</div><p>${esc(w.note)}</p></div>` : ''}
    <ol class="details">${blocks}</ol>
    <button class="btn ghost danger-text" data-action="delete-workout" data-id="${esc(w.id)}">Supprimer cette séance</button>`;
}

/** Petite courbe de la meilleure charge par séance. */
function sparkline(values) {
  if (values.length < 2) return '';
  const w = 120; const h = 36; const pad = 4;
  const lo = Math.min(...values); const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), h - pad - ((v - lo) / span) * (h - 2 * pad)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3"/></svg>`;
}

/** Progrès par exercice : meilleure série de chaque séance, de la plus ancienne à la plus récente. */
export function exerciseProgress(state) {
  const workouts = new Map((state.workouts || []).filter((w) => w.status === 'done').map((w) => [w.id, w]));
  const byEx = new Map();
  for (const s of state.sets || []) {
    const w = workouts.get(s.workoutId);
    if (!w || s.reps === undefined) continue;
    if (!byEx.has(s.exercise)) byEx.set(s.exercise, new Map());
    const m = byEx.get(s.exercise);
    if (!m.has(w.id)) m.set(w.id, { date: w.date, startedAt: w.startedAt, sets: [] });
    m.get(w.id).sets.push(s);
  }
  return [...byEx.entries()].map(([exercise, m]) => {
    const sessions = [...m.values()].sort((a, b) => (a.date + a.startedAt).localeCompare(b.date + b.startedAt)).map((x) => ({ ...x, best: bestSet(x.sets) }));
    return { exercise, sessions, stagnation: isStagnating([...sessions].reverse()) };
  });
}

export function renderProgress(state) {
  const { lib } = state;
  const rows = exerciseProgress(state);
  if (!rows.length) {
    return `<header class="page-head"><h1>Progrès</h1></header>
      <div class="empty">Les progrès par exercice apparaîtront ici après votre première séance enregistrée.</div>`;
  }
  return `<header class="page-head"><h1>Progrès</h1><p class="muted">Meilleure série de chaque séance (charge la plus haute, puis le plus de répétitions).</p></header>
    <ul class="prog">${rows.map((r) => {
      const first = r.sessions[0].best;
      const last = r.sessions[r.sessions.length - 1].best;
      const dKg = (last.loadKg || 0) - (first.loadKg || 0);
      const dReps = last.reps - first.reps;
      const delta = r.sessions.length < 2 ? 'première séance' : dKg ? `${dKg > 0 ? '+' : ''}${fmtKg(dKg)} kg` : dReps ? `${dReps > 0 ? '+' : ''}${dReps} rép.` : 'stable';
      const up = r.sessions.length > 1 && (dKg > 0 || (!dKg && dReps > 0));
      return `<li><details class="prog-item"><summary>
        <span class="prog-main"><span class="nm">${esc(exName(lib, r.exercise))}</span><span class="muted small">${esc(setTxt(last))} · ${r.sessions.length} séance${r.sessions.length > 1 ? 's' : ''}</span></span>
        ${sparkline(r.sessions.map((x) => (x.best.loadKg || 0) * 100 + x.best.reps))}
        <span class="delta${up ? ' up' : ''}">${esc(delta)}</span>
        ${r.stagnation ? '<span class="pill warn">Stagnation</span>' : ''}
      </summary>
      <table class="prog-table"><thead><tr><th>Date</th><th>Meilleure série</th><th>Séries</th></tr></thead><tbody>
        ${[...r.sessions].reverse().map((x) => `<tr><td>${esc(formatDateFr(x.date, { weekday: false }))}</td><td>${esc(setTxt(x.best))}</td><td>${x.sets.length}</td></tr>`).join('')}
      </tbody></table></details></li>`;
    }).join('')}</ul>`;
}
