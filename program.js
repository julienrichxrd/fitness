// Lecture, validation et calculs sur un fichier programme.
// Module sans dépendance, utilisable tel quel dans le navigateur (étapes suivantes) et dans Node (tests).

export const SCHEMA_VERSION = 1;
export const LIMITS = {
  sets: [1, 10],
  reps: [1, 50],
  restSec: [0, 600],
  rir: [0, 5],
  weeks: [1, 12],
};
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CATEGORIES = ['compound', 'isolation', 'explosive', 'core'];
const INCREMENT_TYPES = ['dumbbell', 'barbell', 'machine', 'bodyweight', 'none'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const inRange = (v, [lo, hi]) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Lit un texte JSON sans jamais lever d'exception. */
export function parseJson(text) {
  if (typeof text !== 'string') return { ok: false, errors: ['Le contenu du fichier n\'est pas du texte.'] };
  if (text.length > 10 * 1024 * 1024) return { ok: false, errors: ['Fichier trop volumineux (plus de 10 Mo).'] };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, errors: ['Fichier illisible : ce n\'est pas du JSON valide.'] };
  }
}

/** Vérifie la bibliothèque d'exercices. */
export function validateLibrary(lib) {
  const errors = [];
  if (!isObj(lib)) return ['La bibliothèque n\'est pas un objet JSON.'];
  if (lib.format !== 'fitness-app') errors.push('Bibliothèque : champ « format » inattendu.');
  if (lib.kind !== 'exercise-library') errors.push('Bibliothèque : champ « kind » doit valoir « exercise-library ».');
  if (lib.schemaVersion !== SCHEMA_VERSION) errors.push(`Bibliothèque : version de schéma ${lib.schemaVersion} non reconnue.`);
  const muscles = isObj(lib.muscles) ? Object.keys(lib.muscles) : [];
  if (!muscles.length) errors.push('Bibliothèque : liste des muscles absente.');
  if (!Array.isArray(lib.exercises) || !lib.exercises.length) {
    errors.push('Bibliothèque : aucun exercice.');
    return errors;
  }
  const seen = new Set();
  lib.exercises.forEach((ex, i) => {
    const where = `Exercice n° ${i + 1}${ex && ex.id ? ` (${ex.id})` : ''}`;
    if (!isObj(ex)) return errors.push(`${where} : n'est pas un objet.`);
    if (typeof ex.id !== 'string' || !/^[a-z0-9-]+$/.test(ex.id)) errors.push(`${where} : identifiant invalide.`);
    if (seen.has(ex.id)) errors.push(`${where} : identifiant en double.`);
    seen.add(ex.id);
    if (typeof ex.name !== 'string' || !ex.name.trim()) errors.push(`${where} : nom manquant.`);
    for (const key of ['primary', 'secondary']) {
      if (!Array.isArray(ex[key])) errors.push(`${where} : « ${key} » doit être une liste.`);
      else ex[key].forEach((m) => { if (!muscles.includes(m)) errors.push(`${where} : muscle inconnu « ${m} ».`); });
    }
  });
  return errors;
}

