// Plus : sauvegarde, bilan pour Claude, programme, réglages, guide ; bilan de semaine ; accueil de première ouverture.
import { esc, exName } from './views.js';
import { formatDateFr, addDays } from './dates.js';
import { icon, nf, nf0, infoBtn } from './ui.js';
import { GUIDE } from './guide.js';
import { weekSignals, recommend, DECISION_TEXT, maintainedStreak } from './cycle.js';

const stamp = (iso) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const yesNo = (v, yes, no, unknown = 'inconnu') => (v === true ? yes : v === false ? no : unknown);
const row = (action, ic, cls, title, sub, extra = '') => `<button class="row" data-action="${action}" ${extra}><span class="row-ic ${cls}">${icon(ic)}</span><span class="row-main"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span><span class="row-end">${icon('chevron')}</span></button>`;

export function renderMore(state) {
  const p = state.program;
  return `<header class="page-head"><h1 class="display">Plus</h1></header>
    <div class="group">
      ${row('go', 'download', 'neutral', 'Sauvegarde et données', state.lastBackup ? `Dernière sauvegarde le ${esc(stamp(state.lastBackup.at))}` : 'Aucune sauvegarde pour l\'instant', 'data-tab="data"')}
      ${row('go', 'flag', 'lift', 'Bilan pour Claude', 'Le fichier à m\'envoyer pour analyser le cycle', 'data-tab="review-export"')}
    </div>
    <div class="group">
      ${row('go', 'lift', 'lift', 'Programme', `${esc(p.name)}, version ${p.version}`, 'data-tab="programs"')}
      ${row('go', 'gear', 'neutral', 'Réglages', 'Pesées, crans de charge, son, profil', 'data-tab="settings"')}
      ${row('go', 'book', 'neutral', 'Guide', 'Chaque notion expliquée simplement', 'data-tab="guide"')}
    </div>
    <p class="fineprint">Version ${esc(state.appVersion)}. Vos données restent sur cet appareil.</p>`;
}

