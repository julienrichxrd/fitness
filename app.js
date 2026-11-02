// Point d'entrée : chargement, navigation, séance (saisie dans le tableau), course et natation, sauvegarde, mises à jour.
import { validateProgram, validateLibrary } from './program.js';
import { todayLocal, effectiveProgram } from './dates.js';
import { applyStartDateChange, resetStartDate, START_KEY } from './settings.js';
import { getMeta, setMeta, storageStatus, getAll, putRecord, saveSetAndWorkout, deleteSet, deleteWorkout, deleteRecord, readEverything, replaceAll } from './storage.js';
import {
  renderProgram, renderSession, renderProgress, renderExerciseDetail, renderSheet, renderNav, renderBanners, renderRest,
  sessionModel, shownWeek, parseDuration, fmtDuration, fmtPace, esc,
} from './screens.js';
import { createWorkout, afterSet, fallbackOffer, restLeft, newId, slotSets, suggestionFor } from './workout.js';
import { loadMode } from './suggest.js';
import { buildBackup, backupFileName, checkBackup, lostByRestore, LOCAL_META } from './backup.js';
import { buildCalendar } from './cycle.js';
import { APP_VERSION } from './version.js';
import { mountAnimations } from './anim.js';

const $ = (sel) => document.querySelector(sel);
const state = {
  tab: 'program',
  today: todayLocal(),
  appVersion: APP_VERSION,
  sw: { supported: 'serviceWorker' in navigator, updateReady: false, checking: false, offline: null },
  standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  workouts: [], sets: [], entries: [], settings: {},
  active: null, draftWorkout: null, edits: {}, fallback: null, menu: null,
  sheet: null, viewWeek: null, selDate: null, pickSession: null, progressTab: 'lift', exerciseId: null,
  lastBackup: null, hasSafetyCopy: false, restore: null, backupMsg: null, toast: null,
};
let registration = null;
let updateRequested = false;
const nowIso = () => new Date().toISOString();
const VIEWS = { program: renderProgram, session: renderSession, progress: renderProgress, exercise: renderExerciseDetail };

function render() {
  if (state.tab === 'session' && !state.active && !state.draftWorkout) state.tab = 'program';
  const y = window.scrollY;
  $('#main').innerHTML = VIEWS[state.tab](state);
  $('#sheet').innerHTML = renderSheet(state);
  $('#nav').innerHTML = renderNav(state.tab === 'exercise' ? 'progress' : state.tab);
  $('#banners').innerHTML = renderBanners(state);
  document.body.dataset.tab = state.tab;
  document.body.classList.toggle('has-sheet', !!state.sheet);
  state.toast = null;
  mountAnimations($('#main'));
  mountAnimations($('#sheet'));
  window.scrollTo(0, y);
  tick();
}

function go(tab) {
  state.tab = tab;
  state.sheet = null;
  state.menu = null;
  render();
  window.scrollTo(0, 0);
  updateWakeLock();
}

function openSheet(sheet) {
  state.sheet = sheet;
  state.menu = null;
  render();
  const el = $('.sheet');
  if (el) el.scrollTop = 0;
}

// ---------- Chargement ----------

function rebuildProgram() {
  const eff = effectiveProgram(state.fileProgram, state.startOverride);
  const reviews = state.entries.filter((e) => e.kind === 'week-review' && e.programId === eff.id);
  state.program = { ...eff, calendar: buildCalendar(eff, reviews) };
}