/** Vérifie un fichier programme complet. activeVersion : version du programme actif (facultatif). */
export function validateProgram(file, lib, { activeVersion = null } = {}) {
  const errors = [];
  if (!isObj(file)) return { ok: false, errors: ['Le fichier n\'est pas un objet JSON.'] };
  if (file.format !== 'fitness-app') errors.push('Champ « format » inattendu : ce fichier ne vient pas de l\'application.');
  if (file.kind !== 'program') errors.push(`Type de fichier « ${file.kind} » : un fichier programme est attendu.`);
  if (file.schemaVersion !== SCHEMA_VERSION) errors.push(`Version de schéma ${file.schemaVersion} non reconnue (attendue : ${SCHEMA_VERSION}).`);
  const p = file.program;
  if (!isObj(p)) {
    errors.push('Bloc « program » absent.');
    return { ok: false, errors };
  }
  const libIds = new Set((lib && Array.isArray(lib.exercises) ? lib.exercises : []).map((e) => e.id));
  const exOk = (id, where) => { if (!libIds.has(id)) errors.push(`${where} : exercice inconnu « ${id} ».`); };

  if (typeof p.id !== 'string' || !p.id) errors.push('Identifiant du programme manquant.');
  if (!isInt(p.version) || p.version < 1) errors.push('Version du programme invalide (entier ≥ 1 attendu).');
  if (activeVersion !== null && isInt(p.version) && p.version <= activeVersion) {
    errors.push(`Version ${p.version} non supérieure à celle du programme actif (${activeVersion}).`);
  }
  if (!isInt(p.weeks) || !inRange(p.weeks, LIMITS.weeks)) errors.push('Nombre de semaines invalide (1 à 12).');
  if (typeof p.startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.startDate) || Number.isNaN(Date.parse(`${p.startDate}T12:00:00Z`))) {
    errors.push('Date de début invalide (format AAAA-MM-JJ attendu).');
  } else if (new Date(`${p.startDate}T12:00:00Z`).getUTCDay() !== 1) {
    errors.push('La date de début doit être un lundi.');
  }

  // Séances
  const sessions = Array.isArray(p.sessions) ? p.sessions : [];
  if (!sessions.length) errors.push('Aucune séance dans le programme.');
  const sessionIds = sessions.map((s) => s && s.id);
  if (new Set(sessionIds).size !== sessionIds.length) errors.push('Identifiants de séance en double.');
  if (!Array.isArray(p.sessionOrder) || p.sessionOrder.length !== sessions.length || !p.sessionOrder.every((id) => sessionIds.includes(id))) {
    errors.push('« sessionOrder » doit lister chaque séance une fois.');
  }

  // Planning
  if (!Array.isArray(p.schedule)) errors.push('Planning de la semaine absent.');
  else {
    const days = p.schedule.map((d) => d && d.day);
    days.forEach((d) => { if (!DAYS.includes(d)) errors.push(`Planning : jour inconnu « ${d} ».`); });
    if (new Set(days).size !== days.length) errors.push('Planning : jour en double.');
    p.schedule.forEach((d) => {
      if (d && d.session !== undefined && !sessionIds.includes(d.session)) errors.push(`Planning : séance inconnue « ${d.session} ».`);
    });
    sessionIds.forEach((id) => {
      if (!p.schedule.some((d) => d && d.session === id)) errors.push(`Planning : la séance ${id} n'a pas de jour.`);
    });
  }

  // Règles par semaine
  const rules = Array.isArray(p.weekRules) ? p.weekRules : [];
  for (let w = 1; isInt(p.weeks) && w <= p.weeks; w += 1) {
    const found = rules.filter((r) => r && r.week === w);
    if (found.length !== 1) errors.push(`Règles de semaine : la semaine ${w} doit apparaître exactement une fois.`);
  }
  rules.forEach((r) => {
    if (!isObj(r)) return errors.push('Règle de semaine invalide.');
    if (!isInt(r.week) || r.week < 1 || (isInt(p.weeks) && r.week > p.weeks)) errors.push(`Règle de semaine hors cycle : ${r.week}.`);
    if (!isInt(r.setDelta) || r.setDelta < -5 || r.setDelta > 5) errors.push(`Semaine ${r.week} : écart de séries invalide.`);
    if (!isInt(r.minSets) || !inRange(r.minSets, LIMITS.sets)) errors.push(`Semaine ${r.week} : minimum de séries invalide.`);
    for (const cat of ['compound', 'isolation']) {
      const rr = r.rir && r.rir[cat];
      if (!isObj(rr) || !inRange(rr.min, LIMITS.rir) || !inRange(rr.max, LIMITS.rir) || rr.min > rr.max) {
        errors.push(`Semaine ${r.week} : RIR ${cat === 'compound' ? 'polyarticulaires' : 'isolation'} invalide.`);
      }
    }
  });

  // Emplacements
  const slotIds = new Set();
  sessions.forEach((s) => {
    if (!isObj(s)) return errors.push('Séance invalide.');
    const slots = Array.isArray(s.slots) ? s.slots : [];
    if (!slots.length) errors.push(`Séance ${s.id} : aucun exercice.`);
    const groups = Array.isArray(s.supersets) ? s.supersets : [];
    const groupIds = groups.map((g) => g && g.id);
    groups.forEach((g) => {
      if (!isObj(g) || !Array.isArray(g.slots) || g.slots.length !== 2) {
        errors.push(`Séance ${s.id} : la supersérie ${g && g.id} doit contenir exactement 2 exercices.`);
        return;
      }
      if (!inRange(g.restAfterRoundSec, LIMITS.restSec)) errors.push(`Supersérie ${g.id} : repos invalide.`);
      g.slots.forEach((sid) => {
        const slot = slots.find((x) => x && x.id === sid);
        if (!slot) errors.push(`Supersérie ${g.id} : emplacement inconnu « ${sid} ».`);
        else if (slot.superset !== g.id) errors.push(`Supersérie ${g.id} : l'emplacement ${sid} ne la référence pas.`);
      });
    });
    slots.forEach((sl) => {
      const where = `Séance ${s.id}, emplacement ${sl && sl.id}`;
      if (!isObj(sl)) return errors.push(`Séance ${s.id} : emplacement invalide.`);
      if (typeof sl.id !== 'string' || !sl.id) errors.push(`${where} : identifiant manquant.`);
      if (slotIds.has(sl.id)) errors.push(`${where} : identifiant en double.`);
      slotIds.add(sl.id);
      exOk(sl.exercise, where);
      if (!CATEGORIES.includes(sl.category)) errors.push(`${where} : catégorie inconnue « ${sl.category} ».`);
      if (!isInt(sl.sets) || !inRange(sl.sets, LIMITS.sets)) errors.push(`${where} : nombre de séries hors bornes (1 à 10).`);
      checkReps(sl.reps, where, errors);
      if (sl.superset !== undefined) {
        if (!groupIds.includes(sl.superset)) errors.push(`${where} : supersérie inconnue « ${sl.superset} ».`);
        if (sl.restSec !== null) errors.push(`${where} : dans une supersérie, le repos se règle sur la supersérie (restSec doit être null).`);
      } else if (!isInt(sl.restSec) || !inRange(sl.restSec, LIMITS.restSec)) {
        errors.push(`${where} : repos hors bornes (0 à 600 s).`);
      }
      if (sl.rirFloor !== undefined && !inRange(sl.rirFloor, LIMITS.rir)) errors.push(`${where} : plancher de RIR invalide.`);
      if (!Array.isArray(sl.alternatives)) errors.push(`${where} : liste d'alternatives absente.`);
      else sl.alternatives.forEach((a) => exOk(a, `${where}, alternative`));
      if (!isObj(sl.increment) || !INCREMENT_TYPES.includes(sl.increment.type)) errors.push(`${where} : incrément invalide.`);
      else if (['dumbbell', 'barbell', 'machine'].includes(sl.increment.type) && !(sl.increment.stepKg > 0 && sl.increment.stepKg <= 20)) {
        errors.push(`${where} : pas d'incrément invalide.`);
      }
      if (sl.fallback !== undefined) {
        const f = sl.fallback;
        if (!isObj(f) || !isInt(f.belowReps) || !inRange(f.belowReps, LIMITS.reps)) errors.push(`${where} : seuil de repli invalide.`);
        if (!f || !Array.isArray(f.exercises) || !f.exercises.length) errors.push(`${where} : exercices de repli absents.`);
        else f.exercises.forEach((a) => exOk(a, `${where}, repli`));
        if (f) checkReps(f.reps, `${where}, repli`, errors);
      }
      (Array.isArray(sl.weekOverrides) ? sl.weekOverrides : []).forEach((o) => {
        if (!isObj(o) || !isInt(o.week) || o.week < 1 || (isInt(p.weeks) && o.week > p.weeks)) {
          errors.push(`${where} : exception pour une semaine hors cycle.`);
          return;
        }
        if (o.exercise !== undefined) exOk(o.exercise, `${where}, exception S${o.week}`);
        if (o.sets !== undefined && (!isInt(o.sets) || !inRange(o.sets, LIMITS.sets))) errors.push(`${where}, exception S${o.week} : séries hors bornes.`);
        if (o.reps !== undefined) checkReps(o.reps, `${where}, exception S${o.week}`, errors);
      });
    });
  });

  const gate = p.progressionGate;
  if (!isObj(gate) || !Array.isArray(gate.maintainIfAnySignal) || !gate.maintainIfAnySignal.length) {
    errors.push('Règle de passage de semaine (progressionGate) absente.');
  } else if (!isInt(gate.deloadIfSignalsAtLeast) || gate.deloadIfSignalsAtLeast < 2) {
    errors.push('progressionGate : seuil de décharge invalide.');
  }
  if (!isObj(p.deload) || !(p.deload.setFactor > 0 && p.deload.setFactor < 1)) errors.push('Règle de décharge absente ou invalide.');

  return { ok: errors.length === 0, errors };
}

