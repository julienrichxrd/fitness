// Point d'entrée : chargement, navigation, actions de l'utilisateur, stockage, service worker.
// Les écrans sont des fonctions pures (fichiers *-views.js) ; ce fichier les relie aux données.
import { validateProgram, validateLibrary } from './program.js';
import { todayLocal, effectiveProgram, addDays, cycleInfo } from './dates.js';
import { applyStartDateChange, resetStartDate, START_KEY } from './settings.js';
import { getMeta, setMeta, storageStatus, getAll, putRecord, deleteRecord, saveSetAndWorkout, deleteSet, deleteWorkout, readEverything, replaceAll } from './storage.js';
import { renderToday, renderProgram, renderNav, renderBanners, esc } from './views.js';
import { renderStart, renderWorkout, renderFinish, renderRestBar, currentContext } from './workout-views.js';
import { renderJournal, renderWorkoutDetail } from './history-views.js';
import { renderProgress, renderExercise, renderPhotos } from './progress-views.js';
import { renderNutrition, renderRecipes, renderRecipeEdit, renderFoodResults } from './nutrition-views.js';
import { renderMore, renderData, renderReviewExport, renderPrograms, renderSettings, renderGuide, renderWeekReview, renderOnboarding } from './more-views.js';
import { renderSheet } from './sheets.js';
import { createWorkout, workoutPlan, afterSet, fallbackOffer, restLeft, newId, slotSets } from './workout.js';
import { loadStep, loadMode } from './suggest.js';
import { buildBackup, backupFileName, checkBackup, lostByRestore, LOCAL_META } from './backup.js';
import { buildCalendar } from './cycle.js';
import { allFoods, searchFoods, nutrients, foodEntry, frequentItems, defaultMeal } from './nutrition.js';
import { parseActivityFile, parseDuration } from './endurance.js';
import { buildReviewExport, REVIEW_MESSAGE, setsCsv, bodyCsv, enduranceCsv, foodCsv } from './review.js';
import { activeProgramFile, checkProgramText, compareProgramFiles, addProgram, rollbackProgram } from './programs.js';
import { APP_VERSION } from './version.js';

const $ = (sel) => document.querySelector(sel);
const state = {
  tab: 'today',
  stack: [],
  view: { session: 'A', week: 1 },
  today: todayLocal(),
  appVersion: APP_VERSION,
  sw: { supported: 'serviceWorker' in navigator, updateReady: false, checking: false, lastCheck: null, offline: null },
  storage: null,
  standalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  startOverride: undefined,
  workouts: [], sets: [], entries: [], reviews: [], settings: {},
  photosMeta: [], photoUrls: {},
  active: null, draft: null, ui: { sheet: null, fallback: null },
  sheet: null, starting: null, finish: { difficulty: null, note: '' },
  lastBackup: null, dataOrigin: null, hasSafetyCopy: false, restore: null, backupMsg: null, backupPhotos: false,
  toast: null, inputError: null,
};
let registration = null;
let updateRequested = false;
const FULLSCREEN = new Set(['workout', 'start', 'finish', 'onboarding']);
const NAV_OF = { program: 'today', detail: 'journal', exercise: 'progress', photos: 'progress', recipes: 'nutrition', 'recipe-edit': 'nutrition', data: 'more', 'review-export': 'more', programs: 'more', settings: 'more', guide: 'more', review: 'today' };
const nowIso = () => new Date().toISOString();

// ---------- Rendu et navigation ----------

const VIEWS = {
  today: renderToday, program: renderProgram, journal: renderJournal, detail: renderWorkoutDetail, progress: renderProgress, exercise: renderExercise, photos: renderPhotos,
  nutrition: renderNutrition, recipes: renderRecipes, 'recipe-edit': renderRecipeEdit, more: renderMore, data: renderData, 'review-export': renderReviewExport,
  programs: renderPrograms, settings: renderSettings, guide: renderGuide, review: renderWeekReview, onboarding: renderOnboarding,
  start: renderStart, workout: renderWorkout, finish: renderFinish,
};

function render() {
  if ((state.tab === 'workout' || state.tab === 'finish') && !state.active) state.tab = 'today';
  $('#main').innerHTML = VIEWS[state.tab](state);
  document.body.classList.toggle('in-workout', FULLSCREEN.has(state.tab));
  $('#nav').innerHTML = renderNav(NAV_OF[state.tab] || state.tab);
  $('#banners').innerHTML = renderBanners(state);
  renderSheetOnly();
  showToast();
  tick();
}
let toastTimer = null;
function showToast() {
  const box = $('#toast');
  if (!box || !state.toast) return;
  box.innerHTML = `<div class="toast" role="status"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg><span>${esc(state.toast)}</span></div>`;
  state.toast = null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.innerHTML = ''; }, 3200);
}
function renderSheetOnly() {
  $('#sheet').innerHTML = renderSheet(state);
  document.body.classList.toggle('sheet-open', !!state.sheet);
}

const ROOT_TABS = new Set(['today', 'journal', 'progress', 'nutrition', 'more']);
function go(tab, { push = true } = {}) {
  if (push && tab !== state.tab && !ROOT_TABS.has(tab)) state.stack.push(state.tab);
  if (ROOT_TABS.has(tab)) state.stack = [];
  state.tab = tab;
  state.sheet = null;
  state.startMsg = null;
  state.backupMsg = null;
  state.inputError = null;
  render();
  window.scrollTo(0, 0);
  updateWakeLock();
}
function back() {
  const prev = state.stack.pop();
  go(prev || 'today', { push: false });
}
function toast(text, tab = 'today') {
  state.toast = text;
  go(tab);
}

// ---------- Chargement ----------

function rebuildProgram() {
  const file = activeProgramFile(state.bundledFile, state.programStore);
  state.fileProgram = file.program;
  const eff = effectiveProgram(state.fileProgram, state.startOverride);
  state.reviews = state.entries.filter((e) => e.kind === 'week-review' && e.programId === eff.id).sort((a, b) => a.calWeek - b.calWeek);
  state.program = { ...eff, calendar: buildCalendar(eff, state.reviews) };
}