async function loadRecords() {
  const [workouts, sets, entries] = await Promise.all([getAll('workouts'), getAll('sets'), getAll('entries')]);
  state.workouts = workouts;
  state.sets = sets;
  state.entries = entries;
  const w = workouts.filter((x) => x.status === 'in-progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  state.active = w ? { workout: w, sets: sets.filter((s) => s.workoutId === w.id) } : null;
  state.lastBackup = (await getMeta('last-backup')) || null;
  state.hasSafetyCopy = !!(await getMeta('restore-safety'));
  state.settings = (await getMeta('settings')) || {};
  state.startOverride = await getMeta(START_KEY);
  rebuildProgram();
}

async function loadData() {
  const [progFile, lib] = await Promise.all([
    fetch('./programme-cycle-1.json').then((r) => r.json()),
    fetch('./exercises.json').then((r) => r.json()),
  ]);
  const errors = [...validateLibrary(lib), ...validateProgram(progFile, lib).errors];
  if (errors.length) throw Object.assign(new Error('invalid'), { messages: errors });
  state.lib = lib;
  state.fileProgram = progFile.program;
  try {
    await loadRecords();
  } catch {
    rebuildProgram();
  }
}

// ---------- Séance ----------

const currentWorkout = () => (state.active ? state.active.workout : state.draftWorkout);

async function persistWorkout() {
  if (!state.active) return;
  state.active.workout.updatedAt = nowIso();
  await putRecord('workouts', state.active.workout);
}

function openSession(sessionId, date) {
  unlockAudio();
  if (state.active) {
    if (state.active.workout.sessionId !== sessionId && !window.confirm(`La séance ${state.active.workout.sessionId} est en cours. La reprendre ?`)) return;
    state.fallback = null;
    go('session');
    return;
  }
  const d = date && date < state.today ? date : state.today;
  if (!state.draftWorkout || state.draftWorkout.sessionId !== sessionId || state.draftWorkout.date !== d) {
    state.draftWorkout = createWorkout(state.program, sessionId, { date: d });
    state.edits = {};
  }
  state.fallback = null;
  go('session');
}

const toNum = (v) => { const t = String(v ?? '').trim().replace(',', '.'); return t === '' ? null : Number(t); };

function rowInputs(slotId, i) {
  const q = (f) => document.querySelector(`input[data-slot="${CSS.escape(slotId)}"][data-i="${i}"][data-f="${f}"]`);
  return { kg: q('kg'), reps: q('reps') };
}

function toast(text) {
  state.toast = text;
}

async function doSet(slotId, i) {
  unlockAudio();
  const w = currentWorkout();
  const { plan } = sessionModel(state);
  const item = plan.find((x) => x.slotId === slotId);
  const mode = loadMode(item, item.increment);
  const inp = rowInputs(slotId, i);
  const kg = inp.kg ? toNum(inp.kg.value) : null;
  const reps = inp.reps ? toNum(inp.reps.value) : null;
  const bad = (el, msg) => { if (el) { el.classList.add('bad'); el.focus(); } flash(msg); };
  if (mode === 'external' && (kg === null || !Number.isFinite(kg) || kg < 0 || kg > 500)) return bad(inp.kg, 'Indiquez le poids.');
  if (mode === 'added' && kg !== null && (!Number.isFinite(kg) || kg < 0 || kg > 200)) return bad(inp.kg, 'Lest invalide.');
  if (reps === null || !Number.isInteger(reps) || reps < 0 || reps > 100) return bad(inp.reps, 'Indiquez les répétitions.');
  const now = nowIso();
  if (!state.active) {
    w.startedAt = now;
    w.createdAt = now;
    state.active = { workout: w, sets: [] };
    state.workouts.push(w);
    state.draftWorkout = null;
  }
  const done = slotSets(state.active.sets, slotId);
  const set = {
    id: newId('s'), workoutId: w.id, slotId, exercise: item.exercise, index: done.length + 1,
    loadKg: mode === 'none' ? null : (Number.isFinite(kg) ? kg : 0), reps, rir: null,
    perSide: !!item.perSide, kind: 'work', doneAt: now, createdAt: now, updatedAt: now,
  };
  const sets = [...state.active.sets, set];
  const next = afterSet(plan, sets, slotId);
  const offer = fallbackOffer(item, sets, reps);
  w.restTotalSec = next.restSec || null;
  w.restEndsAt = next.restSec ? Date.now() + next.restSec * 1000 : null;
  w.currentSlot = next.next || slotId;
  w.updatedAt = now;
  try {
    await saveSetAndWorkout(set, w);
  } catch (e) {
    flash(`Série non enregistrée : ${e.message}`);
    return null;
  }
  state.active.sets = sets;
  state.sets.push(set);
  const ed = state.edits[slotId];
  if (ed) delete ed[i];
  restSignaled = false;
  state.fallback = offer ? { slotId, ...offer } : null;
  render();
  if (next.reason === 'finished' && !offer) { openSheet({ type: 'finish' }); return null; }
  if (next.reason === 'next-exercise' || next.reason === 'superset' || next.reason === 'round') {
    const el = document.getElementById(`ex-${next.next}`);
    if (el && next.reason === 'next-exercise') setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  }
  return null;
}

async function undoSet(id) {
  const set = state.sets.find((s) => s.id === id);
  if (!set || !state.active) return;
  const w = state.active.workout;
  w.restEndsAt = null;
  await deleteSet(id, w);
  state.sets = state.sets.filter((s) => s.id !== id);
  const rest = state.sets.filter((s) => s.workoutId === w.id && s.slotId === set.slotId).sort((a, b) => a.index - b.index);
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].index !== i + 1) { rest[i].index = i + 1; await putRecord('sets', rest[i]); }
  }
  state.active.sets = state.sets.filter((s) => s.workoutId === w.id);
  state.edits[set.slotId] = { ...(state.edits[set.slotId] || {}), [set.index - 1]: { kg: set.loadKg, reps: set.reps } };
  render();
}

