// Écrans de l'application, sous forme de fonctions pures : état → HTML.
// Aucune donnée n'est insérée sans échappement.
import { resolveSession } from './program.js';
import { cycleInfo, formatDateFr, dayFr, sessionDate, addDays } from './dates.js';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

const exName = (lib, id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
const rirText = (x) => (x.rir ? `RIR ${fmtRange(x.rir)}` : 'explosif');

function weekLine(program, week) {
  const rule = program.weekRules.find((r) => r.week === week);
  const start = addDays(program.startDate, (week - 1) * 7);
  const end = addDays(start, 6);
  return { rule, start, end };
}

function nextSession(program, today) {
  for (let i = 0; i < 14; i += 1) {
    const d = addDays(today, i);
    const info = cycleInfo(program, d);
    if (info.status !== 'during') continue;
    const entry = program.schedule.find((s) => s.day === info.dayKey && s.session);
    if (entry) return { date: d, session: entry.session, week: info.week, isToday: i === 0 };
  }
  return null;
}

function sessionCompact(state, sessionId, week) {
  const { program, lib } = state;
  const s = program.sessions.find((x) => x.id === sessionId);
  const res = resolveSession(program, sessionId, week);
  const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
  return `
    <div class="card">
      <div class="card-kicker">Séance ${esc(sessionId)} · S${week}</div>
      <h2 class="card-title">${esc(s.name.replace(/^Séance [ABC] — /, ''))}</h2>
      <p class="muted">${esc(s.objective)}</p>
      <div class="stats">
        <div><span class="stat">${sets}</span><span class="stat-label">séries</span></div>
        <div><span class="stat">~${estimateMinutes(res)}</span><span class="stat-label">minutes</span></div>
        <div><span class="stat">${res.length}</span><span class="stat-label">exercices</span></div>
      </div>
      <ol class="compact">
        ${res.map((x) => `<li><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(exName(lib, x.exercise))}</span><span class="sr">${esc(fmtSetsReps(x))}</span></li>`).join('')}
      </ol>
      <button class="btn" data-action="open-program" data-session="${esc(sessionId)}" data-week="${week}">Voir le détail</button>
    </div>`;
}

export function renderToday(state) {
  const { program, today } = state;
  const info = cycleInfo(program, today);
  const head = `<header class="page-head"><p class="kicker">${esc(formatDateFr(today, { year: true }))}</p><h1>${esc(program.name)}</h1></header>`;

  if (info.status === 'before') {
    const first = nextSession(program, program.startDate);
    return `${head}
      <div class="notice"><strong>Le cycle commence ${esc(formatDateFr(program.startDate))}</strong> (dans ${info.daysUntilStart} jour${info.daysUntilStart > 1 ? 's' : ''}).
      La date se change dans Données si besoin.</div>
      <h3 class="section">Première séance — ${esc(formatDateFr(first.date))}</h3>
      ${sessionCompact(state, first.session, 1)}`;
  }

  if (info.status === 'after') {
    return `${head}
      <div class="notice"><strong>Cycle terminé ${esc(formatDateFr(info.endDate))}.</strong> Prochaine étape : le bilan du cycle.</div>
      <button class="btn secondary" data-action="open-program" data-session="A" data-week="${program.weeks}">Revoir le programme</button>`;
  }

  const { rule, start, end } = weekLine(program, info.week);
  const weekBlock = `
    <div class="week">
      <div><span class="week-num">S${info.week}</span><span class="muted"> sur ${program.weeks} · ${esc(formatDateFr(start, { weekday: false }))} – ${esc(formatDateFr(end, { weekday: false }))}</span></div>
      <div class="week-rule">${esc(rule.label)}</div>
      <div class="pills"><span class="pill">Polyarticulaires RIR ${esc(fmtRange(rule.rir.compound))}</span><span class="pill">Isolation RIR ${esc(fmtRange(rule.rir.isolation))}</span></div>
    </div>`;

  const todayEntry = program.schedule.find((s) => s.day === info.dayKey);
  if (todayEntry && todayEntry.session) {
    return `${head}${weekBlock}
      <h3 class="section">Aujourd'hui</h3>
      ${sessionCompact(state, todayEntry.session, info.week)}`;
  }
  const endurance = program.enduranceReminders && program.enduranceReminders[info.dayKey];
  const reminder = endurance ? endurance[String(info.week)] : todayEntry && todayEntry.reminder;
  const next = nextSession(program, addDays(today, 1));
  return `${head}${weekBlock}
    <h3 class="section">Aujourd'hui</h3>
    <div class="card"><div class="card-kicker">${esc(dayFr(info.dayKey))}</div><h2 class="card-title">${esc(reminder || 'Repos')}</h2></div>
    ${next ? `<h3 class="section">Prochaine séance — ${esc(formatDateFr(next.date))}</h3>${sessionCompact(state, next.session, next.week)}` : ''}`;
}

