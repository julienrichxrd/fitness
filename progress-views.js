// Progrès : musculation (par exercice, avec fiche), corps (poids, mensurations, photos, récupération), endurance.
import { esc, exName } from './views.js';
import { formatDateFr, toDayNumber, fromDayNumber, addDays, mondayOf } from './dates.js';
import { bestSet, isStagnating, fmtKg } from './suggest.js';
import { icon, nf, nf0, lineChart, barChart, infoBtn } from './ui.js';
import { setTxt } from './workout-views.js';
import { weights, trend, trendReading, measureSeries, MEASURES } from './body.js';
import { enduranceStats, fmtDuration, fmtPace, paceSecPerKm } from './endurance.js';

const SEG = [
  { id: 'lift', label: 'Musculation' },
  { id: 'body', label: 'Corps' },
  { id: 'endurance', label: 'Endurance' },
];
const shortDate = (n) => formatDateFr(fromDayNumber(n), { weekday: false }).replace(/ (\w{3})\w+$/, ' $1.');
/** Force estimée (Epley) : utile seulement si répétitions + RIR ≤ 12 ; sinon on suit la charge. */
const e1rm = (s) => ((s.reps + (s.rir || 0)) <= 12 && s.loadKg ? s.loadKg * (1 + (s.reps + (s.rir || 0)) / 30) : null);

export function exerciseProgress(state) {
  const workouts = new Map((state.workouts || []).filter((w) => w.status === 'done').map((w) => [w.id, w]));
  const byEx = new Map();
  for (const s of state.sets || []) {
    const w = workouts.get(s.workoutId);
    if (!w) continue;
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

function deltaText(r) {
  if (r.sessions.length < 2) return { text: 'première séance', up: false };
  const first = r.sessions[0].best;
  const last = r.sessions[r.sessions.length - 1].best;
  const dKg = (last.loadKg || 0) - (first.loadKg || 0);
  const dReps = last.reps - first.reps;
  if (dKg) return { text: `${dKg > 0 ? '+' : ''}${fmtKg(dKg)} kg`, up: dKg > 0 };
  if (dReps) return { text: `${dReps > 0 ? '+' : ''}${dReps} rép.`, up: dReps > 0 };
  return { text: 'stable', up: false };
}

function sparkline(values) {
  if (values.length < 2) return '<span class="spark-empty"></span>';
  const w = 72; const h = 28; const pad = 3;
  const lo = Math.min(...values); const hi = Math.max(...values); const span = hi - lo || 1;
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), h - pad - ((v - lo) / span) * (h - 2 * pad)]);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')}"/><circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="2.6"/></svg>`;
}

/** Séries réellement faites par muscle sur la semaine (directe 1, indirecte 0,5). */
function muscleVolume(state, from) {
  const lib = state.lib;
  const ids = new Set((state.workouts || []).filter((w) => w.status === 'done' && w.date >= from && w.date <= addDays(from, 6)).map((w) => w.id));
  const out = {};
  (state.sets || []).filter((s) => ids.has(s.workoutId)).forEach((s) => {
    const ex = lib.exercises.find((e) => e.id === s.exercise);
    if (!ex) return;
    ex.primary.forEach((m) => { out[m] = (out[m] || 0) + 1; });
    ex.secondary.forEach((m) => { out[m] = (out[m] || 0) + 0.5; });
  });
  return out;
}