async function swapExercise(slotId, exerciseId, kind) {
  const w = currentWorkout();
  const { plan } = sessionModel(state);
  const item = plan.find((x) => x.slotId === slotId);
  w.swaps = { ...(w.swaps || {}) };
  if (exerciseId === item.planned) delete w.swaps[slotId];
  else w.swaps[slotId] = { exercise: exerciseId, kind, fromSet: slotSets(state.active ? state.active.sets : [], slotId).length + 1 };
  state.fallback = null;
  state.menu = null;
  delete state.edits[slotId];
  await persistWorkout();
  render();
}

async function saveWorkout(status) {
  const w = state.active.workout;
  w.status = status;
  w.endedAt = nowIso();
  w.restEndsAt = null;
  w.updatedAt = w.endedAt;
  await putRecord('workouts', w);
  if (status === 'abandoned') {
    for (const s of state.active.sets) await deleteSet(s.id, null);
    await deleteWorkout(w.id);
  }
  await loadRecords();
  state.draftWorkout = null;
  state.edits = {};
  state.fallback = null;
  toast(status === 'done' ? 'Séance enregistrée.' : 'Séance abandonnée.');
  go('program');
}

let flashTimer = null;
function flash(text) {
  let el = $('#flash');
  if (!el) { el = document.createElement('div'); el.id = 'flash'; document.body.appendChild(el); }
  el.textContent = text;
  el.className = 'flash on';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { el.className = 'flash'; }, 2200);
}

// ---------- Course, natation, mobilité ----------

function enduranceDraft(kind, date, title) {
  return { kind, date: date > state.today ? state.today : date, title: title || '', distanceM: null, durationSec: null, note: '' };
}

/** Deux cases remplies sur trois : la troisième se calcule. Le champ recalculé est le moins récemment touché. */
let touched = [];
function calcEndurance(form, changed) {
  touched = [changed, ...touched.filter((x) => x !== changed)].slice(0, 3);
  const run = state.sheet && state.sheet.draft.kind === 'run';
  const unit = run ? 1000 : 100;
  const f = { dist: form.elements.dist, dur: form.elements.dur, pace: form.elements.pace };
  const dist = toNum(f.dist.value);
  const distM = dist && dist > 0 ? (run ? dist * 1000 : dist) : null;
  const dur = parseDuration(f.dur.value);
  const pace = parseDuration(f.pace.value) && f.pace.value.includes(':') ? parseDuration(f.pace.value) : (toNum(f.pace.value) ? Math.round(toNum(f.pace.value) * 60) : null);
  const target = ['dist', 'dur', 'pace'].find((k) => !touched.slice(0, 2).includes(k));
  if (touched.length < 2 || !target) return;
  if (target === 'pace' && distM && dur) f.pace.value = fmtPace(dur / (distM / unit));
  if (target === 'dur' && distM && pace) f.dur.value = fmtDuration(pace * (distM / unit));
  if (target === 'dist' && dur && pace) {
    const m = (dur / pace) * unit;
    f.dist.value = run ? String(Math.round(m / 10) / 100).replace('.', ',') : String(Math.round(m));
  }
}

