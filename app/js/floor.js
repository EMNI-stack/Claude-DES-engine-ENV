/* 2D floor builder. Place nodes, define a linear route, set full parameters per
   node and per transport leg, and run the transport-aware engine to see how the
   layout performs. Persists into the shared study project at `project.model`
   (des-floor/v1). Click any node or any leg to edit it; a table view gives an
   overview of every parameter. */

import { load, save, uid, newAssumption, newFactor } from './project.js';
import { FloorSim, legDistance } from '../../src/floor-engine.js';
import { DISTS, newDist, distMean, distScv, sample, mulberry32 } from '../../src/distributions.js';

/* symbol library — concrete (manufacturing / service) + abstract (value-stream-
   mapping) glyphs, 24×24, pickable per resource AND per storage. Each entry is
   { label, cat, path }; `cat` groups them in the picker. */
const SYMBOLS = {
  // — Manufacturing —
  box:      { label: 'Box / unit',    cat: 'mfg', path: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>' },
  press:    { label: 'Press',         cat: 'mfg', path: '<path d="M6 3h12"/><path d="M12 3v8"/><path d="M7 11h10l-1.5 5h-7z"/><path d="M5 20h14"/>' },
  cut:      { label: 'Cut',           cat: 'mfg', path: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>' },
  weld:     { label: 'Weld',          cat: 'mfg', path: '<path d="M13 2 3 14h9l-1 8 10-12h-9z" class="fillsym"/>' },
  furnace:  { label: 'Furnace',       cat: 'mfg', path: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16"/><path d="M9 14a3 3 0 0 0 6 0c0-1-.5-1.6-1-2.2-.7 1-1.6 1.2-2.5.5.2 1-.3 1.7-1 2 0-.4-.2-.8-.5-1-.6.5-1 1.1-1 1.7z" class="fillsym"/>' },
  assemble: { label: 'Assemble',      cat: 'mfg', path: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' },
  cpu:      { label: 'CNC / machine', cat: 'mfg', path: '<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>' },
  gear:     { label: 'Machining',     cat: 'mfg', path: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>' },
  // — Service —
  operator: { label: 'Operator',      cat: 'svc', path: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
  desk:     { label: 'Workstation',   cat: 'svc', path: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>' },
  counter:  { label: 'Service desk',  cat: 'svc', path: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>' },
  cart:     { label: 'Cart',          cat: 'svc', path: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h2l2.6 12.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H5.1"/>' },
  clipboard:{ label: 'Checklist',     cat: 'svc', path: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>' },
  inspect:  { label: 'Inspect / QA',  cat: 'svc', path: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>' },
  truck:    { label: 'Shipping',      cat: 'svc', path: '<path d="M10 17h4V5H2v12h3"/><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h1"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>' },
  // — Abstract / VSM —
  square:   { label: 'Process (square)',      cat: 'abstract', path: '<rect x="4" y="4" width="16" height="16" rx="1"/>' },
  triangle: { label: 'Inventory (triangle)',  cat: 'abstract', path: '<path d="M12 3 22 20 2 20 Z"/>' },
  circle:   { label: 'Operation (circle)',    cat: 'abstract', path: '<circle cx="12" cy="12" r="9"/>' },
  diamond:  { label: 'Decision (diamond)',    cat: 'abstract', path: '<path d="M12 2 22 12 12 22 2 12 Z"/>' },
  hexagon:  { label: 'Node (hexagon)',        cat: 'abstract', path: '<path d="M21 7.5v9L12 21l-9-4.5v-9L12 3z"/>' },
};
const SYMBOL_CATS = [['mfg', 'Manufacturing'], ['svc', 'Service'], ['abstract', 'Abstract · VSM']];

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 10;                 // px per metre (display); model coords are metres
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let project = load();
let model = ensureModel(project.model);
let tool = 'move';
let selected = null;          // { kind:'node', id } | { kind:'leg', key } | null
let drag = null;

// playback + animation state
let sim = null, simCursor = 0, playing = false, lastTs = 0, speed = 6, needsBuild = true, finished = false, raf = 0;
let lastBuildError = '';     // why buildSim() last refused (missing nodes, or a batch static deadlock)
let tokenEls = new Map(), queueEls = new Map(), tokenLayer = null;
let scrapSeen = 0;            // index into sim.scrapLog of the last scrap we've animated
let hoverNodeId = null;       // node currently hovered, for the live count tooltip

// view (zoom / pan). Base coordinate space is 820×480 px (= 82×48 m at S=10).
const BASE_W = 820, BASE_H = 480;
let view = { z: 1, cx: BASE_W / 2, cy: BASE_H / 2 };   // cx,cy = viewBox centre in base px
let panning = null;

/* ---- model defaults + migration ---------------------------------------- */
function ensureModel(m) {
  const base = {
    schema: 'des-floor/v1', scale: S, units: { time: 'min', distance: 'm', speed: 'm/min' },
    nodes: [], routeOrder: [],
    defaultMover: 'instant', defaultSpeed: 40,
    conveyor: { cap: 3, speed: 30 }, workers: { count: 2, speed: 40 },
    legs: {},
    control: 'push', conwipCap: 10, supply: 'stream',
    demand: { mode: 'instant', dist: newDist('exp', { mean: 2 }) },
  };
  if (!m || m.schema !== 'des-floor/v1') return base;
  m.nodes = m.nodes || []; m.routeOrder = m.routeOrder || [];
  m.defaultMover = m.defaultMover || 'instant';
  m.defaultSpeed = m.defaultSpeed || (m.params && m.params.speed) || 40;
  m.conveyor = m.conveyor || base.conveyor; m.workers = m.workers || base.workers;
  m.legs = m.legs || {};
  m.control = m.control || 'push'; m.conwipCap = m.conwipCap || 10; m.supply = m.supply || 'stream';
  m.demand = m.demand || base.demand; if (!m.demand.dist) m.demand.dist = newDist('exp', { mean: 2 });
  const arr = (m.params && m.params.arrivalMean) || 3;
  for (const n of m.nodes) {
    if (n.kind === 'resource') {
      if (!n.service) n.service = newDist('exp', { mean: n.serviceMean != null ? n.serviceMean : 1 });
      if (!n.buffer) n.buffer = { finite: false, cap: 10, init: 0, target: 8 };
      if (typeof n.scrap !== 'number') n.scrap = 0;
      if (!n.symbol) n.symbol = 'box';
      if (!n.brk) n.brk = { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) };
      if (!n.batch) n.batch = { on: false, size: 2, setup: 0 };
    } else if (n.kind === 'source') {
      if (!n.interarrival) n.interarrival = newDist('exp', { mean: arr });
    } else if (n.kind === 'storage') {
      if (typeof n.cap !== 'number') n.cap = 10;
      if (!n.symbol) n.symbol = 'triangle';      // VSM inventory triangle by default
    }
  }
  return m;
}
function persist() { project.model = model; save(project); needsBuild = true; finished = false; }

/* ---- geometry ----------------------------------------------------------- */
const px = (mm) => mm * S;
function node(id) { return model.nodes.find((n) => n.id === id); }
function legKeyAt(i) { return `${model.routeOrder[i]}>${model.routeOrder[i + 1]}`; }
function effMover(key) { return (model.legs[key] && model.legs[key].mover) || model.defaultMover; }
function legSpeedFor(key, mover) {
  const o = model.legs[key] || {};
  if (mover === 'conveyor') return o.speed || model.conveyor.speed || 30;
  if (mover === 'worker') return model.workers.speed || 40;
  return o.speed || model.defaultSpeed || 40;
}
function svgPoint(e) { const svg = $('svg'); const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const loc = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: loc.x, y: loc.y }; }

/* ---- zoom / pan (viewBox-based) ---------------------------------------- */
function setViewBox() {
  const w = BASE_W / view.z, h = BASE_H / view.z;
  $('svg').setAttribute('viewBox', `${(view.cx - w / 2).toFixed(1)} ${(view.cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
  const zl = $('zLabel'); if (zl) zl.textContent = Math.round(view.z * 100) + '%';
  updateGrid();
  updateScaleBar();
}
/* size the grid background rects to the current viewBox (patterns are anchored to
   user space, so the grid stays aligned while filling whatever is visible) */
function updateGrid() {
  const w = BASE_W / view.z, h = BASE_H / view.z, x0 = view.cx - w / 2, y0 = view.cy - h / 2;
  for (const idr of ['gridMinor', 'gridMajor']) {
    const r = $(idr); if (!r) continue;
    r.setAttribute('x', x0.toFixed(1)); r.setAttribute('y', y0.toFixed(1));
    r.setAttribute('width', w.toFixed(1)); r.setAttribute('height', h.toFixed(1));
  }
}
/* zoom-aware scale bar: pick a "nice" world length whose on-screen size is a
   sensible fraction of the canvas, and label it in metres. */
function updateScaleBar() {
  const seg = $('scaleSeg'), lbl = $('scaleLabel'), svg = $('svg'); if (!seg || !svg) return;
  const w = svg.clientWidth || BASE_W;                  // rendered px width of the canvas
  const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500];
  let d = nice[0];
  for (const k of nice) if (k * S * view.z / BASE_W <= 0.3) d = k;   // largest segment ≤ 30% of width
  seg.style.width = (d * S * view.z / BASE_W * w).toFixed(1) + 'px';
  lbl.textContent = d + ' m';
}
function zoomBy(factor, anchor) {
  const oldz = view.z; view.z = Math.max(0.4, Math.min(4, view.z * factor));
  if (anchor) { view.cx = anchor.x + (view.cx - anchor.x) * (oldz / view.z); view.cy = anchor.y + (view.cy - anchor.y) * (oldz / view.z); }
  setViewBox();
}
function zoomFit() {
  const ns = model.nodes;
  if (!ns.length) { view = { z: 1, cx: BASE_W / 2, cy: BASE_H / 2 }; setViewBox(); return; }
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (const n of ns) { a = Math.min(a, px(n.x)); c = Math.max(c, px(n.x)); b = Math.min(b, px(n.y)); d = Math.max(d, px(n.y)); }
  const pad = 80, w = Math.max(160, (c - a) + pad * 2), h = Math.max(160, (d - b) + pad * 2);
  view.z = Math.max(0.4, Math.min(3, Math.min(BASE_W / w, BASE_H / h)));
  view.cx = (a + c) / 2; view.cy = (b + d) / 2; setViewBox();
}

/* ---- DOM + form helpers ------------------------------------------------- */
function E(tag, attrs = {}, kids = []) { const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of [].concat(kids)) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; }
function H(tag, props = {}, kids = []) { const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) { if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v); else if (v != null && v !== false) n.setAttribute(k, v); }
  for (const c of [].concat(kids)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); return n; }
function field(label, control, full) { return H('div', { class: 'field' + (full ? ' full' : '') }, [H('label', { class: 'small' }, label), control]); }
function textInput(v, on) { const i = H('input', { class: 'input', type: 'text' }); i.value = v || ''; i.addEventListener('input', () => on(i.value)); return i; }
function numInput(v, min, step, on) { const i = H('input', { class: 'input num', type: 'number', step: step || 1 }); if (min != null) i.min = min; i.value = v; i.addEventListener('input', () => on(parseFloat(i.value))); return i; }
function segmented(opts, cur, on, label) { const g = H('div', { class: 'segmented', role: 'group', 'aria-label': label || '' });
  opts.forEach((o) => { const b = H('button', { type: 'button', 'aria-pressed': String(o.value === cur) }, o.label); b.addEventListener('click', () => on(o.value)); g.append(b); }); return g; }

/* a histogram preview that re-samples the distribution on every parameter change.
   Bars + a labelled value axis (lo · μ · hi) + a mean marker, so even a pure
   rescale (e.g. changing an exponential's mean) is always visibly reflected. */
function distGraph(dist) {
  const W = 240, Hh = 60, bins = 32;
  const wrap = H('div', { class: 'distgraph-wrap' });
  const g = E('svg', { class: 'distgraph', viewBox: `0 0 ${W} ${Hh}`, preserveAspectRatio: 'none' });
  const axis = H('div', { class: 'distaxis-row' }, [H('span', {}, ''), H('span', { class: 'mu' }, ''), H('span', {}, '')]);
  wrap.append(g, axis);
  const fmt = (v) => !isFinite(v) ? '—' : (Math.abs(v) >= 100 ? Math.round(v).toString() : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
  function draw() {
    g.innerHTML = '';
    const rng = mulberry32(20260607), n = 4000, xs = [];
    for (let i = 0; i < n; i++) xs.push(sample(dist, rng));
    xs.sort((a, b) => a - b);
    const lo = xs[Math.floor(0.004 * n)], hi = xs[Math.floor(0.996 * n)] || (lo + 1), span = (hi - lo) || 1;
    const counts = new Array(bins).fill(0);
    for (const x of xs) { let b = Math.floor((x - lo) / span * bins); if (b < 0) b = 0; if (b >= bins) b = bins - 1; counts[b]++; }
    const max = Math.max(...counts) || 1, bw = W / bins;
    for (let i = 0; i < bins; i++) {
      const h = Math.max(0, (counts[i] / max) * (Hh - 5));
      g.append(E('rect', { class: 'distbar', x: (i * bw + 0.5).toFixed(2), y: (Hh - h - 0.5).toFixed(2), width: (bw - 1).toFixed(2), height: h.toFixed(2) }));
    }
    const m = distMean(dist);
    if (isFinite(m) && m >= lo && m <= hi) { const mx = ((m - lo) / span * W).toFixed(2); g.append(E('line', { class: 'distmean', x1: mx, y1: 0, x2: mx, y2: Hh })); }
    g.append(E('line', { class: 'distaxis', x1: 0, y1: Hh - 0.5, x2: W, y2: Hh - 0.5 }));
    axis.children[0].textContent = fmt(lo);
    axis.children[1].textContent = 'μ ' + fmt(m);
    axis.children[2].textContent = fmt(hi);
  }
  return { el: wrap, draw };
}

/* a bound distribution editor (type picker + parameter fields + mean/SCV + graph) */
function distEditor(dist, onChange) {
  const wrap = H('div', { class: 'dist-ed' });
  const graph = distGraph(dist);
  function draw() {
    wrap.innerHTML = '';
    const sel = H('select', { class: 'select full' });
    for (const k of Object.keys(DISTS)) { const o = H('option', { value: k }, DISTS[k].label); if (k === dist.type) o.selected = true; sel.append(o); }
    sel.addEventListener('change', () => { dist.type = sel.value; const def = {}; for (const [key, , d] of DISTS[sel.value].f) def[key] = d; dist.params = def; onChange(); draw(); });
    wrap.append(field('Distribution', sel, true));
    const stat = H('div', { class: 'stat' });
    const refresh = () => { const m = distMean(dist), s = distScv(dist); stat.textContent = `mean ${isFinite(m) ? m.toFixed(2) : '—'} · SCV ${isFinite(s) ? s.toFixed(2) : '—'}`; graph.draw(); };
    for (const [key, label, defv] of DISTS[dist.type].f) {
      wrap.append(field(label, numInput(dist.params[key] != null ? dist.params[key] : defv, 0, 0.1, (v) => { dist.params[key] = v; onChange(); refresh(); })));
    }
    wrap.append(stat);
    wrap.append(H('div', { class: 'full' }, [graph.el]));
    refresh();
  }
  draw(); return wrap;
}

/* ---- canvas render ------------------------------------------------------ */
function render() {
  const svg = $('svg'); svg.innerHTML = ''; setViewBox();
  // grid as tiling patterns (5 m minor / 10 m major) + background rects sized to
  // the live viewBox in updateGrid(), so it always fills the canvas at any zoom/pan
  const defs = E('defs', {});
  const mk = (idp, sz, cls) => { const p = E('pattern', { id: idp, width: sz, height: sz, patternUnits: 'userSpaceOnUse' }); p.append(E('path', { class: cls, d: `M ${sz} 0 H 0 V ${sz}` })); return p; };
  defs.append(mk('grid-minor', 5 * S, 'grid-line'), mk('grid-major', 10 * S, 'grid-line major'));
  svg.append(defs);
  const grid = E('g', { class: 'grid' });
  grid.append(E('rect', { id: 'gridMinor', fill: 'url(#grid-minor)' }), E('rect', { id: 'gridMajor', fill: 'url(#grid-major)' }));
  svg.append(grid);
  updateGrid();

  const legG = E('g', {});
  for (let i = 0; i < model.routeOrder.length - 1; i++) {
    const a = node(model.routeOrder[i]), b = node(model.routeOrder[i + 1]); if (!a || !b) continue;
    const key = legKeyAt(i), mover = effMover(key);
    const ax = px(a.x), ay = px(a.y), bx = px(b.x), by = px(b.y);
    const cls = 'leg ' + (mover === 'conveyor' ? 'leg-conv' : mover === 'worker' ? 'leg-worker' : '') + (selected && selected.kind === 'leg' && selected.key === key ? ' sel' : '');
    legG.append(E('line', { class: cls.trim(), x1: ax, y1: ay, x2: bx, y2: by }));
    legG.append(E('line', { class: 'leg-hit', 'data-leg': key, x1: ax, y1: ay, x2: bx, y2: by }));
    const far = legDistance(a, b) > 0.5, mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (mover === 'worker' && far) { legG.append(E('circle', { class: 'worker-mark', cx: mx, cy: my, r: 7 })); legG.append(E('text', { class: 'worker-mark-t', x: mx, y: my + 3, 'text-anchor': 'middle' }, 'W')); }
  }
  svg.append(legG);
  for (const n of model.nodes) svg.append(nodeEl(n));
  tokenLayer = E('g', {}); svg.append(tokenLayer); tokenEls = new Map(); queueEls = new Map();   // fresh token layer
  if (sim && !needsBuild) renderFrame(simCursor);                           // repaint live state onto the rebuilt scene
}

/* ---- live frame render (tokens + station states + progress) ------------ */
function renderFrame(cursor) {
  if (!sim) return;
  const svg = $('svg');
  for (const n of model.nodes) {
    if (n.kind !== 'resource') continue;
    const g = svg.querySelector(`[data-node="${n.id}"]`); if (!g) continue;
    const rect = g.querySelector('.node-rect'), prog = g.querySelector('.prog');
    const r = sim.res[n.id]; let frac = 0, cls = 'node-rect';
    if (r) {
      const anyDown = r.machines.some((m) => m.down), anyBusy = r.machines.some((m) => m.busy), anyBlk = r.machines.some((m) => m.blocked);
      cls += anyDown ? ' down' : anyBusy ? ' busy' : anyBlk ? ' blocked' : '';
      for (const m of r.machines) if (m.busy && m.depTime > m.startTime) frac = Math.max(frac, Math.min(1, Math.max(0, (cursor - m.startTime) / (m.depTime - m.startTime))));
      // batch resource: badge shows accumulate (N/B) → setup → processing; the progress
      // sliver tracks the PROCESSING phase only (0 during setup). Quiet, no glow (DESIGN-LANG §7).
      const badgeEl = g.querySelector('.batch-badge');
      if (badgeEl && r.batch) {
        const bm = r.machines.find((m) => m.batch);   // a machine holding a batch (busy, or blocked at hand-off)
        if (bm) {
          if (cursor < bm.setupEnd) { frac = 0; badgeEl.textContent = 'setup'; }
          else { frac = bm.depTime > bm.setupEnd ? Math.min(1, Math.max(0, (cursor - bm.setupEnd) / (bm.depTime - bm.setupEnd))) : 1; badgeEl.textContent = 'processing ' + bm.batch.length; }
        } else { frac = 0; badgeEl.textContent = r.queue.length + '/' + r.batch.size; }
      }
    }
    if (selected && selected.kind === 'node' && selected.id === n.id) cls += ' sel';
    rect.setAttribute('class', cls);
    if (prog) prog.setAttribute('width', (frac * 66).toFixed(1));
    // capacity cells: filled (state-coloured) when that machine is in use, empty when free
    if (r) g.querySelectorAll('.cap-cell').forEach((cell) => {
      const m = r.machines[+cell.getAttribute('data-cell')];
      cell.setAttribute('class', 'cap-cell' + (m ? (m.down ? ' down' : m.busy ? ' busy' : m.blocked ? ' blocked' : '') : ''));
    });
  }
  // units in service / transit → individual moving dots (capped so nothing floods
  // the view). Queued / stored / finished units → ONE grey dot + "×N" per location,
  // so a long queue or a full storage reads at a glance instead of a cloud of dots.
  const TOK_CAP = 150;
  const seen = new Set(); let drawn = 0;
  const queues = new Map();
  for (const job of sim.jobs.values()) {
    const loc = job.loc; if (!loc) continue;
    if (loc.k === 'service' || loc.k === 'transit') {
      if (drawn >= TOK_CAP) continue;
      const p = jobPos(job, cursor); if (!p) continue;
      seen.add(job.id); drawn++;
      let c = tokenEls.get(job.id);
      if (!c) { c = E('circle', { class: 'tok' }); tokenLayer.append(c); tokenEls.set(job.id, c); }
      c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); c.setAttribute('r', p.r);
    } else {
      const a = queueLoc(loc); if (!a) continue;
      let q = queues.get(a.key);
      if (!q) { q = { x: a.x, y: a.y, anchor: a.anchor, n: 0 }; queues.set(a.key, q); }
      q.n++;
    }
  }
  for (const [id, c] of tokenEls) if (!seen.has(id)) { c.remove(); tokenEls.delete(id); }
  const qSeen = new Set();
  for (const [key, q] of queues) {
    qSeen.add(key);
    let el = queueEls.get(key);
    if (!el) { const g = E('g', { class: 'qmark' }); const dot = E('circle', { class: 'tok q', r: 6 }); const lbl = E('text', { class: 'qcount' }); g.append(dot, lbl); tokenLayer.append(g); el = { dot, lbl, g }; queueEls.set(key, el); }
    el.dot.setAttribute('cx', q.x.toFixed(1)); el.dot.setAttribute('cy', q.y.toFixed(1));
    el.lbl.setAttribute('x', (q.anchor === 'end' ? q.x - 10 : q.x + 10).toFixed(1)); el.lbl.setAttribute('y', (q.y + 3.5).toFixed(1)); el.lbl.setAttribute('text-anchor', q.anchor);
    el.lbl.textContent = q.n > 1 ? '×' + q.n : '';
  }
  for (const [key, el] of queueEls) if (!qSeen.has(key)) { el.g.remove(); queueEls.delete(key); }
  // scrapped parts: drop-and-fade where they were destroyed (only when watching live)
  let spawned = 0;
  while (scrapSeen < sim.scrapLog.length && sim.scrapLog[scrapSeen].t <= cursor) {
    const s = sim.scrapLog[scrapSeen++];
    if (playing && spawned < 12) { spawnScrapAnim(s.node); spawned++; }   // skip animating bulk (run-to-end) scraps
  }
  if (hoverNodeId && !$('floorTip').hidden) $('floorTip').innerHTML = tipHTML(hoverNodeId);   // keep counts live
}
/* a scrapped part: a red-ish token at the machine that drops straight down and fades out */
function spawnScrapAnim(nodeId) {
  const n = node(nodeId); if (!n || !tokenLayer) return;
  const c = E('circle', { class: 'tok tok-scrap', cx: px(n.x), cy: px(n.y) - 2, r: 8 });
  c.addEventListener('animationend', () => c.remove());
  tokenLayer.append(c);
}

/* ---- live count tooltip (hover a node while a run exists) --------------- */
function tipHTML(id) {
  const n = node(id); if (!n || !sim) return '';
  const rows = [];
  if (n.kind === 'resource' && sim.res[id]) {
    const r = sim.res[id];
    const busy = r.machines.filter((m) => m.busy).length;
    const blocked = r.machines.filter((m) => m.blocked).length;
    const down = r.machines.filter((m) => m.down).length;
    const waiting = r.queue.length;
    rows.push(['here', waiting + busy + blocked], ['being processed', busy + ' / ' + r.machines.length], ['waiting', waiting]);
    if (blocked) rows.push(['blocked', blocked]);
    if (down) rows.push(['down', down]);
    if (r.batch) {
      const bm = r.machines.find((m) => m.busy && m.batch);
      rows.push(['batch (B=' + r.batch.size + ')',
        bm ? (simCursor < bm.setupEnd ? 'setup' : 'processing ' + bm.batch.length) : 'accumulating ' + r.queue.length + '/' + r.batch.size]);
    }
  } else if (sim.hold[id]) {
    const h = sim.hold[id];
    rows.push([n.kind === 'source' ? 'staged' : 'holding', h.items.length + (h.cap === Infinity ? '' : ' / ' + h.cap)]);
  } else if (n.kind === 'sink') {
    rows.push(['shipped', sim.completed]);
  }
  const name = n.name || (n.kind[0].toUpperCase() + n.kind.slice(1));
  return `<div class="tip-name">${esc(name)}</div>` + rows.map(([k, v]) => `<div class="tip-row"><span>${k}</span><span class="v num">${v}</span></div>`).join('');
}
function showTip(id, e) {
  const tip = $('floorTip'); tip.innerHTML = tipHTML(id); tip.hidden = false;
  const stage = tip.parentElement.getBoundingClientRect();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = e.clientX - stage.left + 16, y = e.clientY - stage.top + 16;
  if (x + tw > stage.width - 4) x = e.clientX - stage.left - tw - 12;
  if (y + th > stage.height - 4) y = stage.height - th - 4;
  tip.style.left = Math.max(4, x) + 'px'; tip.style.top = Math.max(4, y) + 'px';
}
function hideTip() { const t = $('floorTip'); if (t) t.hidden = true; }
function onHover(e) {
  if (drag || panning) { hoverNodeId = null; hideTip(); return; }
  const grp = e.target.closest('[data-node]');
  const id = grp && grp.getAttribute('data-node');
  if (id && sim && !needsBuild) { hoverNodeId = id; showTip(id, e); }
  else { hoverNodeId = null; hideTip(); }
}
function jobPos(job, cursor) {
  const loc = job.loc; if (!loc) return null;
  if (loc.k === 'transit') {
    const f = node(loc.from), t = node(loc.to); if (!f || !t) return null;
    const p = Math.min(1, Math.max(0, (cursor - loc.t0) / ((loc.t1 - loc.t0) || 1)));
    return { x: px(f.x + (t.x - f.x) * p), y: px(f.y + (t.y - f.y) * p), r: 6.5 };
  }
  const n = node(loc.node); if (!n) return null;
  if (loc.k === 'service') return { x: px(n.x), y: px(n.y) - 2, r: 8 };
  return null;   // queued / staged / held / finished units are aggregated by queueLoc(), not drawn per-job
}
/* where a queued / stored / finished unit's single count marker sits: incoming
   side (left) for queue/hold, outgoing side (right) for finished goods */
function queueLoc(loc) {
  const n = node(loc.node); if (!n) return null;
  const half = n.kind === 'resource' ? 46 : n.kind === 'storage' ? 38 : 18;
  if (loc.k === 'fg') return { key: loc.node + ':fg', x: px(n.x) + half + 14, y: px(n.y), anchor: 'start' };
  return { key: loc.node + ':q', x: px(n.x) - half - 14, y: px(n.y), anchor: 'end' };   // queue / pending / hold
}
function symG(key, cls, tx, ty, scale) {
  const g = E('g', { class: cls, transform: `translate(${tx},${ty}) scale(${scale})` });
  // parse the glyph markup in the SVG namespace (innerHTML on an SVG element won't)
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${(SYMBOLS[key] || SYMBOLS.box).path}</svg>`, 'image/svg+xml');
  for (const child of Array.from(doc.documentElement.childNodes)) g.append(document.importNode(child, true));
  return g;
}
function nodeEl(n) {
  const sel = selected && selected.kind === 'node' && selected.id === n.id;
  const g = E('g', { class: 'node' + (sel ? ' sel' : ''), 'data-node': n.id, transform: `translate(${px(n.x)},${px(n.y)})` });
  if (n.kind === 'resource') {
    g.append(E('rect', { class: 'node-rect', x: -46, y: -32, width: 92, height: 64, rx: 9 }));
    g.append(symG(n.symbol || 'box', 'node-sym', -10, -29, 0.85));    // glyph, centred top
    g.append(E('text', { class: 'node-label', x: 0, y: 4, 'text-anchor': 'middle' }, n.name || 'Resource'));
    // capacity cells — one box per parallel machine, "checked" (filled) when in use
    const cells = E('g', { class: 'cap-cells' });
    const M = Math.max(1, n.machines || 1), shown = Math.min(M, 8), cw = 9, gap = 3, total = shown * cw + (shown - 1) * gap;
    for (let i = 0; i < shown; i++) cells.append(E('rect', { class: 'cap-cell', 'data-cell': i, x: (-total / 2 + i * (cw + gap)).toFixed(1), y: 12, width: cw, height: 9, rx: 2 }));
    g.append(cells);
    if (M > 8) g.append(E('text', { class: 'node-badge', x: 44, y: -20, 'text-anchor': 'end' }, '×' + M));
    g.append(E('rect', { class: 'prog', x: -44, y: 25, width: 0, height: 3, rx: 1.5 }));
    // batch resource: a quiet status badge above the box (accumulating N/B → setup → processing)
    if (n.batch && n.batch.on) g.append(E('text', { class: 'batch-badge', x: 0, y: -40, 'text-anchor': 'middle' }, 'batch ' + Math.max(2, n.batch.size | 0)));
  } else if (n.kind === 'storage') {
    g.append(E('rect', { class: 'store-rect', x: -38, y: -32, width: 76, height: 64, rx: 9 }));
    g.append(symG(n.symbol || 'triangle', 'node-sym', -10, -27, 0.82));    // chosen shape, centred top
    g.append(E('text', { class: 'node-label', x: 0, y: 8, 'text-anchor': 'middle' }, n.name || 'Storage'));
    g.append(E('text', { class: 'node-kind', x: 0, y: 24, 'text-anchor': 'middle' }, 'cap ' + (n.cap ?? '—')));
  } else {
    g.append(E('circle', { class: 'endpoint', r: 18 }));
    g.append(E('circle', { class: 'endpoint-dot', r: 5 }));
    g.append(E('text', { class: 'node-kind', x: 0, y: 35, 'text-anchor': 'middle' }, n.kind.toUpperCase()));
    g.append(E('text', { class: 'node-label', x: 0, y: 51, 'text-anchor': 'middle' }, n.name || (n.kind === 'source' ? 'In' : 'Out')));
  }
  return g;
}

/* ---- route list --------------------------------------------------------- */
function renderRoute() {
  const ul = $('routeList'); ul.innerHTML = '';
  model.routeOrder.forEach((id, i) => {
    const n = node(id); if (!n) return;
    const li = H('li', { class: (selected && selected.kind === 'node' && selected.id === id) ? 'sel' : '' });
    li.innerHTML = `<span class="rn">${i + 1}</span><span class="rname"></span><span class="rk">${n.kind}</span>`;
    li.querySelector('.rname').textContent = n.name || n.kind;
    li.append(mini('↑', () => moveInRoute(i, -1)), mini('↓', () => moveInRoute(i, +1)), mini('✕', () => removeNode(id)));
    li.addEventListener('click', (e) => { if (!e.target.classList.contains('mini')) selectNode(id); });
    ul.append(li);
  });
  $('routeHint').textContent = model.nodes.length ? 'Order = flow direction. First node = entry, last = exit.' : 'No nodes yet. Pick a tool above and click the canvas.';
}
function mini(label, on) { const b = H('button', { class: 'mini' }, label); b.addEventListener('click', (e) => { e.stopPropagation(); on(); }); return b; }

/* ---- inspector (node OR leg) ------------------------------------------- */
function renderInspector() {
  const body = $('propBody'); body.innerHTML = '';
  if (!selected) {
    $('propKind').textContent = 'Selected'; $('propTitle').textContent = 'Nothing selected';
    body.append(H('p', { class: 'small faint' }, 'Click a node or a transport leg on the floor to edit it.'));
    return;
  }
  if (selected.kind === 'node') inspectNode(node(selected.id), body);
  else inspectLeg(selected.key, body);
}
/* grouped symbol picker (Manufacturing / Service / Abstract·VSM) for a node */
function symbolPicker(n) {
  const wrap = H('div', { class: 'sympick' });
  const cur = n.symbol || (n.kind === 'storage' ? 'triangle' : 'box');
  for (const [cat, label] of SYMBOL_CATS) {
    const keys = Object.keys(SYMBOLS).filter((k) => SYMBOLS[k].cat === cat);
    if (!keys.length) continue;
    wrap.append(H('p', { class: 'symcat' }, label));
    const row = H('div', { class: 'symrow' });
    keys.forEach((k) => {
      const b = H('button', { class: 'symbtn', type: 'button', title: SYMBOLS[k].label, 'aria-pressed': String(cur === k) });
      b.innerHTML = `<svg viewBox="0 0 24 24">${SYMBOLS[k].path}</svg>`;
      b.addEventListener('click', () => { n.symbol = k; persist(); render(); renderInspector(); });
      row.append(b);
    });
    wrap.append(row);
  }
  return wrap;
}
/* Static deadlock guards for a batch resource: cases where B can provably never be reached, so
   the model would jam. Surfaced in the inspector (and block Play — see buildSim). */
function batchWarning(n) {
  if (!n.batch || !n.batch.on) return null;
  const B = Math.max(2, n.batch.size | 0);
  if (n.buffer && n.buffer.finite && n.buffer.cap < B)
    return `Input buffer capacity (${n.buffer.cap}) is below the batch size (${B}) — a full batch can never accumulate, so this station would jam. Raise the capacity to at least ${B}, or lower B.`;
  if (model.control === 'conwip' && model.conwipCap < B)
    return `The CONWIP cap (${model.conwipCap}) is below the batch size (${B}) — at most ${model.conwipCap} parts can ever be in the line, so a batch of ${B} can never form. Raise the cap to at least ${B}, or lower B.`;
  return null;
}
function firstBatchDeadlock() {
  for (const n of model.nodes) if (n.kind === 'resource') { const w = batchWarning(n); if (w) return { n, w }; }
  return null;
}
function inspectNode(n, body) {
  if (!n) { selected = null; renderInspector(); return; }
  $('propKind').textContent = n.kind;
  $('propTitle').textContent = n.name || n.kind[0].toUpperCase() + n.kind.slice(1);
  body.append(field('Name', textInput(n.name || '', (v) => { n.name = v; persist(); render(); renderRoute(); })));
  if (n.kind === 'resource') {
    if (!n.batch) n.batch = { on: false, size: 2, setup: 0 };
    body.append(H('p', { class: 'subhead' }, 'Symbol / shape'));
    body.append(symbolPicker(n));
    body.append(field('Machines (parallel)', numInput(n.machines || 1, 1, 1, (v) => { n.machines = Math.max(1, v | 0); persist(); render(); })));
    // Batch mode — the machine waits for a full batch of B, pays one setup, then processes the batch together.
    body.append(H('p', { class: 'subhead' }, 'Batch processing'));
    const batchChk = H('input', { type: 'checkbox' }); batchChk.checked = !!n.batch.on;
    batchChk.addEventListener('change', () => { n.batch.on = batchChk.checked; persist(); if (n.batch.on) ensureBatchAssumption(); render(); renderInspector(); });
    body.append(H('label', { class: 'toggle-row' }, [batchChk, 'Process parts in batches']));
    if (n.batch.on) {
      body.append(field('Batch size B', numInput(n.batch.size, 2, 1, (v) => { n.batch.size = Math.max(2, v | 0); persist(); ensureBatchAssumption(); render(); renderInspector(); })));
      body.append(field('Setup time (once per batch)', numInput(n.batch.setup, 0, 0.1, (v) => { n.batch.setup = Math.max(0, v || 0); persist(); render(); })));
      body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' },
        `The machine waits for a full batch of ${n.batch.size}, pays the setup once, then processes the batch together — all ${n.batch.size} finish at the same moment and continue on individually.`));
      const w = batchWarning(n);
      if (w) body.append(H('p', { class: 'floor-warn', style: 'margin:var(--s-2) 0 0' }, w));
      const binding = `resource:${n.id}:batch.size`;
      const haveFactor = project.conceptual.factors.some((f) => f.bindingHint === binding);
      const facBtn = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-2)' },
        haveFactor ? 'Batch size is an experimental factor ✓' : 'Add batch size as an experimental factor');
      facBtn.disabled = haveFactor;
      facBtn.addEventListener('click', () => { if (addBatchFactor(n)) renderInspector(); });
      body.append(facBtn);
    }
    body.append(H('p', { class: 'subhead' }, n.batch.on ? 'Whole-batch process time' : 'Service time'));
    if (n.batch.on) body.append(H('p', { class: 'floor-hint', style: 'margin:0 0 var(--s-2)' }, 'This distribution is now the time to process the WHOLE batch, not one part.'));
    body.append(distEditor(n.service, persist));
    body.append(H('p', { class: 'subhead' }, 'Input buffer'));
    const finChk = H('input', { type: 'checkbox' }); finChk.checked = !!n.buffer.finite;
    finChk.addEventListener('change', () => { n.buffer.finite = finChk.checked; persist(); renderInspector(); });
    body.append(H('label', { class: 'toggle-row' }, [finChk, 'Finite capacity (can block / back up)']));
    if (n.buffer.finite) body.append(field('Capacity', numInput(n.buffer.cap, 1, 1, (v) => { n.buffer.cap = Math.max(1, v | 0); persist(); })));
    body.append(H('p', { class: 'subhead' }, 'Scrap'));
    body.append(field('Scrap fraction (0–1)', numInput(n.scrap || 0, 0, 0.01, (v) => { n.scrap = Math.min(1, Math.max(0, v || 0)); persist(); })));
    body.append(H('p', { class: 'subhead' }, 'Breakdowns'));
    const brkChk = H('input', { type: 'checkbox' }); brkChk.checked = !!n.brk.on;
    brkChk.addEventListener('change', () => { n.brk.on = brkChk.checked; persist(); render(); renderInspector(); });
    body.append(H('label', { class: 'toggle-row' }, [brkChk, 'Machine can break down (preempt-resume)']));
    if (n.brk.on) {
      body.append(H('p', { class: 'subhead' }, 'Time to failure'));
      body.append(distEditor(n.brk.ttf, persist));
      body.append(H('p', { class: 'subhead' }, 'Time to repair'));
      body.append(distEditor(n.brk.ttr, persist));
    }
  } else if (n.kind === 'storage') {
    body.append(H('p', { class: 'subhead' }, 'Symbol / shape'));
    body.append(symbolPicker(n));
    body.append(field('Capacity', numInput(n.cap, 1, 1, (v) => { n.cap = Math.max(1, v | 0); persist(); })));
  } else if (n.kind === 'source') {
    body.append(H('p', { class: 'subhead' }, 'Interarrival time'));
    body.append(distEditor(n.interarrival, persist));
  }
}
function inspectLeg(key, body) {
  const [fromId, toId] = key.split('>'); const from = node(fromId), to = node(toId);
  $('propKind').textContent = 'transport leg';
  $('propTitle').textContent = `${(from && from.name) || fromId} → ${(to && to.name) || toId}`;
  const o = model.legs[key] || {};
  const mover = o.mover || model.defaultMover;
  const placeDist = legDistance(from, to), effLen = (o.length > 0) ? o.length : placeDist;
  body.append(H('p', { class: 'small', style: 'margin:0' }, 'Travel time on this leg = length ÷ speed.'));
  body.append(field('Transport length (m)', numInput(+effLen.toFixed(1), 0, 1, (v) => {
    if (v > 0) model.legs[key] = Object.assign({}, model.legs[key], { length: v });
    else if (model.legs[key]) { delete model.legs[key].length; }
    persist(); render();
  })));
  body.append(H('p', { class: 'small faint', style: 'margin:0' }, (o.length > 0)
    ? `Typed length (placement distance is ${placeDist.toFixed(0)} m).`
    : 'From placement distance — type a value to fix it independently of the layout.'));
  body.append(field('Mover', segmented(
    [{ value: 'instant', label: 'Instant' }, { value: 'conveyor', label: 'Conveyor' }, { value: 'worker', label: 'Worker' }],
    mover, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { mover: v }); if (v === 'worker') ensureWorkerAssumption(); persist(); render(); renderInspector(); }, 'Leg mover')));
  if (mover === 'conveyor') {
    body.append(field('Capacity (items)', numInput(o.cap != null ? o.cap : model.conveyor.cap, 1, 1, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { cap: Math.max(1, v | 0) }); persist(); })));
    body.append(field('Speed (m/min)', numInput(o.speed != null ? o.speed : model.conveyor.speed, 1, 5, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { speed: Math.max(1, v) }); persist(); render(); })));
  } else if (mover === 'worker') {
    body.append(H('p', { class: 'small faint', style: 'margin:0' }, 'Uses the shared worker pool (set its size and speed under Transport).'));
  } else {
    body.append(field('Speed (m/min)', numInput(o.speed != null ? o.speed : model.defaultSpeed, 1, 5, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { speed: Math.max(1, v) }); persist(); render(); })));
  }
  body.append(H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-2)', onclick: () => { delete model.legs[key]; persist(); render(); renderInspector(); } }, 'Reset to default'));
}

