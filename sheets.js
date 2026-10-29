// Feuilles (panneaux qui montent du bas) : saisies rapides du journal, correction d'une série, guide.
import { esc, exName } from './views.js';
import { formatDateFr } from './dates.js';
import { icon, nf, scale, infoBtn } from './ui.js';
import { CHECKIN_SCALES, MEASURES } from './body.js';
import { fmtDuration } from './endurance.js';
import { guideEntry } from './guide.js';
import { renderFoodSheet, renderTargetsSheet, renderCustomFoodSheet } from './nutrition-views.js';

const v = (x) => (x === null || x === undefined ? '' : esc(String(x).replace('.', ',')));
const dateField = (date, today) => `<label class="field"><span class="field-label">Date</span><input type="date" name="date" value="${esc(date)}" max="${esc(today)}" required></label>`;
const deleteBtn = (sh) => (sh.editId ? `<button type="button" class="btn ghost danger-text" data-action="entry-delete" data-id="${esc(sh.editId)}">${icon('trash')} Supprimer</button>` : '');

function addMenu() {
  const it = (value, ic, cls, title, sub, extra = '') => `<button class="row" data-action="${value.startsWith('go:') ? 'go' : 'sheet'}" ${value.startsWith('go:') ? `data-tab="${value.slice(3)}"` : `data-value="${value}"`} ${extra}><span class="row-ic ${cls}">${icon(ic)}</span><span class="row-main"><b>${title}</b><span>${sub}</span></span><span class="row-end">${icon('chevron')}</span></button>`;
  return `<h2>Ajouter au journal</h2>
    <div class="group">
      ${it('backfill', 'lift', 'lift', 'Séance de musculation passée', 'Saisir après coup une séance faite sans l\'application')}
      ${it('run', 'run', 'run', 'Course', 'Durée, distance, effort ; ou fichier de la montre')}
      ${it('swim', 'swim', 'swim', 'Natation', 'Distance, durée ; repère des 400 m')}
      ${it('mobility', 'mobility', 'mob', 'Mobilité', 'Séance A ou B')}
    </div>
    <div class="group">
      ${it('weight', 'scale', 'body', 'Pesée', 'Au réveil, avant de manger ou boire')}
      ${it('checkin', 'moon', 'body', 'Ressenti du matin', 'Sommeil, fatigue, courbatures, motivation')}
      ${it('measure', 'body', 'body', 'Mensurations', 'Taille, poitrine, bras, cuisse')}
      ${it('go:photos', 'camera', 'body', 'Photos de suivi', 'Face, profil, dos')}
    </div>`;
}

function checkinSheet(state) {
  const sh = state.sheet;
  const d = sh.draft;
  return `<h2>Ressenti ${sh.editId ? `du ${esc(formatDateFr(d.date, { weekday: false }))}` : 'du matin'} ${infoBtn('checkin')}</h2>
    <form data-form="checkin" class="form">
      ${sh.editId ? dateField(d.date, state.today) : ''}
      <label class="field"><span class="field-label">Heures de sommeil</span><input name="sleepH" class="num-input" inputmode="decimal" value="${v(d.sleepH)}" placeholder="7,5"></label>
      ${CHECKIN_SCALES.map((s) => `<div class="field"><span class="field-label">${esc(s.label)}</span>${scale(s.id, 5, d[s.id], { action: 'draft-pick', low: s.low, high: s.high })}</div>`).join('')}
      <label class="check"><input type="checkbox" name="pain"${d.pain ? ' checked' : ''}> Douleur articulaire ou localisée ${infoBtn('pain')}</label>
      <div class="field-row">
        <label class="field"><span class="field-label">FC au repos <span class="opt">facultatif</span></span><input name="restingHr" class="num-input" inputmode="numeric" value="${v(d.restingHr)}" placeholder="bpm"></label>
        <label class="field"><span class="field-label">Pas d'hier <span class="opt">facultatif</span></span><input name="steps" class="num-input" inputmode="numeric" value="${v(d.steps)}"></label>
      </div>
      <button class="btn big body" type="submit">Enregistrer</button>
      ${deleteBtn(sh)}
    </form>`;
}

function weightSheet(state) {
  const sh = state.sheet;
  const d = sh.draft;
  return `<h2>Pesée ${infoBtn('weight-trend')}</h2>
    <p class="muted small">Au réveil, après les toilettes, avant de manger ou boire. On lit la moyenne de la semaine, pas la valeur du jour.</p>
    <form data-form="weight" class="form">
      ${dateField(d.date, state.today)}
      <label class="field"><span class="field-label">Poids (kg)</span><input name="kg" class="num-input big" inputmode="decimal" value="${v(d.kg)}" required autocomplete="off"></label>
      <button class="btn big body" type="submit">Enregistrer</button>
      ${deleteBtn(sh)}
    </form>`;
}