function liftTab(state) {
  const rows = exerciseProgress(state);
  if (!rows.length) return '<div class="empty">Les progrès par exercice apparaîtront après votre première séance enregistrée.</div>';
  const vol = muscleVolume(state, mondayOf(state.today));
  const max = Math.max(1, ...Object.values(vol));
  const volBlock = Object.keys(vol).length ? `
    <h3 class="section">Séries par muscle cette semaine ${infoBtn('weekly-review')}</h3>
    <div class="card vol">${Object.entries(state.lib.muscles).filter(([m]) => vol[m]).map(([m, label]) => `<div class="vol-row"><span>${esc(label)}</span><span class="vol-track"><span style="width:${(vol[m] / max) * 100}%"></span></span><b>${nf(vol[m])}</b></div>`).join('')}
    <p class="muted small">Série où le muscle travaille en premier = 1, en second = 0,5. Une approximation utile, pas une mesure.</p></div>` : '';
  return `${volBlock}
    <h3 class="section">Exercices</h3>
    <div class="group">${rows.sort((a, b) => b.sessions.length - a.sessions.length).map((r) => {
      const last = r.sessions[r.sessions.length - 1].best;
      const d = deltaText(r);
      return `<button class="row" data-action="open-exercise" data-value="${esc(r.exercise)}">
        <span class="row-main"><b>${esc(exName(state.lib, r.exercise))}</b><span>${esc(setTxt(last))}, ${r.sessions.length} séance${r.sessions.length > 1 ? 's' : ''}${r.stagnation ? ', stagnation' : ''}</span></span>
        ${sparkline(r.sessions.map((x) => (x.best.loadKg || 0) * 100 + x.best.reps))}
        <span class="delta${d.up ? ' up' : ''}">${esc(d.text)}</span>
      </button>`;
    }).join('')}</div>`;
}