async function saveEndurance(form) {
  const sh = state.sheet;
  const run = sh.draft.kind === 'run';
  const unit = run ? 1000 : 100;
  const fd = new FormData(form);
  const dist = toNum(fd.get('dist'));
  let distM = dist !== null && Number.isFinite(dist) && dist > 0 ? Math.round(run ? dist * 1000 : dist) : null;
  let dur = parseDuration(fd.get('dur'));
  const pv = String(fd.get('pace') || '');
  const pace = pv.includes(':') ? parseDuration(pv) : (toNum(pv) ? Math.round(toNum(pv) * 60) : null);
  if (!dur && distM && pace) dur = Math.round(pace * (distM / unit));
  if (!distM && dur && pace) distM = Math.round((dur / pace) * unit);
  const err = (t) => { sh.error = t; render(); };
  if (!distM && !dur) return err(`Indiquez au moins deux valeurs : distance, durée ou allure.`);
  if (distM && (distM > 300000)) return err('Distance trop grande.');
  if (dur && dur > 86400) return err('Durée trop longue.');
  const date = String(fd.get('date') || state.today);
  if (date > state.today) return err('La date ne peut pas être dans le futur.');
  const old = sh.editId ? state.entries.find((e) => e.id === sh.editId) : null;
  const now = nowIso();
  const entry = {
    ...(old || {}), id: old ? old.id : newId('e'), kind: sh.draft.kind, date, title: String(fd.get('title') || '').trim().slice(0, 80),
    distanceM: distM, durationSec: dur || null, note: String(fd.get('note') || '').trim().slice(0, 200), createdAt: old ? old.createdAt : now, updatedAt: now,
  };
  await putRecord('entries', entry);
  state.entries = state.entries.filter((e) => e.id !== entry.id).concat(entry);
  state.sheet = null;
  if (state.tab === 'program') { state.selDate = entry.date; state.pickSession = null; }
  toast(run ? 'Course enregistrée.' : 'Natation enregistrée.');
  render();
  return null;
}

// ---------- Chronomètre de repos ----------

let audioCtx = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* son indisponible */ }
}
function beep() {
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    if (!audioCtx) return;
    [0, 0.25].forEach((t) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + t + 0.2);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.22);
    });
  } catch { /* ignoré */ }
}