export function renderProgram(state) {
  const { program, lib, view } = state;
  const sid = view.session;
  const week = view.week;
  const s = program.sessions.find((x) => x.id === sid);
  const res = resolveSession(program, sid, week);
  const { rule, start, end } = weekLine(program, week);
  const date = sessionDate(program, week, s.day);
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
        <div class="slot-head"><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(exName(lib, x.exercise))}</span></div>
        <div class="slot-line">${esc(fmtSetsReps(x))} · ${esc(rirText(x))}${g ? '' : ` · repos ${esc(fmtRest(x.restSec))}`}</div>
        ${notes.map((n) => `<div class="slot-note">${esc(n)}</div>`).join('')}
        <details><summary>Consigne et alternatives</summary>
          <p>${esc(cue)}</p>
          <p class="muted">Si occupé : ${esc(sl.alternatives.map((id) => exName(lib, id)).join(' · '))}</p>
        </details>
      </li>`;
  }).join('');

  const chips = (list, current, action, label) => list.map((v) => `<button class="chip${v === current ? ' on' : ''}" data-action="${action}" data-value="${esc(v)}" aria-pressed="${v === current}">${esc(label(v))}</button>`).join('');
  const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
  const gate = program.progressionGate;

  return `
    <header class="page-head with-back"><button class="back" data-action="go" data-tab="today" aria-label="Retour">‹ Aujourd'hui</button><h1>Programme</h1></header>
    <div class="chips" role="group" aria-label="Séance">${chips(program.sessionOrder, sid, 'pick-session', (v) => `Séance ${v}`)}</div>
    <div class="chips" role="group" aria-label="Semaine">${chips(program.weekRules.map((r) => r.week), week, 'pick-week', (v) => `S${v}`)}</div>
    <div class="week">
      <div><strong>${esc(s.name)}</strong></div>
      <div class="muted">${esc(formatDateFr(date))} · S${week} (${esc(formatDateFr(start, { weekday: false }))} – ${esc(formatDateFr(end, { weekday: false }))})</div>
      <div class="week-rule">${esc(rule.label)}${rule.setDelta ? ` · une série de moins par exercice (minimum ${rule.minSets})` : ''}</div>
      <div class="pills"><span class="pill">${sets} séries</span><span class="pill">~${estimateMinutes(res)} min + échauffement</span></div>
    </div>
    <ol class="slots">${items}</ol>
    <details class="rules"><summary>Passage à la semaine suivante</summary>
      <p>${esc(gate.principle)}</p>
      <p>Garder les réglages de la semaine en cours une semaine de plus si un de ces signaux est présent :</p>
      <ul>${gate.maintainIfAnySignal.map((x) => `<li>${esc(x.label)}</li>`).join('')}</ul>
      <p>Deux signaux ou plus : semaine de décharge (moitié des séries, mêmes charges, RIR ${esc(fmtRange(program.deload.rir))}).</p>
    </details>
    <details class="rules"><summary>Ajustements du jour</summary>
      <ul>${program.dayAdjustments.map((x) => `<li><strong>${esc(x.when)}</strong> : ${esc(x.reminder)}</li>`).join('')}</ul>
    </details>`;
}

export function renderHistory() {
  return `<header class="page-head"><h1>Historique</h1></header>
    <div class="empty">Aucune séance enregistrée pour l'instant.<br>L'enregistrement des séances arrive à la prochaine étape du développement.</div>`;
}

export function renderProgress() {
  return `<header class="page-head"><h1>Progrès</h1></header>
    <div class="empty">Les courbes de progression apparaîtront ici après vos premières séances enregistrées.</div>`;
}

const yesNo = (v, yes, no, unknown = 'inconnu') => (v === true ? yes : v === false ? no : unknown);

export function renderData(state) {
  const { program, fileProgram, appVersion, sw, storage, standalone, startOverride, startMsg, today } = state;
  const changed = program.startDate !== fileProgram.startDate;
  const history = startOverride && startOverride.programId === program.id ? startOverride.history : [];
  const off = sw.offline;
  return `
    <header class="page-head"><h1>Données</h1></header>

    <h3 class="section">Application</h3>
    <dl class="rows">
      <div><dt>Version</dt><dd data-test="app-version">${esc(appVersion)}</dd></div>
      <div><dt>Hors ligne</dt><dd data-test="offline">${off ? (off.ready ? `Prêt (${off.cached}/${off.total} fichiers)` : `En préparation (${off.cached}/${off.total})`) : esc(sw.supported === false ? 'Non pris en charge par ce navigateur' : 'Vérification…')}</dd></div>
      <div><dt>Mises à jour</dt><dd>${esc(sw.updateReady ? 'Nouvelle version prête' : sw.checking ? 'Vérification…' : sw.lastCheck ? `À jour (vérifié à ${sw.lastCheck})` : 'Non vérifié')}</dd></div>
    </dl>
    ${sw.supported === false ? '' : '<button class="btn secondary" data-action="check-update">Vérifier les mises à jour</button>'}

    <h3 class="section">Programme</h3>
    <dl class="rows">
      <div><dt>Programme actif</dt><dd>${esc(program.name)}</dd></div>
      <div><dt>Identifiant · version</dt><dd>${esc(program.id)} · v${esc(program.version)}</dd></div>
      <div><dt>Période</dt><dd>${esc(formatDateFr(program.startDate, { weekday: false }))} → ${esc(formatDateFr(addDays(program.startDate, program.weeks * 7 - 1), { weekday: false, year: true }))}</dd></div>
    </dl>

    <h3 class="section">Date de début du cycle</h3>
    <p class="muted">Changer la date décale tout le cycle (semaines, séances prévues, bilan). Le fichier programme n'est pas modifié.</p>
    <dl class="rows">
      <div><dt>Date actuelle</dt><dd data-test="start-date">${esc(formatDateFr(program.startDate, { year: true }))}${changed ? ' (modifiée)' : ''}</dd></div>
      ${changed ? `<div><dt>Date prévue dans le programme</dt><dd>${esc(formatDateFr(fileProgram.startDate, { year: true }))}</dd></div>` : ''}
    </dl>
    <form class="inline-form" data-form="start-date">
      <label for="start-input">Nouvelle date (un lundi)</label>
      <input id="start-input" name="start" type="date" required value="${esc(program.startDate)}">
      <button class="btn" type="submit">Enregistrer la date</button>
    </form>
    ${changed ? `<button class="btn secondary" data-action="reset-start">Revenir au ${esc(formatDateFr(fileProgram.startDate))}</button>` : ''}
    ${startMsg ? `<div class="${startMsg.ok ? 'msg-ok' : 'msg-err'}" role="status">${esc(startMsg.text)}${startMsg.suggestion ? ` <button class="link" data-action="use-suggestion" data-value="${esc(startMsg.suggestion)}">Utiliser le ${esc(formatDateFr(startMsg.suggestion))}</button>` : ''}</div>` : ''}
    ${history.length ? `<details class="rules"><summary>Historique des changements (${history.length})</summary><ul>${history.map((h) => `<li>${esc(formatDateFr(h.from, { weekday: false }))} → ${esc(formatDateFr(h.to, { weekday: false }))}, le ${esc(h.changedAt.slice(0, 10))}</li>`).join('')}</ul></details>` : ''}

    <h3 class="section">Stockage sur cet appareil</h3>
    <dl class="rows">
      <div><dt>Ouverte depuis l'écran d'accueil</dt><dd data-test="standalone">${yesNo(standalone, 'Oui', 'Non')}</dd></div>
      <div><dt>Stockage local (IndexedDB)</dt><dd data-test="idb">${storage ? (storage.indexedDb ? 'Fonctionne' : `Erreur${storage.error ? ` : ${esc(storage.error)}` : ''}`) : 'Vérification…'}</dd></div>
      <div><dt>Stockage persistant</dt><dd data-test="persisted">${storage ? yesNo(storage.persisted, 'Accordé', 'Non accordé', 'Non pris en charge') : 'Vérification…'}</dd></div>
      <div><dt>Espace utilisé</dt><dd>${storage && storage.usageKb !== null ? `${storage.usageKb} Ko` : '—'}</dd></div>
    </dl>
    <p class="muted">${storage && storage.persisted === false ? 'Le navigateur n\'a pas accordé le stockage persistant. Ouvrez l\'application depuis l\'icône de l\'écran d\'accueil, puis revenez ici.' : 'Le stockage local n\'est pas une sauvegarde : il disparaît si l\'icône est supprimée ou les données de Safari effacées.'}</p>

    <h3 class="section">Sauvegarde</h3>
    <p class="muted">La sauvegarde et la restauration arriveront avec l'enregistrement des séances, à la prochaine étape. Pour l'instant, seule la date de début est enregistrée sur l'appareil.</p>
    <p class="fineprint">Aujourd'hui : ${esc(today)}</p>`;
}

export function renderNav(tab) {
  const t = (id, label, icon) => `<button class="tab${tab === id ? ' on' : ''}" data-action="go" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}"><span class="ico" aria-hidden="true">${icon}</span><span>${label}</span></button>`;
  return `${t('today', 'Aujourd\'hui', '◉')}${t('history', 'Historique', '≡')}${t('progress', 'Progrès', '↗')}${t('data', 'Données', '⚙')}`;
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
