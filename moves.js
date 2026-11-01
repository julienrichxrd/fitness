// Définition des mouvements : positions clés (départ, arrivée), tempo, décor, et une image mentale par exercice.
// Repère : toile de 400 × 300, sol à y = 262. Vue de profil : le personnage regarde vers la droite.
// Le tempo suit le programme : phase de retour (excentrique) ~2 s, phase d'effort (concentrique) ~1 s.
import { side, front, pt, add, line, circle, rect, plate, dumbbellSide, floor, cable, pulley, rep, angle, C, L, registerMoves } from './anim.js';

const STAND = { x: 205, y: 250 }; // cheville, debout
const FLOOR_Y = 262;
const eccentricFirst = { ab: 2.2, ba: 1.1 };
const concentricFirst = { ab: 1.1, ba: 2.1 };

const benchFlat = (x1, x2, y) => [rect(x1, y, x2 - x1, 15, C.pad, { rx: 6 }), rect(x1 + 22, y + 15, 9, FLOOR_Y - y - 15, C.padDark, { rx: 2 }), rect(x2 - 31, y + 15, 9, FLOOR_Y - y - 15, C.padDark, { rx: 2 })];
const padLine = (a, b, w = 16) => line([a, b], C.pad, w);
const post = (x, y1, y2 = FLOOR_Y) => line([{ x, y: y1 }, { x, y: y2 }], C.frame, 8, { cap: 'butt' });
const all = (...parts) => parts.flat(Infinity).filter(Boolean);

function bodyDraw(b, back = [], mid = [], fore = []) {
  return all(floor(), back, b.items, mid, b.near, fore);
}

// Bras qui pendent sous l'épaule (de profil).
const hang = (sh, dx = 0, len = 82) => ({ x: sh.x + dx, y: sh.y + len });