export function renderData(state) {
  const { appVersion, sw, storage, standalone } = state;
  const done = (state.workouts || []).filter((w) => w.status === 'done').length;
  const origin = state.dataOrigin;
  const r = state.restore;
  const off = sw.offline;
  let restoreBlock = '';
  if (r && r.errors) {
    restoreBlock = `<div class="msg-err" role="alert"><b>Fichier refusé, rien n'a été modifié.</b><br>${r.errors.map(esc).join('<br>')}</div>`;
  } else if (r && r.preview) {
    const pv = r.preview;
    restoreBlock = `
      <div class="confirm" data-test="restore-preview">
        <h3>Restaurer cette sauvegarde ?</h3>
        <dl class="kv">
          <div><dt>Sauvegarde du</dt><dd>${pv.createdAt ? esc(stamp(pv.createdAt)) : '—'}</dd></div>
          <div><dt>Séances</dt><dd>${pv.workouts}, ${pv.sets} séries</dd></div>
          <div><dt>Journal</dt><dd>${pv.entries} éléments${pv.photos ? `, ${pv.photos} photos` : ''}</dd></div>
          <div><dt>Période</dt><dd>${pv.from ? `${esc(formatDateFr(pv.from, { weekday: false }))} → ${esc(formatDateFr(pv.to, { weekday: false }))}` : 'aucune séance'}</dd></div>
        </dl>
        ${r.lost ? `<div class="msg-err"><b>Attention : ${r.lost} séance${r.lost > 1 ? 's' : ''} de cet appareil ${r.lost > 1 ? 'ne sont' : 'n\'est'} pas dans ce fichier et ser${r.lost > 1 ? 'ont' : 'a'} perdue${r.lost > 1 ? 's' : ''}.</b></div>` : ''}
        <p class="muted small">Toutes les données seront remplacées par celles du fichier. Une copie de sécurité de l'état actuel est gardée : « Annuler la dernière restauration » la remet en place.</p>
        <button class="btn danger" data-action="restore-confirm">Remplacer mes données</button>
        <button class="btn quiet" data-action="restore-cancel">Annuler</button>
      </div>`;
  }
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Plus</button><h1 class="display">Données</h1></header>
    <section class="card">
      <div class="chart-head"><b>Sauvegarde</b>${infoBtn('backup')}</div>
      <dl class="kv">
        <div><dt>Séances</dt><dd data-test="count-workouts">${done}</dd></div>
        <div><dt>Séries</dt><dd>${(state.sets || []).length}</dd></div>
        <div><dt>Journal</dt><dd>${(state.entries || []).length} éléments</dd></div>
        <div><dt>Dernière sauvegarde</dt><dd data-test="last-backup">${state.lastBackup ? esc(stamp(state.lastBackup.at)) : 'Jamais'}</dd></div>
        <div><dt>Origine</dt><dd>${origin && origin.type === 'restored' ? `Copie restaurée le ${esc(stamp(origin.at))}` : 'Saisies sur cet appareil'}</dd></div>
      </dl>
      <button class="btn big" data-action="backup">${icon('download')} Sauvegarder</button>
      <label class="check"><input type="checkbox" id="backup-photos"${state.backupPhotos ? ' checked' : ''} data-action="toggle-backup-photos"> Inclure les photos (fichier plus lourd)</label>
      <p class="muted small">Sur l'iPhone, choisissez « Enregistrer dans Fichiers », puis copiez le fichier sur le PC avec LocalSend. Chaque dimanche, et après chaque bilan.</p>
      <label class="btn quiet file-btn">${icon('upload')} Restaurer depuis un fichier<input type="file" id="restore-input" hidden></label>
      ${state.hasSafetyCopy ? '<button class="btn quiet" data-action="undo-restore">Annuler la dernière restauration</button>' : ''}
      ${state.backupMsg ? `<div class="${state.backupMsg.ok ? 'msg-ok' : 'msg-err'}" role="status">${esc(state.backupMsg.text)}</div>` : ''}
      ${restoreBlock}
    </section>
    <section class="card">
      <div class="chart-head"><b>Exports pour tableur</b></div>
      <p class="muted small">Fichiers CSV qui s'ouvrent dans Excel.</p>
      <div class="btn-grid">
        <button class="btn quiet" data-action="csv" data-value="sets">Séries</button>
        <button class="btn quiet" data-action="csv" data-value="body">Corps</button>
        <button class="btn quiet" data-action="csv" data-value="endurance">Endurance</button>
        <button class="btn quiet" data-action="csv" data-value="food">Nutrition</button>
      </div>
    </section>
    <section class="card">
      <div class="chart-head"><b>Application</b>${infoBtn('privacy')}</div>
      <dl class="kv">
        <div><dt>Version</dt><dd data-test="app-version">${esc(appVersion)}</dd></div>
        <div><dt>Hors ligne</dt><dd data-test="offline">${off ? (off.ready ? `Prêt (${off.cached}/${off.total} fichiers)` : `En préparation (${off.cached}/${off.total})`) : esc(sw.supported === false ? 'Non pris en charge' : 'Vérification…')}</dd></div>
        <div><dt>Mises à jour</dt><dd>${esc(sw.updateReady ? 'Nouvelle version prête' : sw.checking ? 'Vérification…' : sw.lastCheck ? `À jour (vérifié à ${sw.lastCheck})` : 'Non vérifié')}</dd></div>
        <div><dt>Ouverte depuis l'écran d'accueil</dt><dd data-test="standalone">${yesNo(standalone, 'Oui', 'Non')}</dd></div>
        <div><dt>Stockage local</dt><dd data-test="idb">${storage ? (storage.indexedDb ? 'Fonctionne' : `Erreur${storage.error ? ` : ${esc(storage.error)}` : ''}`) : 'Vérification…'}</dd></div>
        <div><dt>Stockage persistant</dt><dd data-test="persisted">${storage ? yesNo(storage.persisted, 'Accordé', 'Non accordé', 'Non pris en charge') : 'Vérification…'}</dd></div>
        <div><dt>Espace utilisé</dt><dd>${storage && storage.usageKb !== null ? `${nf0(storage.usageKb)} Ko` : '—'}</dd></div>
      </dl>
      ${sw.supported === false ? '' : '<button class="btn quiet" data-action="check-update">Vérifier les mises à jour</button>'}
    </section>`;
}

export function renderReviewExport(state) {
  const p = state.program;
  const from = state.exportFrom || p.startDate;
  const to = state.exportTo || (state.today < addDays(p.startDate, 6) ? addDays(p.startDate, 6) : state.today);
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Plus</button><h1 class="display">Bilan pour Claude</h1></header>
    <p class="lead">Un fichier qui résume la période : séances et charges, poids, mensurations, récupération, course, natation, nutrition. Sans nom ni coordonnées.</p>
    <form data-form="review-export" class="form card">
      <div class="field-row">
        <label class="field"><span class="field-label">Du</span><input type="date" name="from" value="${esc(from)}"></label>
        <label class="field"><span class="field-label">Au</span><input type="date" name="to" value="${esc(to)}"></label>
      </div>
      <button class="btn big" type="submit">${icon('download')} Créer le fichier de bilan</button>
    </form>
    ${state.exportMsg ? `<div class="${state.exportMsg.ok ? 'msg-ok' : 'msg-err'}">${esc(state.exportMsg.text)}</div>` : ''}
    <section class="card">
      <div class="chart-head"><b>Ensuite</b>${infoBtn('review-export')}</div>
      <ol class="steps">
        <li>Ouvrez une conversation avec Claude et joignez le fichier.</li>
        <li>Collez le message ci-dessous.</li>
        <li>Le cycle suivant revient en texte ou en fichier programme : importez-le dans Plus → Programme.</li>
      </ol>
      <button class="btn quiet" data-action="copy-review-message">Copier le message d'accompagnement</button>
    </section>`;
}

