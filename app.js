// Point d'entrée : charge le programme, gère la navigation, le service worker et les réglages.
import { validateProgram, validateLibrary } from './program.js';
import { todayLocal, effectiveProgram, cycleInfo } from './dates.js';
import { applyStartDateChange, resetStartDate, START_KEY } from './settings.js';
import { getMeta, setMeta, storageStatus } from './storage.js';
import { renderToday, renderProgram, renderHistory, renderProgress, renderData, renderNav, renderBanners, esc } from './views.js';
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
};
let registration = null;
let updateRequested = false;

function render() {
  const main = $('#main');
  const views = { today: renderToday, program: renderProgram, history: renderHistory, progress: renderProgress, data: renderData };
  main.innerHTML = views[state.tab](state);
  $('#nav').innerHTML = renderNav(state.tab === 'program' ? 'today' : state.tab);
  $('#banners').innerHTML = renderBanners(state);
}

function fatal(messages) {
  $('#main').innerHTML = `<header class="page-head"><h1>Problème de chargement</h1></header>
    <div class="msg-err">${messages.map(esc).join('<br>')}</div>
    <p class="muted">Rechargez la page. Si le problème persiste, notez ce message pour le signaler.</p>`;
}

function applyStart() {
  state.program = effectiveProgram(state.fileProgram, state.startOverride);
}

async function loadData() {
  const [progFile, lib] = await Promise.all([
    fetch('./data/programme-cycle-1.json').then((r) => r.json()),
    fetch('./data/exercises.json').then((r) => r.json()),
  ]);
  const libErrors = validateLibrary(lib);
  const progCheck = validateProgram(progFile, lib);
  if (libErrors.length || !progCheck.ok) throw Object.assign(new Error('invalid'), { messages: [...libErrors, ...progCheck.errors] });
  state.lib = lib;
  state.fileProgram = progFile.program;
  try {
    state.startOverride = await getMeta(START_KEY);
  } catch {
    state.startOverride = undefined;
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

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'go') {
    state.tab = el.dataset.tab;
    state.startMsg = null;
    render();
    window.scrollTo(0, 0);
  } else if (a === 'open-program') {
    state.view = { session: el.dataset.session, week: Number(el.dataset.week) };
    state.tab = 'program';
    render();
    window.scrollTo(0, 0);
  } else if (a === 'pick-session') {
    state.view.session = el.dataset.value;
    render();
  } else if (a === 'pick-week') {
    state.view.week = Number(el.dataset.value);
    render();
  } else if (a === 'check-update') {
    checkForUpdate(true);
  } else if (a === 'apply-update') {
    applyUpdate();
  } else if (a === 'reset-start') {
    saveStart(resetStartDate(state.startOverride, state.fileProgram), 'Date de début remise à celle du programme.');
  } else if (a === 'use-suggestion') {
    saveStart(applyStartDateChange(state.startOverride, state.fileProgram, el.dataset.value, { today: state.today }), 'Date de début enregistrée.');
  }
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
    render();
  };
  ctrl.postMessage({ type: 'STATUS' }, [ch.port2]);
}

function watchWorker(worker) {
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      state.sw.updateReady = true;
      render();
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
  render();
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
    // Première visite : le service worker prend la main sans rechargement, puis on interroge son état.
    navigator.serviceWorker.addEventListener('controllerchange', askOfflineStatus, { once: true });
  }
  askOfflineStatus();
  render();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = todayLocal();
  if (now !== state.today) {
    state.today = now;
    render();
  }
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
  render();
}

start();