export const MOVES = {
  // ---------------- Séance A ----------------
  'db-bench-press': {
    view: 'Vue de profil',
    cue: 'Imaginez un crayon coincé entre vos omoplates : gardez-le serré pendant toute la série, et descendez jusqu\'à sentir l\'étirement des pectoraux.',
    keys: rep({ hand: { x: 213, y: 78 } }, { hand: { x: 181, y: 151 } }, eccentricFirst),
    draw(p) {
      const b = side({ hip: { x: 140, y: 162 }, tor: -2, head: 8, armN: { to: p.hand, bend: -1 }, legN: { to: { x: 86, y: 250 }, bend: 1, foot: 0 } });
      return bodyDraw(b, benchFlat(92, 290, 176), [plate(add(b.j.handF, 0, 0), 14)], [plate(b.j.handN, 16)]);
    },
  },
  'incline-db-press': {
    view: 'Vue de profil',
    cue: 'Omoplates serrées et poitrine sortie : poussez les haltères vers le plafond en les rapprochant légèrement en haut, sans les cogner.',
    keys: rep({ hand: { x: 214, y: 72 } }, { hand: { x: 193, y: 150 } }, eccentricFirst),
    draw(p) {
      const hip = { x: 150, y: 190 };
      const b = side({ hip, tor: -32, head: 10, armN: { to: p.hand, bend: -1 }, legN: { to: { x: 108, y: 250 }, bend: 1, foot: 0 } });
      return bodyDraw(b, [padLine(pt(hip, -10, -32), pt(hip, 104, -32), 15), rect(110, 194, 70, 14, C.pad, { rx: 6 }), post(160, 208)], [plate(b.j.handF, 14)], [plate(b.j.handN, 16)]);
    },
  },
  'pullup-pronated': {
    view: 'Vue de dos',
    cue: 'Imaginez que vous essayez de briser la barre en deux avec vos mains : c\'est ce geste qui engage le dos. Tirez les coudes vers le bas, menton au-dessus de la barre.',
    keys: rep({ y: 0 }, { y: -62 }, concentricFirst),
    draw(p) {
      const hipY = 190 + p.y;
      const shY = hipY - 70;
      const bend = (s) => ({ to: { x: 200 + s * 64, y: 40 }, bend: s > 0 ? -1 : 1 });
      const b = front({ cx: 200, hipY, back: true, armL: bend(-1), armR: bend(1), legL: { to: { x: 192, y: hipY + 118 }, bend: 1 }, legR: { to: { x: 208, y: hipY + 118 }, bend: -1 } });
      void shY;
      return all(line([{ x: 70, y: 40 }, { x: 330, y: 40 }], C.steel, 7), post(74, 40, 100), post(326, 40, 100), b.items, b.near);
    },
  },
  'assisted-pullup': {
    view: 'Vue de dos',
    cue: 'Même geste que les tractions : essayez de briser la barre en deux, et tirez les coudes vers vos poches arrière. La machine aide, pas vos jambes.',
    keys: rep({ y: 0 }, { y: -56 }, concentricFirst),
    draw(p) {
      const hipY = 186 + p.y;
      const arm = (s) => ({ to: { x: 200 + s * 62, y: 40 }, bend: s > 0 ? -1 : 1 });
      const b = front({ cx: 200, hipY, back: true, kneel: true, armL: arm(-1), armR: arm(1) });
      return all(line([{ x: 90, y: 40 }, { x: 310, y: 40 }], C.steel, 7), post(96, 40, FLOOR_Y), post(304, 40, FLOOR_Y), rect(160, hipY + 66, 80, 14, C.pad, { rx: 6 }), line([{ x: 200, y: hipY + 78 }, { x: 200, y: FLOOR_Y }], C.frame, 8), b.items, b.near);
    },
  },
  'lat-pulldown-pronated': {
    view: 'Vue de face',
    cue: 'Tirez avec les coudes, pas avec les mains : imaginez que vous rangez vos coudes dans vos poches arrière. La barre vient au haut de la poitrine.',
    keys: rep({ hy: 38 }, { hy: 120 }, concentricFirst),
    draw(p) {
      const arm = (s) => ({ to: { x: 200 + s * (p.hy < 80 ? 66 : 62), y: p.hy }, bend: s > 0 ? -1 : 1 });
      const b = front({ cx: 200, hipY: 196, seated: true, armL: arm(-1), armR: arm(1) });
      return all(floor(), cable({ x: 200, y: 0 }, { x: 200, y: p.hy }), rect(130, 202, 140, 12, C.pad, { rx: 5 }), b.items, rect(150, 210, 100, 12, C.pad, { rx: 5 }), b.near, line([{ x: 112, y: p.hy }, { x: 288, y: p.hy }], C.steel, 6));
    },
  },
  'chest-supported-db-row': {
    view: 'Vue de profil',
    cue: 'Poitrine collée au banc : tirez les coudes vers les hanches comme si vous mettiez les mains dans vos poches, et serrez les omoplates une seconde en haut.',
    keys: rep({ hand: null, h: 0 }, { h: 1 }, concentricFirst),
    draw(p) {
      const hip = { x: 150, y: 196 };
      const tor = -30;
      const sh = pt(hip, L.T - L.SH, tor);
      const low = hang(sh, 2, 82);
      const high = { x: sh.x - 25, y: sh.y + 17 };
      const hand = { x: low.x + (high.x - low.x) * p.h, y: low.y + (high.y - low.y) * p.h };
      const b = side({ hip, tor, head: 18, armN: { to: hand, bend: 1 }, legN: { to: { x: 112, y: 250 }, bend: 1, foot: 0 } });
      const off = (q) => pt(q, 20, tor + 90);
      return bodyDraw(b, [padLine(off(pt(hip, -14, tor)), off(pt(hip, 70, tor)), 14), post(150, 214), rect(112, 210, 56, 12, C.pad, { rx: 5 })], [plate(b.j.handF, 13)], [plate(b.j.handN, 15)]);
    },
  },
  'cable-fly': {
    view: 'Vue de face',
    cue: 'Faites comme si vous enlaciez un gros arbre : coudes légèrement fléchis et figés, les mains se rejoignent devant la poitrine. Revenez lentement jusqu\'à l\'étirement.',
    keys: rep({ open: 1 }, { open: 0 }, concentricFirst),
    draw(p) {
      const hipY = 128;
      const shY = hipY - 70;
      const hand = (s) => ({ x: 200 + s * (16 + 110 * p.open), y: shY + 36 - 14 * p.open });
      const arm = (s) => ({ to: hand(s), bend: s > 0 ? -1 : 1 });
      const b = front({ cx: 200, hipY, armL: arm(-1), armR: arm(1) });
      const pl = { x: 40, y: 34 };
      const pr = { x: 360, y: 34 };
      return all(floor(), post(40, 20), post(360, 20), pulley(pl), pulley(pr), cable(pl, b.j.handL), cable(pr, b.j.handR), b.items, b.near);
    },
  },
  'cable-lateral-raise': {
    view: 'Vue de face',
    cue: 'Montez le coude, pas la main : imaginez qu\'on tire votre coude vers le mur sur le côté. Arrêtez à l\'horizontale, sans hausser l\'épaule.',
    keys: rep({ r: 0 }, { r: 1 }, concentricFirst),
    draw(p) {
      const hipY = 128;
      const shY = hipY - 70;
      const ang = 90 + 8 + 74 * p.r; // bras gauche de l'image : de 98° (le long du corps, devant) à 172° (horizontal)
      const shL = { x: 167, y: shY };
      const elbow = pt(shL, L.UA, ang);
      const handL = pt(elbow, L.FA, ang - 10);
      const b = front({ cx: 200, hipY, armL: { to: handL, bend: 1 }, armR: { to: { x: 250, y: hipY - 6 }, bend: -1 } });
      const pul = { x: 300, y: 246 };
      return all(floor(), post(312, 30), pulley(pul), cable(pul, b.j.handL), b.items, b.near);
    },
  },
  'db-lateral-raise': {
    view: 'Vue de face',
    cue: 'Montez le coude, pas la main : imaginez qu\'on tire vos coudes vers les murs sur les côtés. Arrêtez à l\'horizontale, épaules basses.',
    keys: rep({ r: 0 }, { r: 1 }, concentricFirst),
    draw(p) {
      const hipY = 128;
      const shY = hipY - 70;
      const items = [];
      const arm = (s) => {
        const sh = { x: 200 + s * 33, y: shY };
        const a = 90 - s * (10 + 76 * p.r);
        const elbow = pt(sh, L.UA, a);
        return { to: pt(elbow, L.FA, a + s * 10), bend: s > 0 ? -1 : 1 };
      };
      const b = front({ cx: 200, hipY, armL: arm(-1), armR: arm(1) });
      for (const [h, s] of [[b.j.handL, -1], [b.j.handR, 1]]) items.push(rect(h.x - 6, h.y - 14, 12, 28, C.iron, { rx: 4, rot: { a: angle(s < 0 ? b.j.elbowL : b.j.elbowR, h) - 90, cx: h.x, cy: h.y } }));
      return all(floor(), b.items, b.near, items);
    },
  },
  'overhead-cable-triceps-ext': {
    view: 'Vue de profil',
    cue: 'Les coudes restent pointés vers l\'avant comme s\'ils étaient vissés : seuls les avant-bras bougent. Écartez légèrement la corde quand les bras sont tendus.',
    keys: rep({ f: 0 }, { f: 1 }, concentricFirst),
    draw(p) {
      const hip = { x: 188, y: 134 };
      const tor = -62;
      const ua = -52;
      const fa = ua + 155 - 152 * p.f;
      const b = side({ hip, tor, head: -6, armN: { a1: ua, a2: fa }, legN: { to: { x: 240, y: 250 }, bend: -1, foot: 0 }, legF: { to: { x: 150, y: 250 }, bend: -1, foot: 0, farDx: 0, farDy: 0 } });
      const pul = { x: 46, y: 120 };
      return bodyDraw(b, [post(40, 30), pulley(pul), cable(pul, b.j.handF)], [], [cable(pul, b.j.handN), line([pt(b.j.handN, 6, fa + 90), pt(b.j.handN, 6, fa - 90)], C.cable, 6)]);
    },
  },
  'incline-db-curl': {
    view: 'Vue de profil',
    cue: 'Les bras restent derrière le buste, comme accrochés à vos épaules : seuls les avant-bras montent. Descendez jusqu\'à presque tendre les bras.',
    keys: rep({ f: 0 }, { f: 1 }, concentricFirst),
    draw(p) {
      const hip = { x: 222, y: 196 };
      const tor = -128;
      const fa = 92 - 145 * p.f;
      const b = side({ hip, tor, head: 20, armN: { a1: 94, a2: fa }, legN: { to: { x: 290, y: 250 }, bend: -1, foot: 0 } });
      return bodyDraw(b, [padLine(pt(hip, -6, tor), pt(hip, 98, tor), 15), rect(196, 200, 70, 13, C.pad, { rx: 6 }), post(226, 212)], [plate(b.j.handF, 12)], [plate(b.j.handN, 14)]);
    },
  },
  'seated-leg-curl': {
    view: 'Vue de profil',
    cue: 'Bassin plaqué au siège : ramenez les talons sous vous en serrant l\'arrière des cuisses, puis freinez la remontée.',
    keys: rep({ s: 0 }, { s: 1 }, concentricFirst),
    draw(p) {
      const hip = { x: 162, y: 182 };
      const sh = 2 + 104 * p.s;
      const b = side({ hip, tor: -104, head: 6, armN: { to: { x: 196, y: 172 }, bend: 1 }, legN: { a1: 0, a2: sh, foot: sh - 85 } });
      const pad = pt(b.j.ankleN, 8, sh + 90);
      return bodyDraw(b, [padLine(pt(hip, -4, -104), pt(hip, 92, -104), 15), rect(120, 190, 120, 14, C.pad, { rx: 6 }), post(170, 204)], [], [rect(192, 160, 50, 12, C.pad, { rx: 5 }), circle(add(pad, 4, 4), 10, C.pad), line([b.j.kneeN, add(pad, 4, 4)], C.frame, 5)]);
    },
  },
  'cable-crunch': {
    view: 'Vue de profil',
    cue: 'Enroulez la colonne comme pour amener le front vers les genoux : ce sont les abdos qui tirent, pas les bras ni les hanches.',
    keys: rep({ c: 0 }, { c: 1 }, concentricFirst),
    draw(p) {
      const knee = { x: 196, y: 250 };
      const hip = { x: 192 - 8 * p.c, y: 188 + 4 * p.c };
      const tor = -78 + 84 * p.c;
      const head = 8 + 22 * p.c;
      const neck = pt(hip, L.T, tor);
      const hc = pt(neck, L.HEAD + 4, tor + head);
      const hand = pt(hc, 14, tor + head + 70);
      const b = side({ hip, tor, head, armN: { to: hand, bend: 1 }, legN: { to: { x: 140, y: 252 }, bend: -1, foot: 180 } });
      void knee;
      const pul = { x: 300, y: 18 };
      return bodyDraw(b, [post(312, 10), pulley(pul)], [], [cable(pul, b.j.handN)]);
    },
  },

  // ---------------- Séance B ----------------
  'box-jump': {
    view: 'Vue de profil',
    viewBox: '-20 -52 440 330',
    cue: 'Bras en arrière, puis lancez-les vers l\'avant en poussant le sol : réception silencieuse sur la box, comme un chat. On redescend en marchant.',
    keys: (() => {
      const stand = { hx: 186, hy: 128, tor: -88, ax: 190, ay: 250, arm: 92 };
      const load = { hx: 172, hy: 170, tor: -42, ax: 190, ay: 250, arm: 160 };
      const air = { hx: 246, hy: 96, tor: -70, ax: 262, ay: 186, arm: -40 };
      const land = { hx: 272, hy: 136, tor: -52, ax: 292, ay: 192, arm: 20 };
      const top = { hx: 290, hy: 72, tor: -90, ax: 292, ay: 192, arm: 92 };
      return [{ dur: 0.6, pose: stand, hold: true }, { dur: 0.55, pose: stand }, { dur: 0.25, pose: load }, { dur: 0.32, pose: air }, { dur: 0.3, pose: land }, { dur: 0.5, pose: top }, { dur: 0.6, pose: top, hold: true }, { dur: 0.01, pose: top }];
    })(),
    draw(p) {
      const hip = { x: p.hx, y: p.hy };
      const sh = pt(hip, L.T - L.SH, p.tor);
      const b = side({ hip, tor: p.tor, head: 6, armN: { a1: p.arm, a2: p.arm - 8 }, legN: { to: { x: p.ax, y: p.ay }, bend: -1, foot: 0 } });
      void sh;
      return bodyDraw(b, [rect(262, 205, 82, 57, C.pad, { rx: 6 })]);
    },
  },
  'vertical-jump': {
    view: 'Vue de profil',
    cue: 'Petite flexion, bras en arrière, puis poussez le sol de toutes vos forces en lançant les bras vers le haut. Réception souple, genoux fléchis.',
    keys: (() => {
      const stand = { hx: 200, hy: 128, tor: -88, ay: 250, arm: 92 };
      const load = { hx: 188, hy: 160, tor: -50, ay: 250, arm: 155 };
      const air = { hx: 202, hy: 82, tor: -90, ay: 208, arm: -95 };
      const landing = { hx: 192, hy: 150, tor: -58, ay: 250, arm: 40 };
      return [{ dur: 0.7, pose: stand, hold: true }, { dur: 0.5, pose: stand }, { dur: 0.25, pose: load }, { dur: 0.32, pose: air }, { dur: 0.32, pose: landing }, { dur: 0.6, pose: landing }];
    })(),
    draw(p) {
      const b = side({ hip: { x: p.hx, y: p.hy }, tor: p.tor, head: 4, armN: { a1: p.arm, a2: p.arm - 6 }, legN: { to: { x: 204, y: p.ay }, bend: -1, foot: 0 } });
      return bodyDraw(b);
    },
  },
  'barbell-squat': {
    view: 'Vue de profil',
    cue: 'Écartez le sol avec les pieds et descendez entre vos talons, poitrine fière. Les genoux suivent la pointe des pieds ; remontez en poussant le sol.',
    keys: rep({ hx: 200, hy: 130, tor: -84 }, { hx: 158, hy: 196, tor: -50 }, { ab: 2.3, ba: 1.3 }),
    draw(p) {
      const hip = { x: p.hx, y: p.hy };
      const sh = pt(hip, L.T - L.SH, p.tor);
      const bar = pt(sh, 15, p.tor - 96);
      const b = side({ hip, tor: p.tor, head: 14, armN: { to: add(bar, 10, 4), bend: 1 }, legN: { to: STAND, bend: -1, foot: 0 } });
      return all(floor(), plate(bar, 28, { sw: 4 }), b.items, b.near);
    },
  },
  'db-rdl': {
    view: 'Vue de profil',
    cue: 'Poussez les fesses vers le mur derrière vous, comme pour fermer une porte avec : dos plat, genoux légèrement fléchis, les haltères frôlent les jambes.',
    keys: rep({ hx: 200, hy: 128, tor: -88 }, { hx: 152, hy: 138, tor: -16 }, { ab: 2.3, ba: 1.2 }),
    draw(p) {
      const hip = { x: p.hx, y: p.hy };
      const sh = pt(hip, L.T - L.SH, p.tor);
      const hand = { x: sh.x + 2, y: sh.y + 82 };
      const b = side({ hip, tor: p.tor, head: 4, armN: { to: hand, bend: 1 }, legN: { to: STAND, bend: -1, foot: 0 } });
      return bodyDraw(b, [], [plate(b.j.handF, 12)], [plate(b.j.handN, 14)]);
    },
  },
  'leg-press': {
    view: 'Vue de profil',
    cue: 'Poussez à travers les talons, le bas du dos reste collé au dossier. Descendez jusqu\'à ce que les genoux approchent de la poitrine, sans verrouiller en haut.',
    keys: rep({ d: 114 }, { d: 64 }, { ab: 2.3, ba: 1.2 }),
    draw(p) {
      const hip = { x: 132, y: 206 };
      const dir = -42;
      const ankle = pt(hip, p.d, dir);
      const b = side({ hip, tor: -146, head: 30, armN: { to: { x: 150, y: 214 }, bend: 1 }, legN: { to: ankle, bend: 1, foot: dir - 86 } });
      const plat = pt(ankle, 6, dir);
      return all(floor(), line([pt(hip, 30, dir), pt(hip, 210, dir)], C.padDark, 6), padLine(pt(hip, -6, -146), pt(hip, 100, -146), 16), line([{ x: 108, y: 214 }, { x: 160, y: 214 }], C.pad, 14), b.items, b.near, line([pt(plat, 34, dir - 90), pt(plat, 30, dir + 90)], C.frame, 9));
    },
  },
  'leg-extension': {
    view: 'Vue de profil',
    cue: 'Tendez complètement les jambes et serrez les cuisses une seconde en haut, puis freinez la descente jusqu\'à l\'angle droit.',
    keys: rep({ s: 0 }, { s: 1 }, { ab: 1.1, ba: 2.1, holdB: 0.9 }),
    draw(p) {
      const hip = { x: 168, y: 188 };
      const sh = 94 - 90 * p.s;
      const b = side({ hip, tor: -98, head: 4, armN: { to: { x: 176, y: 204 }, bend: 1 }, legN: { a1: 2, a2: sh, foot: sh - 92 } });
      const pad = pt(b.j.kneeN, 50, sh);
      return bodyDraw(b, [padLine(pt(hip, -4, -98), pt(hip, 90, -98), 15), rect(132, 196, 104, 14, C.pad, { rx: 6 }), post(178, 210)], [], [line([b.j.kneeN, pad], C.frame, 5), circle(add(pt(pad, 10, sh + 90), 0, 0), 10, C.pad)]);
    },
  },
  'reverse-pec-deck': {
    view: 'Vue de dos',
    cue: 'Écartez les bras comme pour ouvrir de grands rideaux, coudes légèrement fléchis, épaules basses : c\'est l\'arrière de l\'épaule qui travaille.',
    keys: rep({ o: 0 }, { o: 1 }, concentricFirst),
    draw(p) {
      const hipY = 190;
      const shY = hipY - 70;
      const hand = (s) => ({ x: 200 + s * (34 + 88 * p.o), y: shY + 6 });
      const arm = (s) => ({ to: hand(s), bend: s > 0 ? 1 : -1 });
      const b = front({ cx: 200, hipY, back: true, seated: true, armsBehind: p.o < 0.3, armL: arm(-1), armR: arm(1) });
      return all(floor(), rect(150, 196, 100, 14, C.pad, { rx: 6 }), b.items, b.near, line([add(b.j.handL, 0, -16), add(b.j.handL, 0, 16)], C.frame, 7), line([add(b.j.handR, 0, -16), add(b.j.handR, 0, 16)], C.frame, 7));
    },
  },
  'cable-reverse-fly': {
    view: 'Vue de dos',
    cue: 'Bras croisés devant vous au départ, puis ouvrez comme de grands rideaux jusqu\'à former un T : coudes souples, épaules basses.',
    keys: rep({ o: 0 }, { o: 1 }, concentricFirst),
    draw(p) {
      const hipY = 128;
      const shY = hipY - 70;
      const hand = (s) => ({ x: 200 + s * (30 + 96 * p.o), y: shY + 4 });
      const arm = (s) => ({ to: hand(s), bend: s > 0 ? 1 : -1 });
      const b = front({ cx: 200, hipY, back: true, armsBehind: p.o < 0.3, armL: arm(-1), armR: arm(1) });
      const pl = { x: 40, y: shY };
      const pr = { x: 360, y: shY };
      return all(floor(), post(40, 30), post(360, 30), pulley(pl), pulley(pr), cable(pr, b.j.handL), cable(pl, b.j.handR), b.items, b.near);
    },
  },
  'seated-db-shoulder-press': {
    view: 'Vue de face',
    cue: 'Côtes rentrées, dos contre le dossier : poussez les haltères vers le plafond en les rapprochant un peu en haut, sans cambrer. Redescendez au niveau des oreilles.',
    keys: rep({ u: 0 }, { u: 1 }, concentricFirst),
    draw(p) {
      const hipY = 196;
      const shY = hipY - 70;
      const hand = (s) => ({ x: 200 + s * (66 - 34 * p.u), y: shY - 12 - 68 * p.u });
      const arm = (s) => ({ to: hand(s), bend: s > 0 ? 1 : -1 });
      const b = front({ cx: 200, hipY, seated: true, armL: arm(-1), armR: arm(1) });
      const db = (h) => rect(h.x - 17, h.y - 6, 34, 12, C.iron, { rx: 4 });
      return all(floor(), rect(150, 50, 100, 150, C.pad, { rx: 10 }), rect(140, 200, 120, 13, C.pad, { rx: 6 }), b.items, b.near, db(b.j.handL), db(b.j.handR));
    },
  },
  'calf-raise': {
    view: 'Vue de profil',
    viewBox: '-20 -40 440 330',
    cue: 'Montez le plus haut possible sur la pointe des pieds et tenez une seconde, puis descendez lentement jusqu\'à bien étirer les mollets.',
    keys: rep({ f: -20 }, { f: 40 }, { ab: 1, ba: 2, holdB: 1 }),
    draw(p) {
      const ball = { x: 226, y: 236 };
      const ankle = pt(ball, L.FOOT - 4, p.f + 180);
      const hip = { x: ankle.x - 2, y: ankle.y - 122 };
      const b = side({ hip, tor: -90, head: 0, armN: { to: add(pt(hip, L.T - L.SH, -90), 14, -6), bend: 1 }, legN: { to: ankle, bend: -1, foot: p.f } });
      const sh = pt(hip, L.T - L.SH, -90);
      return all(floor(), rect(212, 242, 56, 20, C.pad, { rx: 4 }), post(300, 20), b.items, rect(sh.x - 18, sh.y - 16, 46, 12, C.pad, { rx: 5 }), line([{ x: sh.x + 26, y: sh.y - 10 }, { x: 300, y: sh.y - 10 }], C.frame, 6), b.near);
    },
  },
  'db-hammer-curl': {
    view: 'Vue de profil',
    cue: 'Pouces vers le plafond, coudes collés au corps comme des charnières : seuls les avant-bras bougent. Descendez jusqu\'en bas, sans élan.',
    keys: rep({ f: 0 }, { f: 1 }, concentricFirst),
    draw(p) {
      const fa = 88 - 146 * p.f;
      const b = side({ hip: { x: 200, y: 128 }, tor: -89, head: 2, armN: { a1: 94, a2: fa }, legN: { to: STAND, bend: -1, foot: 0 } });
      return bodyDraw(b, [], [dumbbellSide(b.j.handF, fa + 90, 28)], [dumbbellSide(b.j.handN, fa + 90, 30)]);
    },
  },
  'rope-pushdown': {
    view: 'Vue de profil',
    cue: 'Coudes collés aux flancs comme des charnières : poussez la corde vers le bas et écartez-la en fin de mouvement, triceps serrés.',
    keys: rep({ f: 0 }, { f: 1 }, concentricFirst),
    draw(p) {
      const fa = -12 + 96 * p.f;
      const b = side({ hip: { x: 196, y: 130 }, tor: -80, head: 4, armN: { a1: 98, a2: fa }, legN: { to: STAND, bend: -1, foot: 0 } });
      const pul = { x: 268, y: 16 };
      return bodyDraw(b, [post(280, 8), pulley(pul)], [], [cable(pul, b.j.handN), line([pt(b.j.handN, 7, fa + 90), pt(b.j.handN, 7, fa - 90)], C.cable, 6)]);
    },
  },

  // ---------------- Séance C ----------------
  'lat-pulldown-neutral': {
    view: 'Vue de profil',
    cue: 'Tirez les coudes vers les hanches, poitrine vers la poignée, buste à peine incliné en arrière. Remontez lentement jusqu\'à étirer le dos.',
    keys: rep({ h: 0, tor: -96 }, { h: 1, tor: -106 }, concentricFirst),
    draw(p) {
      const hip = { x: 184, y: 192 };
      const sh = pt(hip, L.T - L.SH, p.tor);
      const top = { x: 226, y: 46 };
      const low = { x: sh.x + 26, y: sh.y + 16 };
      const hand = { x: top.x + (low.x - top.x) * p.h, y: top.y + (low.y - top.y) * p.h };
      const b = side({ hip, tor: p.tor, head: 2, armN: { to: hand, bend: 1 }, legN: { a1: 2, a2: 92, foot: 0 } });
      const pul = { x: 234, y: 8 };
      return bodyDraw(b, [rect(150, 200, 80, 13, C.pad, { rx: 6 }), post(186, 213)], [], [cable(pul, b.j.handN), rect(b.j.handN.x - 10, b.j.handN.y - 4, 20, 8, C.steel, { rx: 3 }), rect(232, 172, 30, 12, C.pad, { rx: 5 })]);
    },
  },
  dips: {
    view: 'Vue de profil',
    viewBox: '-20 -40 440 330',
    cue: 'Buste légèrement penché en avant, descendez jusqu\'à ce que les épaules soient au niveau des coudes, puis poussez les barres loin de vous.',
    keys: rep({ hx: 191, hy: 116, tor: -80 }, { hx: 165, hy: 170, tor: -64 }, eccentricFirst),
    draw(p) {
      const grip = { x: 206, y: 132 };
      const b = side({ hip: { x: p.hx, y: p.hy }, tor: p.tor, head: 10, armN: { to: grip, bend: 1 }, legN: { a1: 100, a2: 205, foot: 120 } });
      return all(floor(), post(214, 132), post(196, 132), b.items, b.near, circle(grip, 7, C.steel));
    },
  },
  'one-arm-db-row': {
    view: 'Vue de profil',
    cue: 'Tirez le coude vers la hanche comme pour démarrer une tondeuse, mais lentement. Le dos reste plat et immobile.',
    keys: rep({ h: 0 }, { h: 1 }, concentricFirst),
    draw(p) {
      const hip = { x: 150, y: 150 };
      const tor = -10;
      const sh = pt(hip, L.T - L.SH, tor);
      const low = hang(sh, 4, 82);
      const high = { x: sh.x - 34, y: sh.y + 22 };
      const hand = { x: low.x + (high.x - low.x) * p.h, y: low.y + (high.y - low.y) * p.h };
      const b = side({ hip, tor, head: 12, far: { x: 0, y: 0 }, armN: { to: hand, bend: 1 }, armF: { to: { x: 232, y: 194 }, bend: 1, farDx: 0, farDy: 0 }, legN: { to: { x: 122, y: 250 }, bend: -1, foot: 0 }, legF: { a1: 92, a2: 178, foot: 180 } });
      return bodyDraw(b, benchFlat(100, 260, 196), [], [plate(b.j.handN, 15)]);
    },
  },
  'preacher-curl': {
    view: 'Vue de profil',
    cue: 'Arrière des bras collé au pupitre : montez la barre sans décoller les coudes, puis descendez jusqu\'à presque tendre, sans relâcher en bas.',
    keys: rep({ f: 0 }, { f: 1 }, concentricFirst),
    draw(p) {
      const hip = { x: 176, y: 196 };
      const fa = 34 - 118 * p.f;
      const b = side({ hip, tor: -82, head: 6, armN: { a1: 48, a2: fa }, legN: { to: { x: 238, y: 250 }, bend: -1, foot: 0 } });
      const e = b.j.elbowN;
      return all(floor(), rect(140, 204, 70, 13, C.pad, { rx: 6 }), post(176, 217), b.items, line([pt(pt(e, -38, 48), 13, 138), pt(pt(e, 8, 48), 13, 138)], C.pad, 14), post(e.x - 4, e.y + 24), b.near, plate(b.j.handN, 14));
    },
  },
  'ez-skull-crusher': {
    view: 'Vue de profil',
    cue: 'Les coudes restent pointés vers le plafond, immobiles : la barre descend vers le front, puis les triceps la repoussent. Pas les épaules.',
    keys: rep({ f: 0 }, { f: 1 }, eccentricFirst),
    draw(p) {
      const ua = -74;
      const fa = ua + 4 + 136 * p.f;
      const b = side({ hip: { x: 140, y: 162 }, tor: -2, head: 8, armN: { a1: ua, a2: fa }, legN: { to: { x: 86, y: 250 }, bend: 1, foot: 0 } });
      return bodyDraw(b, benchFlat(92, 290, 176), [], [plate(b.j.handN, 13)]);
    },
  },
  'hanging-leg-raise': {
    view: 'Vue de profil',
    viewBox: '-40 0 480 360',
    cue: 'Sans balancer : enroulez le bassin vers l\'avant comme pour ranger les genoux contre la poitrine, puis redescendez lentement.',
    keys: rep({ th: 92, sn: 96, tor: -90, hx: 200 }, { th: -6, sn: 10, tor: -78, hx: 192 }, concentricFirst),
    draw(p) {
      const grip = { x: 206, y: 38 };
      const hip = { x: p.hx, y: 196 };
      const b = side({ hip, tor: p.tor, head: 0, armN: { to: grip, bend: 1 }, legN: { a1: p.th, a2: p.sn, foot: p.sn - 80 } });
      return all(line([{ x: 120, y: 38 }, { x: 230, y: 38 }], C.frame, 6), post(124, 0, 38), b.items, b.near, circle(grip, 6, C.steel));
    },
  },
};

// Les variantes reprennent un mouvement existant.
MOVES['smith-incline-press'] = { ...MOVES['incline-db-press'], cue: 'Omoplates serrées, poitrine sortie : descendez la barre vers le haut de la poitrine, puis poussez vers le plafond.' };
MOVES['pullup-neutral'] = { ...MOVES['pullup-pronated'] };
MOVES['machine-lateral-raise'] = { ...MOVES['db-lateral-raise'] };
MOVES['bent-over-db-reverse-fly'] = { ...MOVES['cable-reverse-fly'], cue: 'Buste penché, dos plat : écartez les haltères comme pour ouvrir de grands rideaux, coudes souples, épaules basses.' };

registerMoves(MOVES);
