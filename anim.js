// Animations dessinées des exercices : un personnage articulé (cinématique inverse pour les coudes et les genoux),
// interpolé entre des positions clés au tempo de l'exercice. Dessin SVG, sans dépendance, fonctionne hors ligne.
let MOVES = {};
/** Les mouvements sont déclarés dans moves.js, qui les enregistre ici (évite une dépendance circulaire). */
export function registerMoves(m) { MOVES = m; }

export const C = {
  skin: '#ecdcc8', skinFar: '#b9a58f', shirt: '#f2b84b', shirtFar: '#c48e2c', shorts: '#3d4855', shortsFar: '#2b333c',
  shoe: '#cfd6de', shoeFar: '#8d969f', hair: '#3a2f28', iron: '#7a8693', ironDark: '#505a65', steel: '#9aa6b2',
  pad: '#3a4550', padDark: '#2c353f', frame: '#56616d', cable: '#c9d1d9', floor: '#2e3842', accent: '#f2b84b',
};
export const L = { T: 80, SH: 10, UA: 44, FA: 40, TH: 64, SN: 60, FOOT: 24, HEAD: 16 };

const rad = (d) => (d * Math.PI) / 180;
export const pt = (p, len, a) => ({ x: p.x + len * Math.cos(rad(a)), y: p.y + len * Math.sin(rad(a)) });
export const add = (p, dx, dy) => ({ x: p.x + dx, y: p.y + dy });
export const angle = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
export const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/** Cinématique inverse à deux segments : articulation intermédiaire du côté « bend » (+1 ou −1). */
export function ik(a, c, l1, l2, bend) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const d = Math.max(1, Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01));
  const base = Math.atan2(dy, dx);
  const off = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const ang = base + bend * off;
  const mid = { x: a.x + l1 * Math.cos(ang), y: a.y + l1 * Math.sin(ang) };
  const end = { x: mid.x + l2 * Math.cos(Math.atan2(c.y - mid.y, c.x - mid.x)), y: mid.y + l2 * Math.sin(Math.atan2(c.y - mid.y, c.x - mid.x)) };
  return [mid, end];
}

const seg = (...p) => p.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ');
export const line = (pts, stroke, w, extra = {}) => ({ k: 'p', d: seg(...pts), stroke, w, ...extra });
export const circle = (p, r, fill, extra = {}) => ({ k: 'c', x: p.x, y: p.y, r, fill, ...extra });
export const rect = (x, y, w, h, fill, extra = {}) => ({ k: 'r', x, y, w, h, fill, ...extra });

function limb(base, spec, l1, l2) {
  if (spec.to) return [base, ...ik(base, spec.to, l1, l2, spec.bend || 1)];
  const mid = pt(base, l1, spec.a1);
  return [base, mid, pt(mid, l2, spec.a2)];
}

/**
 * Personnage de profil, tourné vers la droite.
 * p.hip, p.tor (angle hanche → cou), p.head (inclinaison de la tête), p.armN / p.armF : { to, bend } ou { a1, a2 },
 * p.legN / p.legF : { to, bend, foot } ou { a1, a2, foot }, p.far : décalage des membres du côté éloigné.
 */