/* ---- transport defaults panel ------------------------------------------ */
function renderTransport() {
  const b = $('transportBody'); b.innerHTML = '';
  b.append(field('Default mover', segmented(
    [{ value: 'instant', label: 'Instant' }, { value: 'conveyor', label: 'Conveyor' }, { value: 'worker', label: 'Worker' }],
    model.defaultMover, (v) => { model.defaultMover = v; if (v === 'worker') ensureWorkerAssumption(); persist(); render(); renderTransport(); }, 'Default mover')));
  b.append(field('Default speed (m/min)', numInput(model.defaultSpeed, 1, 5, (v) => { model.defaultSpeed = Math.max(1, v); persist(); render(); })));
  b.append(H('p', { class: 'subhead' }, 'Worker pool'));
  b.append(field('Workers', numInput(model.workers.count, 1, 1, (v) => { model.workers.count = Math.max(1, v | 0); persist(); })));
  b.append(field('Worker speed (m/min)', numInput(model.workers.speed, 1, 5, (v) => { model.workers.speed = Math.max(1, v); persist(); render(); })));
  b.append(H('p', { class: 'subhead' }, 'Conveyor default'));
  b.append(field('Capacity', numInput(model.conveyor.cap, 1, 1, (v) => { model.conveyor.cap = Math.max(1, v | 0); persist(); })));
  b.append(field('Speed (m/min)', numInput(model.conveyor.speed, 1, 5, (v) => { model.conveyor.speed = Math.max(1, v); persist(); render(); })));
}

