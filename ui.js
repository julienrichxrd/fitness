// Briques d'interface partagées : échappement, formats français, icônes, graphiques SVG.
// Tout est rendu en texte HTML ; aucune donnée n'est insérée sans échappement.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const nf = (x, d = 1) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : (Math.round(x * 10 ** d) / 10 ** d).toLocaleString('fr-FR', { maximumFractionDigits: d }));
export const nf0 = (x) => nf(x, 0);

/** Icônes au trait, 24 × 24, couleur du texte. */
const P = {
  today: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  journal: '<path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2z"/><path d="M6 18a2 2 0 0 1 2-2h10"/><path d="M10 8h5"/>',
  progress: '<path d="M4 19h16"/><path d="M5 15l4-4 3 3 6-7"/><path d="M15 7h3v3"/>',
  food: '<path d="M7 3v8a2 2 0 0 0 2 2v8"/><path d="M5 3v5a2 2 0 0 0 4 0V3"/><path d="M17 21V3c-2 1-3 4-3 7 0 2 1 3 3 3"/>',
  more: '<circle cx="5" cy="12" r="1.6" class="f"/><circle cx="12" cy="12" r="1.6" class="f"/><circle cx="19" cy="12" r="1.6" class="f"/>',
  lift: '<path d="M3 10v4M6 8v8M18 8v8M21 10v4M6 12h12"/>',
  run: '<circle cx="15" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2v5"/><path d="M6 12l3-4 4 1 2 4 3 1"/>',
  swim: '<path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="16" cy="7" r="1.8"/><path d="M5 13l5-5 3 3 3-1"/>',
  mobility: '<circle cx="12" cy="4.5" r="1.8"/><path d="M12 7v6l-4 7M12 13l4 7M5 10l7-1 7 1"/>',
  body: '<path d="M12 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/><path d="M7 21l1-8-3-4 7 1 7-1-3 4 1 8"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9a4 4 0 0 1 6 0l-3 3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  download: '<path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M5 17v3h14v-3"/>',
  upload: '<path d="M12 16V5m0 0L8 9m4-4l4 4"/><path d="M5 17v3h14v-3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  watch: '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3M12 9v3l2 1"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

/** Couleur de chaque domaine (codage de l'information, cohérent dans toute l'application). */
export const DOMAIN = { lift: 'lift', run: 'run', swim: 'swim', mobility: 'mob', food: 'food', body: 'body' };

/**
 * Graphique en ligne, en SVG, responsive. series : [{ points: [{ x, y }], cls, dots, area }].
 * x : nombre (jour) ; yFmt : format des étiquettes ; xLabel(x) : étiquette d'axe.
 */
export function lineChart({ series, yFmt = (v) => nf(v), xLabel = () => '', height = 180, yPad = 0.15, goal = null, label = 'Graphique' }) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) return '';
  const W = 340; const H = height; const L = 38; const R = 10; const T = 12; const B = 24;
  const xs = all.map((p) => p.x); const ys = all.map((p) => p.y).concat(goal !== null ? [goal] : []);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs);
  let y0 = Math.min(...ys); let y1 = Math.max(...ys);
  const span = y1 - y0 || Math.abs(y1) * 0.05 || 1;
  y0 -= span * yPad; y1 += span * yPad;
  const X = (x) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R);
  const Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  const grid = ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(Y(t) + 4).toFixed(1)}" class="ytick">${esc(yFmt(t))}</text>`).join('');
  const xt = [x0, x1].map((x, i) => `<text x="${X(x).toFixed(1)}" y="${H - 6}" class="xtick" text-anchor="${i ? 'end' : 'start'}">${esc(xLabel(x))}</text>`).join('');
  const goalLine = goal !== null ? `<line x1="${L}" x2="${W - R}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" class="goal"/>` : '';
  const paths = series.map((s) => {
    const pts = [...s.points].sort((a, b) => a.x - b.x);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    const area = s.area ? `<path d="${d} L${X(pts[pts.length - 1].x).toFixed(1)} ${H - B} L${X(pts[0].x).toFixed(1)} ${H - B} Z" class="area ${s.cls || ''}"/>` : '';
    const dots = s.dots ? pts.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${s.dotR || 2.6}" class="dot ${s.cls || ''}"/>`).join('') : '';
    const line = s.line === false ? '' : `<path d="${d}" class="line ${s.cls || ''}"/>`;
    return area + line + dots;
  }).join('');
  const last = series[series.length - 1].points.slice().sort((a, b) => a.x - b.x).pop();
  const endDot = `<circle cx="${X(last.x).toFixed(1)}" cy="${Y(last.y).toFixed(1)}" r="4.5" class="end ${series[series.length - 1].cls || ''}"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${goalLine}${paths}${endDot}${xt}</svg>`;
}

/** Barres verticales simples (une par jour), avec une ligne d'objectif facultative. */
export function barChart({ bars, goal = null, yFmt = (v) => nf0(v), height = 150, label = 'Graphique', cls = '' }) {
  if (!bars.length) return '';
  const W = 340; const H = height; const L = 34; const R = 6; const T = 10; const B = 22;
  const max = Math.max(...bars.map((b) => b.value), goal || 0) * 1.1 || 1;
  const bw = (W - L - R) / bars.length;
  const Y = (v) => T + (1 - v / max) * (H - T - B);
  const rects = bars.map((b, i) => {
    const h = Math.max(0, H - B - Y(b.value));
    return `<rect x="${(L + i * bw + bw * 0.18).toFixed(1)}" y="${Y(b.value).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="3" class="bar ${cls}${b.muted ? ' muted' : ''}"/><text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="xtick" text-anchor="middle">${esc(b.label)}</text>`;
  }).join('');
  const g = goal ? `<line x1="${L}" x2="${W - R}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}" class="goal"/><text x="${L - 4}" y="${(Y(goal) + 4).toFixed(1)}" class="ytick">${esc(yFmt(goal))}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}${rects}</svg>`;
}

/** Anneau de progression (calories du jour). */
export function ring(value, goal, { size = 132, stroke = 12, cls = 'food' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = goal ? Math.min(1, value / goal) : 0;
  const over = goal && value > goal * 1.05;
  return `<svg class="ring ${cls}${over ? ' over' : ''}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

/** Barre de macro (protéines, glucides, lipides). */
export const macroBar = (label, value, goal, cls) => `
  <div class="macro ${cls}"><div class="macro-top"><span>${esc(label)}</span><span><b>${nf0(value)}</b> / ${nf0(goal)} g</span></div>
  <div class="macro-track"><span style="width:${Math.min(100, goal ? (value / goal) * 100 : 0).toFixed(0)}%"></span></div></div>`;

/** Échelle de boutons 1..n. */
export function scale(name, n, value, { from = 1, action = 'pick', low = '', high = '' } = {}) {
  const btns = [];
  for (let i = from; i < from + n; i += 1) btns.push(`<button type="button" class="scale-btn${value === i ? ' on' : ''}" data-action="${action}" data-name="${esc(name)}" data-value="${i}" aria-pressed="${value === i}">${i}</button>`);
  return `<div class="scale" style="--n:${n === 10 ? 5 : Math.min(n, 6)}">${btns.join('')}</div>${low || high ? `<div class="scale-legend"><span>${esc(low)}</span><span>${esc(high)}</span></div>` : ''}`;
}

export const infoBtn = (key, label = 'Comprendre') => `<button class="info-btn" data-action="guide" data-value="${esc(key)}" aria-label="${esc(label)}">${icon('info')}</button>`;
