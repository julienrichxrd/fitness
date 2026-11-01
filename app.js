// Point d'entrée : chargement, navigation, séance en cours, sauvegarde, service worker.
import { validateProgram, validateLibrary } from './program.js';
import { todayLocal, effectiveProgram, cycleInfo } from './dates.js';
import { applyStartDateChange, resetStartDate, START_KEY } from './settings.js';
import { getMeta, setMeta, storageStatus, getAll, putRecord, saveSetAndWorkout, deleteSet, deleteWorkout, readEverything, replaceAll } from './storage.js';
import { renderHome, renderSession, renderExercise, renderFinish, renderHistory, renderSettings, renderBanners, renderRest, exerciseContext, esc } from './screens.js';
import { createWorkout, workoutPlan, afterSet, fallbackOffer, restLeft, newId, slotSets } from './workout.js';
import { loadStep, loadMode } from './suggest.js';
import { buildBackup, backupFileName, checkBackup, lostByRestore, LOCAL_META } from './backup.js';
import { buildCalendar } from './cycle.js';
import { APP_VERSION } from './version.js';
import { mountAnimations } from './anim.js';

const $ = (sel) => document.querySelector(sel);
const state = {
  tab: 'home',
  today: todayLocal(),
  appVersion: APP_VERSION,
  sw: { supported: 'serviceWorker' in navigator, updateReady: false, checking: false, offline: null },
  standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  workouts: [], sets: [], entries: [], settings: {},
  active: null, draft: null, ui: { sheet: null, fallback: null },
  lastBackup: null, hasSafetyCopy: false, restore: null, backupMsg: null, toast: null, inputError: null,
};
let registration = null;
let updateRequested = false;
const nowIso = () => new Date().toISOString();
const VIEWS = { home: renderHome, session: renderSession, exercise: renderExercise, finish: renderFinish, history: renderHistory, settings: renderSettings };

function render() {
  if (['session', 'exercise', 'finish'].includes(state.tab) && !state.active) state.tab = 'home';
  $('#main').innerHTML = VIEWS[state.tab](state);
  $('#banners').innerHTML = renderBanners(state);
  document.body.dataset.tab = state.tab;
  state.toast = null;
  mountAnimations($('#main'));
  tick();
}

function go(tab) {
  state.tab = tab;
  state.backupMsg = null;
  state.startMsg = null;
  state.inputError = null;
  state.ui.sheet = null;
  render();
  window.scrollTo(0, 0);
  updateWakeLock();
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

const planOf = (w) => workoutPlan(state.program, w, state.settings.increments);

async function persistWorkout() {
  state.active.workout.updatedAt = nowIso();
  await putRecord('workouts', state.active.workout);
}

async function startWorkout(sessionId) {
  unlockAudio();
  if (state.active) { go('session'); return; }
  const w = createWorkout(state.program, sessionId, { date: state.today });
  await putRecord('workouts', w);
  state.workouts.push(w);
  state.active = { workout: w, sets: [] };
  state.draft = null;
  state.ui = { sheet: null, fallback: null };
  go('session');
}

function readDraft() {
  const load = $('#in-load');
  const reps = $('#in-reps');
  if (load) { const v = load.value.trim().replace(',', '.'); state.draft.loadKg = v === '' ? null : Number(v); }
  if (reps) { const v = reps.value.trim(); state.draft.reps = v === '' ? null : Number(v); }
}

async function validateSet() {
  unlockAudio();
  readDraft();
  const { plan, item, todaySets } = exerciseContext(state);
  const d = state.draft;
  const mode = loadMode(item, item.increment);
  if (mode === 'external' && (d.loadKg === null || !Number.isFinite(d.loadKg) || d.loadKg < 0 || d.loadKg > 500)) {
    state.inputError = 'Indiquez le poids utilisé.';
    render();
    return;
  }
  if (d.reps === null || !Number.isInteger(d.reps) || d.reps < 0 || d.reps > 100) {
    state.inputError = 'Indiquez le nombre de répétitions.';
    render();
    return;
  }
  state.inputError = null;
  const now = nowIso();
  const set = {
    id: newId('s'), workoutId: state.active.workout.id, slotId: item.slotId, exercise: item.exercise, index: todaySets.length + 1,
    loadKg: mode === 'none' ? null : (Number.isFinite(d.loadKg) ? d.loadKg : 0), reps: d.reps, rir: item.rir ? d.rir : null,
    perSide: !!item.perSide, kind: 'work', doneAt: now, createdAt: now, updatedAt: now,
  };
  const sets = [...state.active.sets, set];
  const next = afterSet(plan, sets, item.slotId);
  const offer = fallbackOffer(item, sets, set.reps);
  const w = state.active.workout;
  // On reste sur l'exercice terminé (écran « Exercice terminé ») sauf dans une supersérie, qui s'enchaîne seule.
  const stay = offer || next.reason === 'next-exercise' || next.reason === 'finished';
  w.currentSlot = stay ? item.slotId : next.next;
  w.restTotalSec = next.restSec || null;
  w.restEndsAt = next.restSec ? Date.now() + next.restSec * 1000 : null;
  w.nextSlot = next.next;
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
  if (next.reason === 'finished' && !offer) { go('finish'); return; }
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openSlot(slotId) {
  state.active.workout.currentSlot = slotId;
  state.draft = null;
  state.inputError = null;
  state.ui = { sheet: null, fallback: null };
  await persistWorkout();
  go('exercise');
}

async function swapExercise(exerciseId, kind) {
  const w = state.active.workout;
  const slotId = w.currentSlot;
  const item = planOf(w).find((x) => x.slotId === slotId);
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
  const set = state.sets.find((s) => s.id === id);
  if (!set) return;
  const w = state.active.workout;
  w.currentSlot = set.slotId;
  w.restEndsAt = null;
  await deleteSet(id, w);
  state.sets = state.sets.filter((s) => s.id !== id);
  const rest = state.sets.filter((s) => s.workoutId === w.id && s.slotId === set.slotId).sort((a, b) => a.index - b.index);
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].index !== i + 1) { rest[i].index = i + 1; await putRecord('sets', rest[i]); }
  }
  state.active.sets = state.sets.filter((s) => s.workoutId === w.id);
  state.draft = null;
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
  state.toast = status === 'done' ? 'Séance enregistrée. Bien joué.' : 'Séance abandonnée.';
  go('home');
}