/* ---- control & demand panel -------------------------------------------- */
function renderControl() {
  const b = $('controlBody'); b.innerHTML = '';
  b.append(field('Release control', segmented(
    [{ value: 'push', label: 'Push' }, { value: 'conwip', label: 'CONWIP (pull)' }],
    model.control, (v) => { model.control = v; persist(); renderControl(); }, 'Control')));
  if (model.control === 'conwip') b.append(field('WIP cap (cards)', numInput(model.conwipCap, 1, 1, (v) => { model.conwipCap = Math.max(1, v | 0); persist(); })));
  b.append(field('Raw supply', segmented(
    [{ value: 'stream', label: 'Arrival stream' }, { value: 'limitless', label: 'Limitless' }],
    model.supply, (v) => { model.supply = v; persist(); renderControl(); }, 'Supply')));
  b.append(H('p', { class: 'floor-hint', style: 'margin:0' }, model.supply === 'stream'
    ? 'Raw arrives per the Source node’s interarrival distribution.'
    : 'Raw is always available — release is limited by capacity (and the WIP cap, if CONWIP).'));
  b.append(H('p', { class: 'subhead' }, 'Customer demand'));
  b.append(field('Consumption', segmented(
    [{ value: 'instant', label: 'Instant' }, { value: 'stream', label: 'Demand stream' }],
    model.demand.mode, (v) => { model.demand.mode = v; persist(); renderControl(); }, 'Demand')));
  if (model.demand.mode === 'stream') { b.append(H('p', { class: 'subhead' }, 'Interdemand time')); b.append(distEditor(model.demand.dist, persist)); }
  else b.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'Every finished unit is consumed immediately (push to sink).'));
}

