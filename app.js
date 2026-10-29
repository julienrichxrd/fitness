// Point d'entrée : charge le programme et les données, gère la navigation, la séance en cours,
// la sauvegarde, le service worker et les réglages.
import { validateProgram, validateLibrary } from './program.js';
import { todayLocal, effectiveProgram, cycleInfo } from './dates.js';
import { applyStartDateChange, resetStartDate, START_KEY } from './settings.js';
import { getMeta, setMeta, storageStatus, getAll, putRecord, saveSetAndWorkout, deleteSet, deleteWorkout, readEverything, replaceAll } from './storage.js';
import { renderToday, renderProgram, renderData, renderNav, renderBanners, esc } from './views.js';
import { renderStart, renderWorkout, renderFinish, renderRestBar, currentContext } from './workout-views.js';
import { renderHistory, renderWorkoutDetail, renderProgress } from './history-views.js';
import { createWorkout, workoutPlan, afterSet, fallbackOffer, restLeft, newId, slotSets } from './workout.js';
import { loadStep, loadMode } from './suggest.js';
import { buildBackup, backupFileName, checkBackup, lostByRestore, LOCAL_META } from './backup.js';
import { APP_VERSION } from './version.js';

const $ = (sel) => document.querySelector(sel);
const state = {
  tab: 'today',
  view: { session: 'A', week: 1 },
  today: todayLocal(),
  appVersion: APP_VERSION,
  sw: { supported: 'serviceWorker' in navigator, updateReady: false, checking: false, lastCheck: null, offline: null },
  storage: null,
  standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  startOverride: undefined,
  startMsg: null,
  workouts: [],
  sets: [],
  active: null, // { workout, sets } : séance en cours
  draft: null,
  ui: { sheet: null, fallback: null },
  starting: null,
  finish: { difficulty: null, note: '' },
  detailId: null,
  lastBackup: null,
  dataOrigin: null,
  hasSafetyCopy: false,
  restore: null,
  backupMsg: null,
  toast: null,
  inputError: null,
};
let registration = null;
let updateRequested = false;
const FULLSCREEN = new Set(['workout', 'start', 'finish']);

function render() {
  const main = $('#main');
  const views = {
    today: renderToday, program: renderProgram, history: renderHistory, progress: renderProgress, data: renderData,
    start: renderStart, workout: renderWorkout, finish: renderFinish, detail: renderWorkoutDetail,
  };
  if (FULLSCREEN.has(state.tab) && state.tab !== 'start' && !state.active) state.tab = 'today';
  main.innerHTML = views[state.tab](state);
  document.body.classList.toggle('in-workout', FULLSCREEN.has(state.tab));
  const navTab = { program: 'today', detail: 'history' }[state.tab] || state.tab;
  $('#nav').innerHTML = renderNav(navTab);
  $('#banners').innerHTML = renderBanners(state);
  tick();
}

function go(tab) {
  state.tab = tab;
  state.startMsg = null;
  state.backupMsg = null;
  state.inputError = null;
  if (tab !== 'today') state.toast = null;
  render();
  window.scrollTo(0, 0);
  updateWakeLock();
}

function fatal(messages) {
  $('#main').innerHTML = `<header class="page-head"><h1>Problème de chargement</h1></header>
    <div class="msg-err">${messages.map(esc).join('<br>')}</div>
    <p class="muted">Rechargez la page. Si le problème persiste, notez ce message pour le signaler.</p>`;
}

function applyStart() {
  state.program = effectiveProgram(state.fileProgram, state.startOverride);
}