async function loadPhotos() {
  try {
    const photos = await getAll('photos');
    Object.values(state.photoUrls).forEach((u) => URL.revokeObjectURL(u));
    state.photoUrls = {};
    state.photosMeta = photos.map((p) => ({ id: p.id, date: p.date, pose: p.pose })).sort((a, b) => a.date.localeCompare(b.date));
    photos.forEach((p) => { if (p.blob) state.photoUrls[p.id] = URL.createObjectURL(p.blob); });
  } catch { state.photosMeta = []; }
}

async function loadRecords() {
  const [workouts, sets, entries] = await Promise.all([getAll('workouts'), getAll('sets'), getAll('entries')]);
  state.workouts = workouts;
  state.sets = sets;
  state.entries = entries;
  const w = workouts.filter((x) => x.status === 'in-progress').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  state.active = w ? { workout: w, sets: sets.filter((s) => s.workoutId === w.id) } : null;
  state.lastBackup = (await getMeta('last-backup')) || null;
  state.dataOrigin = (await getMeta('data-origin')) || null;
  state.hasSafetyCopy = !!(await getMeta('restore-safety'));
  state.settings = (await getMeta('settings')) || {};
  state.programStore = (await getMeta('program-store')) || null;
  state.startOverride = await getMeta(START_KEY);
  rebuildProgram();
}

async function loadData() {
  const [progFile, lib, foodLib] = await Promise.all([
    fetch('./programme-cycle-1.json').then((r) => r.json()),
    fetch('./exercises.json').then((r) => r.json()),
    fetch('./foods.json').then((r) => r.json()),
  ]);
  const libErrors = validateLibrary(lib);
  const progCheck = validateProgram(progFile, lib);
  if (libErrors.length || !progCheck.ok) throw Object.assign(new Error('invalid'), { messages: [...libErrors, ...progCheck.errors] });
  state.lib = lib;
  state.foodLib = foodLib;
  state.bundledFile = progFile;
  state.fileProgram = progFile.program;
  try {
    await loadRecords();
    await loadPhotos();
  } catch (e) {
    state.storageError = e.message;
    rebuildProgram();
  }
  const info = cycleInfo(state.program, state.today);
  state.view.week = info.status === 'during' ? info.week : 1;
  let onboarded = true;
  try { onboarded = !!(await getMeta('onboarded')); } catch { /* stockage indisponible */ }
  if (!onboarded) { state.tab = 'onboarding'; state.onboardingStep = 0; }
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await setMeta('settings', state.settings);
}

async function saveEntry(entry) {
  const now = nowIso();
  const e = { ...entry, updatedAt: now, createdAt: entry.createdAt || now };
  await putRecord('entries', e);
  state.entries = [...state.entries.filter((x) => x.id !== e.id), e];
  if (e.kind === 'week-review') rebuildProgram();
  return e;
}

async function removeEntry(id) {
  await deleteRecord('entries', id);
  state.entries = state.entries.filter((x) => x.id !== id);
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
    rebuildProgram();
    state.startMsg = { ok: true, text: okText };
  } catch (e) {
    state.startMsg = { ok: false, text: `Enregistrement impossible : ${e.message}` };
  }
  render();
}

// ---------- Séance ----------

const planOf = (w) => workoutPlan(state.program, w, state.settings.increments);

async function persistWorkout() {
  state.active.workout.updatedAt = nowIso();
  await putRecord('workouts', state.active.workout);
}

async function startWorkout() {
  const st = state.starting;
  let date = state.today;
  if (st.backfill) {
    const input = $('#backfill-date');
    date = input && input.value ? input.value : st.date;
    if (date > state.today) date = state.today;
  }
  const w = createWorkout(state.program, st.sessionId, { date, fatigue: st.fatigue ?? null, backfill: !!st.backfill });
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
  } catch { /* son indisponible */ }
}
function beep() {
  if (state.settings.sound === false) return;
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
    id: newId('s'), workoutId: state.active.workout.id, slotId: item.slotId, exercise: item.exercise, index: todaySets.length + 1,
    loadKg: mode === 'none' ? null : (Number.isFinite(d.loadKg) ? d.loadKg : 0), reps: d.reps, rir: item.rir ? d.rir : null,
    perSide: !!item.perSide, kind: 'work', doneAt: now, createdAt: now, updatedAt: now,
  };
  const sets = [...state.active.sets, set];
  const next = afterSet(plan, sets, item.slotId);
  const offer = fallbackOffer(item, sets, set.reps);
  const w = state.active.workout;
  w.currentSlot = offer ? item.slotId : (next.next || item.slotId);
  const rest = w.backfill ? 0 : next.restSec;
  w.restTotalSec = rest || null;
  w.restEndsAt = rest ? Date.now() + rest * 1000 : null;
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
  const item = planOf(w).find((x) => x.slotId === slotId);
  w.swaps = { ...(w.swaps || {}) };
  if (exerciseId === item.planned) delete w.swaps[slotId];
  else w.swaps[slotId] = { exercise: exerciseId, kind, fromSet: slotSets(state.active.sets, slotId).length + 1 };
  state.ui = { sheet: null, fallback: null };
  state.draft = null;
  await persistWorkout();
  render();
}

async function renumber(slotId, workoutId) {
  const list = state.sets.filter((s) => s.workoutId === workoutId && s.slotId === slotId).sort((a, b) => a.index - b.index || a.doneAt.localeCompare(b.doneAt));
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].index !== i + 1) {
      list[i].index = i + 1;
      list[i].updatedAt = nowIso();
      await putRecord('sets', list[i]);
    }
  }
}

async function removeSet(id) {
  if (!window.confirm('Supprimer cette série ?')) return;
  const set = state.sets.find((s) => s.id === id);
  if (!set) return;
  const isActive = state.active && state.active.workout.id === set.workoutId;
  if (isActive) {
    const w = state.active.workout;
    w.currentSlot = set.slotId;
    w.restEndsAt = null;
    w.updatedAt = nowIso();
    await deleteSet(id, w);
  } else {
    await deleteSet(id, null);
  }
  state.sets = state.sets.filter((s) => s.id !== id);
  await renumber(set.slotId, set.workoutId);
  if (isActive) state.active.sets = state.sets.filter((s) => s.workoutId === set.workoutId);
  state.draft = null;
  state.sheet = null;
  render();
}