/* ---- table overview ----------------------------------------------------- */
function renderTable() {
  const host = $('tableHost'); host.innerHTML = '';
  const wrap = H('div', { class: 'ov-table' });
  // resources
  wrap.append(H('h3', {}, 'Resources & storage'));
  const rt = H('table', { class: 'table' }); rt.innerHTML = '<thead><tr><th>Node</th><th>Kind</th><th class="num">Machines</th><th>Service / cap</th><th class="num">Buffer</th></tr></thead>';
  const rb = H('tbody', {});
  model.routeOrder.map(node).filter(Boolean).forEach((n) => {
    const tr = H('tr', { class: 'click' });
    const svc = n.kind === 'resource' ? `${DISTS[n.service.type].label} · μ=${distMean(n.service).toFixed(2)}${(n.batch && n.batch.on) ? ` · batch ${n.batch.size}${n.batch.setup ? `+setup ${n.batch.setup}` : ''}` : ''}${n.scrap ? ` · scrap ${(n.scrap * 100).toFixed(0)}%` : ''}${n.brk.on ? ' · brk' : ''}` : n.kind === 'storage' ? `cap ${n.cap}` : n.kind === 'source' ? `${DISTS[n.interarrival.type].label} · μ=${distMean(n.interarrival).toFixed(2)}` : '—';
    const buf = n.kind === 'resource' ? (n.buffer.finite ? String(n.buffer.cap) : '∞') : '—';
    tr.innerHTML = `<td></td><td>${n.kind}</td><td class="num">${n.kind === 'resource' ? (n.machines || 1) : '—'}</td><td class="sum"></td><td class="num">${buf}</td>`;
    tr.children[0].textContent = n.name || n.kind; tr.children[3].textContent = svc;
    tr.addEventListener('click', () => { selectNode(n.id); });
    rb.append(tr);
  });
  rt.append(rb); wrap.append(rt);
  // legs
  wrap.append(H('h3', {}, 'Transport legs'));
  const lt = H('table', { class: 'table' }); lt.innerHTML = '<thead><tr><th>From → To</th><th>Mover</th><th>Params</th></tr></thead>';
  const lb = H('tbody', {});
  for (let i = 0; i < model.routeOrder.length - 1; i++) {
    const key = legKeyAt(i), mover = effMover(key), o = model.legs[key] || {};
    const from = node(model.routeOrder[i]), to = node(model.routeOrder[i + 1]);
    const params = mover === 'conveyor' ? `cap ${o.cap != null ? o.cap : model.conveyor.cap}, ${o.speed != null ? o.speed : model.conveyor.speed} m/min`
      : mover === 'worker' ? `pool ${model.workers.count} @ ${model.workers.speed} m/min` : `${o.speed != null ? o.speed : model.defaultSpeed} m/min`;
    const tr = H('tr', { class: 'click' });
    tr.innerHTML = `<td></td><td>${mover}${model.legs[key] ? '' : ' <span class="faint">(default)</span>'}</td><td class="sum">${params}</td>`;
    tr.children[0].textContent = `${(from && from.name) || key.split('>')[0]} → ${(to && to.name) || key.split('>')[1]}`;
    tr.addEventListener('click', () => { selectLeg(key); });
    lb.append(tr);
  }
  lt.append(lb); wrap.append(lt);
  host.append(wrap);
}

