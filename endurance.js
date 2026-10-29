// Course, natation et mobilité : séances prévues (document programme, cycle 1), journal, import des fichiers
// de montre (GPX, TCX, FIT — formats exportables depuis l'application Suunto et la plupart des montres).
// Les lecteurs de fichiers sont écrits sans dépendance et fonctionnent aussi dans Node (tests).

export const RUN_GUIDE = {
  effort: 'Vous pouvez parler en phrases complètes : effort 3–4 sur 10. Si vous devez couper vos phrases pour respirer, ralentissez, quitte à marcher en côte.',
  strides: 'Accélérations : en fin de sortie, sur terrain plat. Montez progressivement jusqu\'à une allure rapide mais relâchée, sans sprint. 1 min de trottinement entre chaque.',
  adapt: [
    'Jambes lourdes ou courbatures fortes : 30 min très faciles, ou vélo ou natation à la place.',
    'Douleur au tibia, au genou ou au tendon d\'Achille : pas de course.',
  ],
  watch: 'Enregistrez la sortie avec la montre (durée, distance, fréquence cardiaque), puis importez le fichier ici ou saisissez les chiffres.',
};

export const SWIM_PLANS = {
  early: {
    title: 'Séance technique S1–S2',
    meters: 1100,
    blocks: [
      { name: 'Échauffement', what: '200 m nage facile, n\'importe quelle nage', rest: '—', why: 'Se détendre' },
      { name: 'Respiration au bord', what: '10 cycles : visage dans l\'eau, expirer doucement par le nez et la bouche, tourner la tête sur le côté pour inspirer', rest: '30 s', why: 'Vider l\'air sous l\'eau, inspirer rapidement' },
      { name: 'Éducatif 1', what: '4 × 25 m battements sur le côté, bras du dessous tendu devant, tourner la tête pour respirer', rest: '20 s', why: 'Corps aligné, une lunette reste dans l\'eau' },
      { name: 'Éducatif 2', what: '4 × 25 m rattrapé : une main attend l\'autre devant avant de tirer', rest: '20 s', why: 'Allonger le mouvement, glisser' },
      { name: 'Nage', what: '4 × 100 m crawl facile, respiration tous les 3 temps', rest: '30 s', why: 'Expiration continue, tête basse' },
      { name: 'Retour au calme', what: '100 m très facile', rest: '—', why: 'Relâcher' },
    ],
  },
  late: {
    title: 'Séance technique S3–S5',
    meters: 1300,
    blocks: [
      { name: 'Échauffement', what: '200 m nage facile, n\'importe quelle nage', rest: '—', why: 'Se détendre' },
      { name: 'Respiration au bord', what: '10 cycles d\'expiration dans l\'eau, inspiration sur le côté', rest: '30 s', why: 'Vider l\'air sous l\'eau' },
      { name: 'Éducatif 1', what: '4 × 25 m battements sur le côté, respiration en tournant la tête', rest: '20 s', why: 'Corps aligné' },
      { name: 'Éducatif 2', what: '4 × 25 m « doigts qui traînent » : le bout des doigts frôle l\'eau pendant le retour du bras, coude haut', rest: '20 s', why: 'Retour du bras relâché' },
      { name: 'Nage', what: '3 × 200 m crawl facile. Si la respiration tous les 3 temps devient difficile, passez à 2, puis revenez à 3', rest: '40 s', why: 'Tenir l\'expiration sur la durée' },
      { name: 'Retour au calme', what: '100 m très facile', rest: '—', why: 'Relâcher' },
    ],
    test: 'Repère de fin de cycle (S5) : 400 m de crawl continu à allure confortable. Notez le temps et le nombre de mouvements de bras sur une longueur. Ce n\'est pas un test de vitesse.',
  },
  safety: 'Aucune apnée prolongée, aucune hyperventilation avant de nager. Nagez seulement en présence d\'un surveillant.',
};

export const MOBILITY = {
  A: {
    title: 'Mobilité A : épaules, colonne, hanches',
    items: [
      ['Respiration allongé, jambes sur une chaise', '1 min', 'Relâcher avant de commencer'],
      ['Chat-vache à quatre pattes', '10 lents', 'Mobilité de la colonne'],
      ['Rotation thoracique allongé sur le côté (livre ouvert)', '8 par côté', 'Rotation du haut du dos (natation, développés)'],
      ['Glissés au mur, dos plaqué', '2 × 10', 'Bras au-dessus de la tête sans cambrer'],
      ['Étirement des pectoraux dans un cadre de porte', '2 × 30 s par côté', 'Ouvrir l\'avant des épaules'],
      ['Rotations externes d\'épaule à l\'élastique', '2 × 15 par côté', 'Santé des épaules'],
      ['Fente basse genou au sol, étirement du fléchisseur de hanche', '2 × 30 s par côté', 'Hanches assises toute la journée'],
      ['Squat profond tenu, talons au sol', '3 × 30 s', 'Amplitude de squat'],
    ],
  },
  B: {
    title: 'Mobilité B : hanches, chevilles, chaîne arrière',
    items: [
      ['Respiration allongé', '1 min', 'Relâcher'],
      ['Hanches 90/90 au sol, passage d\'un côté à l\'autre', '10 lents', 'Rotation des hanches'],
      ['Mobilité de cheville genou contre le mur', '2 × 10 par côté', 'Squat et course'],
      ['Étirement des ischios allongé à l\'élastique', '2 × 30 s par côté', 'Soulevé de terre roumain, course'],
      ['Pigeon au sol ou sur un lit', '2 × 30 s par côté', 'Fessiers'],
      ['Étirement des mollets contre un mur, jambe tendue puis fléchie', '30 s chaque position par côté', 'Course'],
      ['Chat-vache puis enfant (bras tendus devant)', '10 + 1 min', 'Grand dorsal, bas du dos'],
      ['Suspension à une barre si disponible', '3 × 20–30 s', 'Épaules, décompression'],
    ],
  },
  walk: 'Ajoutez une marche de 20–30 min dans la journée pour les pas.',
};