function checkReps(r, where, errors) {
  if (!isObj(r) || !isInt(r.min) || !isInt(r.max) || !inRange(r.min, LIMITS.reps) || !inRange(r.max, LIMITS.reps)) {
    errors.push(`${where} : répétitions hors bornes (1 à 50).`);
  } else if (r.min > r.max) {
    errors.push(`${where} : fourchette incohérente (minimum supérieur au maximum).`);
  }
}

/** Dates de la semaine n du cycle (lundi → dimanche), sans dépendre du fuseau de la machine. */
export function weekDates(program, week) {
  const start = new Date(`${program.startDate}T12:00:00Z`);
  const monday = new Date(start.getTime() + (week - 1) * 7 * 86400000);
  const sunday = new Date(monday.getTime() + 6 * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(monday), end: iso(sunday) };
}

/** Séance telle qu'elle doit être faite une semaine donnée. options.deload : semaine de décharge. */
export function resolveSession(program, sessionId, week, { deload = false } = {}) {
  const s = program.sessions.find((x) => x.id === sessionId);
  if (!s) throw new Error(`Séance inconnue : ${sessionId}`);
  const rule = program.weekRules.find((r) => r.week === week);
  if (!rule) throw new Error(`Semaine hors cycle : ${week}`);
  return s.slots.map((sl) => {
    const o = (sl.weekOverrides || []).find((x) => x.week === week);
    let sets;
    if (o && o.sets !== undefined) sets = o.sets;
    else sets = Math.max(rule.minSets, sl.sets + rule.setDelta);
    let rir = sl.category === 'explosive' ? null : { ...(sl.category === 'compound' ? rule.rir.compound : rule.rir.isolation) };
    if (deload) {
      const d = program.deload;
      sets = Math.max(d.minSets, d.setRounding === 'up' ? Math.ceil(sets * d.setFactor) : Math.floor(sets * d.setFactor));
      if (rir) rir = { ...d.rir };
    }
    const group = sl.superset ? s.supersets.find((g) => g.id === sl.superset) : null;
    return {
      slotId: sl.id,
      label: sl.label,
      exercise: o && o.exercise ? o.exercise : sl.exercise,
      category: sl.category,
      sets,
      reps: o && o.reps ? { ...o.reps } : { ...sl.reps },
      perSide: !!sl.perSide,
      restSec: group ? group.restAfterRoundSec : sl.restSec,
      superset: group ? group.id : null,
      rir,
      rirFloor: sl.rirFloor ?? null,
      note: o && o.note ? o.note : null,
    };
  });
}