async function loadRecords() {
  const [workouts, sets] = await Promise.all([getAll('workouts'), getAll('sets')]);
  state.workouts = workouts;
  state.sets = sets;
  const w = workouts.filter((x) => x.status === 'in-progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  state.active = w ? { workout: w, sets: sets.filter((s) => s.workoutId === w.id) } : null;
  state.lastBackup = (await getMeta('last-backup')) || null;
  state.dataOrigin = (await getMeta('data-origin')) || null;
  state.hasSafetyCopy = !!(await getMeta('restore-safety'));
}

async function loadData() {
  const [progFile, lib] = await Promise.all([
    fetch('./programme-cycle-1.json').then((r) => r.json()),
    fetch('./exercises.json').then((r) => r.json()),
  ]);
  const libErrors = validateLibrary(lib);
  const progCheck = validateProgram(progFile, lib);
  if (libErrors.length || !progCheck.ok) throw Object.assign(new Error('invalid'), { messages: [...libErrors, ...progCheck.errors] });
  state.lib = lib;
  state.fileProgram = progFile.program;
  try {
    state.startOverride = await getMeta(START_KEY);
    await loadRecords();
  } catch (e) {
    state.startOverride = undefined;
    state.storageError = e.message;
  }
  applyStart();
  const info = cycleInfo(state.program, state.today);
  state.view.week = info.status === 'during' ? info.week : 1;
}

async function saveStart(result, okText) {
  if (!result.ok) {
    state.startMsg = { ok: false, text: result.errors.join(' '), suggestion: result.suggestion || null };
    render();
    return;
  }
  try {
    await setMeta(START_KEY, result.override);
    state.startOverride = result.override;
    applyStart();
    const info = cycleInfo(state.program, state.today);
    state.view.week = info.status === 'during' ? info.week : 1;
    state.startMsg = { ok: true, text: okText };
  } catch (e) {
    state.startMsg = { ok: false, text: `Enregistrement impossible : ${e.message}` };
  }
  render();
}

// ---- Séance ----

const nowIso = () => new Date().toISOString();

async function persistWorkout() {
  state.active.workout.updatedAt = nowIso();
  await putRecord('workouts', state.active.workout);
}

async function startWorkout() {
  const w = createWorkout(state.program, state.starting.sessionId, { date: state.today, fatigue: state.starting.fatigue ?? null });
  await putRecord('workouts', w);
  state.workouts.push(w);
  state.active = { workout: w, sets: [] };
  state.draft = null;
  state.ui = { sheet: null, fallback: null };
  state.starting = null;
  go('workout');
}

function readDraftInputs() {
  const load = $('#in-load');
  const reps = $('#in-reps');
  if (load) {
    const v = load.value.trim().replace(',', '.');
    state.draft.loadKg = v === '' ? null : Number(v);
  }
  if (reps) {
    const v = reps.value.trim();
    state.draft.reps = v === '' ? null : Number(v);
  }
}

let audioCtx = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* son indisponible : sans importance */ }
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