/* ---- selection + mutations --------------------------------------------- */
function selectNode(id) { selected = { kind: 'node', id }; activateTab('inspect'); refreshAll(); }
function selectLeg(key) { selected = { kind: 'leg', key }; activateTab('inspect'); refreshAll(); }
function refreshAll() { render(); renderRoute(); renderInspector(); if (!$('tablePanel').hidden) renderTable(); }
function activateTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tabbody').forEach((b) => { b.hidden = (b.id !== 'tab-' + name); });
}

function addNode(kind, x, y) {
  const idp = { resource: 'res', storage: 'sto', source: 'src', sink: 'snk' }[kind] || 'n';
  const n = { kind, id: uid(idp), name: '', x, y };
  if (kind === 'resource') { n.machines = 1; n.symbol = 'box'; n.service = newDist('exp', { mean: 1 }); n.buffer = { finite: false, cap: 10, init: 0, target: 8 }; n.scrap = 0; n.brk = { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) }; n.batch = { on: false, size: 2, setup: 0 }; }
  if (kind === 'storage') { n.cap = 10; n.symbol = 'triangle'; }
  if (kind === 'source') n.interarrival = newDist('exp', { mean: 3 });
  model.nodes.push(n); model.routeOrder.push(n.id);
  selected = { kind: 'node', id: n.id }; activateTab('inspect'); persist(); refreshAll();
}
function removeNode(id) {
  model.nodes = model.nodes.filter((n) => n.id !== id);
  model.routeOrder = model.routeOrder.filter((x) => x !== id);
  for (const k of Object.keys(model.legs)) if (k.startsWith(id + '>') || k.endsWith('>' + id)) delete model.legs[k];
  if (selected && ((selected.kind === 'node' && selected.id === id) || (selected.kind === 'leg' && selected.key.includes(id)))) selected = null;
  persist(); refreshAll();
}
function moveInRoute(i, d) { const j = i + d; if (j < 0 || j >= model.routeOrder.length) return; const a = model.routeOrder; [a[i], a[j]] = [a[j], a[i]]; persist(); refreshAll(); }