let restSignaled = false;
function tick() {
  const w = state.active && state.active.workout;
  const el = $('#elapsed');
  if (el && w) el.textContent = `${Math.max(0, Math.floor((Date.now() - Date.parse(w.startedAt)) / 60000))} min`;
  if (!w || state.tab !== 'session') return;
  const left = restLeft(w);
  if (left === null) return;
  const time = $('#rest-time');
  if (time) {
    time.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const fill = $('#rest-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (left / (w.restTotalSec || 1)) * 100))}%`;
  }
  if (left === 0 && !restSignaled) {
    restSignaled = true;
    beep();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = renderRest(w);
  }
}
setInterval(tick, 500);

let wakeLock = null;
async function updateWakeLock() {
  try {
    if (state.tab === 'session' && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}

// ---------- Sauvegarde et restauration ----------

async function deliverFile(name, text) {
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}

async function doBackup() {
  try {
    const all = await readEverything();
    const backup = buildBackup({ ...all, appVersion: APP_VERSION });
    const name = backupFileName();
    if (await deliverFile(name, JSON.stringify(backup))) {
      const info = { at: nowIso(), fileName: name, workouts: backup.counts.workouts, sets: backup.counts.sets };
      await setMeta('last-backup', info);
      state.lastBackup = info;
      state.backupMsg = { ok: true, text: `Fichier « ${name} » créé.` };
    } else state.backupMsg = { ok: false, text: 'Sauvegarde annulée.' };
  } catch (e) {
    state.backupMsg = { ok: false, text: `Sauvegarde impossible : ${e.message}` };
  }
  render();
}

async function confirmRestore() {
  const r = state.restore;
  try {
    const current = await readEverything();
    await setMeta('restore-safety', { at: nowIso(), backup: buildBackup({ ...current, appVersion: APP_VERSION }) });
    await replaceAll({ workouts: r.backup.data.workouts, sets: r.backup.data.sets, entries: r.backup.data.entries || [], meta: r.backup.data.meta.map((m) => ({ ...m, updatedAt: m.updatedAt || nowIso() })) }, { keepMeta: LOCAL_META });
    await setMeta('data-origin', { type: 'restored', at: nowIso() });
    await loadRecords();
    state.restore = null;
    state.backupMsg = { ok: true, text: `Restauration terminée : ${r.preview.workouts} séances.` };
  } catch (e) {
    state.backupMsg = { ok: false, text: `Restauration impossible, rien n'a été modifié : ${e.message}` };
  }
  render();
}

async function undoRestore() {
  if (!window.confirm('Remettre les données d\'avant la dernière restauration ?')) return;
  const safe = await getMeta('restore-safety');
  if (!safe) return;
  const b = safe.backup;
  await replaceAll({ workouts: b.data.workouts, sets: b.data.sets, entries: b.data.entries || [], meta: b.data.meta }, { keepMeta: LOCAL_META });
  await setMeta('restore-safety', null);
  await loadRecords();
  state.backupMsg = { ok: true, text: 'Dernière restauration annulée.' };
  render();
}

async function saveStart(result, okText) {
  if (!result.ok) {
    state.startMsg = { ok: false, text: result.errors.join(' '), suggestion: result.suggestion || null };
  } else {
    await setMeta(START_KEY, result.override);
    state.startOverride = result.override;
    rebuildProgram();
    state.viewWeek = null;
    state.startMsg = { ok: true, text: okText };
  }
  render();
}

// ---------- Actions ----------

const ACTIONS = {
  go: (el) => go(el.dataset.tab),
  week: (el) => {
    const { totalWeeks, calWeek } = shownWeek(state);
    state.viewWeek = Math.max(1, Math.min(totalWeeks, calWeek + Number(el.dataset.value)));
    state.selDate = null;
    state.pickSession = null;
    render();
  },
  'pick-day': (el) => { state.selDate = el.dataset.value; state.pickSession = null; render(); },
  'pick-session': (el) => { state.pickSession = el.dataset.value; render(); },
  'open-session': (el) => openSession(el.dataset.value, el.dataset.date),
  resume: () => go('session'),
  'close-session': () => { state.fallback = null; go('program'); },
  'show-demo': (el) => openSheet({ type: 'demo', id: el.dataset.value }),
  'ex-menu': (el) => { state.menu = state.menu === el.dataset.value ? null : el.dataset.value; render(); },
  swap: (el) => swapExercise(el.dataset.slot, el.dataset.value, 'alternative'),
  'accept-fallback': (el) => swapExercise(el.dataset.slot, el.dataset.value, 'fallback'),
  'refuse-fallback': () => { state.fallback = null; render(); },
  'do-set': (el) => doSet(el.dataset.slot, Number(el.dataset.i)),
  'undo-set': (el) => undoSet(el.dataset.id),
  'add-set': async (el) => {
    const w = currentWorkout();
    w.extraSets = { ...(w.extraSets || {}), [el.dataset.value]: ((w.extraSets || {})[el.dataset.value] || 0) + 1 };
    await persistWorkout();
    render();
  },
  'pick-option': (el) => {
    const { plan } = sessionModel(state);
    const item = plan.find((x) => x.slotId === el.dataset.slot);
    const { suggestion } = suggestionFor(item, state.workouts, state.sets, currentWorkout());
    const o = suggestion.options[Number(el.dataset.value)];
    const ed = {};
    for (let i = 0; i < item.sets; i += 1) ed[i] = { kg: o.load, reps: o.reps };
    state.edits[item.slotId] = ed;
    render();
  },
  'rest-adjust': async (el) => {
    const w = state.active.workout;
    if (!w.restEndsAt) return;
    w.restEndsAt = Math.max(Date.now(), w.restEndsAt + Number(el.dataset.value) * 1000);
    w.restTotalSec = Math.max(1, (w.restTotalSec || 0) + Number(el.dataset.value));
    restSignaled = false;
    await persistWorkout();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = renderRest(w);
  },
  'rest-skip': async () => {
    state.active.workout.restEndsAt = null;
    await persistWorkout();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = '';
  },
  finish: () => openSheet({ type: 'finish' }),
  'save-workout': () => saveWorkout('done'),
  'abandon-workout': () => { if (window.confirm('Abandonner cette séance ? Les séries faites seront effacées.')) saveWorkout('abandoned'); },
  'close-sheet': () => { state.sheet = null; state.restore = null; render(); },
  'log-endurance': (el) => { touched = []; openSheet({ type: 'endurance', draft: enduranceDraft(el.dataset.kind, el.dataset.date, el.dataset.title) }); },
  'edit-endurance': (el) => {
    const e = state.entries.find((x) => x.id === el.dataset.id);
    if (!e) return;
    touched = ['dist', 'dur'];
    openSheet({ type: 'endurance', editId: e.id, draft: { kind: e.kind, date: e.date, title: e.title || '', distanceM: e.distanceM, durationSec: e.durationSec, note: e.note || '' } });
  },
  'delete-endurance': async (el) => {
    if (!window.confirm('Supprimer cette séance ?')) return;
    await deleteRecord('entries', el.dataset.id);
    state.entries = state.entries.filter((e) => e.id !== el.dataset.id);
    state.sheet = null;
    render();
  },
  'toggle-mobility': async (el) => {
    const date = el.dataset.date;
    const ex = state.entries.find((e) => e.kind === 'mobility' && e.date === date);
    if (ex) {
      await deleteRecord('entries', ex.id);
      state.entries = state.entries.filter((e) => e.id !== ex.id);
    } else {
      const now = nowIso();
      const e = { id: newId('e'), kind: 'mobility', date: date > state.today ? state.today : date, createdAt: now, updatedAt: now };
      await putRecord('entries', e);
      state.entries.push(e);
    }
    render();
  },
  'progress-tab': (el) => { state.progressTab = el.dataset.value; render(); },
  'open-exercise': (el) => { state.exerciseId = el.dataset.value; go('exercise'); },
  settings: () => { state.backupMsg = null; state.startMsg = null; openSheet({ type: 'settings' }); },
  'delete-workout': async (el) => {
    if (!window.confirm('Supprimer définitivement cette séance ?')) return;
    await deleteWorkout(el.dataset.id);
    await loadRecords();
    render();
  },
  backup: () => doBackup(),
  'restore-confirm': () => confirmRestore(),
  'restore-cancel': () => { state.restore = null; render(); },
  'undo-restore': () => undoRestore(),
  'reset-start': () => saveStart(resetStartDate(state.startOverride, state.fileProgram), 'Date remise à celle du programme.'),
  'use-suggestion': (el) => saveStart(applyStartDateChange(state.startOverride, state.fileProgram, el.dataset.value, { today: state.today }), 'Date enregistrée.'),
  'check-update': () => checkForUpdate(true),
  'apply-update': () => applyUpdate(),
};

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  try { await fn(el, ev); } catch (e) { console.error(e); window.alert(`Action impossible : ${e.message}`); }
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form');
  if (!form) return;
  ev.preventDefault();
  if (form.dataset.form === 'start-date') saveStart(applyStartDateChange(state.startOverride, state.fileProgram, String(new FormData(form).get('start')), { today: state.today }), 'Date enregistrée.');
  if (form.dataset.form === 'endurance') saveEndurance(form).catch((e) => { state.sheet.error = e.message; render(); });
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset && t.dataset.calc) { calcEndurance(t.form, t.dataset.calc); return; }
  if (!t.dataset || !t.dataset.slot || !t.dataset.f) return;
  t.classList.remove('bad');
  const slot = t.dataset.slot;
  const i = Number(t.dataset.i);
  const v = toNum(t.value);
  state.edits[slot] = state.edits[slot] || {};
  state.edits[slot][i] = { ...(state.edits[slot][i] || {}), [t.dataset.f]: v };
  // Le poids changé se reporte sur les séries suivantes pas encore faites.
  if (t.dataset.f === 'kg') {
    document.querySelectorAll(`input[data-slot="${CSS.escape(slot)}"][data-f="kg"]`).forEach((other) => {
      const j = Number(other.dataset.i);
      if (j > i && !other.disabled) {
        other.value = t.value;
        state.edits[slot][j] = { ...(state.edits[slot][j] || {}), kg: v };
      }
    });
  }
});