async function saveWorkout(status) {
  const w = state.active.workout;
  const note = $('#finish-note');
  w.status = status;
  w.endedAt = w.backfill ? addMinutes(w.startedAt, 60) : nowIso();
  w.difficulty = state.finish.difficulty;
  w.note = note ? note.value.trim().slice(0, 1000) : '';
  w.restEndsAt = null;
  w.updatedAt = nowIso();
  await putRecord('workouts', w);
  state.active = null;
  toast(status === 'done' ? 'Séance enregistrée. Bien joué.' : 'Séance abandonnée, gardée dans le journal.');
}
const addMinutes = (iso, m) => new Date(Date.parse(iso) + m * 60000).toISOString();

// ---------- Chronomètre (mis à jour sans redessiner la page) ----------

let restSignaled = false;
function tick() {
  const w = state.active && state.active.workout;
  const el = $('#elapsed');
  if (el && w && !w.backfill) {
    const sec = Math.max(0, Math.floor((Date.now() - Date.parse(w.startedAt)) / 1000));
    el.textContent = `${Math.floor(sec / 60)} min`;
  }
  if (!w || state.tab !== 'workout' || w.backfill) return;
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
    if (dock) dock.innerHTML = renderRestBar(w);
  }
}
setInterval(tick, 500);

let wakeLock = null;
async function updateWakeLock() {
  try {
    if (state.tab === 'workout' && state.settings.wakeLock !== false && document.visibilityState === 'visible' && 'wakeLock' in navigator) {
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

// ---------- Fichiers : enregistrer, partager ----------

async function deliverFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
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

const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });

async function doBackup() {
  try {
    const all = await readEverything({ withPhotos: state.backupPhotos });
    const photos = state.backupPhotos ? await Promise.all((all.photos || []).map(async (p) => ({ id: p.id, date: p.date, pose: p.pose, dataUrl: await blobToDataUrl(p.blob) }))) : null;
    const backup = buildBackup({ ...all, photos, appVersion: APP_VERSION });
    const name = backupFileName();
    const ok = await deliverFile(name, JSON.stringify(backup), 'application/json');
    if (!ok) {
      state.backupMsg = { ok: false, text: 'Sauvegarde annulée : aucun fichier enregistré.' };
    } else {
      const info = { at: nowIso(), fileName: name, workouts: backup.counts.workouts, sets: backup.counts.sets };
      await setMeta('last-backup', info);
      state.lastBackup = info;
      state.backupMsg = { ok: true, text: `Fichier « ${name} » créé.` };
    }
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
    await setMeta('restore-safety', { at: nowIso(), backup: buildBackup({ ...current, appVersion: APP_VERSION }) });
    const photos = r.backup.data.photos ? await Promise.all(r.backup.data.photos.map(async (p) => ({ id: p.id, date: p.date, pose: p.pose, blob: await (await fetch(p.dataUrl)).blob() }))) : null;
    const metaRows = r.backup.data.meta.map((m) => ({ ...m, updatedAt: m.updatedAt || nowIso() }));
    await replaceAll({ workouts: r.backup.data.workouts, sets: r.backup.data.sets, entries: r.backup.data.entries || [], meta: metaRows, photos }, { keepMeta: LOCAL_META });
    await setMeta('data-origin', { type: 'restored', at: nowIso(), backupCreatedAt: r.backup.createdAt });
    await reloadAll();
    state.restore = null;
    state.backupMsg = { ok: true, text: `Restauration terminée : ${r.preview.workouts} séances, ${r.preview.entries} éléments du journal.` };
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
    await replaceAll({ workouts: b.data.workouts, sets: b.data.sets, entries: b.data.entries || [], meta: b.data.meta }, { keepMeta: LOCAL_META });
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
  await loadRecords();
  await loadPhotos();
  state.draft = null;
}

// ---------- Journal : feuilles de saisie ----------

const ENTRY_SHEET = { weight: 'weight', measure: 'measure', checkin: 'checkin', run: 'run', swim: 'swim', mobility: 'mobility' };

function openSheet(type, extra = {}) {
  const base = { date: state.today };
  let draft = { ...base };
  if (type === 'checkin') {
    const c = state.entries.find((e) => e.kind === 'checkin' && e.date === state.today);
    if (c) return openEntry(c.id);
  }
  if (type === 'weight') {
    const w = state.entries.find((e) => e.kind === 'weight' && e.date === state.today);
    if (w) return openEntry(w.id);
  }
  if (type === 'mobility') draft.variant = cycleInfo(state.program, state.today).dayKey === 'thursday' ? 'B' : 'A';
  if (type === 'food') draft = {};
  state.sheet = { type, draft, ...extra };
  renderSheetOnly();
  if (type === 'food') setTimeout(() => { const s = $('#food-search'); if (s) s.focus(); }, 60);
  return null;
}

function openEntry(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e) return;
  state.sheet = { type: ENTRY_SHEET[e.kind], editId: e.id, draft: { ...e } };
  renderSheetOnly();
}

const numOrNull = (v, int = false) => {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return int ? Math.round(n) : n;
};

function sheetError(text) {
  const sheet = $('#sheet .sheet');
  if (!sheet) return;
  let el = sheet.querySelector('.msg-err.form-err');
  if (!el) { el = document.createElement('div'); el.className = 'msg-err form-err'; el.setAttribute('role', 'alert'); sheet.querySelector('form').prepend(el); }
  el.textContent = text;
}

const FORMS = {
  async weight(fd) {
    const kg = numOrNull(fd.get('kg'));
    if (!(kg >= 30 && kg <= 300)) return sheetError('Indiquez un poids entre 30 et 300 kg.');
    const d = state.sheet.draft;
    await saveEntry({ ...d, id: state.sheet.editId || newId('e'), kind: 'weight', date: fd.get('date') || state.today, kg });
    return done('Pesée enregistrée.');
  },
  async measure(fd) {
    const vals = {};
    for (const k of ['waist', 'chest', 'arm', 'thigh']) {
      const n = numOrNull(fd.get(k));
      if (Number.isNaN(n) || (n !== null && !(n >= 10 && n <= 250))) return sheetError('Les mesures vont de 10 à 250 cm.');
      if (n !== null) vals[k] = n;
    }
    if (!Object.keys(vals).length) return sheetError('Indiquez au moins une mesure.');
    await saveEntry({ ...state.sheet.draft, ...vals, id: state.sheet.editId || newId('e'), kind: 'measure', date: fd.get('date') || state.today });
    return done('Mensurations enregistrées.');
  },
  async checkin(fd) {
    const d = state.sheet.draft;
    const sleepH = numOrNull(fd.get('sleepH'));
    if (Number.isNaN(sleepH) || (sleepH !== null && !(sleepH >= 0 && sleepH <= 24))) return sheetError('Heures de sommeil : entre 0 et 24.');
    const hr = numOrNull(fd.get('restingHr'), true);
    const steps = numOrNull(fd.get('steps'), true);
    await saveEntry({ ...d, id: state.sheet.editId || newId('e'), kind: 'checkin', date: fd.get('date') || d.date || state.today, sleepH, restingHr: hr >= 25 && hr <= 150 ? hr : null, steps: steps >= 0 && steps <= 100000 ? steps : null, pain: fd.get('pain') === 'on' });
    return done('Ressenti enregistré.');
  },
  async run(fd) {
    const d = state.sheet.draft;
    const sec = parseDuration(fd.get('duration'));
    if (!sec) return sheetError('Indiquez la durée, par exemple 42 ou 41:30.');
    const km = numOrNull(fd.get('km'));
    const hr = numOrNull(fd.get('avgHr'), true);
    await saveEntry({ ...d, id: state.sheet.editId || newId('e'), kind: 'run', date: fd.get('date') || state.today, durationSec: sec, distanceM: km ? Math.round(km * 1000) : null, avgHr: hr >= 25 && hr <= 250 ? hr : null, note: String(fd.get('note') || '').slice(0, 300), source: d.source || 'manual' });
    return done('Course enregistrée.');
  },
  async swim(fd) {
    const d = state.sheet.draft;
    const m = numOrNull(fd.get('distanceM'), true);
    const sec = parseDuration(fd.get('duration'));
    if (!m && !sec) return sheetError('Indiquez au moins la distance ou la durée.');
    const t400 = parseDuration(fd.get('test400'));
    const strokes = numOrNull(fd.get('strokes'), true);
    await saveEntry({ ...d, id: state.sheet.editId || newId('e'), kind: 'swim', date: fd.get('date') || state.today, distanceM: m || null, durationSec: sec || null, test400Sec: t400 || null, strokes: strokes || null, note: String(fd.get('note') || '').slice(0, 300), source: d.source || 'manual' });
    return done('Natation enregistrée.');
  },
  async mobility(fd) {
    const d = state.sheet.draft;
    await saveEntry({ ...d, id: state.sheet.editId || newId('e'), kind: 'mobility', date: fd.get('date') || state.today, variant: d.variant || 'A', minutes: numOrNull(fd.get('minutes'), true) || 30 });
    return done('Mobilité enregistrée.');
  },
  async 'set-edit'(fd) {
    const s = state.sets.find((x) => x.id === state.sheet.editId);
    const reps = numOrNull(fd.get('reps'), true);
    const load = numOrNull(fd.get('loadKg'));
    if (!(reps >= 0 && reps <= 100)) return sheetError('Répétitions : entre 0 et 100.');
    if (Number.isNaN(load) || (load !== null && !(load >= 0 && load <= 500))) return sheetError('Charge : entre 0 et 500 kg.');
    const next = { ...s, reps, loadKg: s.loadKg === null && load === null ? null : (load ?? 0), rir: s.rir === null || s.rir === undefined ? s.rir : state.sheet.draft.rir, updatedAt: nowIso() };
    await putRecord('sets', next);
    state.sets = state.sets.map((x) => (x.id === next.id ? next : x));
    if (state.active) state.active.sets = state.sets.filter((x) => x.workoutId === state.active.workout.id);
    state.sheet = null;
    render();
    return null;
  },
  async 'food-manual'(fd) {
    const kcal = numOrNull(fd.get('kcal'), true);
    if (!(kcal >= 0 && kcal <= 10000)) return sheetError('Indiquez les calories (0 à 10 000).');
    const manual = { name: String(fd.get('name') || '').trim().slice(0, 80) || 'Saisie libre', kcal, p: numOrNull(fd.get('p')) || 0, c: numOrNull(fd.get('c')) || 0, f: numOrNull(fd.get('f')) || 0 };
    const sh = state.sheet;
    const old = sh.editId ? state.entries.find((x) => x.id === sh.editId) : null;
    await saveEntry(foodEntry({ date: old ? old.date : state.foodDate || state.today, meal: sh.meal, manual, id: sh.editId || newId('f'), now: old ? old.createdAt : nowIso() }));
    state.sheet = null;
    render();
    return null;
  },
  async targets(fd) {
    const profile = { ...(state.settings.profile || {}), age: numOrNull(fd.get('age'), true) || 25, heightCm: numOrNull(fd.get('heightCm'), true) || 180, goal: fd.get('goal') || 'lean-gain' };
    const custom = fd.get('custom') === 'on';
    const t = custom ? { kcal: numOrNull(fd.get('kcal'), true), protein: numOrNull(fd.get('protein'), true), carbs: numOrNull(fd.get('carbs'), true), fat: numOrNull(fd.get('fat'), true) } : null;
    if (custom && !(t.kcal >= 1000 && t.kcal <= 6000)) return sheetError('Calories : entre 1 000 et 6 000.');
    await saveSettings({ profile, nutritionTargets: t });
    state.sheet = null;
    render();
    return null;
  },
  async 'custom-food'(fd) {
    const f = { id: newId('c'), name: String(fd.get('name') || '').trim().slice(0, 80), kcal: numOrNull(fd.get('kcal')), p: numOrNull(fd.get('p')), c: numOrNull(fd.get('c')), f: numOrNull(fd.get('f')) };
    if (!f.name || ![f.kcal, f.p, f.c, f.f].every((x) => x >= 0 && x <= 1000)) return sheetError('Nom et valeurs pour 100 g obligatoires.');
    const pg = numOrNull(fd.get('portionG'));
    if (pg > 0) f.portion = { label: String(fd.get('portionLabel') || '1 portion').slice(0, 40), g: pg };
    await saveSettings({ customFoods: [...(state.settings.customFoods || []), f] });
    state.sheet = null;
    state.toast = null;
    render();
    return null;
  },
  async increments(fd) {
    const inc = {};
    for (const [k, v] of fd.entries()) {
      const n = numOrNull(v);
      if (n > 0 && n <= 20) inc[k] = n;
    }
    await saveSettings({ increments: inc });
    state.settingsMsg = 'Crans de charge enregistrés.';
    render();
    return null;
  },
  async 'review-export'(fd) {
    const from = fd.get('from');
    const to = fd.get('to');
    if (!from || !to || from > to) { state.exportMsg = { ok: false, text: 'Choisissez une période valide.' }; render(); return null; }
    state.exportFrom = from;
    state.exportTo = to;
    const r = buildReviewExport({ program: state.program, lib: state.lib, workouts: state.workouts, sets: state.sets, entries: state.entries, reviews: state.reviews, settings: state.settings, from, to, appVersion: APP_VERSION });
    const ok = await deliverFile(`fitness-bilan-${state.program.id}-${to}.json`, JSON.stringify(r, null, 1), 'application/json');
    state.exportMsg = ok ? { ok: true, text: `Fichier de bilan créé : ${r.sessions.length} séances, ${r.body.weights.length} pesées, ${r.endurance.runs.length + r.endurance.swims.length} sorties d'endurance, ${r.nutrition.daysLogged} jours de nutrition.` } : { ok: false, text: 'Création annulée.' };
    render();
    return null;
  },
  async 'start-date'(fd) {
    await saveStart(applyStartDateChange(state.startOverride, state.fileProgram, String(fd.get('start')), { today: state.today }), 'Date de début enregistrée.');
    return null;
  },
};

function done(text) {
  state.sheet = null;
  state.toast = text;
  render();
  return null;
}

// ---------- Nutrition ----------

const foods = () => allFoods(state.foodLib, state.settings);

async function confirmFood() {
  const sh = state.sheet;
  const p = sh.pick;
  const old = sh.editId ? state.entries.find((x) => x.id === sh.editId) : null;
  const date = old ? old.date : state.foodDate || state.today;
  const id = sh.editId || newId('f');
  const now = old ? old.createdAt : nowIso();
  if (p.recipe) {
    const recipe = (state.settings.recipes || []).find((r) => r.id === p.recipeId);
    await saveEntry(foodEntry({ date, meal: sh.meal, recipe, portions: p.portions || 1, foods: foods(), id, now }));
  } else {
    const g = readGrams();
    if (!(g > 0 && g <= 5000)) { sheetFoodError('Indiquez une quantité en grammes.'); return; }
    await saveEntry(foodEntry({ date, meal: sh.meal, food: foods().find((f) => f.id === p.foodId), grams: g, id, now }));
  }
  state.sheet = null;
  render();
}
function readGrams() {
  const el = $('#food-grams');
  const n = el ? Number(el.value.replace(',', '.')) : state.sheet.pick.grams;
  return Number.isFinite(n) ? n : null;
}
function sheetFoodError(text) {
  const prev = $('#food-preview');
  if (prev) prev.insertAdjacentHTML('afterend', `<div class="msg-err">${esc(text)}</div>`);
}
function updateFoodPreview() {
  const sh = state.sheet;
  if (!sh || !sh.pick || sh.pick.recipe) return;
  const g = readGrams();
  sh.pick.grams = g;
  const f = foods().find((x) => x.id === sh.pick.foodId);
  const n = f && g ? nutrients(f, g) : { kcal: 0, p: 0, c: 0, f: 0 };
  const el = $('#food-preview');
  if (el) el.innerHTML = `<b>${Math.round(n.kcal)}</b> kcal<span>P ${String(n.p).replace('.', ',')} g · G ${String(n.c).replace('.', ',')} g · L ${String(n.f).replace('.', ',')} g</span>`;
}

// ---------- Photos ----------

async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('Image illisible.')); i.src = url; });
    const max = 1400;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addPhoto(input) {
  const file = input.files && input.files[0];
  const pose = input.dataset.photoPose;
  input.value = '';
  if (!file) return;
  try {
    const blob = await compressImage(file);
    const id = newId('p');
    await putRecord('photos', { id, date: state.today, pose, blob, createdAt: nowIso() });
    await saveEntry({ id: `pm-${id}`, kind: 'photo-meta', date: state.today, pose, photoId: id });
    await loadPhotos();
    render();
  } catch (e) {
    window.alert(`Photo non enregistrée : ${e.message}`);
  }
}