/* ---- worker simplification auto-log ------------------------------------ */
function ensureWorkerAssumption() {
  if (!project.assumptions.some((a) => a.id === 'a_worker_return')) {
    project.assumptions.push(newAssumption({ id: 'a_worker_return', kind: 'simplification',
      description: 'Worker empty-return travel is ignored — only one-way loaded trips are modelled.',
      rationale: 'Out of v1 scope (Charter §6). Ignoring it understates worker utilisation, so it is flagged for sensitivity analysis later.',
      data: 'C', uncertainty: 'Real empty-return time depends on layout and dispatch.', sensitivity: true }));
    save(project);
  }
}

/* ---- batch modelling-note auto-log ------------------------------------- */
// Records the strict full-batch-start behaviour as a stated simplification (Robinson: document
// assumptions/simplifications). Refreshed to list the current batch stations whenever one changes.
function ensureBatchAssumption() {
  const batched = model.nodes.filter((n) => n.kind === 'resource' && n.batch && n.batch.on);
  const existing = project.assumptions.find((a) => a.id === 'a_batch_start');
  if (!batched.length) return;   // leave any prior note in place if batching is later turned off
  const names = batched.map((n) => `${n.name || 'a station'} (B=${Math.max(2, n.batch.size | 0)})`).join(', ');
  const desc = `Batch stations require a FULL batch to start (strict wait-to-batch, no timeout); setup is incurred once per batch and the process time is for the whole batch: ${names}.`;
  if (existing) { existing.description = desc; }
  else project.assumptions.push(newAssumption({ id: 'a_batch_start', kind: 'simplification',
    description: desc,
    rationale: 'Charter §6.1 process-batch model. Wait-to-batch is variability from control, not randomness (theory-notes §4.6); the strict no-timeout rule is a deliberate simplification to flag for sensitivity analysis.',
    data: 'C', uncertainty: 'Real batching policies may start partial batches after a timeout; that latency is excluded here.', sensitivity: true }));
  save(project);
}
// Offer batch size as an experimental factor (Robinson: inputs you deliberately vary). De-duped by binding.
function addBatchFactor(n) {
  const binding = `resource:${n.id}:batch.size`;
  if (project.conceptual.factors.some((f) => f.bindingHint === binding)) return false;
  project.conceptual.factors.push(newFactor({
    name: `Batch size — ${n.name || 'resource'}`, unit: 'parts', baseline: String(Math.max(2, n.batch.size | 0)),
    description: 'Number of parts processed together as one batch (process batch). Vary to study the setup/wait-to-batch trade-off.',
    bindingHint: binding }));
  save(project);
  return true;
}