// ---------- Chronomètre de repos (sans redessiner la page) ----------

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
  if (!w) return;
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
    if (['session', 'exercise'].includes(state.tab) && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
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
  if (state.tab !== 'settings') state.toast = state.backupMsg.text;
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
    state.startMsg = { ok: true, text: okText };
  }
  render();
}

// ---------- Actions ----------

const ACTIONS = {
  go: (el) => go(el.dataset.tab),
  start: (el) => startWorkout(el.dataset.session),
  resume: () => go('session'),
  'open-slot': (el) => openSlot(el.dataset.value),
  'next-exercise': () => {
    const w = state.active.workout;
    const plan = planOf(w);
    const nx = plan.find((x, i) => i > plan.findIndex((y) => y.slotId === w.currentSlot) && slotSets(state.active.sets, x.slotId).length < x.sets)
      || plan.find((x) => slotSets(state.active.sets, x.slotId).length < x.sets);
    if (nx) openSlot(nx.slotId); else go('finish');
  },
  'step-load': (el) => {
    readDraft();
    const { item } = exerciseContext(state);
    const step = loadStep(item.increment) || 1;
    state.draft.loadKg = Math.max(0, Math.round(((state.draft.loadKg || 0) + Number(el.dataset.dir) * step) * 100) / 100);
    render();
  },
  'step-reps': (el) => { readDraft(); state.draft.reps = Math.max(0, (state.draft.reps || 0) + Number(el.dataset.dir)); render(); },
  'pick-rir': (el) => { readDraft(); state.draft.rir = Number(el.dataset.value); render(); },
  'pick-option': (el) => {
    readDraft();
    const { suggestion } = exerciseContext(state);
    const o = suggestion.options[Number(el.dataset.value)];
    Object.assign(state.draft, { option: Number(el.dataset.value), loadKg: o.load, reps: o.reps });
    render();
  },
  'validate-set': () => validateSet(),
  'delete-set': (el) => removeSet(el.dataset.id),
  'extra-set': async () => {
    const w = state.active.workout;
    w.extraSets = { ...(w.extraSets || {}), [w.currentSlot]: ((w.extraSets || {})[w.currentSlot] || 0) + 1 };
    state.draft = null;
    await persistWorkout();
    render();
  },
  'swap-open': () => { state.ui.sheet = 'swap'; render(); },
  'swap-close': () => { state.ui.sheet = null; render(); },
  swap: (el) => swapExercise(el.dataset.value, 'alternative'),
  'accept-fallback': (el) => swapExercise(el.dataset.value, 'fallback'),
  'refuse-fallback': () => { state.ui.fallback = null; render(); },
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
  finish: () => go('finish'),
  'save-workout': () => saveWorkout('done'),
  'abandon-workout': () => { if (window.confirm('Abandonner cette séance ? Les séries faites seront effacées.')) saveWorkout('abandoned'); },
  'toggle-history': (el) => { state.historyOpen = state.historyOpen === el.dataset.value ? null : el.dataset.value; render(); },
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
  if (!el || (el.tagName === 'INPUT')) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  try { await fn(el, ev); } catch (e) { console.error(e); window.alert(`Action impossible : ${e.message}`); }
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-form="start-date"]');
  if (!form) return;
  ev.preventDefault();
  saveStart(applyStartDateChange(state.startOverride, state.fileProgram, String(new FormData(form).get('start')), { today: state.today }), 'Date enregistrée.');
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

document.addEventListener('focusin', (ev) => {
  if (ev.target.classList && ev.target.classList.contains('step-input')) setTimeout(() => { try { ev.target.select(); } catch { /* ignoré */ } }, 0);
});

// ---------- Service worker ----------

function askOfflineStatus() {
  const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
  if (!ctrl) return;
  const ch = new MessageChannel();
  ch.port1.onmessage = (e) => { state.sw.offline = e.data; if (state.tab === 'settings') render(); };
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
  if (now !== state.today) { state.today = now; if (state.tab === 'home') render(); }
  tick();
  checkForUpdate(false);
});

async function start() {
  try {
    await loadData();
  } catch (e) {
    $('#main').innerHTML = `<h1 class="h1">Problème de chargement</h1><div class="err">${(e.messages || ['Impossible de lire le programme. Vérifiez la connexion pour la première ouverture.']).map(esc).join('<br>')}</div>`;
    return;
  }
  if (state.active) state.tab = 'session';
  render();
  initServiceWorker();
  storageStatus().catch(() => null);
  if (cycleInfo(state.program, state.today).status === 'during') { /* rien de plus à préparer */ }
}

start();