export const swimPlanFor = (week) => (week <= 2 ? SWIM_PLANS.early : SWIM_PLANS.late);

/** Allure en secondes par km (course) ou par 100 m (natation). */
export const paceSecPerKm = (durationSec, km) => (km > 0 ? durationSec / km : null);
export const paceSecPer100 = (durationSec, m) => (m > 0 ? (durationSec / m) * 100 : null);

export function fmtDuration(sec) {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export const fmtPace = (sec) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}` : '—');

/** « 45:30 », « 1:02:10 » ou « 42 » (minutes) → secondes. */
export function parseDuration(text) {
  const t = String(text || '').trim().replace(/[hH]/, ':').replace(/\s/g, '');
  if (!t) return null;
  if (/^\d+([.,]\d+)?$/.test(t)) return Math.round(Number(t.replace(',', '.')) * 60);
  const parts = t.split(':').map(Number);
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// ---------- Lecture des fichiers de montre ----------

const toRad = (d) => (d * Math.PI) / 180;
function haversine(a, b) {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const tagValues = (xml, tag) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, 'g'))].map((m) => m[1].trim());
const firstTag = (xml, tag) => tagValues(xml, tag)[0];

function sportFromText(s) {
  const t = String(s || '').toLowerCase();
  if (/swim|nata/.test(t)) return 'swim';
  if (/run|course|jog|trail/.test(t)) return 'run';
  return null;
}

export function parseGpx(xml) {
  const pts = [...xml.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)].map((m) => {
    const lat = Number((/lat="([^"]+)"/.exec(m[1]) || [])[1]);
    const lon = Number((/lon="([^"]+)"/.exec(m[1]) || [])[1]);
    const time = firstTag(m[2], 'time');
    const hr = Number(firstTag(m[2], 'hr'));
    return { lat, lon, t: time ? Date.parse(time) : null, hr: Number.isFinite(hr) && hr > 0 ? hr : null };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (pts.length < 2) throw new Error('Fichier GPX sans trace exploitable.');
  let dist = 0;
  for (let i = 1; i < pts.length; i += 1) dist += haversine(pts[i - 1], pts[i]);
  const times = pts.map((p) => p.t).filter((t) => t !== null);
  const hrs = pts.map((p) => p.hr).filter(Boolean);
  const start = times.length ? new Date(Math.min(...times)) : null;
  return {
    sport: sportFromText(firstTag(xml, 'type') || firstTag(xml, 'name')) || 'run',
    startTime: start ? start.toISOString() : null,
    durationSec: times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : null,
    distanceM: Math.round(dist),
    avgHr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null,
    maxHr: hrs.length ? Math.max(...hrs) : null,
    source: 'gpx',
  };
}

export function parseTcx(xml) {
  const sportAttr = (/<Activity\b[^>]*Sport="([^"]+)"/.exec(xml) || [])[1];
  const laps = [...xml.matchAll(/<Lap\b([^>]*)>([\s\S]*?)<\/Lap>/g)];
  if (!laps.length) throw new Error('Fichier TCX sans tour exploitable.');
  let dur = 0; let dist = 0; let hrWeighted = 0; let maxHr = null; let start = null;
  laps.forEach((m) => {
    const st = (/StartTime="([^"]+)"/.exec(m[1]) || [])[1];
    if (st && (!start || Date.parse(st) < Date.parse(start))) start = st;
    const inner = m[2].replace(/<Track>[\s\S]*<\/Track>/, '');
    const t = Number(firstTag(inner, 'TotalTimeSeconds')) || 0;
    dur += t;
    dist += Number(firstTag(inner, 'DistanceMeters')) || 0;
    const avg = (/<AverageHeartRateBpm>\s*<Value>(\d+)<\/Value>/.exec(inner) || [])[1];
    const mx = (/<MaximumHeartRateBpm>\s*<Value>(\d+)<\/Value>/.exec(inner) || [])[1];
    if (avg) hrWeighted += Number(avg) * t;
    if (mx) maxHr = Math.max(maxHr || 0, Number(mx));
  });
  return {
    sport: sportFromText(sportAttr) || 'run',
    startTime: start ? new Date(start).toISOString() : null,
    durationSec: Math.round(dur),
    distanceM: Math.round(dist),
    avgHr: hrWeighted && dur ? Math.round(hrWeighted / dur) : null,
    maxHr,
    source: 'tcx',
  };
}

/**
 * Lecteur FIT minimal : lit le message « session » (n° 18) — sport, début, durée, distance, fréquence cardiaque,
 * longueur de bassin. Gère les en-têtes normaux, les champs développeur et les en-têtes compressés.
 */
export function parseFit(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const headerSize = u8[0];
  if (u8.length < 14 || String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) !== '.FIT') throw new Error('Ce fichier n\'est pas un fichier FIT.');
  const dataSize = dv.getUint32(4, true);
  const end = Math.min(u8.length, headerSize + dataSize);
  const defs = {};
  const sessions = [];
  const records = { hr: [] };
  let pos = headerSize;
  const FIT_EPOCH = Date.UTC(1989, 11, 31) / 1000;
  const read = (type, size, off, little) => {
    const base = type & 0x1f;
    if (size === 1) return u8[off];
    if (size === 2) return base === 0x03 ? dv.getInt16(off, little) : dv.getUint16(off, little);
    if (size === 4) return base === 0x05 ? dv.getInt32(off, little) : dv.getUint32(off, little);
    return null;
  };
  while (pos < end) {
    const h = u8[pos];
    pos += 1;
    if (h & 0x80) { // en-tête compressé : message de données
      const local = (h >> 5) & 0x03;
      const d = defs[local];
      if (!d) throw new Error('Fichier FIT illisible.');
      pos += d.size;
      continue;
    }
    const local = h & 0x0f;
    if (h & 0x40) { // définition
      const little = u8[pos + 1] === 0;
      const global = little ? dv.getUint16(pos + 2, true) : dv.getUint16(pos + 2, false);
      const n = u8[pos + 4];
      const fields = [];
      let p = pos + 5;
      let size = 0;
      for (let i = 0; i < n; i += 1) {
        fields.push({ num: u8[p], size: u8[p + 1], type: u8[p + 2], off: size });
        size += u8[p + 1];
        p += 3;
      }
      if (h & 0x20) { // champs développeur
        const nd = u8[p];
        p += 1;
        for (let i = 0; i < nd; i += 1) { size += u8[p + 1]; p += 3; }
      }
      defs[local] = { global, little, fields, size };
      pos = p;
    } else {
      const d = defs[local];
      if (!d) throw new Error('Fichier FIT illisible.');
      const v = {};
      d.fields.forEach((f) => { v[f.num] = read(f.type, f.size, pos + f.off, d.little); });
      if (d.global === 18) sessions.push(v);
      if (d.global === 20 && v[3] !== undefined && v[3] !== 0xff) records.hr.push(v[3]);
      pos += d.size;
    }
  }
  if (!sessions.length) throw new Error('Fichier FIT sans résumé de séance.');
  const s = sessions[0];
  const ok = (x, invalid) => (x === undefined || x === null || x === invalid ? null : x);
  const sportCode = ok(s[5], 0xff);
  const timer = ok(s[8], 0xffffffff) ?? ok(s[7], 0xffffffff);
  const dist = ok(s[9], 0xffffffff);
  const pool = ok(s[44], 0xffff);
  return {
    sport: sportCode === 5 ? 'swim' : sportCode === 1 ? 'run' : null,
    startTime: ok(s[2], 0xffffffff) !== null ? new Date((s[2] + FIT_EPOCH) * 1000).toISOString() : null,
    durationSec: timer !== null ? Math.round(timer / 1000) : null,
    distanceM: dist !== null ? Math.round(dist / 100) : null,
    avgHr: ok(s[16], 0xff),
    maxHr: ok(s[17], 0xff),
    poolM: pool !== null ? Math.round(pool / 100) : null,
    source: 'fit',
  };
}

/** Lit un fichier de montre d'après son nom ; text() et arrayBuffer() fournis par l'appelant. */
export async function parseActivityFile(name, { text, arrayBuffer }) {
  const ext = String(name).toLowerCase().split('.').pop();
  if (ext === 'gpx') return parseGpx(await text());
  if (ext === 'tcx') return parseTcx(await text());
  if (ext === 'fit') return parseFit(await arrayBuffer());
  throw new Error('Format non reconnu : choisissez un fichier .fit, .gpx ou .tcx.');
}

const inRange = (e, from, to) => e.date >= from && e.date <= to;
export function enduranceStats(entries, kind, from = '0000', to = '9999') {
  const list = entries.filter((e) => e.kind === kind && inRange(e, from, to)).sort((a, b) => a.date.localeCompare(b.date));
  const total = list.reduce((a, e) => ({ sec: a.sec + (e.durationSec || 0), m: a.m + (e.distanceM || 0) }), { sec: 0, m: 0 });
  return { list, count: list.length, durationSec: total.sec, distanceM: total.m };
}