function measureSheet(state) {
  const sh = state.sheet;
  const d = sh.draft;
  return `<h2>Mensurations ${infoBtn('measurements')}</h2>
    <form data-form="measure" class="form">
      ${dateField(d.date, state.today)}
      ${MEASURES.map((m) => `<label class="field"><span class="field-label">${esc(m.label)} (cm)</span><input name="${m.id}" class="num-input" inputmode="decimal" value="${v(d[m.id])}"><span class="field-help">${esc(m.how)}</span></label>`).join('')}
      <button class="btn big body" type="submit">Enregistrer</button>
      ${deleteBtn(sh)}
    </form>`;
}

function runSheet(state) {
  const sh = state.sheet;
  const d = sh.draft;
  return `<h2>Course ${infoBtn('easy-run')}</h2>
    ${sh.editId ? '' : `<button class="btn quiet" data-action="sheet" data-value="import" data-kind="run">${icon('watch')} Importer un fichier de la montre</button>`}
    ${d.source && d.source !== 'manual' ? `<div class="notice ok small">Lu dans le fichier de la montre (${esc(d.source.toUpperCase())}). Vérifiez, complétez, enregistrez.</div>` : ''}
    <form data-form="run" class="form">
      ${dateField(d.date, state.today)}
      <div class="field-row">
        <label class="field"><span class="field-label">Durée</span><input name="duration" class="num-input" inputmode="decimal" value="${d.durationSec ? esc(fmtDuration(d.durationSec)) : ''}" placeholder="42 ou 41:30" required></label>
        <label class="field"><span class="field-label">Distance (km)</span><input name="km" class="num-input" inputmode="decimal" value="${d.distanceM ? v(Math.round(d.distanceM / 10) / 100) : ''}"></label>
      </div>
      <label class="field"><span class="field-label">FC moyenne <span class="opt">facultatif</span></span><input name="avgHr" class="num-input" inputmode="numeric" value="${v(d.avgHr)}" placeholder="bpm"></label>
      <div class="field"><span class="field-label">Effort ressenti (1 à 10)</span>${scale('rpe', 10, d.rpe, { action: 'draft-pick', low: 'très facile', high: 'maximal' })}<span class="field-help">Course facile : 3 ou 4.</span></div>
      <label class="field"><span class="field-label">Note <span class="opt">facultatif</span></span><input name="note" value="${esc(d.note || '')}" placeholder="Accélérations faites, jambes lourdes…"></label>
      <button class="btn big run" type="submit">Enregistrer</button>
      ${deleteBtn(sh)}
    </form>`;
}

function swimSheet(state) {
  const sh = state.sheet;
  const d = sh.draft;
  return `<h2>Natation ${infoBtn('swim')}</h2>
    ${sh.editId ? '' : `<button class="btn quiet" data-action="sheet" data-value="import" data-kind="swim">${icon('watch')} Importer un fichier de la montre</button>`}
    <form data-form="swim" class="form">
      ${dateField(d.date, state.today)}
      <div class="field-row">
        <label class="field"><span class="field-label">Distance (m)</span><input name="distanceM" class="num-input" inputmode="numeric" value="${v(d.distanceM)}" placeholder="1100"></label>
        <label class="field"><span class="field-label">Durée</span><input name="duration" class="num-input" inputmode="decimal" value="${d.durationSec ? esc(fmtDuration(d.durationSec)) : ''}" placeholder="45"></label>
      </div>
      <details class="rules"${d.test400Sec ? ' open' : ''}><summary>Repère des 400 m (fin de cycle)</summary>
        <div class="field-row">
          <label class="field"><span class="field-label">Temps des 400 m</span><input name="test400" class="num-input" inputmode="decimal" value="${d.test400Sec ? esc(fmtDuration(d.test400Sec)) : ''}" placeholder="9:30"></label>
          <label class="field"><span class="field-label">Mouvements / longueur</span><input name="strokes" class="num-input" inputmode="numeric" value="${v(d.strokes)}"></label>
        </div>
      </details>
      <div class="field"><span class="field-label">Effort ressenti (1 à 10)</span>${scale('rpe', 10, d.rpe, { action: 'draft-pick', low: 'très facile', high: 'maximal' })}</div>
      <label class="field"><span class="field-label">Note <span class="opt">facultatif</span></span><input name="note" value="${esc(d.note || '')}" placeholder="Respiration tous les 3 temps tenue…"></label>
      <button class="btn big swim" type="submit">Enregistrer</button>
      ${deleteBtn(sh)}
    </form>`;
}

