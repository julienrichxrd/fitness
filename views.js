// Écrans principaux, sous forme de fonctions pures : état → HTML.
// Aucune donnée n'est insérée sans échappement.
import { resolveSession } from './program.js';
import { cycleInfo, formatDateFr, dayFr, sessionDate, addDays, toDayNumber } from './dates.js';
import { nextSessionToDo, progress, workoutPlan } from './workout.js';

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

export const exName = (lib, id) => (lib.exercises.find((e) => e.id === id) || { name: id }).name;
export const rirText = (x) => (x.rir ? `RIR ${fmtRange(x.rir)}` : 'explosif');
export const shortName = (s) => s.name.replace(/^Séance [ABC] — /, '');

function weekLine(program, week) {
  const rule = program.weekRules.find((r) => r.week === week);
  const start = addDays(program.startDate, (week - 1) * 7);
  const end = addDays(start, 6);
  return { rule, start, end };
}

const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LETTER = { monday: 'L', tuesday: 'M', wednesday: 'M', thursday: 'J', friday: 'V', saturday: 'S', sunday: 'D' };

/** Bande des 7 jours de la semaine : séance prévue, faite, jour courant. */
function weekStrip(state, week) {
  const { program, today } = state;
  const workouts = state.workouts || [];
  const start = addDays(program.startDate, (week - 1) * 7);
  const cells = DAY_ORDER.map((day, i) => {
    const date = addDays(start, i);
    const entry = program.schedule.find((s) => s.day === day) || {};
    const done = workouts.filter((w) => w.status === 'done' && w.date === date);
    const tag = entry.session || (day === 'saturday' ? 'Run' : day === 'sunday' ? 'Nage' : 'Mob');
    const cls = ['day', entry.session ? 'gym' : 'off', date === today ? 'today' : '', done.length ? 'done' : '', toDayNumber(date) < toDayNumber(today) ? 'past' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}"><span class="d-l">${DAY_LETTER[day]}</span><span class="d-n">${Number(date.slice(8))}</span><span class="d-t">${done.length ? '✓' : esc(tag)}</span></div>`;
  });
  return `<div class="strip" aria-label="Semaine ${week}">${cells.join('')}</div>`;
}

function sessionStats(res) {
  const sets = res.filter((x) => x.category !== 'explosive').reduce((n, x) => n + x.sets, 0);
  return `
      <div class="stats">
        <div><span class="stat">${sets}</span><span class="stat-label">séries</span></div>
        <div><span class="stat">~${estimateMinutes(res)}</span><span class="stat-label">minutes</span></div>
        <div><span class="stat">${res.length}</span><span class="stat-label">exercices</span></div>
      </div>`;
}

/** Carte principale : la séance à faire, avec le bouton Commencer. */
function sessionHero(state, sessionId, week, { kicker, start = true }) {
  const { program, lib } = state;
  const s = program.sessions.find((x) => x.id === sessionId);
  const res = resolveSession(program, sessionId, week);
  return `
    <section class="hero">
      <div class="hero-kicker">${esc(kicker)}</div>
      <div class="hero-row"><span class="hero-letter">${esc(sessionId)}</span><div><div class="card-kicker">Séance ${esc(sessionId)} · S${week}</div><h2 class="hero-title">${esc(shortName(s))}</h2></div></div>
      <p class="muted">${esc(s.objective)}</p>
      ${sessionStats(res)}
      <ol class="compact">
        ${res.map((x) => `<li><span class="lbl">${esc(x.label)}</span><span class="nm">${esc(exName(lib, x.exercise))}</span><span class="sr">${esc(fmtSetsReps(x))}</span></li>`).join('')}
      </ol>
      ${start ? `<button class="btn big" data-action="start-session" data-session="${esc(sessionId)}">Commencer la séance ${esc(sessionId)}</button>` : ''}
      <button class="btn secondary" data-action="open-program" data-session="${esc(sessionId)}" data-week="${week}">Voir le détail</button>
    </section>`;
}

function resumeCard(state) {
  const { active, program } = state;
  if (!active) return '';
  const plan = workoutPlan(program, active.workout);
  const p = progress(plan, active.sets);
  const s = program.sessions.find((x) => x.id === active.workout.sessionId);
  const pct = Math.round((p.done / p.planned) * 100);
  return `
    <section class="hero resume">
      <div class="hero-kicker">Séance en cours</div>
      <h2 class="hero-title">Séance ${esc(s.id)} — ${esc(shortName(s))}</h2>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <p class="muted">${p.done} séries sur ${p.planned} · commencée ${esc(formatDateFr(active.workout.date))}</p>
      <button class="btn big" data-action="resume">Reprendre la séance</button>
    </section>`;
}

function otherSessions(program, week) {
  return `<div class="other"><span class="muted">Faire une autre séance :</span>${program.sessionOrder.map((id) => `<button class="chip" data-action="start-session" data-session="${esc(id)}">${esc(id)}</button>`).join('')}</div>`;
}