/* ---- run ---------------------------------------------------------------- */
function buildRunModel() {
  const nodes = model.nodes.map((n) => n.kind === 'resource'
    ? { kind: 'resource', id: n.id, name: n.name, x: n.x, y: n.y, machines: n.machines || 1, service: n.service, bufferCap: n.buffer.finite ? n.buffer.cap : Infinity, scrap: n.scrap || 0, brk: n.brk, batch: (n.batch && n.batch.on) ? { size: Math.max(2, n.batch.size | 0), setup: Math.max(0, n.batch.setup || 0) } : null }
    : { kind: n.kind, id: n.id, name: n.name, x: n.x, y: n.y, cap: n.cap });
  const src = model.nodes.find((n) => n.kind === 'source');
  const demand = src ? src.interarrival : newDist('exp', { mean: 3 });
  const transport = { default: model.defaultMover, speed: model.defaultSpeed, conveyor: model.conveyor, workers: model.workers, legs: model.legs };
  return { schema: 'des-floor/v1', scale: S, units: model.units, nodes,
    parts: [{ id: 'p', kind: 'product', routing: model.routeOrder.slice(), demand }], transport,
    control: model.control, conwipCap: model.conwipCap, supply: model.supply,
    demand: model.demand.mode === 'stream' ? { mode: 'stream', dist: model.demand.dist } : { mode: 'instant' } };
}
/* ---- playback ----------------------------------------------------------- */
function buildSim() {
  if (model.routeOrder.length < 2) { sim = null; needsBuild = true; lastBuildError = 'Add at least a source, a resource and a sink, then press Play.'; return false; }
  // static deadlock guard: a batch that can provably never form would jam the model — refuse and explain
  const dl = firstBatchDeadlock();
  if (dl) { sim = null; needsBuild = true; lastBuildError = `Cannot run — ${dl.n.name || 'a batch station'}: ${dl.w}`; return false; }
  lastBuildError = '';
  sim = new FloorSim(buildRunModel(), 1);
  simCursor = 0; needsBuild = false; finished = false; scrapSeen = 0;
  render(); updateClock();
  return true;
}
function setPlayLabel() { $('btnPlay').textContent = playing ? 'Pause' : (finished ? 'Replay' : 'Play'); }
function updateClock() {
  $('clkTime').textContent = sim ? sim.now.toFixed(1) : '0.0';
  $('clkWip').textContent = sim ? sim.wip : 0;
  $('clkOut').textContent = sim ? sim.completed : 0;
  $('clkEvents').textContent = (sim ? sim.events : 0).toLocaleString('en-US') + ' events';
}
function loop(ts) {
  if (!playing) return;
  let dt = (ts - lastTs) / 1000; lastTs = ts; if (!(dt > 0)) dt = 0; if (dt > 0.25) dt = 0.25;
  simCursor += dt * speed;
  let guard = 0;
  while (sim.fel.length && sim.fel[0].time <= simCursor && guard++ < 200000) sim.step();
  if (!sim.fel.length) { playing = false; finished = true; setPlayLabel(); showResults(); }
  renderFrame(simCursor); updateClock();
  if (playing) raf = requestAnimationFrame(loop);
}
function play() {
  if (needsBuild || !sim || finished || !sim.fel.length) {
    if (!buildSim()) { $('floorHint').textContent = lastBuildError; setPlayLabel(); return; }
  }
  playing = true; finished = false; setPlayLabel(); lastTs = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
}
function pause() { playing = false; cancelAnimationFrame(raf); setPlayLabel(); }
function togglePlay() { playing ? pause() : play(); }
function stepOne() { pause(); if (needsBuild || !sim) { if (!buildSim()) { $('floorHint').textContent = lastBuildError; return; } } if (!sim) return; if (sim.fel.length) { simCursor = sim.fel[0].time; sim.step(); } renderFrame(simCursor); updateClock(); }
/* End the run at the moment currently on screen (the sim never empties its FEL on
   its own), freeze the time-average statistics there, and show the results. */
function endRun() {
  pause();
  if (needsBuild || !sim) { $('floorHint').textContent = 'Nothing is running yet — press Play or Step first.'; return; }
  if (simCursor > sim.now) { sim.accumulate(simCursor); sim.now = simCursor; }   // extend area-stats to the watched instant
  finished = true; setPlayLabel(); render(); updateClock(); showResults(); activateTab('results');
}
function resetSim() { playing = false; cancelAnimationFrame(raf); buildSim(); setPlayLabel(); }

/* ---- results (read the live sim) --------------------------------------- */
/* adaptive figure formatting: keep KPI values compact and box-safe whatever the
   magnitude — more decimals for small numbers, thousands-suffix for large ones. */