// ---------- Clics ----------

const ACTIONS = {
  go: (el) => go(el.dataset.tab),
  back: () => back(),
  'open-program': (el) => { state.view = { session: el.dataset.session, week: Number(el.dataset.week) }; go('program'); },
  'pick-session': (el) => { state.view.session = el.dataset.value; render(); },
  'pick-week': (el) => { state.view.week = Number(el.dataset.value); render(); },
  'check-update': () => checkForUpdate(true),
  'apply-update': () => applyUpdate(),
  'reset-start': () => saveStart(resetStartDate(state.startOverride, state.fileProgram), 'Date de début remise à celle du programme.'),
  'use-suggestion': (el) => saveStart(applyStartDateChange(state.startOverride, state.fileProgram, el.dataset.value, { today: state.today }), 'Date de début enregistrée.'),
  guide: (el) => { state.sheet = { type: 'guide', key: el.dataset.value }; renderSheetOnly(); },
  sheet: (el) => {
    if (el.dataset.value === 'backfill' || el.dataset.value === 'add' || el.dataset.value === 'import') { state.sheet = { type: el.dataset.value, kind: el.dataset.kind }; renderSheetOnly(); return; }
    openSheet(el.dataset.value);
  },
  'close-sheet': () => { if (state.ui.sheet) { state.ui.sheet = null; render(); } else { state.sheet = null; renderSheetOnly(); } },
  'draft-pick': (el) => {
    const name = el.dataset.name;
    const v = /^\d+$/.test(el.dataset.value) ? Number(el.dataset.value) : el.dataset.value;
    // Garde ce qui a été tapé dans les champs avant de redessiner la feuille.
    const form = $('#sheet form');
    const typed = form ? Object.fromEntries(new FormData(form).entries()) : {};
    state.sheet.draft[name] = state.sheet.draft[name] === v && name !== 'variant' ? null : v;
    renderSheetOnly();
    const f2 = $('#sheet form');
    if (f2) Object.entries(typed).forEach(([k, val]) => { const inp = f2.elements[k]; if (inp && inp.type !== 'checkbox') inp.value = val; else if (inp) inp.checked = val === 'on'; });
  },
  'edit-entry': (el) => openEntry(el.dataset.id),
  'entry-delete': async (el) => { if (!window.confirm('Supprimer cet élément du journal ?')) return; await removeEntry(el.dataset.id); state.sheet = null; render(); },
  'log-mobility': async (el) => { await saveEntry({ id: newId('e'), kind: 'mobility', date: state.today, variant: el.dataset.value, minutes: 30 }); state.toast = 'Mobilité notée.'; render(); },
  'journal-filter': (el) => { state.journalFilter = el.dataset.value; render(); },
  'open-photos': () => go('photos'),
  'photo-menu': async (el) => {
    if (!window.confirm('Supprimer cette photo ?')) return;
    await deleteRecord('photos', el.dataset.id);
    await removeEntry(`pm-${el.dataset.id}`);
    await loadPhotos();
    render();
  },
  'progress-tab': (el) => { state.progressTab = el.dataset.value; render(); },
  'open-exercise': (el) => { state.exerciseId = el.dataset.value; if (state.tab === 'workout') { state.ui.sheet = null; } go('exercise'); },

  // Séance
  'start-session': (el) => {
    if (state.active) { go('workout'); return; }
    state.starting = { sessionId: el.dataset.session, fatigue: null };
    go('start');
  },
  'start-backfill': (el) => {
    if (state.active) { window.alert('Une séance est en cours : terminez-la d\'abord.'); return; }
    state.starting = { sessionId: el.dataset.session, fatigue: null, backfill: true, date: addDays(state.today, -1) };
    go('start');
  },
  'pick-fatigue': (el) => { state.starting.fatigue = state.starting.fatigue === Number(el.dataset.value) ? null : Number(el.dataset.value); render(); },
  'confirm-start': () => { unlockAudio(); startWorkout(); },
  resume: () => go('workout'),
  'step-load': (el) => stepDraft('load', Number(el.dataset.dir)),
  'step-reps': (el) => stepDraft('reps', Number(el.dataset.dir)),
  'pick-rir': (el) => { readDraftInputs(); state.draft.rir = Number(el.dataset.value); render(); },
  'pick-option': (el) => {
    readDraftInputs();
    const { suggestion } = currentContext(state);
    const o = suggestion.options[Number(el.dataset.value)];
    Object.assign(state.draft, { option: Number(el.dataset.value), loadKg: o.load, reps: o.reps });
    render();
  },
  'validate-set': () => validateSet(),
  'goto-slot': (el) => changeSlot(el.dataset.value),
  'open-sheet': (el) => { state.ui.sheet = el.dataset.value; render(); },
  'swap-exercise': (el) => swapExercise(el.dataset.value, 'alternative'),
  'accept-fallback': (el) => swapExercise(el.dataset.value, 'fallback'),
  'refuse-fallback': () => { state.ui.fallback = null; render(); },
  'extra-set': async () => {
    const w = state.active.workout;
    w.extraSets = { ...(w.extraSets || {}), [w.currentSlot]: ((w.extraSets || {})[w.currentSlot] || 0) + 1 };
    state.draft = null;
    await persistWorkout();
    render();
  },
  'delete-set': (el) => removeSet(el.dataset.id),
  'rest-adjust': async (el) => {
    const w = state.active.workout;
    if (!w.restEndsAt) return;
    w.restEndsAt = Math.max(Date.now(), w.restEndsAt + Number(el.dataset.value) * 1000);
    w.restTotalSec = Math.max(1, (w.restTotalSec || 0) + Number(el.dataset.value));
    restSignaled = false;
    await persistWorkout();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = renderRestBar(w);
  },
  'rest-skip': async () => {
    state.active.workout.restEndsAt = null;
    await persistWorkout();
    const dock = $('#rest-dock');
    if (dock) dock.innerHTML = '';
  },
  finish: () => { state.finish = { difficulty: null, note: '' }; go('finish'); },
  'pick-difficulty': (el) => {
    const note = $('#finish-note');
    if (note) state.finish.note = note.value;
    state.finish.difficulty = state.finish.difficulty === Number(el.dataset.value) ? null : Number(el.dataset.value);
    render();
  },
  'save-workout': () => saveWorkout('done'),
  'abandon-workout': () => { if (window.confirm('Abandonner cette séance ? Les séries faites restent dans le journal, sans compter pour les suggestions.')) saveWorkout('abandoned'); },
  'open-workout': (el) => { state.detailId = el.dataset.id; go('detail'); },
  'delete-workout': async (el) => {
    if (!window.confirm('Supprimer définitivement cette séance et toutes ses séries ?')) return;
    await deleteWorkout(el.dataset.id);
    await loadRecords();
    back();
  },
  'edit-set': (el) => { const s = state.sets.find((x) => x.id === el.dataset.id); state.sheet = { type: 'set-edit', editId: el.dataset.id, draft: { rir: s ? s.rir : null } }; renderSheetOnly(); },
  'set-delete': (el) => removeSet(el.dataset.id),

  // Bilan de semaine
  'open-review': (el) => { state.reviewWeek = Number(el.dataset.value); state.reviewSignals = null; state.reviewDecision = null; go('review'); },
  'review-signal': (el) => { state.reviewSignals[el.dataset.value] = el.checked; state.reviewDecision = null; render(); },
  'review-decision': (el) => { state.reviewDecision = el.dataset.value; render(); },
  'review-save': async () => {
    const cal = state.program.calendar[state.reviewWeek - 1] || {};
    const isLast = cal.week === state.program.weeks && !cal.deload;
    const signals = Object.entries(state.reviewSignals).filter(([, v]) => v).map(([k]) => k);
    const decision = isLast ? 'progress' : state.reviewDecision || (signals.length >= state.program.progressionGate.deloadIfSignalsAtLeast ? 'deload' : signals.length ? 'maintain' : 'progress');
    const existing = state.reviews.find((r) => r.calWeek === state.reviewWeek);
    await saveEntry({ id: existing ? existing.id : newId('r'), kind: 'week-review', date: state.today, programId: state.program.id, calWeek: state.reviewWeek, signals, decision });
    toast(isLast ? 'Bilan enregistré. Préparez maintenant le bilan du cycle pour Claude.' : `Bilan enregistré : ${{ progress: 'semaine suivante', maintain: 'semaine maintenue', deload: 'semaine de décharge' }[decision]}.`);
  },

  // Nutrition
  'food-day': (el) => { const v = Number(el.dataset.value); const d = state.foodDate || state.today; state.foodDate = v === 0 ? state.today : addDays(d, v) > state.today ? state.today : addDays(d, v); render(); },
  'food-add': (el) => { state.sheet = { type: 'food', meal: el.dataset.value, query: '' }; renderSheetOnly(); setTimeout(() => { const s = $('#food-search'); if (s) s.focus(); }, 60); },
  'food-mode': (el) => { state.sheet.mode = el.dataset.value; state.sheet.pick = null; renderSheetOnly(); },
  'food-pick': (el) => { const f = foods().find((x) => x.id === el.dataset.value); state.sheet.pick = { foodId: f.id, grams: f.portion ? f.portion.g : 100 }; renderSheetOnly(); },
  'food-pick-recipe': (el) => { state.sheet.pick = { recipe: true, recipeId: el.dataset.value, portions: 1 }; renderSheetOnly(); },
  'food-grams': (el) => { const i = $('#food-grams'); if (i) i.value = String(Math.round(Number(el.dataset.value) * 10) / 10).replace('.', ','); updateFoodPreview(); },
  'food-portions': (el) => { state.sheet.pick.portions = Number(el.dataset.value); renderSheetOnly(); },
  'food-confirm': () => confirmFood(),
  'food-back': () => { state.sheet.pick = null; if (state.sheet.editId) { state.sheet = null; } renderSheetOnly(); },
  'food-quick': async (el) => {
    const src = state.entries.find((x) => x.id === el.dataset.id);
    const { id, createdAt, updatedAt, ...rest } = src;
    await saveEntry({ ...rest, id: newId('f'), date: state.foodDate || state.today, meal: state.sheet.meal });
    state.sheet = null;
    render();
  },
  'food-edit': (el) => {
    const e = state.entries.find((x) => x.id === el.dataset.id);
    if (e.recipeId) state.sheet = { type: 'food', meal: e.meal, editId: e.id, pick: { recipe: true, recipeId: e.recipeId, portions: e.portions || 1 } };
    else if (e.foodId && foods().some((f) => f.id === e.foodId)) state.sheet = { type: 'food', meal: e.meal, editId: e.id, pick: { foodId: e.foodId, grams: e.grams } };
    else state.sheet = { type: 'food', meal: e.meal, editId: e.id, mode: 'manual', manual: { name: e.name, kcal: e.kcal, p: e.p, c: e.c, f: e.f } };
    renderSheetOnly();
  },
  'food-delete': async () => { await removeEntry(state.sheet.editId); state.sheet = null; render(); },
  'recipe-edit': (el) => {
    const r = (state.settings.recipes || []).find((x) => x.id === el.dataset.value);
    state.recipeDraft = r ? JSON.parse(JSON.stringify(r)) : { id: newId('r'), name: '', portions: 5, items: [] };
    state.recipeQuery = '';
    state.recipeError = null;
    go('recipe-edit');
  },
  'recipe-add': (el) => { syncRecipeInputs(); state.recipeDraft.items.push({ foodId: el.dataset.value, grams: 100 }); state.recipeQuery = ''; render(); },
  'recipe-remove': (el) => { syncRecipeInputs(); state.recipeDraft.items.splice(Number(el.dataset.value), 1); render(); },
  'recipe-save': async () => {
    syncRecipeInputs();
    const r = state.recipeDraft;
    if (!r.name.trim()) { state.recipeError = 'Donnez un nom à la recette.'; render(); return; }
    if (!r.items.length) { state.recipeError = 'Ajoutez au moins un ingrédient.'; render(); return; }
    if (!(r.portions >= 1 && r.portions <= 50)) { state.recipeError = 'Nombre de portions : entre 1 et 50.'; render(); return; }
    const list = (state.settings.recipes || []).filter((x) => x.id !== r.id);
    await saveSettings({ recipes: [...list, r] });
    back();
  },
  'recipe-delete': async () => {
    if (!window.confirm('Supprimer cette recette ? Les repas déjà notés sont conservés.')) return;
    await saveSettings({ recipes: (state.settings.recipes || []).filter((x) => x.id !== state.recipeDraft.id) });
    back();
  },

  // Données
  backup: () => doBackup(),
  'toggle-backup-photos': (el) => { state.backupPhotos = el.checked; },
  'restore-cancel': () => { state.restore = null; render(); },
  'restore-confirm': () => confirmRestore(),
  'undo-restore': () => undoRestore(),
  csv: async (el) => {
    const kind = el.dataset.value;
    const data = { program: state.program, lib: state.lib, workouts: state.workouts, sets: state.sets, entries: state.entries };
    const text = { sets: setsCsv, body: bodyCsv, endurance: enduranceCsv, food: foodCsv }[kind](data);
    await deliverFile(`fitness-${{ sets: 'series', body: 'corps', endurance: 'endurance', food: 'nutrition' }[kind]}-${state.today}.csv`, text, 'text/csv');
  },
  'copy-review-message': async () => {
    const text = REVIEW_MESSAGE(state.exportFrom || state.program.startDate, state.exportTo || state.today);
    try { await navigator.clipboard.writeText(text); state.exportMsg = { ok: true, text: 'Message copié : collez-le dans la conversation avec le fichier.' }; } catch { state.exportMsg = { ok: true, text } ; }
    render();
  },
  'program-activate': async () => {
    const store = addProgram(state.programStore, state.programImport.file);
    await setMeta('program-store', store);
    state.programStore = store;
    state.programImport = null;
    rebuildProgram();
    state.programMsg = `Programme « ${state.program.name} » activé.`;
    render();
  },
  'program-cancel': () => { state.programImport = null; render(); },
  'program-rollback': async () => {
    if (!window.confirm('Revenir à la version précédente du programme ?')) return;
    const store = rollbackProgram(state.programStore);
    await setMeta('program-store', store);
    state.programStore = store;
    rebuildProgram();
    state.programMsg = `Programme « ${state.program.name} », version ${state.program.version}, de nouveau actif.`;
    render();
  },
  'toggle-weigh-day': async (el) => {
    const d = Number(el.dataset.value);
    const cur = state.settings.weighDays || [0, 2, 4];
    await saveSettings({ weighDays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort() });
    render();
  },
  'toggle-setting': async (el) => { await saveSettings({ [el.dataset.value]: el.checked }); },
  'replay-onboarding': () => { state.onboardingStep = 0; go('onboarding'); },
  'onboarding-next': async () => {
    if ((state.onboardingStep || 0) < 3) { state.onboardingStep = (state.onboardingStep || 0) + 1; render(); return; }
    try { await setMeta('onboarded', true); } catch { /* ignoré */ }
    go('today');
  },
  'onboarding-skip': async () => { try { await setMeta('onboarded', true); } catch { /* ignoré */ } go('today'); },
};