async function validateSet() {
  unlockAudio();
  readDraftInputs();
  const { plan, item, todaySets } = currentContext(state);
  const d = state.draft;
  const mode = loadMode(item, item.increment);
  if (mode === 'external' && (d.loadKg === null || !Number.isFinite(d.loadKg) || d.loadKg < 0 || d.loadKg > 500)) {
    state.inputError = 'Indiquez la charge utilisée (0 à 500 kg).';
    render();
    return;
  }
  if (d.reps === null || !Number.isInteger(d.reps) || d.reps < 0 || d.reps > 100) {
    state.inputError = 'Indiquez un nombre de répétitions (0 à 100).';
    render();
    return;
  }
  state.inputError = null;
  const now = nowIso();
  const set = {
    id: newId('s'),
    workoutId: state.active.workout.id,
    slotId: item.slotId,
    exercise: item.exercise,
    index: todaySets.length + 1,
    loadKg: mode === 'none' ? null : (Number.isFinite(d.loadKg) ? d.loadKg : 0),
    reps: d.reps,
    rir: item.rir ? d.rir : null,
    perSide: !!item.perSide,
    kind: 'work',
    doneAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const sets = [...state.active.sets, set];
  const next = afterSet(plan, sets, item.slotId);
  const offer = fallbackOffer(item, sets, set.reps);
  const w = state.active.workout;
  w.currentSlot = offer ? item.slotId : (next.next || item.slotId);
  w.restTotalSec = next.restSec || null;
  w.restEndsAt = next.restSec ? Date.now() + next.restSec * 1000 : null;
  w.updatedAt = now;
  try {
    await saveSetAndWorkout(set, w);
  } catch (e) {
    state.inputError = `Série non enregistrée : ${e.message}`;
    render();
    return;
  }
  state.active.sets = sets;
  state.sets.push(set);
  restSignaled = false;
  state.ui.fallback = offer;
  state.draft = null;
  if (next.reason === 'finished' && !offer) {
    state.finish = { difficulty: null, note: '' };
    go('finish');
    return;
  }
  render();
  window.scrollTo(0, 0);
}

async function changeSlot(slotId) {
  state.active.workout.currentSlot = slotId;
  state.ui.sheet = null;
  state.draft = null;
  state.inputError = null;
  await persistWorkout();
  render();
  window.scrollTo(0, 0);
}

async function swapExercise(exerciseId, kind) {
  const w = state.active.workout;
  const slotId = w.currentSlot;
  const plan = workoutPlan(state.program, w);
  const item = plan.find((x) => x.slotId === slotId);
  w.swaps = { ...(w.swaps || {}) };
  if (exerciseId === item.planned) delete w.swaps[slotId];
  else w.swaps[slotId] = { exercise: exerciseId, kind, fromSet: slotSets(state.active.sets, slotId).length + 1 };
  state.ui = { sheet: null, fallback: null };
  state.draft = null;
  await persistWorkout();
  render();
}

async function removeSet(id) {
  if (!window.confirm('Supprimer cette série ?')) return;
  const set = state.active.sets.find((s) => s.id === id);
  if (!set) return;
  const w = state.active.workout;
  w.currentSlot = set.slotId;
  w.restEndsAt = null;
  w.updatedAt = nowIso();
  // Renumérotation des séries suivantes du même exercice.
  const others = state.active.sets.filter((s) => s.slotId === set.slotId && s.index > set.index);
  await deleteSet(id, w);
  for (const s of others) {
    s.index -= 1;
    s.updatedAt = nowIso();
    await putRecord('sets', s);
  }
  state.active.sets = state.active.sets.filter((s) => s.id !== id);
  state.sets = state.sets.filter((s) => s.id !== id);
  state.draft = null;
  render();
}

async function saveWorkout(status) {
  const w = state.active.workout;
  const note = $('#finish-note');
  w.status = status;
  w.endedAt = nowIso();
  w.difficulty = state.finish.difficulty;
  w.note = note ? note.value.trim().slice(0, 1000) : '';
  w.restEndsAt = null;
  w.updatedAt = w.endedAt;
  await putRecord('workouts', w);
  state.active = null;
  state.toast = status === 'done' ? 'Séance enregistrée. Bravo.' : 'Séance abandonnée (gardée dans l\'historique).';
  go('today');
}

// ---- Chronomètre et durée (mise à jour sans redessiner la page) ----

let restSignaled = false;
function tick() {
  const w = state.active && state.active.workout;
  const el = $('#elapsed');
  if (el && w) {
    const sec = Math.max(0, Math.floor((Date.now() - Date.parse(w.startedAt)) / 1000));
    el.textContent = `${Math.floor(sec / 60)} min`;
  }
  if (!w || state.tab !== 'workout') return;
  const left = restLeft(w);
  const time = $('#rest-time');
  if (left === null) return;
  if (time) {
    time.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const fill = $('#rest-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, (left / (w.restTotalSec || 1)) * 100))}%`;
  }
  if (left === 0 && !restSignaled) {
    restSignaled = true;
    beep();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = renderRestBar(w);
  }
}
setInterval(tick, 500);

let wakeLock = null;
async function updateWakeLock() {
  try {
    if (state.tab === 'workout' && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; /* non pris en charge : l'écran se mettra en veille normalement */ }
}

// ---- Sauvegarde et restauration ----

async function doBackup() {
  try {
    const all = await readEverything();
    const backup = buildBackup({ ...all, appVersion: APP_VERSION });
    const text = JSON.stringify(backup, null, 1);
    const name = backupFileName();
    const file = new File([text], name, { type: 'application/json' });
    let shared = false;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        shared = true;
      } catch (e) {
        if (e && e.name === 'AbortError') {
          state.backupMsg = { ok: false, text: 'Sauvegarde annulée : aucun fichier enregistré.' };
          render();
          return;
        }
      }
    }
    if (!shared) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    const info = { at: nowIso(), fileName: name, workouts: backup.counts.workouts, sets: backup.counts.sets };
    await setMeta('last-backup', info);
    state.lastBackup = info;
    state.backupMsg = { ok: true, text: `Fichier « ${name} » créé (${backup.counts.workouts} séances, ${backup.counts.sets} séries).` };
  } catch (e) {
    state.backupMsg = { ok: false, text: `Sauvegarde impossible : ${e.message}` };
  }
  if (state.tab !== 'data') state.toast = state.backupMsg.text;
  render();
}

async function onRestoreFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    state.restore = { errors: ['Fichier trop volumineux (plus de 10 Mo).'] };
    render();
    return;
  }
  const text = await file.text();
  const check = checkBackup(text, { today: state.today });
  state.restore = check.ok ? { preview: check.preview, backup: check.backup, lost: lostByRestore(state.workouts, check.backup) } : { errors: check.errors };
  render();
}