export function renderPrograms(state) {
  const p = state.program;
  const store = state.programStore;
  const imp = state.programImport;
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Plus</button><h1 class="display">Programme</h1></header>
    <section class="card">
      <h2 class="card-title">${esc(p.name)}</h2>
      <dl class="kv">
        <div><dt>Version</dt><dd>${esc(p.id)}, v${esc(p.version)}${store && store.activeIndex !== null && store.activeIndex !== undefined ? ' (importée)' : ' (fournie avec l\'application)'}</dd></div>
        <div><dt>Début</dt><dd data-test="start-date">${esc(formatDateFr(p.startDate, { year: true }))}${p.startDate !== state.fileProgram.startDate ? ' (modifiée)' : ''}</dd></div>
        <div><dt>Durée</dt><dd>${p.weeks} semaines${p.calendar && p.calendar.length !== p.weeks ? `, ${p.calendar.length} semaines réelles après les bilans` : ''}</dd></div>
      </dl>
      <button class="btn quiet" data-action="open-program" data-session="A" data-week="1">Voir les séances</button>
    </section>
    <section class="card">
      <div class="chart-head"><b>Date de début</b></div>
      <p class="muted small">Elle décale tout le cycle. Le fichier programme n'est pas modifié.</p>
      ${p.startDate !== state.fileProgram.startDate ? `<button class="btn" data-action="reset-start">Revenir au ${esc(formatDateFr(state.fileProgram.startDate))}</button>` : ''}
      <form class="form" data-form="start-date">
        <label class="field"><span class="field-label">Nouvelle date (un lundi)</span><input id="start-input" name="start" type="date" required value="${esc(p.startDate)}"></label>
        <button class="btn quiet" type="submit">Enregistrer la date</button>
      </form>
      ${state.startMsg ? `<div class="${state.startMsg.ok ? 'msg-ok' : 'msg-err'}" role="status">${esc(state.startMsg.text)}${state.startMsg.suggestion ? ` <button class="link" data-action="use-suggestion" data-value="${esc(state.startMsg.suggestion)}">Utiliser le ${esc(formatDateFr(state.startMsg.suggestion))}</button>` : ''}</div>` : ''}
    </section>
    <section class="card">
      <div class="chart-head"><b>Nouveau programme</b></div>
      <p class="muted small">Après le bilan, Claude peut vous donner un fichier programme (par exemple le cycle 2). L'application le vérifie et vous montre les différences avant de l'activer.</p>
      <label class="btn quiet file-btn">${icon('upload')} Importer un fichier programme<input type="file" id="program-input" hidden></label>
      ${store && store.previousIndex !== undefined && (store.activeIndex !== null && store.activeIndex !== undefined) ? `<button class="btn quiet" data-action="program-rollback">Revenir à la version précédente</button>` : ''}
      ${imp && imp.errors ? `<div class="msg-err"><b>Fichier refusé, rien n'a été modifié.</b><br>${imp.errors.map(esc).join('<br>')}</div>` : ''}
      ${imp && imp.diff ? `<div class="confirm"><h3>${esc(imp.file.program.name)}, v${esc(imp.file.program.version)}</h3><ul class="diff">${imp.diff.map((l) => `<li class="${l.type}">${esc(l.text)}</li>`).join('')}</ul>
        <button class="btn" data-action="program-activate">Activer ce programme</button><button class="btn quiet" data-action="program-cancel">Annuler</button></div>` : ''}
      ${state.programMsg ? `<div class="msg-ok">${esc(state.programMsg)}</div>` : ''}
    </section>`;
}

export function renderSettings(state) {
  const s = state.settings || {};
  const days = s.weighDays || [0, 2, 4];
  const { program, lib } = state;
  const slots = program.sessions.flatMap((x) => x.slots.map((sl) => ({ ...sl, session: x.id }))).filter((sl) => sl.increment && ['dumbbell', 'barbell', 'machine', 'bodyweight'].includes(sl.increment.type) && (sl.increment.stepKg || sl.increment.loadStepKg));
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Plus</button><h1 class="display">Réglages</h1></header>
    <section class="card">
      <div class="chart-head"><b>Jours de pesée</b></div>
      <div class="weekdays">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((l, i) => `<button class="chip round${days.includes(i) ? ' on' : ''}" data-action="toggle-weigh-day" data-value="${i}" aria-pressed="${days.includes(i)}">${l}</button>`).join('')}</div>
      <p class="muted small">Le programme conseille 3 matins par semaine. Ces jours-là, la pesée apparaît sur l'écran Aujourd'hui.</p>
    </section>
    <section class="card">
      <div class="chart-head"><b>Séance</b></div>
      <label class="check"><input type="checkbox" data-action="toggle-setting" data-value="sound"${s.sound === false ? '' : ' checked'}> Sonnerie à la fin du repos</label>
      <label class="check"><input type="checkbox" data-action="toggle-setting" data-value="wakeLock"${s.wakeLock === false ? '' : ' checked'}> Garder l'écran allumé pendant la séance</label>
    </section>
    <section class="card">
      <div class="chart-head"><b>Crans de charge</b></div>
      <p class="muted small">Le plus petit écart de charge disponible à votre salle. Les suggestions et les boutons − / + l'utilisent.</p>
      <form data-form="increments" class="form">
        ${slots.map((sl) => { const def = sl.increment.stepKg || sl.increment.loadStepKg; const cur = (s.increments || {})[sl.id]; return `<label class="inc-row"><span><b>${esc(sl.session)} ${esc(sl.label)}</b> ${esc(exName(lib, sl.exercise))}</span><input name="${esc(sl.id)}" class="num-input mini" inputmode="decimal" value="${esc(String(cur || def).replace('.', ','))}"><span class="unit">kg</span></label>`; }).join('')}
        <button class="btn quiet" type="submit">Enregistrer les crans</button>
      </form>
      ${state.settingsMsg ? `<div class="msg-ok">${esc(state.settingsMsg)}</div>` : ''}
    </section>
    <section class="card">
      <div class="chart-head"><b>Nutrition</b></div>
      <button class="btn quiet" data-action="sheet" data-value="targets">Profil et objectifs</button>
    </section>
    <button class="btn quiet" data-action="replay-onboarding">Revoir la présentation de l'application</button>`;
}