function mobilitySheet(state) {
  const sh = state.sheet;
  const d = sh.draft;
  return `<h2>Mobilité</h2>
    <form data-form="mobility" class="form">
      ${dateField(d.date, state.today)}
      <div class="seg">${['A', 'B'].map((x) => `<button type="button" class="chip${d.variant === x ? ' on' : ''}" data-action="draft-pick" data-name="variant" data-value="${x}">Mobilité ${x}</button>`).join('')}</div>
      <label class="field"><span class="field-label">Durée (min)</span><input name="minutes" class="num-input" inputmode="numeric" value="${v(d.minutes ?? 30)}"></label>
      <button class="btn big mob" type="submit">Enregistrer</button>
      ${deleteBtn(sh)}
    </form>`;
}

function importSheet(state) {
  const sh = state.sheet;
  return `<h2>Importer depuis la montre ${infoBtn('suunto')}</h2>
    <ol class="steps">
      <li>Dans l'application Suunto, ouvrez la séance.</li>
      <li>Partagez ou exportez-la en fichier <b>.fit</b> ou <b>.gpx</b>, et enregistrez-le dans Fichiers.</li>
      <li>Choisissez ce fichier ci-dessous : durée, distance et fréquence cardiaque sont lues ici, sur l'iPhone.</li>
    </ol>
    <label class="btn big ${sh.kind === 'swim' ? 'swim' : 'run'}">${icon('upload')} Choisir le fichier<input type="file" id="activity-file" data-kind="${esc(sh.kind || 'run')}" hidden></label>
    ${sh.error ? `<div class="msg-err">${esc(sh.error)}</div>` : ''}
    <p class="muted small">Formats lus : FIT, GPX, TCX. Le fichier n'est envoyé nulle part.</p>`;
}

function setEditSheet(state) {
  const s = (state.sets || []).find((x) => x.id === state.sheet.editId);
  if (!s) return '<p>Série introuvable.</p>';
  return `<h2>Corriger la série ${s.index}</h2><p class="muted">${esc(exName(state.lib, s.exercise))}</p>
    <form data-form="set-edit" class="form">
      <div class="field-row">
        <label class="field"><span class="field-label">Charge (kg)</span><input name="loadKg" class="num-input" inputmode="decimal" value="${v(s.loadKg)}"></label>
        <label class="field"><span class="field-label">Répétitions</span><input name="reps" class="num-input" inputmode="numeric" value="${v(s.reps)}" required></label>
      </div>
      ${s.rir !== null && s.rir !== undefined ? `<div class="field"><span class="field-label">RIR</span>${scale('rir', 6, state.sheet.draft.rir, { from: 0, action: 'draft-pick' })}</div>` : ''}
      <button class="btn big" type="submit">Enregistrer la correction</button>
      <button type="button" class="btn ghost danger-text" data-action="set-delete" data-id="${esc(s.id)}">${icon('trash')} Supprimer la série</button>
    </form>`;
}

function backfillSheet(state) {
  return `<h2>Séance passée</h2><p class="muted small">Pour une séance faite sans l'application (notée sur papier, par exemple). Les séries se saisissent comme d'habitude, sans chronomètre.</p>
    <div class="group">${state.program.sessionOrder.map((id) => `<button class="row" data-action="start-backfill" data-session="${esc(id)}"><span class="row-ic lift"><b>${esc(id)}</b></span><span class="row-main"><b>Séance ${esc(id)}</b><span>${esc(state.program.sessions.find((s) => s.id === id).objective)}</span></span><span class="row-end">${icon('chevron')}</span></button>`).join('')}</div>`;
}

function guideSheet(state) {
  const g = guideEntry(state.sheet.key);
  if (!g) return '<p>Entrée introuvable.</p>';
  return `<p class="kicker">Comprendre</p><h2>${esc(g.title)}</h2>${g.body.map((p) => `<p class="guide-p">${esc(p)}</p>`).join('')}
    <button class="btn quiet" data-action="go" data-tab="guide">${icon('book')} Tout le guide</button>`;
}

export function renderSheet(state) {
  const sh = state.sheet;
  if (!sh) return '';
  const body = {
    add: addMenu, checkin: checkinSheet, weight: weightSheet, measure: measureSheet, run: runSheet, swim: swimSheet, mobility: mobilitySheet,
    import: importSheet, 'set-edit': setEditSheet, backfill: backfillSheet, guide: guideSheet, food: renderFoodSheet, targets: renderTargetsSheet, 'custom-food': renderCustomFoodSheet,
  }[sh.type];
  if (!body) return '';
  return `<div class="sheet-back" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true">
      <div class="sheet-grip"></div>
      <button class="icon-btn sheet-close" data-action="close-sheet" aria-label="Fermer">${icon('close')}</button>
      ${body(state)}
    </div>`;
}

export { nf };