async function confirmRestore() {
  const r = state.restore;
  if (!r || !r.backup) return;
  try {
    const current = await readEverything();
    const safety = buildBackup({ ...current, appVersion: APP_VERSION });
    await setMeta('restore-safety', { at: nowIso(), backup: safety });
    const metaRows = r.backup.data.meta.map((m) => ({ ...m, updatedAt: m.updatedAt || nowIso() }));
    await replaceAll({ workouts: r.backup.data.workouts, sets: r.backup.data.sets, meta: metaRows }, { keepMeta: LOCAL_META });
    await setMeta('data-origin', { type: 'restored', at: nowIso(), backupCreatedAt: r.backup.createdAt });
    await reloadAll();
    state.restore = null;
    state.backupMsg = { ok: true, text: `Restauration terminée : ${r.preview.workouts} séances, ${r.preview.sets} séries.` };
  } catch (e) {
    state.backupMsg = { ok: false, text: `Restauration impossible, rien n'a été modifié : ${e.message}` };
  }
  render();
}

async function undoRestore() {
  if (!window.confirm('Remettre les données telles qu\'elles étaient avant la dernière restauration ?')) return;
  try {
    const safe = await getMeta('restore-safety');
    if (!safe) return;
    const b = safe.backup;
    await replaceAll({ workouts: b.data.workouts, sets: b.data.sets, meta: b.data.meta }, { keepMeta: LOCAL_META });
    await setMeta('restore-safety', null);
    await setMeta('data-origin', { type: 'local', at: nowIso() });
    await reloadAll();
    state.backupMsg = { ok: true, text: 'Dernière restauration annulée : données d\'avant remises en place.' };
  } catch (e) {
    state.backupMsg = { ok: false, text: `Annulation impossible : ${e.message}` };
  }
  render();
}

async function reloadAll() {
  state.startOverride = await getMeta(START_KEY);
  applyStart();
  await loadRecords();
  state.draft = null;
}

// ---- Événements ----

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.action;
  const v = el.dataset.value;
  if (a === 'go') {
    go(el.dataset.tab);
  } else if (a === 'open-program') {
    state.view = { session: el.dataset.session, week: Number(el.dataset.week) };
    go('program');
  } else if (a === 'pick-session') {
    state.view.session = v;
    render();
  } else if (a === 'pick-week') {
    state.view.week = Number(v);
    render();
  } else if (a === 'check-update') {
    checkForUpdate(true);
  } else if (a === 'apply-update') {
    applyUpdate();
  } else if (a === 'reset-start') {
    saveStart(resetStartDate(state.startOverride, state.fileProgram), 'Date de début remise à celle du programme.');
  } else if (a === 'use-suggestion') {
    saveStart(applyStartDateChange(state.startOverride, state.fileProgram, v, { today: state.today }), 'Date de début enregistrée.');
  } else if (a === 'start-session') {
    if (state.active) { go('workout'); return; }
    state.starting = { sessionId: el.dataset.session, fatigue: null };
    go('start');
  } else if (a === 'pick-fatigue') {
    state.starting.fatigue = state.starting.fatigue === Number(v) ? null : Number(v);
    render();
  } else if (a === 'confirm-start') {
    unlockAudio();
    startWorkout();
  } else if (a === 'resume') {
    go('workout');
  } else if (a === 'step-load' || a === 'step-reps') {
    readDraftInputs();
    const { item } = currentContext(state);
    const dir = Number(el.dataset.dir);
    if (a === 'step-load') {
      const step = loadStep(item.increment) || 1;
      state.draft.loadKg = Math.max(0, Math.round(((state.draft.loadKg || 0) + dir * step) * 100) / 100);
    } else {
      state.draft.reps = Math.max(0, (state.draft.reps || 0) + dir);
    }
    render();
  } else if (a === 'pick-rir') {
    readDraftInputs();
    state.draft.rir = Number(v);
    render();
  } else if (a === 'pick-option') {
    readDraftInputs();
    const { suggestion } = currentContext(state);
    const o = suggestion.options[Number(v)];
    Object.assign(state.draft, { option: Number(v), loadKg: o.load, reps: o.reps });
    render();
  } else if (a === 'validate-set') {
    validateSet();
  } else if (a === 'goto-slot') {
    changeSlot(v);
  } else if (a === 'open-sheet') {
    state.ui.sheet = v;
    render();
  } else if (a === 'close-sheet') {
    state.ui.sheet = null;
    render();
  } else if (a === 'swap-exercise') {
    swapExercise(v, 'alternative');
  } else if (a === 'accept-fallback') {
    swapExercise(v, 'fallback');
  } else if (a === 'refuse-fallback') {
    state.ui.fallback = null;
    render();
  } else if (a === 'extra-set') {
    // Une série de plus que prévu, gardée dans la séance.
    const w = state.active.workout;
    w.extraSets = { ...(w.extraSets || {}), [w.currentSlot]: ((w.extraSets || {})[w.currentSlot] || 0) + 1 };
    state.draft = null;
    await persistWorkout();
    render();
  } else if (a === 'delete-set') {
    removeSet(el.dataset.id);
  } else if (a === 'rest-adjust') {
    const w = state.active.workout;
    if (w.restEndsAt) {
      w.restEndsAt = Math.max(Date.now(), w.restEndsAt + Number(v) * 1000);
      w.restTotalSec = Math.max(1, (w.restTotalSec || 0) + Number(v));
      restSignaled = false;
      await persistWorkout();
      const dock = $('#rest-dock');
      if (dock) dock.innerHTML = renderRestBar(w);
    }
  } else if (a === 'rest-skip') {
    state.active.workout.restEndsAt = null;
    await persistWorkout();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = '';
  } else if (a === 'finish') {
    state.finish = { difficulty: null, note: '' };
    go('finish');
  } else if (a === 'pick-difficulty') {
    const note = $('#finish-note');
    if (note) state.finish.note = note.value;
    state.finish.difficulty = state.finish.difficulty === Number(v) ? null : Number(v);
    render();
  } else if (a === 'save-workout') {
    saveWorkout('done');
  } else if (a === 'abandon-workout') {
    if (window.confirm('Abandonner cette séance ? Les séries faites restent dans l\'historique, sans compter pour les suggestions.')) saveWorkout('abandoned');
  } else if (a === 'open-workout') {
    state.detailId = el.dataset.id;
    go('detail');
  } else if (a === 'delete-workout') {
    if (!window.confirm('Supprimer définitivement cette séance et toutes ses séries ?')) return;
    await deleteWorkout(el.dataset.id);
    await loadRecords();
    go('history');
  } else if (a === 'backup') {
    doBackup();
  } else if (a === 'restore-cancel') {
    state.restore = null;
    render();
  } else if (a === 'restore-confirm') {
    confirmRestore();
  } else if (a === 'undo-restore') {
    undoRestore();
  }
});

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'restore-input') onRestoreFile(ev.target);
});