export function renderGuide() {
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Retour</button><h1 class="display">Guide</h1></header>
    <p class="lead">Les notions de votre programme, expliquées simplement.</p>
    ${GUIDE.map((g) => `<h3 class="section">${esc(g.group)}</h3><div class="group">${g.items.map((i) => `<details class="guide-item"><summary><b>${esc(i.title)}</b>${icon('chevron')}</summary>${i.body.map((p) => `<p>${esc(p)}</p>`).join('')}</details>`).join('')}</div>`).join('')}`;
}

export function renderWeekReview(state) {
  const { program } = state;
  const calWeek = state.reviewWeek;
  const { signals, stats } = weekSignals(program, { workouts: state.workouts || [], sets: state.sets || [], entries: state.entries || [] }, calWeek);
  const chosen = state.reviewSignals || Object.fromEntries(Object.entries(signals).map(([k, s]) => [k, s.auto]));
  state.reviewSignals = chosen;
  const count = Object.values(chosen).filter(Boolean).length;
  const rec = recommend(program, count);
  const decision = state.reviewDecision || rec;
  const cal = program.calendar || [];
  const entry = cal[calWeek - 1] || { week: calWeek };
  const isLast = entry.week === program.weeks && !entry.deload;
  const streak = maintainedStreak(cal, calWeek) + (decision === 'maintain' ? 1 : 0);
  const labels = Object.fromEntries(program.progressionGate.maintainIfAnySignal.map((s) => [s.id, s.label]));
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Retour</button><p class="kicker">Semaine ${calWeek}, réglages de S${entry.week}${entry.deload ? ' en décharge' : ''}</p><h1 class="display">Bilan de la semaine</h1></header>
    <p class="lead">${esc(program.progressionGate.principle.split('.')[0])}. ${infoBtn('weekly-review')}</p>
    <div class="facts"><span><b>${stats.workouts}</b> séance${stats.workouts > 1 ? 's' : ''}</span><span><b>${stats.checkins}</b> ressenti${stats.checkins > 1 ? 's' : ''}</span></div>
    <h3 class="section">Signaux de fatigue</h3>
    <div class="group">${Object.entries(signals).map(([k, s]) => `
      <label class="row check-row"><input type="checkbox" data-action="review-signal" data-value="${esc(k)}"${chosen[k] ? ' checked' : ''}><span class="row-main"><b>${esc(labels[k] || k)}</b><span>${esc(s.detail)}${s.auto ? ', détecté' : ''}</span></span></label>`).join('')}</div>
    ${isLast ? `<div class="notice"><b>Dernière semaine du programme.</b> Après ce bilan, préparez le bilan de cycle pour Claude (Plus → Bilan pour Claude).</div>` : `
    <h3 class="section">Semaine prochaine</h3>
    <div class="decisions">${['progress', 'maintain', 'deload'].map((d) => `
      <button class="decision${d === decision ? ' on' : ''}" data-action="review-decision" data-value="${d}">
        <span class="decision-title">${esc(DECISION_TEXT[d].title)}${d === rec ? '<span class="tag">Recommandé</span>' : ''}</span>
        <span class="decision-why">${esc(DECISION_TEXT[d].why)}</span>
      </button>`).join('')}</div>
    ${streak > program.progressionGate.maxMaintainedWeeksBeforeEarlyReview ? `<div class="notice warn">Plus de ${program.progressionGate.maxMaintainedWeeksBeforeEarlyReview} semaines maintenues de suite : faites un bilan anticipé avec Claude (Plus → Bilan pour Claude).</div>` : ''}`}
    <button class="btn big" data-action="review-save">Enregistrer le bilan</button>`;
}