export function side(p) {
  const far = p.far || { x: -5, y: -2 };
  const neck = pt(p.hip, L.T, p.tor);
  const sh = pt(p.hip, L.T - L.SH, p.tor);
  const headC = pt(neck, L.HEAD + 4, p.tor + (p.head || 0));
  const shF = add(sh, far.x, far.y);
  const hipF = add(p.hip, far.x, far.y);
  const shiftTo = (s) => (s.to ? { ...s, to: add(s.to, s.farDx ?? far.x, s.farDy ?? far.y) } : s);
  const armN = limb(sh, p.armN, L.UA, L.FA);
  const armF = limb(shF, shiftTo(p.armF || p.armN), L.UA, L.FA);
  const legN = limb(p.hip, p.legN, L.TH, L.SN);
  const legF = limb(hipF, shiftTo(p.legF || p.legN), L.TH, L.SN);
  const foot = (leg, spec) => {
    const a = spec.foot ?? 0;
    return [pt(leg[2], 6, a + 180), pt(leg[2], L.FOOT - 2, a)];
  };
  const shortsEnd = (leg) => pt(leg[0], L.TH * 0.55, angle(leg[0], leg[1]));
  const items = [];
  // Côté éloigné, derrière le buste.
  items.push(line([legF[1], legF[2]], C.skinFar, 18));
  items.push(line(foot(legF, p.legF || p.legN), C.shoeFar, 12));
  items.push(line([legF[0], legF[1]], C.skinFar, 23));
  items.push(line([legF[0], shortsEnd(legF)], C.shortsFar, 25));
  items.push(line([armF[0], armF[1]], C.skinFar, 15));
  items.push(line([armF[1], armF[2]], C.skinFar, 12));
  items.push(circle(armF[2], 6.5, C.skinFar));
  // Buste, tête.
  items.push(line([pt(p.hip, 4, p.tor), pt(neck, -4, p.tor)], C.shirt, 36));
  items.push(line([p.hip, pt(p.hip, 10, p.tor)], C.shorts, 34));
  items.push(line([neck, pt(neck, 9, p.tor + (p.head || 0))], C.skin, 12));
  items.push(circle(headC, L.HEAD, C.skin));
  items.push({ k: 'a', c: headC, r: L.HEAD, from: p.tor + (p.head || 0) + 110, to: p.tor + (p.head || 0) + 250, fill: C.hair });
  // Côté proche.
  items.push(line([legN[1], legN[2]], C.skin, 19));
  items.push(line(foot(legN, p.legN), C.shoe, 13));
  items.push(line([legN[0], legN[1]], C.skin, 25));
  items.push(line([legN[0], shortsEnd(legN)], C.shorts, 27));
  const near = [];
  near.push(line([armN[0], armN[1]], C.skin, 16));
  near.push(line([armN[1], armN[2]], C.skin, 13));
  near.push(circle(armN[2], 7, C.skin));
  return { items, near, j: { hip: p.hip, neck, sh, shF, head: headC, handN: armN[2], handF: armF[2], elbowN: armN[1], elbowF: armF[1], kneeN: legN[1], ankleN: legN[2], kneeF: legF[1], ankleF: legF[2] } };
}

/**
 * Personnage de face (ou de dos : p.back). p.cx, p.hipY, p.armL / p.armR : { to, bend } ou { a1, a2 },
 * p.legL / p.legR : { to, bend }, p.seated : cuisses vers l'avant (raccourcies).
 */