document.addEventListener('focusin', (ev) => {
  // Sélectionne le contenu pour le remplacer d'un geste.
  if (ev.target.classList && ev.target.classList.contains('step-input')) setTimeout(() => ev.target.select(), 0);
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form="start-date"]');
  if (!form) return;
  ev.preventDefault();
  const value = new FormData(form).get('start');
  saveStart(applyStartDateChange(state.startOverride, state.fileProgram, String(value), { today: state.today }), 'Date de début enregistrée.');
});

// ---- Service worker : hors ligne et mises à jour ----

function askOfflineStatus() {
  const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!ctrl) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => {
    state.sw.offline = e.data;
    if (state.tab === 'data') render();
  };
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
  try {
    await registration.update();
  } catch { /* hors ligne : pas de vérification possible */ }
  state.sw.checking = false;
  state.sw.lastCheck = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (registration.waiting && navigator.serviceWorker.controller) state.sw.updateReady = true;
  // Pas de redessin pendant une saisie : seul le bandeau change.
  if (manual || state.tab === 'data') render();
  else $('#banners').innerHTML = renderBanners(state);
}

function applyUpdate() {
  const waiting = registration && registration.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  updateRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function initServiceWorker() {
  if (!state.sw.supported) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) {
    state.sw.supported = false;
    render();
    return;
  }
  if (registration.waiting && navigator.serviceWorker.controller) state.sw.updateReady = true;
  if (registration.installing) watchWorker(registration.installing);
  registration.addEventListener('updatefound', () => watchWorker(registration.installing));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Rechargement seulement après « Mettre à jour », jamais à la première installation.
    if (!updateRequested) return;
    updateRequested = false;
    window.location.reload();
  });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', askOfflineStatus, { once: true });
  }
  askOfflineStatus();
  $('#banners').innerHTML = renderBanners(state);
}

document.addEventListener('visibilitychange', () => {
  updateWakeLock();
  if (document.visibilityState !== 'visible') return;
  const now = todayLocal();
  if (now !== state.today) {
    state.today = now;
    if (!FULLSCREEN.has(state.tab)) render();
  }
  tick();
  checkForUpdate(false);
});

async function start() {
  try {
    await loadData();
  } catch (e) {
    fatal(e.messages || ['Impossible de lire le programme. Vérifiez la connexion pour la première ouverture.']);
    return;
  }
  render();
  initServiceWorker();
  state.storage = await storageStatus();
  if (state.tab === 'data') render();
}

start();