/** Total des séries de travail (hors explosivité) d'une séance pour une semaine. */
export function workSets(program, sessionId, week, opts) {
  return resolveSession(program, sessionId, week, opts)
    .filter((x) => x.category !== 'explosive')
    .reduce((n, x) => n + x.sets, 0);
}

/** Volume par muscle : série directe = 1, série indirecte = 0,5 (approximation utile, pas une mesure). */
export function weeklyVolume(program, lib, week, opts) {
  const byId = new Map(lib.exercises.map((e) => [e.id, e]));
  const out = {};
  const add = (m, key, v, sid) => {
    out[m] = out[m] || { direct: 0, indirect: 0, total: 0, sessions: new Set(), perSession: {} };
    out[m][key] += v;
    out[m].total += v;
    out[m].sessions.add(sid);
    out[m].perSession[sid] = (out[m].perSession[sid] || 0) + v;
  };
  for (const s of program.sessions) {
    for (const x of resolveSession(program, s.id, week, opts)) {
      if (x.category === 'explosive') continue;
      const ex = byId.get(x.exercise);
      ex.primary.forEach((m) => add(m, 'direct', x.sets, s.id));
      ex.secondary.forEach((m) => add(m, 'indirect', x.sets * 0.5, s.id));
    }
  }
  for (const m of Object.keys(out)) {
    out[m].sessions = [...out[m].sessions].sort();
    out[m].maxPerSession = Math.max(...Object.values(out[m].perSession));
  }
  return out;
}