document.addEventListener('focusin', (ev) => {
  if (ev.target.classList && (ev.target.classList.contains('num') || ev.target.classList.contains('big-in'))) setTimeout(() => { try { ev.target.select(); } catch { /* ignoré */ } }, 0);
});

document.addEventListener('change', async (ev) => {
  if (ev.target.id !== 'restore-input') return;
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const check = checkBackup(await file.text(), { today: state.today });
  state.restore = check.ok ? { preview: check.preview, backup: check.backup, lost: lostByRestore(state.workouts, check.backup) } : { errors: check.errors };
  render();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && state.sheet) { state.sheet = null; render(); }
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.slot) {
    ev.preventDefault();
    const { slot, i, f } = ev.target.dataset;
    if (f === 'kg') { const r = rowInputs(slot, i).reps; if (r) r.focus(); } else doSet(slot, Number(i));
  }
});

// ---------- Service worker ----------

function askOfflineStatus() {
  const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!ctrl) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => { state.sw.offline = e.data; if (state.sheet && state.sheet.type === 'settings') render(); };
  ctrl.postMessage({ type: 'STATUS' }, [ch.port2]);
}

function watchWorker(worker) {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      state.sw.updateReady = true;
      $('#banners').innerHTML = renderBanners(state);
    }
  });
}