export function front(p) {
  const cx = p.cx;
  const shY = p.hipY - 70;
  const shL = { x: cx - 33, y: shY };
  const shR = { x: cx + 33, y: shY };
  const hipL = { x: cx - 15, y: p.hipY };
  const hipR = { x: cx + 15, y: p.hipY };
  const armL = limb(shL, p.armL, L.UA, L.FA);
  const armR = limb(shR, p.armR, L.UA, L.FA);
  const items = [];
  const legs = [];
  for (const [hip, spec, s] of [[hipL, p.legL, -1], [hipR, p.legR, 1]]) {
    if (p.kneel) {
      const knee = { x: hip.x + s * 3, y: hip.y + 62 };
      legs.push(line([knee, add(knee, s * 2, 12)], C.skin, 18), line([hip, knee], C.skin, 25), line([hip, pt(hip, L.TH * 0.55, angle(hip, knee))], C.shorts, 28));
    } else if (p.seated) {
      const knee = { x: hip.x + s * 4, y: hip.y + 16 };
      const ankle = spec && spec.to ? spec.to : { x: hip.x + s * 8, y: 250 };
      legs.push(line([knee, ankle], C.skin, 18), line([pt(ankle, 0, 0), add(ankle, s * 8, 6)], C.shoe, 13), line([hip, knee], C.shorts, 30));
    } else {
      const [knee, ankle] = ik(hip, spec && spec.to ? spec.to : { x: hip.x + s * 5, y: 250 }, L.TH, L.SN, spec && spec.bend ? spec.bend : -s);
      legs.push(line([knee, ankle], C.skin, 19), line([add(ankle, 0, 5), add(ankle, s * 9, 7)], C.shoe, 13), line([hip, knee], C.skin, 25), line([hip, pt(hip, L.TH * 0.55, angle(hip, knee))], C.shorts, 28));
    }
  }
  items.push(...legs);
  const head = { x: cx, y: shY - 30 };
  items.push(line([{ x: cx, y: shY - 8 }, { x: cx, y: shY - 18 }], C.skin, 14));
  items.push({ k: 'f', d: `M${cx - 36} ${shY - 4} Q${cx} ${shY - 12} ${cx + 36} ${shY - 4} L${cx + 23} ${p.hipY - 2} L${cx - 23} ${p.hipY - 2} Z`, fill: C.shirt, stroke: C.shirt, w: 8 });
  if (p.back) items.push(line([{ x: cx, y: shY + 6 }, { x: cx, y: p.hipY - 12 }], C.shirtFar, 3));
  items.push(rect(cx - 25, p.hipY - 6, 50, 14, C.shorts, { rx: 5 }));
  items.push(circle(head, L.HEAD, p.back ? C.hair : C.skin));
  if (!p.back) items.push({ k: 'a', c: head, r: L.HEAD, from: 200, to: 340, fill: C.hair });
  const arms = [];
  for (const arm of [armL, armR]) arms.push(line([arm[0], arm[1]], C.skin, 16), line([arm[1], arm[2]], C.skin, 13), circle(arm[2], 7, C.skin));
  // Bras tendus vers l'avant vus de dos : derrière le buste.
  if (p.armsBehind) return { items: [...legs, ...arms, ...items.slice(legs.length)], near: [], j: { shL, shR, hipL, hipR, handL: armL[2], handR: armR[2], elbowL: armL[1], elbowR: armR[1], head, shY } };
  return { items, near: arms, j: { shL, shR, hipL, hipR, handL: armL[2], handR: armR[2], elbowL: armL[1], elbowR: armR[1], head, shY } };
}

// Accessoires.
export const plate = (p, r = 15, extra = {}) => [circle(p, r, C.ironDark, { stroke: C.iron, sw: 3, ...extra }), circle(p, 3.5, C.steel)];
export const dumbbellSide = (p, a = 0, len = 32) => [line([pt(p, len / 2, a + 180), pt(p, len / 2, a)], C.steel, 5), line([pt(p, len / 2, a + 180), pt(p, len / 2 - 8, a + 180)], C.iron, 14), line([pt(p, len / 2, a), pt(p, len / 2 - 8, a)], C.iron, 14)];
export const floor = () => line([{ x: 30, y: 262 }, { x: 370, y: 262 }], C.floor, 4);
export const cable = (a, b) => line([a, b], C.cable, 2);
export const pulley = (p) => [circle(p, 8, C.frame), circle(p, 3, C.steel)];

/** Positions clés : interpolation des nombres (et des objets {x, y}) entre a et b. */
export function mix(a, b, t) {
  if (typeof a === 'number') return lerp(a, b, t);
  if (a && typeof a === 'object') {
    const o = Array.isArray(a) ? [] : {};
    for (const k of Object.keys(a)) o[k] = b && k in b ? mix(a[k], b[k], t) : a[k];
    return o;
  }
  return t < 0.5 ? a : b;
}

/** Valeur d'une suite de positions clés au temps s (secondes) : keys = [{ dur, pose }], boucle. */
export function timeline(keys, s) {
  const total = keys.reduce((n, k) => n + k.dur, 0);
  let x = s % total;
  for (let i = 0; i < keys.length; i += 1) {
    const k = keys[i];
    if (x <= k.dur) {
      const next = keys[(i + 1) % keys.length];
      const t = k.hold ? 0 : ease(x / k.dur);
      return mix(k.pose, next.pose, t);
    }
    x -= k.dur;
  }
  return keys[0].pose;
}

/** Boucle classique : A (départ) → B, pause, B → A, pause. tempo = { ab, ba, holdA, holdB }. */
export function rep(A, B, { ab = 2, ba = 1.2, holdA = 0.4, holdB = 0.35 } = {}) {
  return [{ dur: holdA, pose: A, hold: true }, { dur: ab, pose: A }, { dur: holdB, pose: B, hold: true }, { dur: ba, pose: B }];
}