const SLIDES = [
  { kind: 'lift', title: 'Votre programme, séance par séance', text: 'Chaque jour, l\'application vous dit quoi faire : la séance de musculation, la course, la natation ou la mobilité. Pendant la séance, elle enchaîne les exercices, lance le repos et pré-remplit chaque série.' },
  { kind: 'lift', title: 'Toujours un cran plus loin', text: 'À chaque exercice, une suggestion vous dit quoi viser : ajouter une répétition, ou monter la charge quand vous êtes prêt. Elle explique pourquoi, et vous restez libre.' },
  { kind: 'body', title: 'Corps, nutrition, récupération', text: 'Pesées avec la courbe de tendance, mensurations, photos, ressenti du matin, calories et protéines repas par repas. Chaque week-end, un bilan de 4 questions décide de la semaine suivante.' },
  { kind: 'food', title: 'Vos données restent ici', text: 'Rien ne quitte l\'iPhone sans votre geste. Sauvegardez chaque dimanche dans Fichiers, et envoyez le bilan à Claude en fin de cycle.' },
];

export function renderOnboarding(state) {
  const i = state.onboardingStep || 0;
  const s = SLIDES[i];
  return `<div class="onb ${s.kind}">
    <div class="onb-art"><span class="onb-num">${i + 1}</span><span class="onb-of">/ ${SLIDES.length}</span></div>
    <h1 class="display">${esc(s.title)}</h1>
    <p class="lead">${esc(s.text)}</p>
    <div class="onb-dots">${SLIDES.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
    <button class="btn big" data-action="onboarding-next">${i < SLIDES.length - 1 ? 'Continuer' : 'C\'est parti'}</button>
    ${i < SLIDES.length - 1 ? '<button class="btn ghost" data-action="onboarding-skip">Passer</button>' : ''}
  </div>`;
}

export { nf };