export function renderExercise(state) {
  const { lib, program } = state;
  const id = state.exerciseId;
  const ex = lib.exercises.find((e) => e.id === id) || { id, name: id, primary: [], secondary: [] };
  const slots = program.sessions.flatMap((s) => s.slots.map((sl) => ({ ...sl, session: s.id }))).filter((sl) => sl.exercise === id || sl.alternatives.includes(id) || (sl.fallback && sl.fallback.exercises.includes(id)));
  const main = slots.find((sl) => sl.exercise === id);
  const cue = main ? (main.cueRef ? program.sessions.flatMap((s) => s.slots).find((z) => z.id === main.cueRef).cue : main.cue) : null;
  const r = exerciseProgress(state).find((x) => x.exercise === id);
  const muscles = (list) => list.map((m) => lib.muscles[m]).join(', ');
  let hist = '<div class="empty small">Pas encore de séance sur cet exercice.</div>';
  if (r) {
    const pts = r.sessions.map((x) => ({ x: toDayNumber(x.date), y: x.best.loadKg || 0, reps: x.best.reps }));
    const strength = r.sessions.map((x) => ({ x: toDayNumber(x.date), y: e1rm(x.best) })).filter((p) => p.y);
    const useStrength = strength.length >= 2 && r.sessions.every((x) => (x.best.loadKg || 0) > 0);
    const loads = new Set(r.sessions.map((x) => x.best.loadKg || 0));
    let chart;
    let title;
    let sub;
    if (useStrength) {
      chart = lineChart({ series: [{ points: strength, cls: 'lift', dots: true, area: true }], yFmt: (v) => `${nf0(v)}`, xLabel: shortDate, label: 'Force estimée' });
      title = 'Force estimée (kg)'; sub = 'Meilleure série de chaque séance';
    } else if (loads.size > 1) {
      chart = lineChart({ series: [{ points: pts.map((p) => ({ x: p.x, y: p.y })), cls: 'lift', dots: true, area: true }], yFmt: (v) => nf(v), xLabel: shortDate, label: 'Charge de la meilleure série' });
      title = 'Charge (kg)'; sub = 'Meilleure série de chaque séance';
    } else {
      chart = lineChart({ series: [{ points: pts.map((p) => ({ x: p.x, y: p.reps })), cls: 'lift', dots: true, area: true }], yFmt: (v) => nf0(v), xLabel: shortDate, label: 'Répétitions' });
      title = 'Répétitions'; sub = [...loads][0] ? `à ${fmtKg([...loads][0])} kg` : 'au poids du corps';
    }
    hist = `
      ${chart ? `<div class="card chart-card"><div class="chart-head"><b>${title}</b><span class="muted small">${esc(sub)}</span></div>${chart}</div>` : ''}
      <table class="table"><thead><tr><th>Date</th><th>Meilleure série</th><th>Séries</th></tr></thead><tbody>
        ${[...r.sessions].reverse().map((x) => `<tr><td>${esc(formatDateFr(x.date, { weekday: false }))}</td><td>${esc(setTxt(x.best))}</td><td class="muted">${x.sets.map((s) => `${s.reps}`).join(' · ')}</td></tr>`).join('')}
      </tbody></table>
      ${r.stagnation ? '<div class="notice warn"><b>Stagnation</b> : même charge et même total trois séances de suite. Vérifiez sommeil, alimentation et technique ; si elle dure, au choix : garder la charge, ou baisser de 5 à 10 % et reconstruire.</div>' : ''}`;
  }
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Retour</button><h1 class="display">${esc(ex.name)}</h1></header>
    <div class="card fiche">
      <dl class="kv">
        <div><dt>Muscles principaux</dt><dd>${esc(muscles(ex.primary) || '—')}</dd></div>
        ${ex.secondary.length ? `<div><dt>Aussi</dt><dd>${esc(muscles(ex.secondary))}</dd></div>` : ''}
        ${ex.equipment ? `<div><dt>Matériel</dt><dd>${esc(ex.equipment)}</dd></div>` : ''}
        ${slots.length ? `<div><dt>Dans le programme</dt><dd>${esc(slots.map((s) => `Séance ${s.session}, ${s.label}${s.exercise === id ? '' : ' (remplaçant)'}`).join(' ; '))}</dd></div>` : ''}
      </dl>
      ${cue ? `<p class="cue">${esc(cue)}</p>` : ''}
      ${main && main.alternatives.length ? `<p class="muted small">Si occupé : ${esc(main.alternatives.map((a) => exName(lib, a)).join(', '))}</p>` : ''}
    </div>
    <h3 class="section">Votre progression</h3>
    ${hist}`;
}

function bodyTab(state) {
  const entries = state.entries || [];
  const w = weights(entries);
  const t = trend(w);
  const reading = trendReading(w);
  const weightChart = w.length >= 2 ? lineChart({
    series: [{ points: t.map((p) => ({ x: toDayNumber(p.date), y: p.kg })), cls: 'body faint', dots: true, line: false, dotR: 2.4 }, { points: t.map((p) => ({ x: toDayNumber(p.date), y: p.avg })), cls: 'body' }],
    yFmt: (v) => nf(v), xLabel: shortDate, label: 'Poids et tendance',
  }) : '';
  const ms = measureSeries(entries);
  const mRows = MEASURES.filter((m) => ms[m.id].length).map((m) => {
    const s = ms[m.id];
    const d = s.length > 1 ? s[s.length - 1].value - s[0].value : null;
    return `<tr><td>${esc(m.label)}</td><td><b>${nf(s[s.length - 1].value)}</b> cm</td><td class="${d > 0 ? (m.id === 'waist' ? 'warn' : 'up') : d < 0 ? (m.id === 'waist' ? 'up' : 'warn') : 'muted'}">${d === null ? '—' : `${d > 0 ? '+' : ''}${nf(d)}`}</td></tr>`;
  }).join('');
  const photos = (state.photosMeta || []);
  const c = entries.filter((e) => e.kind === 'checkin').sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
  const sleepBars = c.filter((x) => typeof x.sleepH === 'number').map((x) => ({ value: x.sleepH, label: String(Number(x.date.slice(8))), muted: x.sleepH < 7 }));
  return `
    <div class="card chart-card">
      <div class="chart-head"><b>Poids</b>${infoBtn('weight-trend')}<button class="btn small quiet" data-action="sheet" data-value="weight">${icon('plus')} Pesée</button></div>
      ${w.length ? `<div class="big-num">${nf(t[t.length - 1].avg)} <small>kg, moyenne 7 jours</small></div>` : ''}
      ${weightChart || '<p class="muted">Pesez-vous 3 matins par semaine : la courbe de tendance apparaît dès la deuxième pesée.</p>'}
      ${w.length ? `<p class="reading ${reading.tone}">${esc(reading.text)}</p>` : ''}
    </div>
    <div class="card">
      <div class="chart-head"><b>Mensurations</b>${infoBtn('measurements')}<button class="btn small quiet" data-action="sheet" data-value="measure">${icon('plus')} Mesurer</button></div>
      ${mRows ? `<table class="table"><thead><tr><th></th><th>Dernière</th><th>Depuis le début</th></tr></thead><tbody>${mRows}</tbody></table>` : '<p class="muted">En semaine 1, puis en fin de cycle.</p>'}
    </div>
    <div class="card">
      <div class="chart-head"><b>Photos</b>${infoBtn('photos')}<button class="btn small quiet" data-action="go" data-tab="photos">${icon('camera')} ${photos.length ? 'Voir' : 'Ajouter'}</button></div>
      <p class="muted small">${photos.length ? `${photos.length} photo${photos.length > 1 ? 's' : ''}, la dernière le ${esc(formatDateFr(photos[photos.length - 1].date, { weekday: false }))}.` : 'Face, profil, dos : en semaine 1, puis en fin de cycle. Elles restent sur cet iPhone.'}</p>
    </div>
    <div class="card chart-card">
      <div class="chart-head"><b>Sommeil</b>${infoBtn('checkin')}</div>
      ${sleepBars.length >= 2 ? barChart({ bars: sleepBars, goal: 7, yFmt: (v) => `${nf0(v)} h`, cls: 'body', label: 'Heures de sommeil' }) : '<p class="muted">Le ressenti du matin alimente ce graphique.</p>'}
    </div>`;
}

function enduranceTab(state) {
  const entries = state.entries || [];
  const runs = enduranceStats(entries, 'run');
  const swims = enduranceStats(entries, 'swim');
  const runChart = runs.list.filter((r) => r.durationSec).length >= 2 ? lineChart({ series: [{ points: runs.list.filter((r) => r.durationSec).map((r) => ({ x: toDayNumber(r.date), y: r.durationSec / 60 })), cls: 'run', dots: true, area: true }], yFmt: (v) => `${nf0(v)}′`, xLabel: shortDate, label: 'Durée des sorties' }) : '';
  const swimChart = swims.list.filter((s) => s.distanceM).length >= 2 ? lineChart({ series: [{ points: swims.list.filter((s) => s.distanceM).map((s) => ({ x: toDayNumber(s.date), y: s.distanceM })), cls: 'swim', dots: true, area: true }], yFmt: (v) => nf0(v), xLabel: shortDate, label: 'Distance nagée' }) : '';
  const tests = swims.list.filter((s) => s.test400Sec);
  return `
    <div class="card chart-card">
      <div class="chart-head"><b>Course</b>${infoBtn('easy-run')}<button class="btn small quiet" data-action="sheet" data-value="run">${icon('plus')} Course</button></div>
      <div class="facts"><span><b>${runs.count}</b> sortie${runs.count > 1 ? 's' : ''}</span><span><b>${nf(runs.distanceM / 1000)}</b> km</span><span><b>${fmtDuration(runs.durationSec)}</b></span></div>
      ${runChart || '<p class="muted">La durée de chaque sortie s\'affichera ici. L\'objectif du cycle : 35 à 45 min faciles.</p>'}
      ${runs.list.length ? `<table class="table"><tbody>${[...runs.list].reverse().slice(0, 6).map((r) => `<tr><td>${esc(formatDateFr(r.date, { weekday: false }))}</td><td>${esc(fmtDuration(r.durationSec))}</td><td>${r.distanceM ? `${nf(r.distanceM / 1000, 2)} km` : '—'}</td><td class="muted">${r.distanceM && r.durationSec ? `${fmtPace(paceSecPerKm(r.durationSec, r.distanceM / 1000))}/km` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    </div>
    <div class="card chart-card">
      <div class="chart-head"><b>Natation</b>${infoBtn('swim')}<button class="btn small quiet" data-action="sheet" data-value="swim">${icon('plus')} Natation</button></div>
      <div class="facts"><span><b>${swims.count}</b> séance${swims.count > 1 ? 's' : ''}</span><span><b>${nf0(swims.distanceM)}</b> m</span></div>
      ${swimChart || '<p class="muted">La distance de chaque séance s\'affichera ici.</p>'}
      ${tests.length ? `<p class="reading ok">Repère 400 m : ${esc(fmtDuration(tests[tests.length - 1].test400Sec))}${tests[tests.length - 1].strokes ? `, ${tests[tests.length - 1].strokes} mouvements par longueur` : ''}.</p>` : ''}
    </div>`;
}

export function renderProgress(state) {
  const tab = state.progressTab || 'lift';
  return `<header class="page-head"><h1 class="display">Progrès</h1></header>
    <div class="seg" role="group">${SEG.map((s) => `<button class="chip${s.id === tab ? ' on' : ''}" data-action="progress-tab" data-value="${s.id}">${esc(s.label)}</button>`).join('')}</div>
    ${tab === 'lift' ? liftTab(state) : tab === 'body' ? bodyTab(state) : enduranceTab(state)}`;
}

export function renderPhotos(state) {
  const list = state.photosMeta || [];
  const poses = [['face', 'Face'], ['profil', 'Profil'], ['dos', 'Dos']];
  const dates = [...new Set(list.map((p) => p.date))].sort();
  const cmp = state.photoCompare || { a: dates[0], b: dates[dates.length - 1] };
  const img = (date, pose) => { const p = list.find((x) => x.date === date && x.pose === pose); return p && state.photoUrls[p.id] ? `<img src="${state.photoUrls[p.id]}" alt="${esc(pose)} du ${esc(date)}" data-action="photo-menu" data-id="${esc(p.id)}">` : '<div class="ph-empty">—</div>'; };
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Progrès</button><h1 class="display">Photos</h1></header>
    <div class="notice">${esc('Même lieu, même lumière, même distance, même heure, posture relâchée. Elles restent sur cet iPhone.')}</div>
    <div class="photo-add">${poses.map(([id, label]) => `<label class="btn quiet">${icon('camera')} ${label}<input type="file" accept="image/*" data-photo-pose="${id}" hidden></label>`).join('')}</div>
    ${dates.length >= 2 ? `
      <h3 class="section">Comparer</h3>
      <div class="cmp-pick">
        <select data-action="photo-compare" data-side="a">${dates.map((d) => `<option value="${d}"${d === cmp.a ? ' selected' : ''}>${esc(formatDateFr(d, { weekday: false }))}</option>`).join('')}</select>
        <select data-action="photo-compare" data-side="b">${dates.map((d) => `<option value="${d}"${d === cmp.b ? ' selected' : ''}>${esc(formatDateFr(d, { weekday: false }))}</option>`).join('')}</select>
      </div>
      ${poses.map(([id, label]) => `<div class="cmp-row"><div>${img(cmp.a, id)}</div><div>${img(cmp.b, id)}</div><span class="cmp-label">${label}</span></div>`).join('')}` : ''}
    <h3 class="section">Toutes les photos</h3>
    ${dates.length ? [...dates].reverse().map((d) => `<div class="photo-day"><div class="muted small">${esc(formatDateFr(d))}</div><div class="photo-grid">${poses.map(([id]) => img(d, id)).join('')}</div></div>`).join('') : '<div class="empty small">Aucune photo pour l\'instant.</div>'}`;
}