async function checkForUpdate(manual) {
  if (!registration) return;
  state.sw.checking = true;
  if (manual) render();
  try { await registration.update(); } catch { /* hors ligne */ }
  state.sw.checking = false;
  if (registration.waiting && navigator.serviceWorker.controller) state.sw.updateReady = true;
  if (manual) render(); else $('#banners').innerHTML = renderBanners(state);
}

function applyUpdate() {
  const waiting = registration && registration.waiting;
  if (!waiting) { window.location.reload(); return; }
  updateRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function initServiceWorker() {
  if (!state.sw.supported) return;
  try { registration = await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch { state.sw.supported = false; return; }
  if (registration.waiting && navigator.serviceWorker.controller) state.sw.updateReady = true;
  if (registration.installing) watchWorker(registration.installing);
  registration.addEventListener('updatefound', () => watchWorker(registration.installing));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested) return;
    updateRequested = false;
    window.location.reload();
  });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) navigator.serviceWorker.addEventListener('controllerchange', askOfflineStatus, { once: true });
  askOfflineStatus();
  $('#banners').innerHTML = renderBanners(state);
}

document.addEventListener('visibilitychange', () => {
  updateWakeLock();
  if (document.visibilityState !== 'visible') return;
  const now = todayLocal();
  if (now !== state.today) { state.today = now; if (state.tab === 'program' && !state.sheet) render(); }
  tick();
  checkForUpdate(false);
});

async function start() {
  try {
    await loadData();
  } catch (e) {
    $('#main').innerHTML = `<h1>Problème de chargement</h1><p class="err">${(e.messages || ['Impossible de lire le programme. Vérifiez la connexion pour la première ouverture.']).map(esc).join('<br>')}</p>`;
    return;
  }
  if (state.active) state.tab = 'session';
  render();
  initServiceWorker();
  storageStatus().catch(() => null);
}

start();