export function needsBackup(state) {
  const done = (state.workouts || []).filter((w) => w.status === 'done');
  if (!done.length) return false;
  const last = state.lastBackup;
  if (!last) return true;
  return Date.now() - Date.parse(last.at) > 7 * 86400000 || done.some((w) => (w.endedAt || '') > last.at);
}

function backupNudge(state) {
  if (!needsBackup(state)) return '';
  const last = state.lastBackup;
  return `<div class="notice small"><strong>${last ? 'Des séances ne sont pas encore sauvegardées.' : 'Aucune sauvegarde pour l\'instant.'}</strong> Une sauvegarde protège vos séances si l'iPhone est effacé ou perdu.
    <button class="btn secondary" data-action="backup">Sauvegarder maintenant</button></div>`;
}

export function renderToday(state) {
  const { program, today } = state;
  const workouts = state.workouts || [];
  const info = cycleInfo(program, today);
  const week = info.status === 'during' ? info.week : info.status === 'before' ? 1 : program.weeks;
  const head = `<header class="page-head"><p class="kicker">${esc(program.name)}${info.status === 'during' ? ` · semaine ${info.week} sur ${program.weeks}` : ''}</p><h1>${esc(formatDateFr(today))}</h1></header>`;
  const toast = state.toast ? `<div class="msg-ok" role="status">${esc(state.toast)}</div>` : '';

  if (info.status === 'after') {
    return `${head}${toast}${resumeCard(state)}
      <div class="notice"><strong>Cycle terminé ${esc(formatDateFr(info.endDate))}.</strong> Prochaine étape : le bilan du cycle.</div>
      ${backupNudge(state)}
      <button class="btn secondary" data-action="open-program" data-session="A" data-week="${program.weeks}">Revoir le programme</button>`;
  }

  const { rule } = weekLine(program, week);
  const weekBlock = `
    <div class="week">
      ${weekStrip(state, week)}
      <div class="week-rule"><span class="week-num">S${week}</span> ${esc(rule.label)}</div>
      <div class="pills"><span class="pill">Polyarticulaires RIR ${esc(fmtRange(rule.rir.compound))}</span><span class="pill">Isolation RIR ${esc(fmtRange(rule.rir.isolation))}</span></div>
    </div>`;

  let main = '';
  if (state.active) {
    main = resumeCard(state);
  } else if (info.status === 'before') {
    main = `<div class="notice"><strong>Le cycle commence ${esc(formatDateFr(program.startDate))}</strong> (dans ${info.daysUntilStart} jour${info.daysUntilStart > 1 ? 's' : ''}).
      Vous pouvez faire une séance d'essai : elle restera dans l'historique sans compter dans la semaine 1, et vous pourrez la supprimer.</div>
      ${sessionHero(state, program.sessionOrder[0], 1, { kicker: `Première séance — ${formatDateFr(program.startDate)}` })}`;
  } else {
    const todayEntry = program.schedule.find((s) => s.day === info.dayKey);
    const endurance = program.enduranceReminders && program.enduranceReminders[info.dayKey];
    const reminder = endurance ? endurance[String(info.week)] : todayEntry && todayEntry.reminder;
    const reminderCard = todayEntry && !todayEntry.session ? `<div class="card day-card"><div class="card-kicker">${esc(dayFr(info.dayKey))}</div><h2 class="card-title">${esc(reminder || 'Repos')}</h2></div>` : '';
    const next = nextSessionToDo(program, workouts, today);
    if (next) {
      const s = program.sessions.find((x) => x.id === next.sessionId);
      const planned = sessionDate(program, info.week, s.day);
      const kicker = next.scheduledToday ? 'Aujourd\'hui'
        : toDayNumber(planned) < toDayNumber(today) ? `À rattraper — prévue ${formatDateFr(planned)}`
          : `Prochaine séance — ${formatDateFr(planned)}`;
      main = `${reminderCard}${sessionHero(state, next.sessionId, info.week, { kicker })}`;
    } else {
      main = `${reminderCard}<div class="notice ok"><strong>Les ${program.sessionOrder.length} séances de la semaine sont faites.</strong> Récupération, mobilité et endurance jusqu'à lundi.</div>`;
    }
  }
  return `${head}${toast}${main}${weekBlock}${state.active ? '' : otherSessions(program, week)}${backupNudge(state)}`;
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

const yesNo = (v, yes, no, unknown = 'inconnu') => (v === true ? yes : v === false ? no : unknown);
const stamp = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

function backupSection(state) {
  const workouts = state.workouts || [];
  const done = workouts.filter((w) => w.status === 'done').length;
  const nSets = (state.sets || []).length;
  const origin = state.dataOrigin;
  const r = state.restore;
  let restoreBlock = '';
  if (r && r.errors) {
    restoreBlock = `<div class="msg-err" role="alert"><strong>Fichier refusé, rien n'a été modifié.</strong><br>${r.errors.map(esc).join('<br>')}</div>`;
  } else if (r && r.preview) {
    const p = r.preview;
    restoreBlock = `
      <div class="confirm" data-test="restore-preview">
        <h3>Restaurer cette sauvegarde ?</h3>
        <dl class="rows">
          <div><dt>Sauvegarde du</dt><dd>${p.createdAt ? esc(stamp(p.createdAt)) : '—'}</dd></div>
          <div><dt>Séances</dt><dd>${p.workouts}</dd></div>
          <div><dt>Séries</dt><dd>${p.sets}</dd></div>
          <div><dt>Période</dt><dd>${p.from ? `${esc(formatDateFr(p.from, { weekday: false }))} → ${esc(formatDateFr(p.to, { weekday: false }))}` : 'aucune séance'}</dd></div>
        </dl>
        ${r.lost ? `<div class="msg-err"><strong>Attention : ${r.lost} séance${r.lost > 1 ? 's' : ''} enregistrée${r.lost > 1 ? 's' : ''} sur cet appareil ${r.lost > 1 ? 'ne sont' : 'n\'est'} pas dans ce fichier et ser${r.lost > 1 ? 'ont' : 'a'} perdue${r.lost > 1 ? 's' : ''}.</strong></div>` : ''}
        <p class="muted">Toutes les données de l'application seront remplacées par celles du fichier. Une copie de sécurité de l'état actuel est gardée : « Annuler la dernière restauration » la remettra en place.</p>
        <button class="btn danger" data-action="restore-confirm">Remplacer mes données</button>
        <button class="btn secondary" data-action="restore-cancel">Annuler</button>
      </div>`;
  }
  return `
    <h3 class="section">Sauvegarde</h3>
    <dl class="rows">
      <div><dt>Séances enregistrées</dt><dd data-test="count-workouts">${done}</dd></div>
      <div><dt>Séries enregistrées</dt><dd>${nSets}</dd></div>
      <div><dt>Dernière sauvegarde</dt><dd data-test="last-backup">${state.lastBackup ? esc(stamp(state.lastBackup.at)) : 'Jamais'}</dd></div>
      <div><dt>Origine des données</dt><dd>${origin && origin.type === 'restored' ? `Copie restaurée le ${esc(stamp(origin.at))}` : 'Saisies sur cet appareil'}</dd></div>
    </dl>
    <button class="btn" data-action="backup">Sauvegarder</button>
    <p class="muted small">Crée un fichier avec toutes vos séances. Sur l'iPhone, choisissez « Enregistrer dans Fichiers », puis copiez-le sur le PC (LocalSend). Vous pouvez aussi m'envoyer ce fichier pour une analyse de votre progression.</p>
    <label class="btn secondary file-btn">Restaurer depuis un fichier<input type="file" id="restore-input" data-action="restore-file" hidden></label>
    ${state.hasSafetyCopy ? '<button class="btn secondary" data-action="undo-restore">Annuler la dernière restauration</button>' : ''}
    ${state.backupMsg ? `<div class="${state.backupMsg.ok ? 'msg-ok' : 'msg-err'}" role="status">${esc(state.backupMsg.text)}</div>` : ''}
    ${restoreBlock}`;
}

export function renderData(state) {
  const { program, fileProgram, appVersion, sw, storage, standalone, startOverride, startMsg, today } = state;
  const changed = program.startDate !== fileProgram.startDate;
  const history = startOverride && startOverride.programId === program.id ? startOverride.history : [];
  const off = sw.offline;
  return `
    <header class="page-head"><h1>Données</h1></header>
    ${backupSection(state)}

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
    ${changed ? `<button class="btn" data-action="reset-start">Revenir au ${esc(formatDateFr(fileProgram.startDate))}</button>` : ''}
    <form class="inline-form" data-form="start-date">
      <label for="start-input">Nouvelle date (un lundi)</label>
      <input id="start-input" name="start" type="date" required value="${esc(program.startDate)}">
      <button class="btn secondary" type="submit">Enregistrer la date</button>
    </form>
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
    <p class="fineprint">Aujourd'hui : ${esc(today)}</p>`;
}

export function renderNav(tab) {
  const ico = {
    today: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" class="fill"/></svg>',
    history: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    progress: '<svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/></svg>',
    data: '<svg viewBox="0 0 24 24"><path d="M12 3v11m0 0l-4-4m4 4l4-4"/><path d="M5 15v4h14v-4"/></svg>',
  };
  const t = (id, label) => `<button class="tab${tab === id ? ' on' : ''}" data-action="go" data-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}"><span class="ico" aria-hidden="true">${ico[id]}</span><span>${label}</span></button>`;
  return `${t('today', 'Aujourd\'hui')}${t('history', 'Historique')}${t('progress', 'Progrès')}${t('data', 'Données')}`;
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