// ---------- Rendu dans la page ----------

function render(svg, items) {
  const sig = items.map((i) => i.k).join('');
  if (svg._sig !== sig) {
    svg.innerHTML = items.map((i) => (i.k === 'c' ? '<circle/>' : i.k === 'r' ? '<rect/>' : '<path/>')).join('');
    svg._sig = sig;
  }
  const els = svg.children;
  items.forEach((i, n) => {
    const e = els[n];
    if (i.k === 'p') {
      e.setAttribute('d', i.d);
      e.setAttribute('stroke', i.stroke);
      e.setAttribute('stroke-width', i.w);
      e.setAttribute('stroke-linecap', i.cap || 'round');
      e.setAttribute('stroke-linejoin', 'round');
      e.setAttribute('fill', 'none');
      if (i.dash) e.setAttribute('stroke-dasharray', i.dash);
    } else if (i.k === 'f') {
      e.setAttribute('d', i.d);
      e.setAttribute('fill', i.fill);
      if (i.stroke) { e.setAttribute('stroke', i.stroke); e.setAttribute('stroke-width', i.w || 1); e.setAttribute('stroke-linejoin', 'round'); }
    } else if (i.k === 'a') {
      const p1 = pt(i.c, i.r, i.from);
      const p2 = pt(i.c, i.r, i.to);
      e.setAttribute('d', `M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A${i.r} ${i.r} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z`);
      e.setAttribute('fill', i.fill);
    } else if (i.k === 'c') {
      e.setAttribute('cx', i.x.toFixed(1));
      e.setAttribute('cy', i.y.toFixed(1));
      e.setAttribute('r', i.r);
      e.setAttribute('fill', i.fill);
      if (i.stroke) { e.setAttribute('stroke', i.stroke); e.setAttribute('stroke-width', i.sw || 2); }
    } else if (i.k === 'r') {
      e.setAttribute('x', i.x.toFixed(1));
      e.setAttribute('y', i.y.toFixed(1));
      e.setAttribute('width', i.w);
      e.setAttribute('height', i.h);
      e.setAttribute('rx', i.rx || 4);
      e.setAttribute('fill', i.fill);
      if (i.rot) e.setAttribute('transform', `rotate(${i.rot.a.toFixed(1)} ${i.rot.cx.toFixed(1)} ${i.rot.cy.toFixed(1)})`);
    }
  });
}

/** Image d'un exercice au temps s : liste d'éléments à dessiner. */
export function frame(id, s) {
  const m = MOVES[id];
  const pose = timeline(m.keys, s);
  return m.draw(pose);
}

export const hasAnimation = (id) => !!MOVES[id];
export const cueOf = (id) => (MOVES[id] ? MOVES[id].cue : null);
export const viewOf = (id) => (MOVES[id] ? MOVES[id].view : null);
export const viewBoxOf = (id) => (MOVES[id] && MOVES[id].viewBox) || '0 0 400 300';

const mounted = new Set();
let running = false;
let visible = new WeakSet();
const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); })) : null;

function loop(ms) {
  for (const svg of mounted) {
    if (!svg.isConnected) { mounted.delete(svg); if (io) io.unobserve(svg); continue; }
    if (io && !visible.has(svg)) continue;
    if (svg._thumb && (ms - (svg._last || 0)) < 40) continue;
    svg._last = ms;
    render(svg, frame(svg.dataset.anim, ms / 1000 + (svg._offset || 0)));
  }
  if (mounted.size) requestAnimationFrame(loop); else running = false;
}

/** Démarre les animations des éléments <svg data-anim="id"> présents dans la page. */
export function mountAnimations(root = document) {
  root.querySelectorAll('svg[data-anim]').forEach((svg, i) => {
    if (mounted.has(svg)) return;
    svg._thumb = svg.classList.contains('thumb-svg');
    svg._offset = svg._thumb ? i * 0.7 : 0;
    render(svg, frame(svg.dataset.anim, svg._offset));
    mounted.add(svg);
    if (io) io.observe(svg); else visible.add(svg);
  });
  if (!running && mounted.size) { running = true; requestAnimationFrame(loop); }
}