function stepDraft(kind, dir) {
  readDraftInputs();
  const { item } = currentContext(state);
  if (kind === 'load') {
    const step = loadStep(item.increment) || 1;
    state.draft.loadKg = Math.max(0, Math.round(((state.draft.loadKg || 0) + dir * step) * 100) / 100);
  } else {
    state.draft.reps = Math.max(0, (state.draft.reps || 0) + dir);
  }
  render();
}

function syncRecipeInputs() {
  const r = state.recipeDraft;
  if (!r) return;
  const name = $('#recipe-name');
  const portions = $('#recipe-portions');
  if (name) r.name = name.value.slice(0, 80);
  if (portions) r.portions = Math.round(Number(portions.value.replace(',', '.'))) || r.portions;
  document.querySelectorAll('[data-recipe-item]').forEach((inp) => {
    const n = Number(inp.value.replace(',', '.'));
    if (n > 0) r.items[Number(inp.dataset.recipeItem)].grams = n;
  });
}

document.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (el.tagName === 'INPUT' && el.type !== 'checkbox') return;
  if (el.tagName === 'SELECT') return;
  if (a === 'guide' || el.closest('summary')) { if (a === 'guide') ev.preventDefault(); }
  const fn = ACTIONS[a];
  if (fn) {
    try { await fn(el, ev); } catch (e) { console.error(e); window.alert(`Action impossible : ${e.message}`); }
  }
});