function fmtNum(x) {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e5) return (x / 1e3).toFixed(0) + 'k';
  if (a >= 1e4) return (x / 1e3).toFixed(1) + 'k';
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  if (a >= 1) return x.toFixed(2);
  return x.toFixed(3);
}
function showResults() {
  const results = $('results');
  if (!sim) { results.innerHTML = '<p class="results-empty">Press Play, then “End” when you’ve seen enough, to see results.</p>'; return; }
  const r = sim.metrics(); const f = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';
  results.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi__label">Throughput</div><div class="kpi__value num">${fmtNum(r.throughput)}<span class="kpi__unit">/min</span></div></div>
      <div class="kpi"><div class="kpi__label">Cycle time</div><div class="kpi__value num">${fmtNum(r.avgCycleTime)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">In transport</div><div class="kpi__value num">${fmtNum(r.avgTransitPerJob)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">Avg WIP</div><div class="kpi__value num">${fmtNum(r.avgWIP)}</div></div>
      <div class="kpi"><div class="kpi__label">Yield</div><div class="kpi__value num">${f(100 * r.yield, 1)}<span class="kpi__unit">%</span></div></div>
    </div>
    <table class="table" style="margin-top:var(--s-4)"><thead><tr><th>Resource</th><th class="num">Util</th><th class="num">Down</th><th class="num">Blocked</th></tr></thead><tbody id="utilBody"></tbody></table>`;
  const tb = $('utilBody');
  model.nodes.filter((n) => n.kind === 'resource').forEach((n) => { const tr = H('tr', {}); tr.innerHTML = `<td></td><td class="num">${(100 * (r.utilisation[n.id] || 0)).toFixed(1)}%</td><td class="num">${(100 * (r.downFraction[n.id] || 0)).toFixed(1)}%</td><td class="num">${(100 * (r.blockedFraction[n.id] || 0)).toFixed(1)}%</td>`; tr.firstChild.textContent = n.name || 'Resource'; tb.append(tr); });
  const tRows = [];
  if (r.workers) tRows.push(`<tr><td>Workers (${r.workers.count})</td><td class="num">${(100 * r.workers.utilisation).toFixed(1)}% util</td><td class="num">${r.workers.avgQueue.toFixed(2)} queued</td></tr>`);
  const conv = Object.values(r.conveyors || {}); if (conv.length) tRows.push(`<tr><td>Conveyor (busiest)</td><td class="num">${(100 * Math.max(...conv.map((c) => c.utilisation))).toFixed(1)}% full</td><td class="num">—</td></tr>`);
  const blk = Math.max(0, ...Object.values(r.blockedFraction || {})); if (blk > 0.001) tRows.push(`<tr><td>Most-blocked resource</td><td class="num">${(100 * blk).toFixed(1)}% blocked</td><td class="num">—</td></tr>`);
  if (tRows.length) results.append(H('div', { html: `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Transport</p><table class="table"><tbody>${tRows.join('')}</tbody></table>` }));
  // batch + deadlock surface
  const batchIds = Object.keys(r.batch || {});
  if (r.deadlock || batchIds.length) {
    const bRows = [];
    if (r.deadlock) bRows.push('<tr><td>Deadlock</td><td class="num">model jammed — WIP stranded, no events left</td></tr>');
    for (const id of batchIds) { const b = r.batch[id]; const nm = (node(id) && node(id).name) || id;
      bRows.push(`<tr><td>${esc(nm)} (B=${b.size})</td><td class="num">${b.batchesStarted} batches done${b.waitingForBatch ? `, ${b.waitingForBatch} waiting for a batch` : ''}</td></tr>`); }
    results.append(H('div', { html: `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Batching${r.deadlock ? ' — deadlock detected' : ''}</p><table class="table"><tbody>${bRows.join('')}</tbody></table>` }));
  }
  // control & demand summary
  const cRows = [`<tr><td>Control</td><td class="num">${r.control === 'conwip' ? `CONWIP (cap ${r.conwipCap})` : 'push'}</td></tr>`,
    `<tr><td>Max line WIP</td><td class="num">${r.maxLineWip}</td></tr>`,
    `<tr><td>Raw supply</td><td class="num">${r.supply}</td></tr>`];
  if (r.demand === 'stream') cRows.push(`<tr><td>Fill rate</td><td class="num">${(100 * r.fillRate).toFixed(1)}%</td></tr>`,
    `<tr><td>Stockouts / avg FG</td><td class="num">${r.stockouts} / ${r.avgFG.toFixed(2)}</td></tr>`);
  results.append(H('div', { html: `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Control &amp; demand</p><table class="table"><tbody>${cRows.join('')}</tbody></table>` }));
}

/* ---- example + clear ---------------------------------------------------- */
function loadExample() {
  const mk = (kind, name, x, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y: 26 }, extra);
  model.nodes = [
    mk('source', 'Raw in', 8, { interarrival: newDist('exp', { mean: 3 }) }),
    mk('resource', 'Press', 26, { machines: 1, symbol: 'press', service: newDist('lognormal', { mean: 2, sd: 0.5 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) } }),
    mk('storage', 'WIP', 44, { cap: 10 }),
    mk('resource', 'Inspect', 62, { machines: 1, symbol: 'inspect', service: newDist('triangular', { min: 0.8, mode: 1.2, max: 2 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) } }),
    mk('sink', 'Ship', 78),
  ];
  model.routeOrder = model.nodes.map((n) => n.id); model.legs = {}; selected = null; sim = null;
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
}
/* Bottleneck-and-buffer demo: a fast Cut feeds a WIP buffer (storage, cap 8) ahead
   of a slow Press whose input buffer is finite (cap 2). The Press can't keep up, so
   stock piles up in the WIP buffer (fills to its cap) and then backs up — showing
   exactly how a finite downstream buffer makes an upstream storage accumulate. */
function loadExample2() {
  const mk = (kind, name, x, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y: 26 }, extra);
  const brk = () => ({ on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) });
  model.nodes = [
    mk('source', 'Raw in', 8, { interarrival: newDist('exp', { mean: 1.6 }) }),
    mk('resource', 'Cut', 26, { machines: 1, symbol: 'cut', service: newDist('lognormal', { mean: 0.7, sd: 0.2 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: brk() }),
    mk('storage', 'WIP buffer', 44, { cap: 8, symbol: 'triangle' }),
    mk('resource', 'Press', 62, { machines: 1, symbol: 'press', service: newDist('lognormal', { mean: 3, sd: 0.6 }), buffer: { finite: true, cap: 2, init: 0, target: 8 }, scrap: 0, brk: brk() }),
    mk('sink', 'Ship', 78),
  ];
  model.routeOrder = model.nodes.map((n) => n.id); model.legs = {}; selected = null; sim = null;
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'Bottleneck demo: the slow Press has a finite input buffer (cap 2), so stock piles up in the WIP buffer ahead of it (fills to cap 8) and backs up. Hover any node for live counts.';
}
/* Batch demo: a steady stream is prepped one-at-a-time, then a heat-treat furnace processes
   parts in BATCHES of 4 — it waits until 4 have accumulated (watch the N/4 badge climb), pays
   one setup, then cooks all 4 together and releases them. Stable on purpose (arrival ~0.4/min <
   furnace capacity 4/(3+5)=0.5/min) so it cycles cleanly: accumulate → setup → process → repeat. */
function loadExample3() {
  const mk = (kind, name, x, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y: 26 }, extra);
  const brk = () => ({ on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) });
  const buf = () => ({ finite: false, cap: 10, init: 0, target: 8 });
  model.nodes = [
    mk('source', 'Raw in', 8, { interarrival: newDist('exp', { mean: 2.5 }) }),
    mk('resource', 'Prep', 28, { machines: 1, symbol: 'cut', service: newDist('lognormal', { mean: 1, sd: 0.3 }), buffer: buf(), scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 } }),
    mk('resource', 'Heat-treat', 54, { machines: 1, symbol: 'furnace', service: newDist('lognormal', { mean: 5, sd: 1 }), buffer: buf(), scrap: 0, brk: brk(), batch: { on: true, size: 4, setup: 3 } }),
    mk('sink', 'Ship', 78),
  ];
  model.routeOrder = model.nodes.map((n) => n.id); model.legs = {}; selected = null; sim = null;
  model.control = 'push'; model.supply = 'stream';   // clean defaults so a leftover CONWIP<B can't block the demo
  ensureBatchAssumption();   // log the "requires a full batch to start" simplification, as in real use
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'Batch demo: the Heat-treat furnace runs batches of 4 — it waits for a full batch (watch the N/4 badge), pays one setup, then cooks all 4 together. Hover it for live counts; press Play.';
}
function clearFloor() { model.nodes = []; model.routeOrder = []; model.legs = {}; selected = null; sim = null;
  persist(); refreshAll(); updateClock(); setPlayLabel();
  $('results').innerHTML = '<p class="results-empty">Press Play, then “End” when you’ve seen enough, to see results.</p>'; }

/* ---- pointer interaction ------------------------------------------------ */
function onPointerDown(e) {
  if (playing) return;          // pause to edit the floor
  const svg = $('svg'); const grp = e.target.closest('[data-node]'); const legHit = e.target.closest('[data-leg]'); const p = svgPoint(e);
  if (tool === 'move') {
    if (grp) { const id = grp.getAttribute('data-node'); selectNode(id); drag = { id, moved: false }; svg.setPointerCapture(e.pointerId); }
    else if (legHit) selectLeg(legHit.getAttribute('data-leg'));
    else { panning = { sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy }; svg.classList.add('panning'); svg.setPointerCapture(e.pointerId); }
  } else if (!grp && !legHit) addNode(tool, p.x / S, p.y / S);
}
function onPointerMove(e) {
  if (panning) { const r = $('svg').getBoundingClientRect();
    view.cx = panning.cx - (e.clientX - panning.sx) * (BASE_W / view.z) / r.width;
    view.cy = panning.cy - (e.clientY - panning.sy) * (BASE_H / view.z) / r.height; setViewBox(); return; }
  if (!drag) return; const p = svgPoint(e); const n = node(drag.id); if (!n) return;
  n.x = Math.max(1.5, p.x / S); n.y = Math.max(1.5, p.y / S); drag.moved = true; render();
}
function onPointerUp() {
  if (panning) { $('svg').classList.remove('panning'); panning = null; }
  if (drag) { if (drag.moved) { persist(); if (!$('tablePanel').hidden) renderTable(); } drag = null; }
}

/* ---- init --------------------------------------------------------------- */
function init() {
  const svg = $('svg');
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointermove', onHover);
  svg.addEventListener('pointerleave', () => { hoverNodeId = null; hideTip(); });
  window.addEventListener('pointerup', onPointerUp);
  $('palette').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; tool = b.dataset.tool; $('palette').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('btnExample').addEventListener('click', loadExample);
  $('btnClear').addEventListener('click', clearFloor);
  $('btnTable').addEventListener('click', () => { const p = $('tablePanel'); p.hidden = !p.hidden; $('btnTable').setAttribute('aria-pressed', String(!p.hidden)); if (!p.hidden) renderTable(); });

  // playback controls
  $('btnPlay').addEventListener('click', togglePlay);
  $('btnStep').addEventListener('click', stepOne);
  $('btnEnd').addEventListener('click', endRun);
  $('btnReset').addEventListener('click', resetSim);
  window.addEventListener('resize', updateScaleBar);
  const sp = $('speed'); speed = parseFloat(sp.value) || 6; $('spdV').textContent = speed + '×';
  sp.addEventListener('input', () => { speed = parseFloat(sp.value) || 6; $('spdV').textContent = speed + '×'; });
  // zoom / pan
  $('zIn').addEventListener('click', () => zoomBy(1.25));
  $('zOut').addEventListener('click', () => zoomBy(1 / 1.25));
  $('zFit').addEventListener('click', zoomFit);
  $('zLabel').addEventListener('click', () => { view = { z: 1, cx: BASE_W / 2, cy: BASE_H / 2 }; setViewBox(); });
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, svgPoint(e)); }, { passive: false });
  // tabs
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));

  let startTab = 'model';
  if (location.hash === '#example' && model.nodes.length === 0) { loadExample(); const r = model.nodes.find((n) => n.kind === 'resource'); if (r) { selected = { kind: 'node', id: r.id }; startTab = 'inspect'; } }
  else if (location.hash === '#example2') { loadExample2(); const b = model.nodes.find((n) => n.kind === 'storage'); if (b) { selected = { kind: 'node', id: b.id }; startTab = 'inspect'; } }   // bottleneck + buffer demo
  else if (location.hash === '#example3') { loadExample3(); const b = model.nodes.find((n) => n.kind === 'resource' && n.batch && n.batch.on); if (b) { selected = { kind: 'node', id: b.id }; startTab = 'inspect'; } }   // batch-processing demo
  if (model.defaultMover === 'worker' || Object.values(model.legs).some((l) => l.mover === 'worker')) ensureWorkerAssumption();
  render(); renderRoute(); renderInspector(); renderTransport(); renderControl();
  activateTab(startTab); setPlayLabel(); updateClock(); zoomFit();
  if (location.hash === '#play' || location.hash === '#example2' || location.hash === '#example3') { if (model.routeOrder.length < 2) loadExample(); play(); }   // deep-link: open running
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