document.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fn = FORMS[form.dataset.form];
  if (fn) {
    try { await fn(new FormData(form), form); } catch (e) { console.error(e); sheetError(`Enregistrement impossible : ${e.message}`); }
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.id === 'restore-input') onRestoreFile(t);
  else if (t.id === 'program-input') {
    const file = t.files && t.files[0];
    t.value = '';
    if (!file) return;
    const text = await file.text();
    const cur = state.fileProgram;
    const sameIdVersion = (() => {
      try { const p = JSON.parse(text).program; return p && p.id === cur.id ? cur.version : null; } catch { return null; }
    })();
    const res = checkProgramText(text, state.lib, sameIdVersion);
    state.programMsg = null;
    state.programImport = res.ok ? { file: res.file, diff: compareProgramFiles({ program: cur }, res.file, state.lib) } : { errors: res.errors };
    render();
  } else if (t.id === 'activity-file') {
    const file = t.files && t.files[0];
    const kind = t.dataset.kind;
    t.value = '';
    if (!file) return;
    try {
      const r = await parseActivityFile(file.name, { text: () => file.text(), arrayBuffer: () => file.arrayBuffer() });
      const date = r.startTime ? new Date(r.startTime).toLocaleDateString('sv-SE') : state.today;
      const type = r.sport === 'swim' ? 'swim' : r.sport === 'run' ? 'run' : kind;
      state.sheet = { type, draft: { date: date > state.today ? state.today : date, durationSec: r.durationSec, distanceM: r.distanceM, avgHr: r.avgHr, maxHr: r.maxHr, source: r.source } };
    } catch (e) {
      state.sheet = { type: 'import', kind, error: e.message };
    }
    renderSheetOnly();
  } else if (t.dataset && t.dataset.photoPose) addPhoto(t);
  else if (t.dataset && t.dataset.action === 'photo-compare') {
    const list = [...new Set(state.photosMeta.map((p) => p.date))].sort();
    state.photoCompare = { a: list[0], b: list[list.length - 1], ...(state.photoCompare || {}), [t.dataset.side]: t.value };
    render();
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.id === 'food-search') {
    state.sheet.query = t.value;
    const q = t.value;
    const box = $('#food-results');
    if (box) box.innerHTML = renderFoodResults(q ? searchFoods(foods(), q) : [], q, frequentItems(state.entries), state.settings.recipes || [], foods());
  } else if (t.id === 'food-grams') updateFoodPreview();
  else if (t.id === 'recipe-search') {
    state.recipeQuery = t.value;
    const box = $('#recipe-results');
    const res = t.value ? searchFoods(foods(), t.value, 12) : [];
    if (box) box.innerHTML = res.length ? `<div class="group tight">${res.map((f) => `<button class="row" data-action="recipe-add" data-value="${esc(f.id)}"><span class="row-main"><b>${esc(f.name)}</b><span>${Math.round(f.kcal)} kcal / 100 g</span></span><span class="row-end">+</span></button>`).join('')}</div>` : '';
  }
});

document.addEventListener('focusin', (ev) => {
  if (ev.target.classList && (ev.target.classList.contains('step-input') || ev.target.classList.contains('num-input'))) setTimeout(() => { try { ev.target.select(); } catch { /* ignoré */ } }, 0);
});

// ---------- Service worker : hors ligne et mises à jour ----------

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
  try { await registration.update(); } catch { /* hors ligne */ }
  state.sw.checking = false;
  state.sw.lastCheck = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (registration.waiting && navigator.serviceWorker.controller) state.sw.updateReady = true;
  if (manual || state.tab === 'data') render();
  else $('#banners').innerHTML = renderBanners(state);
}

function applyUpdate() {
  const waiting = registration && registration.waiting;
  if (!waiting) { window.location.reload(); return; }
  updateRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

async function initServiceWorker() {
  if (!state.sw.supported) return;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch {
    state.sw.supported = false;
    return;
  }
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
  if (now !== state.today) {
    state.today = now;
    if (!FULLSCREEN.has(state.tab) && !state.sheet) render();
  }
  tick();
  checkForUpdate(false);
});

async function start() {
  try {
    await loadData();
  } catch (e) {
    $('#main').innerHTML = `<header class="page-head"><h1>Problème de chargement</h1></header><div class="msg-err">${(e.messages || ['Impossible de lire le programme. Vérifiez la connexion pour la première ouverture.']).map(esc).join('<br>')}</div>`;
    return;
  }
  render();
  initServiceWorker();
  state.storage = await storageStatus();
  if (state.tab === 'data') render();
}

start();
