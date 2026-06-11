/* 2D floor builder. Place nodes, define a linear route, set full parameters per
   node and per transport leg, and run the transport-aware engine to see how the
   layout performs. Persists into the shared study project at `project.model`
   (des-floor/v1). Click any node or any leg to edit it; a table view gives an
   overview of every parameter. */

import { load, save, uid, newAssumption, newFactor, newResponse } from './project.js';
import { FloorSim, legDistance } from '../../src/floor-engine.js';
import { DISTS, newDist, distMean, distScv, sample, mulberry32 } from '../../src/distributions.js';
import { buildRunModel as buildRunModelShared } from './run-model.js';

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
let tokenEls = new Map(), queueEls = new Map(), tokenLayer = null, moverEls = new Map();
let scrapSeen = 0;            // index into sim.scrapLog of the last scrap we've animated
let hoverNodeId = null;       // node currently hovered, for the live count tooltip
let lastLedger = 0;           // throttle stamp for the live Flow ledger (ms)

// view (zoom / pan). Base coordinate space is 820×480 px (= 82×48 m at S=10).
const BASE_W = 820, BASE_H = 480;
let view = { z: 1, cx: BASE_W / 2, cy: BASE_H / 2 };   // cx,cy = viewBox centre in base px
let panning = null;

/* ---- model defaults + migration ---------------------------------------- */
// floor centre (metres) — default standard/home location for new movers, lined up there
function floorCentre(m) { const ns = (m && m.nodes) || []; if (!ns.length) return { x: 41, y: 24 }; let sx = 0, sy = 0; for (const n of ns) { sx += (n.x || 0); sy += (n.y || 0); } return { x: sx / ns.length, y: sy / ns.length }; }
function makeMover(kind, centre, i = 0) {
  return { id: uid('mv'), kind, name: (kind === 'agv' ? 'AGV ' : 'Operator ') + (i + 1), speed: 40,
    home: { x: (centre.x || 41) + (i % 4) * 4 - 6, y: (centre.y || 24) }, serves: { links: 'all', machines: 'all' } };
}
function ensureModel(m) {
  const base = {
    schema: 'des-floor/v1', scale: S, units: { time: 'min', distance: 'm', speed: 'm/min' },
    nodes: [], parts: [], activePart: null,
    defaultMover: 'instant', defaultSpeed: 40,
    conveyor: { cap: 3, speed: 30 }, workers: { count: 2, speed: 40 },
    legs: {},
    control: 'push', conwipCap: 10, supply: 'stream',
    demand: { mode: 'instant', dist: newDist('exp', { mean: 2 }) },
  };
  if (!m || m.schema !== 'des-floor/v1') m = base;
  m.nodes = m.nodes || [];
  m.defaultMover = m.defaultMover || 'instant';
  m.defaultSpeed = m.defaultSpeed || (m.params && m.params.speed) || 40;
  m.conveyor = m.conveyor || base.conveyor; m.workers = m.workers || base.workers;
  m.legs = m.legs || {};
  // Phase 3.7 — resource groups (a routing op may target several member machines)
  m.groups = Array.isArray(m.groups) ? m.groups : [];
  for (const g of m.groups) { g.rule = g.rule === 'even' ? 'even' : 'shortest'; g.members = Array.isArray(g.members) ? g.members : []; }
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
    if (n.kind === 'resource' && typeof n.assembly !== 'boolean') n.assembly = false;   // Phase 3.5
    if (n.kind === 'resource' && typeof n.operatorRequired !== 'boolean') n.operatorRequired = false;   // Phase 3.6
  }
  // Phase 3.6 — flexible movers (AGV / Operator) with a home location. Migrate a legacy worker pool,
  // but ONLY if the model actually used worker transport (so a default pool doesn't spawn phantom units).
  if (!Array.isArray(m.movers)) {
    m.movers = [];
    const usedWorker = m.defaultMover === 'worker' || Object.values(m.legs || {}).some((l) => l.mover === 'worker');
    const w = m.workers;
    if (usedWorker && w && (w.count | 0) > 0) { const c = floorCentre(m); for (let i = 0; i < (w.count | 0); i++) m.movers.push(makeMover('operator', c, i)); }
  }
  for (const u of m.movers) { if (!u.id) u.id = uid('mv'); if (!u.serves) u.serves = { links: 'all', machines: 'all' }; if (!u.home) u.home = floorCentre(m); }
  for (const k in m.legs) { if (m.legs[k].mover === 'worker') m.legs[k].mover = 'operator'; }   // worker → operator
  if (m.defaultMover === 'worker') m.defaultMover = 'operator';
  // Phase 3.5 — parts: migrate the legacy single `routeOrder` to one product part.
  if (!Array.isArray(m.parts) || !m.parts.length) {
    const route = (Array.isArray(m.routeOrder) && m.routeOrder.length) ? m.routeOrder.slice() : m.nodes.map((n) => n.id);
    m.parts = [{ id: uid('part'), name: 'Part', kind: 'product', route, bom: [],
      demand: { on: !!(m.demand && m.demand.mode === 'stream'), dist: (m.demand && m.demand.dist) || newDist('exp', { mean: 2 }), qty: 1, conwip: m.conwipCap || 5 } }];
  }
  for (const p of m.parts) {
    if (!p.id) p.id = uid('part');
    if (!p.name) p.name = 'Part';
    if (!p.kind) p.kind = 'product';
    if (!Array.isArray(p.route)) p.route = [];
    if (!Array.isArray(p.feeders)) p.feeders = [];   // Phase 3.8 — convergence: extra upstream streams of this same part
    for (const f of p.feeders) if (!Array.isArray(f.path)) f.path = [];
    if (!Array.isArray(p.bom)) p.bom = [];
    if (!p.demand) p.demand = { on: false, dist: newDist('exp', { mean: 2 }), qty: 1, conwip: 5 };
  }
  delete m.routeOrder;
  if (!m.activePart || !m.parts.some((p) => p.id === m.activePart)) m.activePart = m.parts[0].id;
  return m;
}
function persist() { project.model = model; save(project); needsBuild = true; finished = false; const d = $('setupDrawer'); if (d && !d.hidden) { renderSetupMini(); renderSetupSummary(); } }

/* ---- geometry ----------------------------------------------------------- */
const px = (mm) => mm * S;
function node(id) { return model.nodes.find((n) => n.id === id); }
/* ---- parts / routes (Phase 3.5) ---------------------------------------- */
function activePart() { return model.parts.find((p) => p.id === model.activePart) || model.parts[0]; }
function aRoute() { const p = activePart(); return p ? p.route : []; }   // the active part's ordered route
// stable per-part colour (by position in model.parts), shared by the parts panel, BOM tree,
// routes, the run ledger, and the coloured job tokens — so a colour means one part everywhere.
const PART_VARS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8', '--c9', '--c10'];
function partColor(idx) { return `var(${PART_VARS[idx % PART_VARS.length]})`; }
function partIndex(pid) { const i = model.parts.findIndex((p) => p.id === pid); return i < 0 ? 0 : i; }
function colorForPart(pid) { return partColor(partIndex(pid)); }
function partById(pid) { return model.parts.find((p) => p.id === pid); }
// parts consumed by some assembly (appear in another part's BOM)
function componentPidSet() { const s = new Set(); for (const p of model.parts) for (const b of (p.bom || [])) s.add(b.partId); return s; }
// show the BOM inset only when the structure is non-trivial (a BOM, or several parts)
function bomActive() { return model.parts.length > 1 || model.parts.some((p) => p.bom && p.bom.length); }
// top-level parts (not a component of anything) — the roots of the assembly tree
function bomRoots() { const comp = componentPidSet(); return model.parts.filter((p) => !comp.has(p.id)); }
function isComponent(pid) { return componentPidSet().has(pid); }
// a "shared" part is both sold to customers AND consumed by an assembly — its finished units split
function isShared(pid) { const p = partById(pid); return !!(p && p.demand && p.demand.on && isComponent(pid)); }
function parentsOf(pid) { return model.parts.filter((p) => (p.bom || []).some((b) => b.partId === pid)).map((p) => p.name); }
// BOM pull-dependencies to DRAW on the floor: a component consumed by an assembly whose route does
// NOT physically end at that assembler (it finishes elsewhere and is pulled from the shared on-hand
// pool). These are the links that otherwise leave the lines looking disconnected. Each is drawn from
// the component's last real (non-sink) node to the assembler, dotted + part-coloured + an arrowhead.
function bomDepLinks() {
  const links = [];
  for (const p of model.parts) {
    if (!(p.bom && p.bom.length) || !p.route.length) continue;
    const assyId = p.route[0]; if (!node(assyId)) continue;
    for (const b of p.bom) {
      const comp = partById(b.partId); if (!comp || !comp.route.length) continue;
      const origin = [...comp.route].reverse().find((id) => { const n = node(id); return n && n.kind !== 'sink'; });
      if (!origin || origin === assyId || !node(origin)) continue;   // routes straight into the assembler → already a physical leg
      links.push({ from: origin, to: assyId, pid: b.partId, qty: b.qty });
    }
  }
  return links;
}
/* ---- resource groups (Phase 3.7) — a route op may target a group of member machines ---- */
function isGroupId(id) { return (model.groups || []).some((g) => g.id === id); }
function groupById(id) { return (model.groups || []).find((g) => g.id === id); }
function groupMembers(id) { const g = groupById(id); return g ? g.members.filter((m) => node(m)) : []; }
// the concrete node id(s) a route entry resolves to (a group → its placed members; else itself)
function routeUnits(id) { return isGroupId(id) ? groupMembers(id) : (node(id) ? [id] : []); }
// display name for a route entry (group name, or the node's name)
function routeName(id) { const g = groupById(id); return g ? (g.name || 'Group') : ((node(id) || {}).name || '?'); }
// concrete node-id leg pairs along a route, expanding a group to its members (fan-out across a boundary)
function routeLegPairs(route) {
  const out = [];
  for (let i = 0; i < route.length - 1; i++) for (const a of routeUnits(route[i])) for (const b of routeUnits(route[i + 1])) out.push([a, b]);
  return out;
}
/* ---- convergence / merge (Phase 3.8) — extra upstream feeder streams of the SAME part ---- */
function partFeeders(p) { return Array.isArray(p.feeders) ? p.feeders : []; }
// the join (merge) node for a feeder = the last node of its path that also lies on the primary route
function feederJoin(p, path) { for (let i = (path || []).length - 1; i >= 0; i--) if (p.route.includes(path[i])) return path[i]; return null; }
// every leg-bearing path of a part for DRAWING / layout: primary route + each feeder path
function partPaths(p) { return [p.route, ...partFeeders(p).map((f) => f.path || [])]; }
// full ENGINE routings: primary + each feeder spliced with the primary tail after its join node
function partRoutings(p) {
  const out = [p.route.slice()];
  for (const f of partFeeders(p)) {
    const path = f.path || [], j = feederJoin(p, path);
    if (j) out.push([...path.slice(0, path.indexOf(j) + 1), ...p.route.slice(p.route.indexOf(j) + 1)]);
    else if (path.length) out.push(path.slice());   // dangling feeder (no join yet) — still a valid stream
  }
  return out;
}
// nodes where 2+ streams of a part converge (a feeder joins the primary route there)
function mergeNodeSet() { const s = new Set(); for (const p of model.parts) for (const f of partFeeders(p)) { const j = feederJoin(p, f.path || []); if (j) s.add(j); } return s; }
// every transport leg used by ANY part (union of consecutive pairs) — shared physical edges = one leg.
// A group op contributes one leg per member on each side; a feeder contributes its upstream legs into
// the merge node (the visual convergence). Group tokens still expand to members within each path.
function allLegKeys() {
  const set = new Set();
  for (const p of model.parts) for (const path of partPaths(p)) for (const [a, b] of routeLegPairs(path)) set.add(`${a}>${b}`);
  return [...set];
}
function legKeyAt(i) { const r = aRoute(); return `${r[i]}>${r[i + 1]}`; }
function effMover(key) { return (model.legs[key] && model.legs[key].mover) || model.defaultMover; }
function legSpeedFor(key, mover) {
  const o = model.legs[key] || {};
  if (mover === 'conveyor') return o.speed || model.conveyor.speed || 30;
  return o.speed || model.defaultSpeed || 40;   // agv/operator use each unit's own speed (set per mover)
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
  const activeKeys = new Set(); { const r = aRoute(); for (let i = 0; i < r.length - 1; i++) activeKeys.add(`${r[i]}>${r[i + 1]}`); }
  for (const key of allLegKeys()) drawLegEl(legG, key, activeKeys.has(key));
  // Component supply legs (shared sub-assembly delivered into its assembler) — drawn like any leg.
  for (const d of bomDepLinks()) drawLegEl(legG, `${d.from}>${d.to}`, true);
  svg.append(legG);
  // group hulls — a quiet rounded outline tying a group's members together, with the group name.
  // Drawn behind the nodes so the machines sit on top (DESIGN-LANGUAGE §7: quiet, diagrammatic).
  const hullG = E('g', {}); for (const g of (model.groups || [])) { const el = groupHullEl(g); if (el) hullG.append(el); }
  svg.append(hullG);
  for (const n of model.nodes) svg.append(nodeEl(n));
  // merge markers — a quiet tag where 2+ same-part streams converge (the visual inverse of 3.7's split)
  const mergeG = E('g', {}); for (const id of mergeNodeSet()) { const el = mergeMarkEl(id); if (el) mergeG.append(el); }
  svg.append(mergeG);
  // flexible mover units (home markers in edit; their transform is updated live in renderFrame)
  const moverLayer = E('g', {}); moverEls = new Map();
  for (const u of model.movers) { const g = moverEl(u); moverLayer.append(g); moverEls.set(u.id, g); }
  svg.append(moverLayer);
  // bend handles for the selected conveyor leg (drag to shape the belt)
  if (selected && selected.kind === 'leg') { const o = model.legs[selected.key]; if (o && effMover(selected.key) === 'conveyor' && Array.isArray(o.waypoints)) {
    const wg = E('g', {}); o.waypoints.forEach((w, i) => wg.append(E('circle', { class: 'wp-handle', 'data-wp': String(i), cx: px(w.x), cy: px(w.y), r: 6 }))); svg.append(wg);
  } }
  tokenLayer = E('g', {}); svg.append(tokenLayer); tokenEls = new Map(); queueEls = new Map();   // fresh token layer
  if (sim && !needsBuild) renderFrame(simCursor);                           // repaint live state onto the rebuilt scene
}
// draw one transport leg (polyline through conveyor waypoints; flexible legs dashed; direction arrow)
function drawLegEl(legG, key, active) {
  const [aid, bid] = key.split('>'); const a = node(aid), b = node(bid); if (!a || !b) return;
  const mover = effMover(key), o = model.legs[key] || {};
  const pts = [[px(a.x), px(a.y)]];
  if (mover === 'conveyor' && Array.isArray(o.waypoints)) for (const w of o.waypoints) pts.push([px(w.x), px(w.y)]);
  pts.push([px(b.x), px(b.y)]);
  const sel = selected && selected.kind === 'leg' && selected.key === key;
  const cls = 'leg ' + (mover === 'conveyor' ? 'leg-conv' : (mover === 'agv' || mover === 'operator') ? 'leg-flex' : '') + (sel ? ' sel' : '') + (active ? '' : ' leg-off');
  const ptStr = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  legG.append(E('polyline', { class: cls.trim(), points: ptStr, fill: 'none' }));
  legG.append(E('polyline', { class: 'leg-hit', 'data-leg': key, points: ptStr, fill: 'none' }));
  const p2 = pts[pts.length - 1], p1 = pts[pts.length - 2], dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  if (Math.hypot(dx, dy) > 5) { const ang = Math.atan2(dy, dx), hb = b.kind === 'resource' ? 48 : b.kind === 'storage' ? 40 : 20, ah = 7;
    const tx = p2[0] - Math.cos(ang) * hb, ty = p2[1] - Math.sin(ang) * hb;
    legG.append(E('polygon', { class: 'leg-dir' + (active ? '' : ' leg-off'), points: `${tx.toFixed(1)},${ty.toFixed(1)} ${(tx - Math.cos(ang - 0.4) * ah).toFixed(1)},${(ty - Math.sin(ang - 0.4) * ah).toFixed(1)} ${(tx - Math.cos(ang + 0.4) * ah).toFixed(1)},${(ty - Math.sin(ang + 0.4) * ah).toFixed(1)}` }));
  }
}
// a quiet rounded hull around a group's member machines + a small name tag (selectable)
function groupHullEl(g) {
  const ms = (g.members || []).map(node).filter(Boolean); if (!ms.length) return null;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const n of ms) { minX = Math.min(minX, px(n.x)); maxX = Math.max(maxX, px(n.x)); minY = Math.min(minY, px(n.y)); maxY = Math.max(maxY, px(n.y)); }
  const hx = 46 + 14, hy = 32 + 16;   // resource half-extents + padding
  const x = minX - hx, y = minY - hy, w = (maxX - minX) + hx * 2, h = (maxY - minY) + hy * 2;
  const sel = selected && selected.kind === 'group' && selected.id === g.id;
  const gg = E('g', { class: 'grouphull' + (sel ? ' sel' : ''), 'data-group': g.id });
  gg.append(E('rect', { class: 'grouphull-box', x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: 14 }));
  const tag = E('g', { class: 'grouphull-tag', transform: `translate(${(x + 10).toFixed(1)},${(y - 2).toFixed(1)})` });
  tag.append(E('text', { class: 'grouphull-lab', x: 0, y: 0 }, `⋔ ${g.name || 'Group'} · ${g.rule === 'even' ? 'even split' : 'shortest queue'}`));
  gg.append(tag);
  return gg;
}
// a quiet "⋎ merge" tag above a node where 2+ same-part streams converge (non-interactive)
function mergeMarkEl(id) {
  const n = node(id); if (!n) return null;
  const g = E('g', { class: 'mergemark', 'data-merge': id, transform: `translate(${px(n.x)},${px(n.y)})` });
  // sit above the batch badge (y:-40) when the merge node is also a batch resource, so the tags don't overlap
  const y = (n.kind === 'resource' && n.batch && n.batch.on) ? -52 : -40;
  g.append(E('text', { class: 'mergemark-lab', x: 0, y, 'text-anchor': 'middle' }, '⋎ merge'));
  return g;
}
function moverEl(u) {
  const p = simMoverPos(u) || u.home;
  const g = E('g', { class: 'mover' + (selected && selected.kind === 'mover' && selected.id === u.id ? ' sel' : ''), 'data-mover': u.id, transform: `translate(${px(p.x)},${px(p.y)})` });
  g.append(E('circle', { class: 'mover-dot ' + u.kind, r: 10 }));
  g.append(E('text', { class: 'mover-lab', y: 3, 'text-anchor': 'middle' }, u.kind === 'agv' ? 'AGV' : 'OP'));
  return g;
}
// a mover's position at the current cursor: interpolate its in-flight move, else its resting pos/home
function simMoverPos(u) {
  if (sim && !needsBuild && sim.movers) { const su = sim.movers.find((x) => x.id === u.id); if (su) { const m = su.move;
    if (m && simCursor < m.t1 && m.t1 > m.t0) { const f = (simCursor - m.t0) / (m.t1 - m.t0); return { x: m.from.x + (m.to.x - m.from.x) * f, y: m.from.y + (m.to.y - m.from.y) * f }; }
    return su.pos; } }
  return { x: u.home.x, y: u.home.y };
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
      const opWait = !anyBusy && r.machines.some((m) => m.opReq && !m.operator);   // operator-required, idle, waiting for an operator
      cls += anyDown ? ' down' : anyBusy ? ' busy' : anyBlk ? ' blocked' : opWait ? ' opwait' : '';
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
  const queues = new Map();   // locKey -> { x, y, anchor, parts: Map(pid -> n) }
  for (const job of sim.jobs.values()) {
    const loc = job.loc; if (!loc) continue;
    if (loc.k === 'service' || loc.k === 'transit') {
      if (drawn >= TOK_CAP) continue;
      const p = jobPos(job, cursor); if (!p) continue;
      seen.add(job.id); drawn++;
      let c = tokenEls.get(job.id);
      if (!c) { c = E('circle', { class: 'tok' }); tokenLayer.append(c); tokenEls.set(job.id, c); }
      c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); c.setAttribute('r', p.r);
      c.style.fill = colorForPart(job.part);                 // solid dot, coloured by its part
    } else {
      const a = queueLoc(loc); if (!a) continue;
      let q = queues.get(a.key);
      if (!q) { q = { x: a.x, y: a.y, anchor: a.anchor, parts: new Map() }; queues.set(a.key, q); }
      q.parts.set(job.part, (q.parts.get(job.part) || 0) + 1);   // count waiting/stored units per part
    }
  }
  for (const [id, c] of tokenEls) if (!seen.has(id)) { c.remove(); tokenEls.delete(id); }
  // waiting / stored units: one part-coloured RING + "×N" per (location, part), stacked vertically
  const qSeen = new Set();
  for (const [locKey, q] of queues) {
    const entries = [...q.parts.entries()].sort((a, b) => partIndex(a[0]) - partIndex(b[0]));
    entries.forEach(([pid, n], i) => {
      const key = locKey + '|' + pid; qSeen.add(key);
      let el = queueEls.get(key);
      if (!el) { const g = E('g', { class: 'qmark' }); const dot = E('circle', { class: 'tok q', r: 6 }); const lbl = E('text', { class: 'qcount' }); g.append(dot, lbl); tokenLayer.append(g); el = { dot, lbl, g }; queueEls.set(key, el); }
      const yy = q.y + (i - (entries.length - 1) / 2) * 15;       // stack the parts present at one location
      el.dot.style.stroke = colorForPart(pid);
      el.dot.setAttribute('cx', q.x.toFixed(1)); el.dot.setAttribute('cy', yy.toFixed(1));
      el.lbl.setAttribute('x', (q.anchor === 'end' ? q.x - 10 : q.x + 10).toFixed(1)); el.lbl.setAttribute('y', (yy + 3.5).toFixed(1)); el.lbl.setAttribute('text-anchor', q.anchor);
      el.lbl.textContent = '×' + n;
    });
  }
  for (const [key, el] of queueEls) if (!qSeen.has(key)) { el.g.remove(); queueEls.delete(key); }
  // scrapped parts: drop-and-fade where they were destroyed (only when watching live)
  let spawned = 0;
  while (scrapSeen < sim.scrapLog.length && sim.scrapLog[scrapSeen].t <= cursor) {
    const s = sim.scrapLog[scrapSeen++];
    if (playing && spawned < 12) { spawnScrapAnim(s.node); spawned++; }   // skip animating bulk (run-to-end) scraps
  }
  // move the flexible-mover markers to their interpolated positions
  for (const u of model.movers) { const g = moverEls.get(u.id); if (!g) continue; const p = simMoverPos(u); g.setAttribute('transform', `translate(${px(p.x)},${px(p.y)})`); }
  if (hoverNodeId && !$('floorTip').hidden) $('floorTip').innerHTML = tipHTML(hoverNodeId);   // keep counts live
  // live Flow ledger (throttled): which parts are at each station / leg right now
  if (!$('tab-flow').hidden) { const tnow = (typeof performance !== 'undefined' ? performance.now() : 0); if (tnow - lastLedger > 240) { lastLedger = tnow; renderFlowLedger(); } }
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
/* point at fraction p (0..1) along a polyline given as metre-coord points, measured by arc length */
function polyAt(pts, p) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  if (total === 0) return { x: pts[0].x, y: pts[0].y };
  let target = p * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) { const fr = seg[i] ? target / seg[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * fr, y: pts[i].y + (pts[i + 1].y - pts[i].y) * fr }; }
    target -= seg[i];
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}
function jobPos(job, cursor) {
  const loc = job.loc; if (!loc) return null;
  if (loc.k === 'transit') {
    const f = node(loc.from), t = node(loc.to); if (!f || !t) return null;
    const p = Math.min(1, Math.max(0, (cursor - loc.t0) / ((loc.t1 - loc.t0) || 1)));
    // a bent conveyor moves the unit along the belt polyline, not the straight line —
    // interpolate by arc length through the waypoints so the token tracks the drawn path
    const key = `${loc.from}>${loc.to}`, leg = model.legs[key];
    const wps = (leg && effMover(key) === 'conveyor' && Array.isArray(leg.waypoints)) ? leg.waypoints : null;
    if (wps && wps.length) { const pt = polyAt([f, ...wps, t], p); return { x: px(pt.x), y: px(pt.y), r: 6.5 }; }
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
  // Route tool: show this node's position(s) in the ACTIVE part's route, so "click in order" is legible.
  if (tool === 'route') {
    const r = aRoute(); const half = n.kind === 'resource' ? 46 : n.kind === 'storage' ? 38 : 18;
    const seq = []; r.forEach((id, i) => { if (id === n.id) seq.push(i + 1); });
    if (seq.length) { const b = E('g', { class: 'route-seq' });
      b.append(E('circle', { cx: -half + 8, cy: -half + 8, r: 9 }));
      b.append(E('text', { x: -half + 8, y: -half + 11.5, 'text-anchor': 'middle' }, seq.join(',')));
      g.append(b); }
  }
  return g;
}

/* ---- BOM visibility: corner inset + magnified modal + flow ledger ------- */
// the assembly tree (shared by the inset and the modal): roots are top-level products,
// each component indented under its parent with the quantity consumed; cycles are guarded.
function bomTreeEl() {
  const wrap = H('div', { class: 'bom-tree' });
  const addNode = (pid, qty, depth, chain) => {
    const p = partById(pid); if (!p) return;
    const sold = p.demand && p.demand.on;
    const sw = H('span', { class: 'psw' }); sw.style.background = colorForPart(pid);
    const meta = []; if (qty != null) meta.push('×' + qty); if (sold) meta.push('sold'); if (isShared(pid)) meta.push('shared');
    const kids = [sw, H('span', { class: 'bomn-name' }, p.name)];
    if (meta.length) kids.push(H('span', { class: 'bomn-meta' }, meta.join(' · ')));
    wrap.append(H('div', { class: 'bomn' + (sold ? ' sold' : ''), style: `padding-left:${depth * 14}px` }, kids));
    if (chain.has(pid)) return;                          // guard a cyclic BOM
    const next = new Set(chain); next.add(pid);
    for (const b of (p.bom || [])) addNode(b.partId, b.qty, depth + 1, next);
  };
  const roots = bomRoots();
  if (!roots.length) wrap.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'No products yet.'));
  for (const r of roots) addNode(r.id, null, 0, new Set());
  return wrap;
}
// each part's physical route (colour-coded), shown in the magnified modal
function bomRoutesEl() {
  const wrap = H('div', { class: 'bom-routes' });
  model.parts.forEach((p) => {
    const sw = H('span', { class: 'psw' }); sw.style.background = colorForPart(p.id);
    const path = p.route.map((id) => (node(id) || {}).name || '?').join('  →  ') || '(no route yet)';
    const row = H('div', { class: 'bomr' }, [sw, H('span', { class: 'bomr-name' }, p.name), H('span', { class: 'bomr-path' }, path)]);
    if (p.demand && p.demand.on) row.append(H('span', { class: 'bomr-tag' }, 'sold'));
    wrap.append(row);
    // shared component: its finished units split between its own demand and the assemblies that pull it
    if (isShared(p.id)) {
      const par = parentsOf(p.id).join(', ');
      wrap.append(H('div', { class: 'bomr-split' }, `↳ split: sold as spares ⇄ pulled into ${par} — shared fairly (alternating)`));
    }
  });
  return wrap;
}
function renderBomInset() {
  const host = $('bomInset'); if (!host) return;
  if (!bomActive()) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false; host.innerHTML = '';
  const mag = H('button', { class: 'bom-mag', title: 'Magnify — show the full tree and routes' }, '⤢');
  mag.addEventListener('click', openBomModal);
  host.append(H('div', { class: 'bom-inset-head' }, [H('span', { class: 'bom-inset-title' }, 'Bill of materials'), mag]), bomTreeEl());
  if (bomDepLinks().length || model.parts.some((p) => isShared(p.id)))
    host.append(H('p', { class: 'bom-note' }, '“shared” parts are sold and also built into a product — their finished units travel a supply leg into the assembler, split with their own demand (fair share).'));
}
function openBomModal() { renderBomModal(); $('bomModal').hidden = false; }
function closeBomModal() { $('bomModal').hidden = true; }
function renderBomModal() {
  const t = $('bomModalTree'), r = $('bomModalRoutes'); if (!t || !r) return;
  t.innerHTML = ''; r.innerHTML = '';
  t.append(bomTreeEl()); r.append(bomRoutesEl());
}
// Live ledger, organised BY LOCATION: which parts (and how many) are at each station / leg /
// shelf right now, each shown in its part colour. Reads the running sim; throttled by renderFrame.
function renderFlowLedger() {
  const host = $('flowLedger'); if (!host) return;
  if (!sim || needsBuild) { host.innerHTML = '<p class="results-empty">Press Play to see which parts are at each station and on each transport leg, live.</p>'; return; }
  const order = {}; model.nodes.forEach((n, i) => { order[n.id] = i; });
  const buckets = new Map();   // key -> { label, ord, parts: Map(pid -> n) }
  const add = (key, label, ord, pid, n = 1) => { let b = buckets.get(key); if (!b) { b = { label, ord, parts: new Map() }; buckets.set(key, b); } b.parts.set(pid, (b.parts.get(pid) || 0) + n); };
  for (const job of sim.jobs.values()) {
    const loc = job.loc; if (!loc) continue;
    if (loc.k === 'transit') {
      const f = node(loc.from), t = node(loc.to);
      add('leg:' + loc.from + '>' + loc.to, `${(f && f.name) || loc.from} → ${(t && t.name) || loc.to}`, 1000 + (order[loc.from] || 0), job.part);
    } else if (loc.node != null) {
      const n = node(loc.node);
      add('node:' + loc.node, (n && n.name) || loc.node, order[loc.node] || 0, job.part);
    }
  }
  if (sim.inventory) for (const pid in sim.inventory) { const v = sim.inventory[pid]; if (v > 0 && isFinite(v)) add('shelf', 'On-hand shelf (finished)', 3000, pid, v); }
  const rows = [...buckets.values()].filter((b) => b.parts.size).sort((a, b) => a.ord - b.ord);
  host.innerHTML = '';
  host.append(H('p', { class: 'floor-hint', style: 'margin:0 0 var(--s-2)' }, 'Live — each unit in its part colour. “On-hand shelf” is finished components/products waiting to be used or sold.'));
  if (!rows.length) { host.append(H('p', { class: 'results-empty' }, 'Nothing in the system right now.')); return; }
  const tbl = H('table', { class: 'table flow-tbl' }); const tb = H('tbody');
  for (const b of rows) {
    const chips = H('div', { class: 'flow-chips' });
    [...b.parts.entries()].sort((x, y) => partIndex(x[0]) - partIndex(y[0])).forEach(([pid, c]) => {
      const sw = H('span', { class: 'psw' }); sw.style.background = colorForPart(pid);
      chips.append(H('span', { class: 'flow-chip' }, [sw, H('span', { class: 'flow-pname' }, (partById(pid) || {}).name || pid), H('span', { class: 'flow-pn num' }, '×' + c)]));
    });
    const td2 = H('td'); td2.append(chips);
    tb.append(H('tr', {}, [H('td', { class: 'flow-loc' }, b.label), td2]));
  }
  tbl.append(tb); host.append(tbl);
}

/* ---- parts panel (Phase 3.5) ------------------------------------------- */
function partLabel(p) { return `${p.name} · ${p.kind}${p.bom.length ? ' · assembled' : ''}`; }
// Compact side-panel parts summary: pick the active part, add, or open the Parts manager modal.
// Full definition (name, type, BOM, demand) lives in the modal; the route is built on the canvas.
function renderParts() {
  const host = $('partsBody'); if (!host) return; host.innerHTML = '';
  model.parts.forEach((p, idx) => {
    const row = H('div', { class: 'part-row' + (p.id === model.activePart ? ' active' : '') });
    const dot = H('span', { class: 'part-dot' }); dot.style.background = partColor(idx);
    const nm = H('span', { class: 'part-name' }); nm.textContent = partLabel(p);
    row.append(dot, nm);
    row.addEventListener('click', () => { model.activePart = p.id; persist(); refreshAll(); });
    host.append(row);
  });
  const acts = H('div', { class: 'part-actions' });
  const addBtn = H('button', { class: 'btn btn-ghost' }, '+ Add part'); addBtn.disabled = model.parts.length >= 10; addBtn.addEventListener('click', addPart);
  const manageBtn = H('button', { class: 'btn btn-ghost' }, 'Manage parts…'); manageBtn.addEventListener('click', openPartsModal);
  acts.append(addBtn, manageBtn); host.append(acts);
  if (model.parts.length >= 10) host.append(H('p', { class: 'floor-hint' }, 'Limit of 10 parts (kept simple).'));
  const p = activePart(); if (!p) return;
  host.append(H('p', { class: 'floor-hint', style: 'margin-top:var(--s-2)' },
    `Active: “${p.name}” (${p.kind})${p.bom.length ? `, assembled from ${p.bom.length} component${p.bom.length > 1 ? 's' : ''}` : ''}${p.demand.on ? ', sold to customers' : ''}. “Manage parts…” sets type, BOM & demand; build its route below.`));
}

/* ---- Parts manager modal (full definition: name, type, BOM, demand) ---- */
let pmSel = null;   // part id selected in the modal (defaults to the active part)
function openPartsModal() { pmSel = model.activePart; $('partsModal').hidden = false; renderPartsModal(); }
function closePartsModal() { $('partsModal').hidden = true; persist(); refreshAll(); }
function renderPartsModal() {
  const listH = $('pmList'), edH = $('pmEditor'); if (!listH || !edH) return;
  if (!model.parts.some((p) => p.id === pmSel)) pmSel = (activePart() || {}).id;
  // left: parts list
  listH.innerHTML = '';
  model.parts.forEach((p, idx) => {
    const row = H('div', { class: 'pm-item' + (p.id === pmSel ? ' active' : '') });
    const dot = H('span', { class: 'part-dot' }); dot.style.background = partColor(idx);
    const nm = H('span', { class: 'part-name' }); nm.textContent = partLabel(p);
    row.append(dot, nm);
    if (model.parts.length > 1) row.append(mini('✕', () => { removePart(p.id); pmSel = model.activePart; renderPartsModal(); }));
    row.addEventListener('click', (e) => { if (!e.target.classList.contains('mini')) { pmSel = p.id; model.activePart = p.id; renderPartsModal(); } });
    listH.append(row);
  });
  const addBtn = H('button', { class: 'btn btn-ghost', style: 'width:100%;margin-top:var(--s-2)' }, '+ Add part');
  addBtn.disabled = model.parts.length >= 10;
  addBtn.addEventListener('click', () => { addPart(); pmSel = model.activePart; renderPartsModal(); });
  listH.append(addBtn);

  // right: editor for the selected part
  edH.innerHTML = '';
  const p = model.parts.find((x) => x.id === pmSel); if (!p) return;
  const listLabel = listH.querySelector('.pm-item.active .part-name');
  edH.append(field('Part name', textInput(p.name, (v) => { p.name = v || 'Part'; if (listLabel) listLabel.textContent = partLabel(p); persist(); })));
  edH.append(field('Type', segmented(
    [{ value: 'product', label: 'Product' }, { value: 'fabricated', label: 'Made' }, { value: 'purchased', label: 'Bought' }],
    p.kind, (v) => { p.kind = v; persist(); renderPartsModal(); }, 'Type')));
  edH.append(H('p', { class: 'floor-hint', style: 'margin:0' }, p.kind === 'purchased'
    ? 'Bought-in: appears at a source and travels to where it is used.'
    : p.kind === 'fabricated' ? 'Made on the line, then used as a component.' : 'A finished product (may be assembled from components).'));

  edH.append(H('p', { class: 'subhead' }, 'Bill of materials'));
  if (!p.bom.length) edH.append(H('p', { class: 'floor-hint', style: 'margin:0 0 var(--s-2)' }, 'No components — made/bought directly. Add a component to assemble this part (its route must start at an assembly station).'));
  p.bom.forEach((b, bi) => {
    const sel = H('select', { class: 'input' });
    model.parts.filter((o) => o.id !== p.id).forEach((o) => { const opt = H('option', { value: o.id }, o.name); if (o.id === b.partId) opt.selected = true; sel.append(opt); });
    sel.addEventListener('change', () => { b.partId = sel.value; persist(); });
    const qty = numInput(b.qty, 1, 1, (v) => { b.qty = Math.max(1, v | 0); persist(); });
    edH.append(H('div', { class: 'bom-row' }, [sel, H('span', { class: 'faint' }, '×'), qty, mini('✕', () => { p.bom.splice(bi, 1); persist(); renderPartsModal(); })]));
  });
  if (model.parts.length > 1) {
    const ab = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-1)' }, '+ component');
    ab.addEventListener('click', () => { const other = model.parts.find((o) => o.id !== p.id && !p.bom.some((b) => b.partId === o.id)) || model.parts.find((o) => o.id !== p.id); if (other) { p.bom.push({ partId: other.id, qty: 1 }); ensureProcessAssumption(); persist(); renderPartsModal(); } });
    edH.append(ab);
  }

  edH.append(H('p', { class: 'subhead' }, 'Customer demand'));
  const dchk = H('input', { type: 'checkbox' }); dchk.checked = !!p.demand.on;
  dchk.addEventListener('change', () => { p.demand.on = dchk.checked; persist(); renderPartsModal(); });
  edH.append(H('label', { class: 'toggle-row' }, [dchk, 'Sold to customers (a demand stream)']));
  if (p.demand.on) {
    edH.append(H('p', { class: 'subhead' }, 'Time between orders'));
    edH.append(distEditor(p.demand.dist, persist));
    edH.append(field('Order quantity', numInput(p.demand.qty, 1, 1, (v) => { p.demand.qty = Math.max(1, v | 0); persist(); })));
    edH.append(factorButton(`part:${p.id}:demand.mean`, { name: `Demand rate — ${p.name}`, unit: 'min between orders', baseline: distMean(p.demand.dist).toFixed(2), description: 'Mean time between customer orders for this product. Vary to study load vs service level.' }, renderPartsModal));
    if (model.control === 'conwip') {
      edH.append(field('CONWIP limit (this product)', numInput(p.demand.conwip, 1, 1, (v) => { p.demand.conwip = Math.max(1, v | 0); persist(); })));
      edH.append(factorButton(`part:${p.id}:conwip`, { name: `CONWIP — ${p.name}`, unit: 'cards', baseline: String(p.demand.conwip || 5), description: 'WIP cap for this product under pull. Vary to study the WIP–throughput–cycle-time trade-off.' }, renderPartsModal));
    }
  }
  // route summary (built in the Routes section below)
  edH.append(H('p', { class: 'subhead' }, 'Route'));
  const rnames = p.route.map((id) => (node(id) || {}).name || '?').join('  →  ') || '(empty)';
  edH.append(H('p', { class: 'floor-hint', style: 'margin:0' }, `${rnames}. Set the order in the “Routes” section below.`));
}
function addPart() {
  if (model.parts.length >= 10) return;
  const id = uid('part');
  model.parts.push({ id, name: 'Part ' + (model.parts.length + 1), kind: 'product', route: [], bom: [],
    demand: { on: false, dist: newDist('exp', { mean: 3 }), qty: 1, conwip: 5 } });
  model.activePart = id; ensureProcessAssumption(); persist(); refreshAll();
}
function removePart(id) {
  if (model.parts.length <= 1) return;
  model.parts = model.parts.filter((p) => p.id !== id);
  for (const p of model.parts) p.bom = p.bom.filter((b) => b.partId !== id);
  if (model.activePart === id) model.activePart = model.parts[0].id;
  persist(); refreshAll();
}

/* ---- route list (active part's route) ---------------------------------- */
function renderRoute() {
  const ul = $('routeList'); ul.innerHTML = '';
  const r = aRoute();
  r.forEach((id, i) => {
    const n = node(id); if (!n) return;
    const li = H('li', { class: (selected && selected.kind === 'node' && selected.id === id) ? 'sel' : '' });
    li.innerHTML = `<span class="rn">${i + 1}</span><span class="rname"></span><span class="rk">${n.kind}${n.assembly ? ' · assy' : ''}</span>`;
    li.querySelector('.rname').textContent = n.name || n.kind;
    li.append(mini('↑', () => moveInRoute(i, -1)), mini('↓', () => moveInRoute(i, +1)), mini('✕', () => removeFromRoute(i)));
    li.addEventListener('click', (e) => { if (!e.target.classList.contains('mini')) selectNode(id); });
    ul.append(li);
  });
  const hint = $('routeHint'); hint.innerHTML = '';
  if (!model.nodes.length) { hint.textContent = 'No nodes yet. Pick a tool above and click the canvas to place sources, machines and a sink — then build this part’s route.'; return; }
  // build-route controls: the Route tool (click nodes on the canvas) + a left→right auto-route shortcut
  const ctrls = H('div', { class: 'route-ctrls' });
  const rt = H('button', { class: 'btn btn-ghost' + (tool === 'route' ? ' on' : '') }, tool === 'route' ? '✓ Routing on canvas' : '✎ Route on canvas');
  rt.addEventListener('click', () => { setTool(tool === 'route' ? 'move' : 'route'); });
  const auto = H('button', { class: 'btn btn-ghost' }, 'Auto-route ↦');
  auto.title = 'Set this route to all placed nodes ordered left→right';
  auto.addEventListener('click', () => { const p = activePart(); p.route = model.nodes.slice().sort((a, b) => a.x - b.x).map((n) => n.id); persist(); refreshAll(); });
  ctrls.append(rt, auto); hint.append(ctrls);
  hint.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' }, `Route of “${activePart().name}”. Order = flow direction; first = entry, last = exit. Build it with the Route tool, or use the chips below.`));
  const missing = model.nodes.filter((n) => !r.includes(n.id));
  if (missing.length) {
    const add = H('div', { class: 'route-add' });
    missing.forEach((n) => { const b = H('button', { class: 'chip' }, '+ ' + (n.name || n.kind)); b.addEventListener('click', () => { aRoute().push(n.id); persist(); refreshAll(); }); add.append(b); });
    hint.append(H('div', { class: 'small faint', style: 'margin-top:var(--s-2)' }, 'Add a placed node to this route:'), add);
  }
}
function removeFromRoute(i) { const r = aRoute(); r.splice(i, 1); persist(); refreshAll(); }
// switch the active tool from code (mirrors clicking the palette), keeping the floor + hint in sync
function setTool(t) {
  tool = t;
  $('palette').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tool === t)));
  $('svg').classList.toggle('routing', t === 'route');
  refreshAll();
  if (t === 'route') setRouteHint();
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
  else if (selected.kind === 'mover') inspectMover(selected.id, body);
  else inspectLeg(selected.key, body);
}
function inspectMover(id, body) {
  const u = model.movers.find((m) => m.id === id); if (!u) { selected = null; renderInspector(); return; }
  $('propKind').textContent = u.kind === 'agv' ? 'AGV' : 'operator';
  $('propTitle').textContent = u.name || (u.kind === 'agv' ? 'AGV' : 'Operator');
  moverEditor(u, body, renderInspector);
  const del = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-4)' }, 'Remove this unit');
  del.addEventListener('click', () => { removeMover(u.id); selected = null; refreshAll(); });
  body.append(del);
}
/* grouped symbol picker (Manufacturing / Service / Abstract·VSM) for a node */
function symbolPicker(n, rerender = renderInspector) {
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
      b.addEventListener('click', () => { n.symbol = k; persist(); render(); rerender(); });
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
// a feeder (Phase 3.8) must converge: its path must end on the part's primary route, else its parts
// would "finish" at a non-sink. Refuse to run and say how to fix it.
function firstDanglingFeeder() {
  for (const p of model.parts) for (const f of partFeeders(p)) {
    if ((f.path || []).length && !feederJoin(p, f.path)) return { p };
  }
  return null;
}
function inspectNode(n, body) {
  if (!n) { selected = null; renderInspector(); return; }
  $('propKind').textContent = n.kind;
  $('propTitle').textContent = n.name || n.kind[0].toUpperCase() + n.kind.slice(1);
  // Floor Inspect = parameters only. Adding/removing stations is done in “Set up model”.
  stationEditor(n, body, renderInspector);
}
/* Shared station parameter editor — used by the floor Inspect panel AND the Setup drawer cards.
   `rerender` rebuilds the host after a structural toggle (so dependent fields show/hide); value
   edits just persist + redraw the floor (and, when the drawer is open, the live mini-preview). */
function stationEditor(n, body, rerender) {
  body.append(field('Name', textInput(n.name || '', (v) => { n.name = v; persist(); render(); })));
  if (n.kind === 'resource') {
    if (!n.batch) n.batch = { on: false, size: 2, setup: 0 };
    body.append(H('p', { class: 'subhead' }, 'Symbol / shape'));
    body.append(symbolPicker(n, rerender));
    body.append(field('Machines (parallel)', numInput(n.machines || 1, 1, 1, (v) => { n.machines = Math.max(1, v | 0); persist(); render(); })));
    body.append(factorButton(`resource:${n.id}:machines`, { name: `Capacity — ${n.name || 'resource'}`, unit: 'machines', baseline: String(n.machines || 1), description: 'Number of parallel machines at this workcenter. Vary to study capacity vs utilisation, WIP and cycle time.' }, rerender));
    body.append(H('p', { class: 'subhead' }, 'Assembly'));
    const asyChk = H('input', { type: 'checkbox' }); asyChk.checked = !!n.assembly;
    asyChk.addEventListener('change', () => { n.assembly = asyChk.checked; persist(); render(); rerender(); });
    body.append(H('label', { class: 'toggle-row' }, [asyChk, 'Assembly station (consumes a product’s BOM)']));
    if (n.assembly) body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' }, 'A product whose route starts here is assembled when all its bill-of-materials components have arrived; components routed here are consumed. Set the BOM in “Parts & BOM”.'));
    // Phase 3.6 — operator-operated machine
    body.append(H('p', { class: 'subhead' }, 'Operator'));
    const opChk = H('input', { type: 'checkbox' }); opChk.checked = !!n.operatorRequired;
    opChk.addEventListener('change', () => { n.operatorRequired = opChk.checked; if (opChk.checked) ensureMoverAssumption(); persist(); render(); rerender(); });
    body.append(H('label', { class: 'toggle-row' }, [opChk, 'Operator required to run']));
    if (n.operatorRequired) body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' }, 'A free operator must travel here to run each operation — the machine sits idle while none is available. Add operators in “Set up model”.'));
    body.append(H('p', { class: 'subhead' }, 'Batch processing'));
    const batchChk = H('input', { type: 'checkbox' }); batchChk.checked = !!n.batch.on;
    batchChk.addEventListener('change', () => { n.batch.on = batchChk.checked; persist(); if (n.batch.on) ensureBatchAssumption(); render(); rerender(); });
    body.append(H('label', { class: 'toggle-row' }, [batchChk, 'Process parts in batches']));
    if (n.batch.on) {
      body.append(field('Batch size B', numInput(n.batch.size, 2, 1, (v) => { n.batch.size = Math.max(2, v | 0); persist(); ensureBatchAssumption(); render(); rerender(); })));
      body.append(field('Setup time (once per batch)', numInput(n.batch.setup, 0, 0.1, (v) => { n.batch.setup = Math.max(0, v || 0); persist(); render(); })));
      body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' },
        `The machine waits for a full batch of ${n.batch.size}, pays the setup once, then processes the batch together — all ${n.batch.size} finish at the same moment and continue on individually.`));
      const w = batchWarning(n);
      if (w) body.append(H('p', { class: 'floor-warn', style: 'margin:var(--s-2) 0 0' }, w));
      body.append(factorButton(`resource:${n.id}:batch.size`, { name: `Batch size — ${n.name || 'resource'}`, unit: 'parts', baseline: String(Math.max(2, n.batch.size | 0)), description: 'Number of parts processed together as one batch (process batch). Vary to study the setup/wait-to-batch trade-off.' }, rerender));
    }
    body.append(H('p', { class: 'subhead' }, n.batch.on ? 'Whole-batch process time' : 'Service time'));
    if (n.batch.on) body.append(H('p', { class: 'floor-hint', style: 'margin:0 0 var(--s-2)' }, 'This distribution is now the time to process the WHOLE batch, not one part.'));
    body.append(distEditor(n.service, persist));
    body.append(H('p', { class: 'subhead' }, 'Input buffer'));
    const finChk = H('input', { type: 'checkbox' }); finChk.checked = !!n.buffer.finite;
    finChk.addEventListener('change', () => { n.buffer.finite = finChk.checked; persist(); rerender(); });
    body.append(H('label', { class: 'toggle-row' }, [finChk, 'Finite capacity (can block / back up)']));
    if (n.buffer.finite) body.append(field('Capacity', numInput(n.buffer.cap, 1, 1, (v) => { n.buffer.cap = Math.max(1, v | 0); persist(); })));
    body.append(H('p', { class: 'subhead' }, 'Scrap'));
    body.append(field('Scrap fraction (0–1)', numInput(n.scrap || 0, 0, 0.01, (v) => { n.scrap = Math.min(1, Math.max(0, v || 0)); persist(); })));
    body.append(H('p', { class: 'subhead' }, 'Breakdowns'));
    const brkChk = H('input', { type: 'checkbox' }); brkChk.checked = !!n.brk.on;
    brkChk.addEventListener('change', () => { n.brk.on = brkChk.checked; persist(); render(); rerender(); });
    body.append(H('label', { class: 'toggle-row' }, [brkChk, 'Machine can break down (preempt-resume)']));
    if (n.brk.on) {
      body.append(H('p', { class: 'subhead' }, 'Time to failure'));
      body.append(distEditor(n.brk.ttf, persist));
      body.append(H('p', { class: 'subhead' }, 'Time to repair'));
      body.append(distEditor(n.brk.ttr, persist));
    }
  } else if (n.kind === 'storage') {
    body.append(H('p', { class: 'subhead' }, 'Symbol / shape'));
    body.append(symbolPicker(n, rerender));
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
  body.append(field('Mode', segmented(
    [{ value: 'instant', label: 'Instant' }, { value: 'conveyor', label: 'Conveyor' }, { value: 'agv', label: 'AGV' }, { value: 'operator', label: 'Operator' }],
    mover, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { mover: v }); if (v === 'agv' || v === 'operator') ensureMoverAssumption(); persist(); render(); renderInspector(); }, 'Leg mode')));
  if (mover === 'instant') {
    body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' }, 'Zero transport time — the baseline. Placement does not affect this link.'));
  } else if (mover === 'conveyor') {
    body.append(field('Capacity (items)', numInput(o.cap != null ? o.cap : model.conveyor.cap, 1, 1, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { cap: Math.max(1, v | 0) }); persist(); })));
    body.append(field('Speed (m/min)', numInput(o.speed != null ? o.speed : model.conveyor.speed, 1, 5, (v) => { model.legs[key] = Object.assign({}, model.legs[key], { speed: Math.max(1, v) }); persist(); render(); })));
    body.append(H('p', { class: 'subhead' }, 'Bent path'));
    const wps = (model.legs[key] && model.legs[key].waypoints) || [];
    if (!wps.length) body.append(H('p', { class: 'floor-hint', style: 'margin:0 0 var(--s-2)' }, 'Straight. Add a bend to route the belt through a waypoint; the transit time uses the full path length.'));
    wps.forEach((w, i) => body.append(H('div', { class: 'bom-row' }, [H('span', { class: 'small faint' }, 'bend ' + (i + 1)),
      numInput(+w.x.toFixed(1), 0, 1, (v) => { w.x = v; persist(); render(); }), H('span', { class: 'faint' }, ','), numInput(+w.y.toFixed(1), 0, 1, (v) => { w.y = v; persist(); render(); }),
      mini('✕', () => { wps.splice(i, 1); persist(); render(); renderInspector(); })])));
    const addB = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-1)' }, '+ Add bend');
    addB.addEventListener('click', () => { const a = node(fromId), b = node(toId); const L = model.legs[key] = model.legs[key] || {}; L.waypoints = L.waypoints || []; L.waypoints.push({ x: +(((a.x + b.x) / 2)).toFixed(1), y: +(((a.y + b.y) / 2) + 5).toFixed(1) }); persist(); render(); renderInspector(); });
    body.append(addB);
    if (wps.length) body.append(H('p', { class: 'small faint', style: 'margin:var(--s-1) 0 0' }, 'Drag the bend handles on the floor to shape the belt.'));
  } else {   // agv / operator — flexible fleet, travel uses each unit's own speed
    const carriers = model.movers.filter((u) => servesLink(u, key));
    body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' },
      `Carried by the flexible fleet (${carriers.length} unit${carriers.length === 1 ? '' : 's'} can serve this leg). A unit travels to pick up, then delivers — using its own speed. Add ${mover === 'agv' ? 'AGVs' : 'operators'} and set their homes in “Set up model”.`));
  }
  body.append(H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-2)', onclick: () => { delete model.legs[key]; persist(); render(); renderInspector(); } }, 'Reset to default'));
}
function servesLink(u, key) { return !u.serves || u.serves.links === 'all' || (Array.isArray(u.serves.links) && u.serves.links.includes(key)); }
function servesMachine(u, id) { return u.kind === 'operator' && (!u.serves || u.serves.machines === 'all' || (Array.isArray(u.serves.machines) && u.serves.machines.includes(id))); }

/* ---- transport defaults panel ------------------------------------------ */
function renderTransport() {
  const b = $('transportBody'); b.innerHTML = '';
  b.append(field('Default mode', segmented(
    [{ value: 'instant', label: 'Instant' }, { value: 'conveyor', label: 'Conveyor' }, { value: 'agv', label: 'AGV' }, { value: 'operator', label: 'Operator' }],
    model.defaultMover, (v) => { model.defaultMover = v; if (v === 'agv' || v === 'operator') ensureMoverAssumption(); persist(); render(); renderTransport(); }, 'Default mode')));
  b.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'Applies to legs you haven’t set individually. Instant = zero time; Conveyor & flexible movers add real transport time.'));
  b.append(H('p', { class: 'subhead' }, 'Conveyor default'));
  b.append(field('Capacity', numInput(model.conveyor.cap, 1, 1, (v) => { model.conveyor.cap = Math.max(1, v | 0); persist(); })));
  b.append(field('Speed (m/min)', numInput(model.conveyor.speed, 1, 5, (v) => { model.conveyor.speed = Math.max(1, v); persist(); render(); })));
  b.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-3) 0 0' }, 'AGV & Operator units (with their home locations and assignments) are set in “Set up model”.'));
}

/* ---- control & demand panel -------------------------------------------- */
function renderControl() {
  const b = $('controlBody'); b.innerHTML = '';
  b.append(field('Release control', segmented(
    [{ value: 'push', label: 'Push' }, { value: 'conwip', label: 'CONWIP (pull)' }],
    model.control, (v) => { model.control = v; persist(); renderControl(); }, 'Control')));
  if (model.control === 'conwip') b.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'Pull (CONWIP): each product is released against its own demand, capped by its CONWIP limit — set per product in the Parts panel above.'));
  b.append(field('Raw supply', segmented(
    [{ value: 'stream', label: 'Arrival stream' }, { value: 'limitless', label: 'Limitless' }],
    model.supply, (v) => { model.supply = v; persist(); renderControl(); }, 'Supply')));
  b.append(H('p', { class: 'floor-hint', style: 'margin:0' }, model.supply === 'stream'
    ? 'Raw/bought parts arrive per each part’s Source interarrival (set on the Source node).'
    : 'Raw is always available — release is limited by capacity (and CONWIP, if pull).'));
  b.append(H('p', { class: 'subhead' }, 'Customer demand'));
  b.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'Demand is per product — turn on “Sold to customers” for a part in the Parts panel and give it its own order interarrival. With no demand set, finished units simply accumulate (throughput is the output rate).'));
}

/* ---- table overview ----------------------------------------------------- */
function renderTable() {
  const host = $('tableHost'); host.innerHTML = '';
  const wrap = H('div', { class: 'ov-table' });
  // resources
  wrap.append(H('h3', {}, 'Resources & storage'));
  const rt = H('table', { class: 'table' }); rt.innerHTML = '<thead><tr><th>Node</th><th>Kind</th><th class="num">Machines</th><th>Service / cap</th><th class="num">Buffer</th></tr></thead>';
  const rb = H('tbody', {});
  model.nodes.forEach((n) => {
    const tr = H('tr', { class: 'click' });
    const svc = n.kind === 'resource' ? `${DISTS[n.service.type].label} · μ=${distMean(n.service).toFixed(2)}${n.assembly ? ' · assembly' : ''}${(n.batch && n.batch.on) ? ` · batch ${n.batch.size}${n.batch.setup ? `+setup ${n.batch.setup}` : ''}` : ''}${n.scrap ? ` · scrap ${(n.scrap * 100).toFixed(0)}%` : ''}${n.brk.on ? ' · brk' : ''}` : n.kind === 'storage' ? `cap ${n.cap}` : n.kind === 'source' ? `${DISTS[n.interarrival.type].label} · μ=${distMean(n.interarrival).toFixed(2)}` : '—';
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
  for (const key of allLegKeys()) {
    const mover = effMover(key), o = model.legs[key] || {};
    const [fromId, toId] = key.split('>'); const from = node(fromId), to = node(toId);
    const params = mover === 'conveyor' ? `cap ${o.cap != null ? o.cap : model.conveyor.cap}, ${o.speed != null ? o.speed : model.conveyor.speed} m/min${(o.waypoints || []).length ? `, ${o.waypoints.length} bend(s)` : ''}`
      : (mover === 'agv' || mover === 'operator') ? `${model.movers.filter((u) => servesLink(u, key)).length} unit(s)` : mover === 'instant' ? 'zero time' : `${o.speed != null ? o.speed : model.defaultSpeed} m/min`;
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
function refreshAll() { render(); renderInspector(); renderTransport(); renderBomInset(); if (!$('bomModal').hidden) renderBomModal(); const d = $('setupDrawer'); if (d && !d.hidden) renderSetup(); if (!$('tablePanel').hidden) renderTable(); }
function activateTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('.tabbody').forEach((b) => { b.hidden = (b.id !== 'tab-' + name); });
  if (name === 'flow') renderFlowLedger();
}
// Model sub-sections: BOM & Parts | Defaults | Control & Demand
function activateSubTab(name) {
  document.querySelectorAll('.subtab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sub === name)));
  document.querySelectorAll('.subpanel').forEach((p) => { p.hidden = (p.dataset.sub !== name); });
}

function makeNode(kind, x, y) {
  const idp = { resource: 'res', storage: 'sto', source: 'src', sink: 'snk' }[kind] || 'n';
  const n = { kind, id: uid(idp), name: '', x, y };
  if (kind === 'resource') { n.machines = 1; n.symbol = 'box'; n.service = newDist('exp', { mean: 1 }); n.buffer = { finite: false, cap: 10, init: 0, target: 8 }; n.scrap = 0; n.brk = { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) }; n.batch = { on: false, size: 2, setup: 0 }; n.assembly = false; }
  if (kind === 'storage') { n.cap = 10; n.symbol = 'triangle'; }
  if (kind === 'source') n.interarrival = newDist('exp', { mean: 3 });
  model.nodes.push(n);
  return n;
}
function addNode(kind, x, y) {   // legacy canvas add (kept for safety; the floor no longer places nodes)
  const n = makeNode(kind, x, y);
  selected = { kind: 'node', id: n.id }; activateTab('inspect'); persist(); refreshAll();
}
function removeNode(id) {
  model.nodes = model.nodes.filter((n) => n.id !== id);
  for (const p of model.parts) { p.route = p.route.filter((x) => x !== id);   // drop from every part's route + feeders
    for (const f of partFeeders(p)) f.path = (f.path || []).filter((x) => x !== id);
    p.feeders = partFeeders(p).filter((f) => (f.path || []).length); }
  for (const k of Object.keys(model.legs)) if (k.startsWith(id + '>') || k.endsWith('>' + id)) delete model.legs[k];
  // a deleted machine leaves any group it belonged to; a group emptied this way is removed + de-routed
  for (const g of (model.groups || [])) g.members = g.members.filter((m) => m !== id);
  for (const g of (model.groups || []).filter((g) => !g.members.length)) removeGroup(g.id);
  if (selected && ((selected.kind === 'node' && selected.id === id) || (selected.kind === 'leg' && selected.key.includes(id)))) selected = null;
  persist(); refreshAll();
}
function moveInRoute(i, d) { const a = aRoute(); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; persist(); refreshAll(); }

/* ---- flexible-mover simplification auto-log (Phase 3.6) ----------------- */
// Supersedes the old "empty-return ignored" note: idle units now return to their home location and
// are re-dispatched en route; what is still excluded is anticipatory repositioning (Charter §9).
function ensureMoverAssumption() {
  const old = project.assumptions.find((a) => a.id === 'a_worker_return');
  if (old) old.id = 'a_mover_repos';   // retire the stale note in place
  if (!project.assumptions.some((a) => a.id === 'a_mover_repos')) {
    project.assumptions.push(newAssumption({ id: 'a_mover_repos', kind: 'simplification',
      description: 'Flexible movers (AGV/Operator) travel to pick up, deliver one load, then return to a standard (home) location when idle (re-dispatchable en route). Anticipatory repositioning beyond returning home is not modelled; movers pass through each other (no path-finding/collisions).',
      rationale: 'Charter §6/§9 — a single fixed dispatch rule (longest-waiting → nearest), no optimising dispatcher. Travel is non-value-adding (theory-notes §5.3).',
      data: 'C', uncertainty: 'Real fleets may pre-position toward expected demand and contend for aisles.', sensitivity: true }));
    save(project);
  }
}
const ensureWorkerAssumption = ensureMoverAssumption;   // back-compat alias for any remaining callers

/* ---- assembly / process modelling-note auto-log ------------------------ */
// When the model gains a BOM, record fork-join assembly synchronisation as a stated behaviour
// (theory-notes §4.6 Law of Assembly Operations): an assembly waits for ALL its components.
function ensureProcessAssumption() {
  if (!project.assumptions.some((a) => a.id === 'a_assembly_sync')) {
    project.assumptions.push(newAssumption({ id: 'a_assembly_sync', kind: 'assumption',
      description: 'Assembly is fork-join synchronised: a product starts only when ALL its bill-of-materials components are on hand (and have travelled to the assembly station), consuming them.',
      rationale: 'Factory-physics Law of Assembly Operations (theory-notes §4.6); reproduces the validated multi-part engine. The slowest/farthest component paces the product.',
      data: 'B', uncertainty: 'Component supply variability and layout (travel) drive assembly starvation.', sensitivity: true }));
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
  return addFactorByBinding(`resource:${n.id}:batch.size`, {
    name: `Batch size — ${n.name || 'resource'}`, unit: 'parts', baseline: String(Math.max(2, n.batch.size | 0)),
    description: 'Number of parts processed together as one batch (process batch). Vary to study the setup/wait-to-batch trade-off.' });
}
/* ---- experimental factors / responses (Phase 3.5.3 study integration) --- */
function hasFactor(binding) { return project.conceptual.factors.some((f) => f.bindingHint === binding); }
function addFactorByBinding(binding, fields) {
  if (hasFactor(binding)) return false;
  project.conceptual.factors.push(newFactor({ ...fields, bindingHint: binding }));
  save(project);
  return true;
}
// a small "declare as experimental factor" button (disabled once declared), reused across inspectors
function factorButton(binding, fields, rerender = renderInspector) {
  const have = hasFactor(binding);
  const b = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-2)' }, have ? '✓ experimental factor' : '+ as experimental factor');
  b.disabled = have;
  b.addEventListener('click', () => { addFactorByBinding(binding, fields); rerender(); });
  return b;
}
// declare the standard floor responses the analysis phase will measure
function addStandardResponses() {
  const want = [
    { name: 'Throughput', unit: '/min', description: 'Finished units per unit time (the production rate).' },
    { name: 'Average WIP', unit: 'units', description: 'Work-in-process held in the system on average.' },
    { name: 'Cycle time', unit: 'min', description: 'Average time a unit spends from release to completion.' },
    { name: 'Fill rate', unit: '%', description: 'Share of customer demand met from stock (service level).' },
  ];
  let added = 0;
  for (const w of want) if (!project.conceptual.responses.some((r) => r.name === w.name)) { project.conceptual.responses.push(newResponse(w)); added++; }
  if (added) save(project);
  return added;
}

/* ---- run ---------------------------------------------------------------- */
// True when the model needs the process engine (multi-part / BOM / pull / per-product demand).
// A single produced part with no BOM, push control, and no demand stays on the byte-identical
// single-part path — the basics-first default behaves exactly as it did pre-3.5.
function isProcessModel() {
  return model.parts.length > 1 || model.parts.some((p) => p.bom && p.bom.length)
    || model.control === 'conwip' || model.parts.some((p) => p.demand && p.demand.on)
    || model.parts.some((p) => partFeeders(p).length);   // a converging part runs the process path
}
// The editor→engine transformation lives in run-model.js (shared with the analysis
// replication driver) so the floor you watch and the runs the analysis replicates
// are built identically. node()/partRoutings()/isProcessModel() above remain for rendering.
function buildRunModel() { return buildRunModelShared(model, S); }
/* ---- playback ----------------------------------------------------------- */
function buildSim() {
  if (!model.parts.some((p) => p.route.length >= 2)) { sim = null; needsBuild = true; lastBuildError = 'Add at least a source, a resource and a sink to a part’s route, then press Play.'; return false; }
  // static deadlock guard: a batch that can provably never form would jam the model — refuse and explain
  const dl = firstBatchDeadlock();
  if (dl) { sim = null; needsBuild = true; lastBuildError = `Cannot run — ${dl.n.name || 'a batch station'}: ${dl.w}`; return false; }
  // convergence guard (Phase 3.8): a feeder must reach the route it converges into
  const df = firstDanglingFeeder();
  if (df) { sim = null; needsBuild = true; lastBuildError = `Cannot run — a feeder line on “${df.p.name || 'a part'}” doesn’t reach its route. End the feeder at a station that is on ${df.p.name || 'the part'}’s main route (the merge point).`; return false; }
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
  // headline throughput/cycle: in a process model show FINISHED PRODUCTS (not every component completion)
  const headTH = r.multiPart ? r.productThroughput : r.throughput;
  const headCT = r.multiPart ? r.productCycle : r.avgCycleTime;
  results.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi__label">${r.multiPart ? 'Product output' : 'Throughput'}</div><div class="kpi__value num">${fmtNum(headTH)}<span class="kpi__unit">/min</span></div></div>
      <div class="kpi"><div class="kpi__label">Cycle time</div><div class="kpi__value num">${fmtNum(headCT)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">In transport</div><div class="kpi__value num">${fmtNum(r.avgTransitPerJob)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">Avg WIP</div><div class="kpi__value num">${fmtNum(r.avgWIP)}</div></div>
      <div class="kpi"><div class="kpi__label">Yield</div><div class="kpi__value num">${f(100 * r.yield, 1)}<span class="kpi__unit">%</span></div></div>
    </div>
    <table class="table" style="margin-top:var(--s-4)"><thead><tr><th>Resource</th><th class="num">Util</th><th class="num">Down</th><th class="num">Blocked</th></tr></thead><tbody id="utilBody"></tbody></table>`;
  const tb = $('utilBody');
  model.nodes.filter((n) => n.kind === 'resource').forEach((n) => { const tr = H('tr', {}); tr.innerHTML = `<td></td><td class="num">${(100 * (r.utilisation[n.id] || 0)).toFixed(1)}%</td><td class="num">${(100 * (r.downFraction[n.id] || 0)).toFixed(1)}%</td><td class="num">${(100 * (r.blockedFraction[n.id] || 0)).toFixed(1)}%</td>`; tr.firstChild.textContent = n.name || 'Resource'; tb.append(tr); });
  const tRows = [];
  if (r.movers) tRows.push(`<tr><td>Movers (${r.movers.agv} AGV · ${r.movers.operators} op)</td><td class="num">${(100 * r.movers.utilisation).toFixed(1)}% util</td><td class="num">${r.movers.avgQueue.toFixed(2)} req queued</td></tr>`);
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
  // process model: per-part production + per-product demand fill. Kept to 4 columns with units in
  // the header so it stays readable in the narrow side panel (the fixed table layout squeezes wider tables).
  if (r.multiPart && r.parts) {
    const pr = Object.keys(r.parts).map((id) => { const p = r.parts[id]; const d = (r.demandByPart || {})[id];
      return `<tr><td>${esc(p.name)}</td><td class="num">${fmtNum(p.throughput)}</td><td class="num">${fmtNum(p.avgCycleTime)}</td><td class="num">${d ? (100 * d.fillRate).toFixed(0) + '%' : (p.onHand || 0)}</td></tr>`; });
    results.append(H('div', { html: `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Parts</p><table class="table"><thead><tr><th>Part</th><th class="num">TH /min</th><th class="num">Cycle</th><th class="num">Fill / stock</th></tr></thead><tbody>${pr.join('')}</tbody></table>` }));
  }
  // control & demand summary
  const cRows = [`<tr><td>Control</td><td class="num">${r.control === 'conwip' ? 'CONWIP (pull)' : 'push'}</td></tr>`,
    `<tr><td>Raw supply</td><td class="num">${r.supply}</td></tr>`];
  if (!r.multiPart) {
    cRows.push(`<tr><td>Max line WIP</td><td class="num">${r.maxLineWip}</td></tr>`);
    if (r.demand === 'stream') cRows.push(`<tr><td>Fill rate</td><td class="num">${(100 * r.fillRate).toFixed(1)}%</td></tr>`,
      `<tr><td>Stockouts / avg FG</td><td class="num">${r.stockouts} / ${r.avgFG.toFixed(2)}</td></tr>`);
  }
  results.append(H('div', { html: `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Control &amp; demand</p><table class="table"><tbody>${cRows.join('')}</tbody></table>` }));
  // study integration: declare these outputs as conceptual-model responses for the analysis phase
  const haveResp = ['Throughput', 'Average WIP', 'Cycle time', 'Fill rate'].every((nm) => project.conceptual.responses.some((x) => x.name === nm));
  const rb = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-4)' }, haveResp ? '✓ responses declared' : 'Declare these as study responses');
  rb.disabled = haveResp;
  rb.addEventListener('click', () => { addStandardResponses(); showResults(); });
  results.append(rb);
}

/* ---- example + clear ---------------------------------------------------- */
// reset model.parts to a single product part whose route is all placed nodes in order
function setSinglePartRoute(name = 'Part') {
  const id = uid('part');
  model.parts = [{ id, name, kind: 'product', route: model.nodes.map((n) => n.id), bom: [],
    demand: { on: false, dist: newDist('exp', { mean: 2 }), qty: 1, conwip: 5 } }];
  model.activePart = id;
}
function loadExample() {
  const mk = (kind, name, x, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y: 26 }, extra);
  model.nodes = [
    mk('source', 'Raw in', 8, { interarrival: newDist('exp', { mean: 3 }) }),
    mk('resource', 'Press', 26, { machines: 1, symbol: 'press', service: newDist('lognormal', { mean: 2, sd: 0.5 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) } }),
    mk('storage', 'WIP', 44, { cap: 10 }),
    mk('resource', 'Inspect', 62, { machines: 1, symbol: 'inspect', service: newDist('triangular', { min: 0.8, mode: 1.2, max: 2 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) } }),
    mk('sink', 'Ship', 78),
  ];
  setSinglePartRoute(); model.legs = {}; model.movers = []; selected = null; sim = null;
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
  setSinglePartRoute(); model.legs = {}; model.movers = []; selected = null; sim = null;
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
  setSinglePartRoute(); model.legs = {}; model.movers = []; selected = null; sim = null;
  model.control = 'push'; model.supply = 'stream';   // clean defaults so a leftover CONWIP<B can't block the demo
  ensureBatchAssumption();   // log the "requires a full batch to start" simplification, as in real use
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'Batch demo: the Heat-treat furnace runs batches of 4 — it waits for a full batch (watch the N/4 badge), pays one setup, then cooks all 4 together. Hover it for live counts; press Play.';
}
/* Assembly demo (#example4): a Widget = 1 Body + 4 Bolts. The Body is fabricated
   (Raw → Cut → Assy), Bolts are bought-in (Bolt store → Assy). The Assy station waits
   for a full set (1 body + 4 bolts) before it can build a widget — fork-join synchronisation;
   the slower component paces the product. */
function loadExample4() {
  const mk = (kind, name, x, y, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y }, extra);
  const brk = () => ({ on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) });
  const buf = () => ({ finite: false, cap: 10, init: 0, target: 8 });
  const srcBody = mk('source', 'Raw', 8, 16, { interarrival: newDist('exp', { mean: 2 }) });
  const cut = mk('resource', 'Cut', 26, 16, { machines: 1, symbol: 'cut', service: newDist('lognormal', { mean: 1, sd: 0.3 }), buffer: buf(), scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 }, assembly: false });
  const srcBolt = mk('source', 'Bolt store', 26, 40, { interarrival: newDist('exp', { mean: 0.4 }) });
  const assy = mk('resource', 'Assemble', 50, 28, { machines: 1, symbol: 'assemble', service: newDist('lognormal', { mean: 1.5, sd: 0.4 }), buffer: buf(), scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 }, assembly: true });
  const ship = mk('sink', 'Ship', 74, 28);
  model.nodes = [srcBody, cut, srcBolt, assy, ship];
  const body = { id: uid('part'), name: 'Body', kind: 'fabricated', route: [srcBody.id, cut.id, assy.id], bom: [], demand: { on: false, dist: newDist('exp', { mean: 3 }), qty: 1, conwip: 5 } };
  const bolt = { id: uid('part'), name: 'Bolt', kind: 'purchased', route: [srcBolt.id, assy.id], bom: [], demand: { on: false, dist: newDist('exp', { mean: 3 }), qty: 1, conwip: 5 } };
  const widget = { id: uid('part'), name: 'Widget', kind: 'product', route: [assy.id, ship.id],
    bom: [{ partId: body.id, qty: 1 }, { partId: bolt.id, qty: 4 }], demand: { on: false, dist: newDist('exp', { mean: 2 }), qty: 1, conwip: 5 } };
  model.parts = [body, bolt, widget]; model.activePart = widget.id;
  model.legs = {}; model.movers = []; selected = { kind: 'node', id: assy.id }; sim = null;
  model.control = 'push'; model.supply = 'stream';
  ensureProcessAssumption();
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'Assembly demo: a Widget needs 1 Body + 4 Bolts. The Assemble station waits for a full set before building one — the slower-supplied component paces output. Hover Assemble for live counts; press Play.';
}
/* Deepest model the engine supports (#example5): a 3-LEVEL BOM where the sub-assembly is
   ALSO sold independently, so there are TWO finished-goods sinks. Pump (sold) = 1 Motor +
   2 Housing; Motor (sold AND a component of Pump) = 1 Rotor + 4 Magnet; Housing/Rotor are
   fabricated leaves, Magnet is bought-in. Levels: Pump → Motor → {Rotor, Magnet}.
     • The Motor line ends at its own sink "Motors out (spares)" — finished Motors land on the
       shared Motor shelf, from which the Motor demand stream sells some and Pump assembly pulls
       the rest (component inventory is a global per-part pool in this engine — there is no leg
       from the Motor line into Final assy; the Pump assembler draws Motors from that pool).
     • The Pump line ends at "Pumps out".
   Run under CONWIP (pull) + limitless supply so demand is exploded through the BOM
   (computePullNeeds) and the scarce Motor is SHARED FAIRLY between Pump assembly and the Motor
   spares demand (extTurn). Exercises every hard path at once: multi-level dependent demand, a
   part that is product AND component, transport-gated fork-join, two demand streams + two sinks,
   per-product CONWIP. Tuned under-loaded so it cycles. */
function loadExample5() {
  const mk = (kind, name, x, y, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y }, extra);
  const brk = () => ({ on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) });
  const buf = () => ({ finite: false, cap: 10, init: 0, target: 8 });
  const res = (name, x, y, sym, mean, extra = {}) => mk('resource', name, x, y, Object.assign(
    { machines: 1, symbol: sym, service: newDist('lognormal', { mean, sd: mean * 0.3 }), buffer: buf(),
      scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 }, assembly: false }, extra));
  // top line → Pumps;  bottom line → Motors (also sold). Two sinks, one per saleable product.
  const housingSrc = mk('source', 'Steel (housing)', 8, 9, { interarrival: newDist('exp', { mean: 2.5 }) });
  const mill = res('Mill', 28, 9, 'gear', 1.4);
  const finalAssy = res('Final assy', 54, 14, 'assemble', 2, { assembly: true });
  const pumpShip = mk('sink', 'Pumps out', 76, 14);
  const rotorSrc = mk('source', 'Bar (rotor)', 8, 40, { interarrival: newDist('exp', { mean: 3 }) });
  const lathe = res('Lathe', 26, 40, 'cpu', 1.2);
  const magnetStore = mk('source', 'Magnet store', 26, 26, { interarrival: newDist('exp', { mean: 0.6 }) });
  const motorAssy = res('Motor assy', 46, 38, 'assemble', 1.5, { assembly: true });
  const motorShip = mk('sink', 'Motors out (spares)', 70, 38);
  model.nodes = [housingSrc, mill, finalAssy, pumpShip, rotorSrc, lathe, magnetStore, motorAssy, motorShip];

  const dem = (mean) => ({ on: false, dist: newDist('exp', { mean }), qty: 1, conwip: 5 });
  const housing = { id: uid('part'), name: 'Housing', kind: 'fabricated', route: [housingSrc.id, mill.id, finalAssy.id], bom: [], demand: dem(3) };
  const rotor   = { id: uid('part'), name: 'Rotor',   kind: 'fabricated', route: [rotorSrc.id, lathe.id, motorAssy.id], bom: [], demand: dem(3) };
  const magnet  = { id: uid('part'), name: 'Magnet',  kind: 'purchased',  route: [magnetStore.id, motorAssy.id], bom: [], demand: dem(3) };
  // Motor: assembled at Motor assy, then shipped to its own sink — finished Motors land on the shared
  // Motor shelf, from which the Motor demand sells some and Pump assembly pulls the rest.
  const motor = { id: uid('part'), name: 'Motor', kind: 'product', route: [motorAssy.id, motorShip.id],
    bom: [{ partId: rotor.id, qty: 1 }, { partId: magnet.id, qty: 4 }],
    demand: { on: true, dist: newDist('exp', { mean: 12 }), qty: 1, conwip: 6 } };   // sub-assembly ALSO sold as a spare
  const pump = { id: uid('part'), name: 'Pump', kind: 'product', route: [finalAssy.id, pumpShip.id],
    bom: [{ partId: motor.id, qty: 1 }, { partId: housing.id, qty: 2 }],
    demand: { on: true, dist: newDist('exp', { mean: 6 }), qty: 1, conwip: 4 } };
  model.parts = [housing, rotor, magnet, motor, pump]; model.activePart = pump.id;
  model.legs = {}; model.movers = []; selected = { kind: 'node', id: finalAssy.id }; sim = null;
  model.control = 'conwip'; model.supply = 'limitless';   // pull: dependent demand exploded through the BOM
  ensureProcessAssumption();
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = '3-level BOM, two products: Pumps (= 1 Motor + 2 Housings) ship from “Pumps out”, and the Motor sub-assembly (= 1 Rotor + 4 Magnets) is ALSO sold as a spare and ships from “Motors out”. Under pull/CONWIP the scarce Motors are shared fairly between Pump assembly and spare-part demand. Hover the two assembly stations for live counts; press Play.';
}
/* Phase 3.6 showcase (#example6): the full toolkit on one floor. A Pump (sold) = 1 Motor + 2 Housing;
   the Motor (sold AND a component) = 1 Rotor + 4 Magnet. Transport uses ALL modes: a bent CONVEYOR
   (Mill → Final assy), AGVs carrying Rotors, Magnets and the shared-Motor supply leg into Final assy,
   and an OPERATOR who runs the operator-required Lathe. Plus scrap, pull/CONWIP and per-product demand.
   Tuned stable (2 AGVs keep up; 1 operator easily runs the Lathe). */
function loadExample6() {
  const mk = (kind, name, x, y, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y }, extra);
  const brk = () => ({ on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) });
  const buf = () => ({ finite: false, cap: 10, init: 0, target: 8 });
  const res = (name, x, y, sym, mean, extra = {}) => mk('resource', name, x, y, Object.assign(
    { machines: 1, symbol: sym, service: newDist('lognormal', { mean, sd: mean * 0.3 }), buffer: buf(),
      scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 }, assembly: false, operatorRequired: false }, extra));
  const steel = mk('source', 'Steel', 8, 10, { interarrival: newDist('exp', { mean: 2.5 }) });
  const mill = res('Mill', 28, 9, 'gear', 1.4, { scrap: 0.05 });
  const finalAssy = res('Final assy', 62, 16, 'assemble', 2, { assembly: true });
  const pumpShip = mk('sink', 'Pumps out', 78, 12);
  const bar = mk('source', 'Bar', 8, 40, { interarrival: newDist('exp', { mean: 3 }) });
  const lathe = res('Lathe', 26, 40, 'cpu', 1.2, { operatorRequired: true });   // an operator must run it
  const magnetStore = mk('source', 'Magnet store', 26, 26, { interarrival: newDist('exp', { mean: 0.6 }) });
  const motorAssy = res('Motor assy', 46, 36, 'assemble', 1.5, { assembly: true });
  const motorShip = mk('sink', 'Motors out (spares)', 70, 42);
  model.nodes = [steel, mill, finalAssy, pumpShip, bar, lathe, magnetStore, motorAssy, motorShip];

  const dem = (mean) => ({ on: false, dist: newDist('exp', { mean }), qty: 1, conwip: 5 });
  const housing = { id: uid('part'), name: 'Housing', kind: 'fabricated', route: [steel.id, mill.id, finalAssy.id], bom: [], demand: dem(3) };
  const rotor = { id: uid('part'), name: 'Rotor', kind: 'fabricated', route: [bar.id, lathe.id, motorAssy.id], bom: [], demand: dem(3) };
  const magnet = { id: uid('part'), name: 'Magnet', kind: 'purchased', route: [magnetStore.id, motorAssy.id], bom: [], demand: dem(3) };
  const motor = { id: uid('part'), name: 'Motor', kind: 'product', route: [motorAssy.id, motorShip.id],
    bom: [{ partId: rotor.id, qty: 1 }, { partId: magnet.id, qty: 4 }], demand: { on: true, dist: newDist('exp', { mean: 12 }), qty: 1, conwip: 8 } };
  const pump = { id: uid('part'), name: 'Pump', kind: 'product', route: [finalAssy.id, pumpShip.id],
    bom: [{ partId: motor.id, qty: 1 }, { partId: housing.id, qty: 2 }], demand: { on: true, dist: newDist('exp', { mean: 6 }), qty: 1, conwip: 5 } };
  model.parts = [housing, rotor, magnet, motor, pump]; model.activePart = pump.id;
  // transport: a bent conveyor + AGV legs (incl. the shared-Motor supply leg into Final assy)
  model.legs = {
    [`${mill.id}>${finalAssy.id}`]: { mover: 'conveyor', speed: 30, cap: 6, waypoints: [{ x: 44, y: 5 }] },
    [`${lathe.id}>${motorAssy.id}`]: { mover: 'agv' },
    [`${magnetStore.id}>${motorAssy.id}`]: { mover: 'agv' },
    [`${motorAssy.id}>${finalAssy.id}`]: { mover: 'agv' },   // the shared Motor is delivered into Final assy by AGV
  };
  model.movers = [
    { id: uid('mv'), kind: 'agv', name: 'AGV 1', speed: 60, home: { x: 40, y: 24 }, serves: { links: 'all', machines: 'all' } },
    { id: uid('mv'), kind: 'agv', name: 'AGV 2', speed: 60, home: { x: 46, y: 24 }, serves: { links: 'all', machines: 'all' } },
    { id: uid('mv'), kind: 'operator', name: 'Operator', speed: 60, home: { x: 22, y: 34 }, serves: { links: [], machines: [lathe.id] } },
  ];
  model.defaultMover = 'instant'; model.control = 'conwip'; model.supply = 'limitless';
  selected = { kind: 'node', id: motorAssy.id }; sim = null;
  ensureProcessAssumption(); ensureMoverAssumption();
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'Showcase: a Pump (=1 Motor+2 Housings) and its sold sub-assembly Motor (=1 Rotor+4 Magnets). A bent CONVEYOR feeds Final assy; two AGVs carry Rotors, Magnets and the shared Motors; an OPERATOR runs the operator-required Lathe. Pull/CONWIP + scrap. Watch the AGVs and the operator move; press Play.';
}
/* The most intricate demo (#example7): everything at once, stress-verified buildable by hand.
   Pump (sold) = 1 Motor + 2 Housing; Motor (sold AND a component) = 1 Rotor + 4 Magnet.
   - Housing line:  Steel → Mill (scrap) → WIP buffer (storage) → Final assy, with a BENT CONVEYOR.
   - Rotor line:    Bar → Lathe (OPERATOR-required) → Motor assy, via AGV.
   - Magnet line:   Magnet store → Heat-treat (BATCH furnace, B=4) → Motor assy, via AGVs. (Magnet is
                    used ×4 per Motor, and the batch is set to 4 so each furnace batch feeds exactly one
                    Motor — batch size must divide the assembly appetite or the pull pipeline stalls.)
   - Shared Motor delivered Motor assy → Final assy by AGV; both products sold under pull/CONWIP.
   3 AGVs + 1 operator; tuned stable. (Batch is kept on Heat-treat, not on an assembly node — design §E4.) */
function loadExample7() {
  const mk = (kind, name, x, y, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y }, extra);
  const brk = () => ({ on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) });
  const buf = () => ({ finite: false, cap: 10, init: 0, target: 8 });
  const res = (name, x, y, sym, mean, extra = {}) => mk('resource', name, x, y, Object.assign(
    { machines: 1, symbol: sym, service: newDist('lognormal', { mean, sd: mean * 0.3 }), buffer: buf(),
      scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 }, assembly: false, operatorRequired: false }, extra));
  const steel = mk('source', 'Steel', 8, 8, { interarrival: newDist('exp', { mean: 2.5 }) });
  const mill = res('Mill', 24, 8, 'gear', 1.3, { scrap: 0.06 });
  const wip = mk('storage', 'WIP buffer', 42, 8, { cap: 12, symbol: 'triangle' });
  const finalAssy = res('Final assy', 66, 16, 'assemble', 2, { assembly: true });
  const pumpShip = mk('sink', 'Pumps out', 82, 12);
  const bar = mk('source', 'Bar', 8, 44, { interarrival: newDist('exp', { mean: 3 }) });
  const lathe = res('Lathe', 24, 44, 'cpu', 1.2, { operatorRequired: true });
  const magnetStore = mk('source', 'Magnet store', 30, 28, { interarrival: newDist('exp', { mean: 0.5 }) });
  const heat = res('Heat-treat', 46, 28, 'furnace', 1.0, { batch: { on: true, size: 4, setup: 0.8 } });
  const motorAssy = res('Motor assy', 58, 38, 'assemble', 1.5, { assembly: true });
  const motorShip = mk('sink', 'Motors out (spares)', 80, 44);
  model.nodes = [steel, mill, wip, finalAssy, pumpShip, bar, lathe, magnetStore, heat, motorAssy, motorShip];

  const dem = (mean) => ({ on: false, dist: newDist('exp', { mean }), qty: 1, conwip: 5 });
  const housing = { id: uid('part'), name: 'Housing', kind: 'fabricated', route: [steel.id, mill.id, wip.id, finalAssy.id], bom: [], demand: dem(3) };
  const rotor = { id: uid('part'), name: 'Rotor', kind: 'fabricated', route: [bar.id, lathe.id, motorAssy.id], bom: [], demand: dem(3) };
  const magnet = { id: uid('part'), name: 'Magnet', kind: 'purchased', route: [magnetStore.id, heat.id, motorAssy.id], bom: [], demand: dem(3) };
  const motor = { id: uid('part'), name: 'Motor', kind: 'product', route: [motorAssy.id, motorShip.id],
    bom: [{ partId: rotor.id, qty: 1 }, { partId: magnet.id, qty: 4 }], demand: { on: true, dist: newDist('exp', { mean: 14 }), qty: 1, conwip: 8 } };
  const pump = { id: uid('part'), name: 'Pump', kind: 'product', route: [finalAssy.id, pumpShip.id],
    bom: [{ partId: motor.id, qty: 1 }, { partId: housing.id, qty: 2 }], demand: { on: true, dist: newDist('exp', { mean: 6 }), qty: 1, conwip: 5 } };
  model.parts = [housing, rotor, magnet, motor, pump]; model.activePart = pump.id;
  model.legs = {
    [`${mill.id}>${wip.id}`]: { mover: 'conveyor', speed: 30, cap: 8, waypoints: [{ x: 33, y: 3 }] },   // bent conveyor
    [`${lathe.id}>${motorAssy.id}`]: { mover: 'agv' },
    [`${magnetStore.id}>${heat.id}`]: { mover: 'agv' },
    [`${heat.id}>${motorAssy.id}`]: { mover: 'agv' },
    [`${motorAssy.id}>${finalAssy.id}`]: { mover: 'agv' },   // shared-Motor supply leg
  };
  model.movers = [
    { id: uid('mv'), kind: 'agv', name: 'AGV 1', speed: 60, home: { x: 44, y: 24 }, serves: { links: 'all', machines: 'all' } },
    { id: uid('mv'), kind: 'agv', name: 'AGV 2', speed: 60, home: { x: 49, y: 24 }, serves: { links: 'all', machines: 'all' } },
    { id: uid('mv'), kind: 'agv', name: 'AGV 3', speed: 60, home: { x: 54, y: 24 }, serves: { links: 'all', machines: 'all' } },
    { id: uid('mv'), kind: 'operator', name: 'Operator', speed: 60, home: { x: 18, y: 36 }, serves: { links: [], machines: [lathe.id] } },
  ];
  model.defaultMover = 'instant'; model.control = 'conwip'; model.supply = 'limitless';
  selected = { kind: 'node', id: motorAssy.id }; sim = null;
  ensureProcessAssumption(); ensureMoverAssumption();
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'The works: Pump = 1 Motor + 2 Housings; Motor (sold spare) = 1 Rotor + 4 Magnets. Housings ride a BENT CONVEYOR via a WIP buffer; Rotors are turned on an OPERATOR-run Lathe; Magnets are BATCH heat-treated (B=4, one batch per Motor); 3 AGVs carry the rest incl. the shared Motors. Pull/CONWIP + scrap. Press Play and watch it all move.';
}
/* The grand demo (#example8) — every feature on one floor, grounded in the layout theory
   (theory-notes §5.3–5.5): TWO heavy-duty automatic casting LINES, each a parallel-machine GROUP
   (3.7 pooling) with breakdowns + scrap and AGV feed, CONVERGE (3.8) into a shared BATCH heat-treat
   furnace (3.4), which delivers the Casing to a CELLULAR assembly station (3.5 BOM + a purchased
   Bearing) run by TWO OPERATORS who both carry bearings and operate the cell (3.6 operator↔machine
   coupling). Gearboxes are sold under pull/CONWIP. Stream supply lets the batch accumulate freely. */
function loadExample8() {
  const mk = (kind, name, x, y, extra = {}) => Object.assign({ kind, id: uid(kind.slice(0, 3)), name, x, y }, extra);
  const brk = (on = false) => ({ on, ttf: newDist('weibull', { shape: 1.6, scale: 55 }), ttr: newDist('exp', { mean: 5 }) });
  const buf = () => ({ finite: false, cap: 10, init: 0, target: 8 });
  const res = (name, x, y, sym, mean, extra = {}) => mk('resource', name, x, y, Object.assign(
    { machines: 1, symbol: sym, service: newDist('lognormal', { mean, sd: mean * 0.3 }), buffer: buf(),
      scrap: 0, brk: brk(), batch: { on: false, size: 2, setup: 0 }, assembly: false, operatorRequired: false }, extra));
  // raw sources (two heavy lines + a purchased part near the cell)
  const steelA = mk('source', 'Steel A', 4, 8, { interarrival: newDist('exp', { mean: 6 }) });
  const steelB = mk('source', 'Steel B', 4, 46, { interarrival: newDist('exp', { mean: 6 }) });
  const bearings = mk('source', 'Bearings (bought)', 56, 6, { interarrival: newDist('exp', { mean: 1.5 }) });
  // line A + line B casters — heavy-duty automatic machines, two per line (a parallel group), scrap + breakdowns
  const castA1 = res('Caster A1', 22, 5, 'gear', 4, { scrap: 0.05, brk: brk(true) });
  const castA2 = res('Caster A2', 22, 15, 'gear', 4, { scrap: 0.05, brk: brk(true) });
  const castB1 = res('Caster B1', 22, 39, 'gear', 4, { scrap: 0.05, brk: brk(true) });
  const castB2 = res('Caster B2', 22, 49, 'gear', 4, { scrap: 0.05, brk: brk(true) });
  const heat = res('Heat-treat', 43, 27, 'furnace', 2.5, { batch: { on: true, size: 4, setup: 1.5 } });   // merge + batch
  // the assembly CELL — three workstations in a U, all operator-run; the two operators stay inside the
  // cell and move parts station-to-station "circularly" (cellular manufacturing, theory-notes §5.5)
  const cellA = res('Press-fit', 62, 13, 'assemble', 1.0, { assembly: true, operatorRequired: true });   // assembles 1 Casing + 2 Bearings
  const cellB = res('Fasten', 78, 27, 'cpu', 0.9, { operatorRequired: true });
  const cellC = res('Test & pack', 62, 41, 'cpu', 0.9, { operatorRequired: true });
  const ship = mk('sink', 'Gearboxes out', 90, 41);
  model.nodes = [steelA, castA1, castA2, steelB, castB1, castB2, bearings, heat, cellA, cellB, cellC, ship];

  // parallel-machine groups (3.7) — one per heavy line, shortest-queue
  const castersA = { id: uid('grp'), name: 'Casters A', rule: 'shortest', members: [castA1.id, castA2.id] };
  const castersB = { id: uid('grp'), name: 'Casters B', rule: 'shortest', members: [castB1.id, castB2.id] };
  model.groups = [castersA, castersB];

  // parts — Casing = two converging heavy lines (primary + feeder) through the batch furnace into the cell
  const dem = (mean, cw) => ({ on: false, dist: newDist('exp', { mean }), qty: 1, conwip: cw });
  const casing = { id: uid('part'), name: 'Casing', kind: 'fabricated',
    route: [steelA.id, castersA.id, heat.id, cellA.id],
    feeders: [{ path: [steelB.id, castersB.id, heat.id] }], bom: [], demand: dem(6, 5) };
  const bearing = { id: uid('part'), name: 'Bearing', kind: 'purchased', route: [bearings.id, cellA.id], feeders: [], bom: [], demand: dem(2, 5) };
  const gearbox = { id: uid('part'), name: 'Gearbox', kind: 'product', route: [cellA.id, cellB.id, cellC.id, ship.id], feeders: [],
    bom: [{ partId: casing.id, qty: 1 }, { partId: bearing.id, qty: 2 }], demand: { on: true, dist: newDist('exp', { mean: 3.2 }), qty: 1, conwip: 8 } };
  model.parts = [casing, bearing, gearbox]; model.activePart = gearbox.id;

  // transport — AGVs feed the heavy lines + carry the Casing to the cell; the purchased Bearings feed
  // the cell AUTOMATICALLY (instant); inside the cell the two operators carry parts station-to-station.
  const agv = { mover: 'agv' }, op = { mover: 'operator' };
  model.legs = {
    [`${steelA.id}>${castA1.id}`]: agv, [`${steelA.id}>${castA2.id}`]: agv,
    [`${castA1.id}>${heat.id}`]: agv, [`${castA2.id}>${heat.id}`]: agv,
    [`${steelB.id}>${castB1.id}`]: agv, [`${steelB.id}>${castB2.id}`]: agv,
    [`${castB1.id}>${heat.id}`]: agv, [`${castB2.id}>${heat.id}`]: agv,
    [`${heat.id}>${cellA.id}`]: agv,                              // Casing into the cell, by AGV
    [`${cellA.id}>${cellB.id}`]: op, [`${cellB.id}>${cellC.id}`]: op,   // within-cell hand-offs, by the operators
    // (Bearings → cell is left at the default INSTANT mover — automatic feed of the purchased part)
  };
  const agvLinks = Object.keys(model.legs).filter((k) => model.legs[k].mover === 'agv');
  const cellLinks = [`${cellA.id}>${cellB.id}`, `${cellB.id}>${cellC.id}`];
  const cellMachines = [cellA.id, cellB.id, cellC.id];
  model.movers = [
    { id: uid('mv'), kind: 'agv', name: 'AGV 1', speed: 70, home: { x: 33, y: 20 }, serves: { links: agvLinks.slice(), machines: [] } },
    { id: uid('mv'), kind: 'agv', name: 'AGV 2', speed: 70, home: { x: 33, y: 27 }, serves: { links: agvLinks.slice(), machines: [] } },
    { id: uid('mv'), kind: 'agv', name: 'AGV 3', speed: 70, home: { x: 33, y: 34 }, serves: { links: agvLinks.slice(), machines: [] } },
    // the two cell workers stay INSIDE the cell — they only serve the cell's stations and hand-offs
    { id: uid('mv'), kind: 'operator', name: 'Worker 1', speed: 55, home: { x: 70, y: 22 }, serves: { links: cellLinks.slice(), machines: cellMachines.slice() } },
    { id: uid('mv'), kind: 'operator', name: 'Worker 2', speed: 55, home: { x: 70, y: 32 }, serves: { links: cellLinks.slice(), machines: cellMachines.slice() } },
  ];
  model.defaultMover = 'instant'; model.control = 'conwip'; model.supply = 'stream';
  selected = { kind: 'node', id: cellA.id }; sim = null;
  ensureProcessAssumption(); ensureMoverAssumption();
  persist(); refreshAll(); updateClock(); setPlayLabel(); zoomFit();
  $('floorHint').textContent = 'The grand demo: two heavy-duty automatic CASTING LINES (each a parallel-machine GROUP, with breakdowns + scrap, AGV-fed) CONVERGE into a shared BATCH heat-treat furnace, then feed a U-shaped CELL of three workstations — Press-fit (1 Casing + 2 auto-fed Bearings) → Fasten → Test & pack — where TWO WORKERS stay in the cell and move parts station-to-station. Gearboxes sold under pull/CONWIP. Press Play and watch it all move.';
}
function clearFloor() { model.nodes = []; setSinglePartRoute(); model.legs = {}; model.movers = []; selected = null; sim = null;
  persist(); refreshAll(); updateClock(); setPlayLabel();
  $('results').innerHTML = '<p class="results-empty">Press Play, then “End” when you’ve seen enough, to see results.</p>';
  openSetup(); }

/* ===== Model Setup (the system builder) =================================
   Define stations · parts & BOM · routes · control in a drawer with a live
   mini-preview; Apply auto-lays-out the floor. After setup the floor is for
   physical work only (reposition + parameters + transport), not structure. */
function setupOpen() { const d = $('setupDrawer'); return !!(d && !d.hidden); }
function openSetup() { const d = $('setupDrawer'); if (!d) return; d.hidden = false; pmSel = model.activePart; renderSetup(); }
function closeSetup() { const d = $('setupDrawer'); if (d) d.hidden = true; }
function applySetup() { autoLayout(); persist(); closeSetup(); selected = null; refreshAll(); zoomFit(); }

function renderSetup() {
  renderSetupStations();
  renderSetupMovers();
  renderSetupGroups();
  renderPartsModal();        // reuses the parts/BOM/demand editor, hosted in the drawer (#pmList/#pmEditor)
  renderSetupRoutes();
  renderControl();           // hosted in the drawer (#controlBody)
  renderSetupMini();
  renderSetupSummary();
}
/* ---- Setup: flexible movers (AGV / Operator) ---- */
let setupOpenMover = null;
function moverSummary(u) { const all = u.serves.links === 'all' && (u.kind === 'agv' || u.serves.machines === 'all'); return `${u.speed} m/min · ${all ? 'serves all' : 'restricted'}`; }
function renderSetupMovers() {
  const host = $('setupMovers'); if (!host) return; host.innerHTML = '';
  const add = H('div', { class: 'setup-add' });
  [['agv', '+ AGV'], ['operator', '+ Operator']].forEach(([k, label]) => { const b = H('button', { class: 'btn btn-ghost' }, label); b.addEventListener('click', () => addMover(k)); add.append(b); });
  host.append(add);
  if (!model.movers.length) { host.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'No movers yet. AGVs carry loads; Operators carry loads AND run “operator required” machines.')); return; }
  // fleet size as an experimental factor (Phase 3.6.3 — Robinson: declare what you'll vary)
  const nAgv = model.movers.filter((u) => u.kind === 'agv').length, nOp = model.movers.filter((u) => u.kind === 'operator').length;
  const fac = H('div', { class: 'setup-add' });
  if (nAgv) fac.append(factorButton('movers:agv:count', { name: 'AGV fleet size', unit: 'AGVs', baseline: String(nAgv), description: 'Number of AGV units. Vary to study transport capacity vs WIP, cycle time and mover utilisation.' }, renderSetupMovers));
  if (nOp) fac.append(factorButton('movers:operator:count', { name: 'Operator count', unit: 'operators', baseline: String(nOp), description: 'Number of operators (shared across moves and operator-run machines). Vary to study the move-vs-operate contention.' }, renderSetupMovers));
  if (fac.childNodes.length) host.append(fac);
  const list = H('div', { class: 'setup-list' });
  model.movers.forEach((u) => {
    const open = setupOpenMover === u.id;
    const card = H('div', { class: 'setup-card' + (open ? ' open' : '') });
    const head = H('div', { class: 'setup-card-h' }, [H('span', { class: 'setup-kind' }, u.kind), H('span', { class: 'setup-cardname' }, u.name), H('span', { class: 'setup-sum' }, open ? '' : moverSummary(u))]);
    head.append(mini('✕', () => { removeMover(u.id); if (setupOpenMover === u.id) setupOpenMover = null; renderSetup(); }));
    head.addEventListener('click', (e) => { if (e.target.classList.contains('mini')) return; setupOpenMover = open ? null : u.id; renderSetupMovers(); });
    card.append(head);
    if (open) { const bd = H('div', { class: 'setup-card-b stack' }); moverEditor(u, bd); card.append(bd); }
    list.append(card);
  });
  host.append(list);
}
function moverEditor(u, body, rerender = renderSetupMovers) {
  body.append(field('Name', textInput(u.name, (v) => { u.name = v || (u.kind === 'agv' ? 'AGV' : 'Operator'); persist(); })));
  body.append(field('Speed (m/min)', numInput(u.speed, 1, 5, (v) => { u.speed = Math.max(1, v); persist(); render(); })));
  body.append(factorButton(`mover:${u.id}:speed`, { name: `Speed — ${u.name}`, unit: 'm/min', baseline: String(u.speed), description: 'Travel speed of this flexible mover. Vary to study transport capacity vs the fleet size.' }, rerender));
  const all = u.serves.links === 'all' && (u.kind === 'agv' || u.serves.machines === 'all');
  const allChk = H('input', { type: 'checkbox' }); allChk.checked = all;
  allChk.addEventListener('change', () => { u.serves = allChk.checked ? { links: 'all', machines: 'all' } : { links: [], machines: [] }; persist(); rerender(); });
  body.append(H('label', { class: 'toggle-row' }, [allChk, 'Serves the whole floor']));
  if (!all) {
    body.append(H('p', { class: 'subhead' }, 'Carries on links'));
    const lks = allLegKeys();
    if (!lks.length) body.append(H('p', { class: 'floor-hint', style: 'margin:0' }, '(no transport links yet — set routes first)'));
    lks.forEach((k) => { const [a, b] = k.split('>'); const ch = H('input', { type: 'checkbox' }); ch.checked = u.serves.links === 'all' || (Array.isArray(u.serves.links) && u.serves.links.includes(k));
      ch.addEventListener('change', () => { if (u.serves.links === 'all') u.serves.links = lks.slice(); if (ch.checked) { if (!u.serves.links.includes(k)) u.serves.links.push(k); } else u.serves.links = u.serves.links.filter((x) => x !== k); persist(); });
      body.append(H('label', { class: 'toggle-row' }, [ch, `${(node(a) || {}).name || a} → ${(node(b) || {}).name || b}`])); });
    if (u.kind === 'operator') {
      body.append(H('p', { class: 'subhead' }, 'Operates machines'));
      const ms = model.nodes.filter((n) => n.kind === 'resource' && n.operatorRequired);
      if (!ms.length) body.append(H('p', { class: 'floor-hint', style: 'margin:0' }, '(no operator-required machines yet)'));
      ms.forEach((nn) => { const ch = H('input', { type: 'checkbox' }); ch.checked = u.serves.machines === 'all' || (Array.isArray(u.serves.machines) && u.serves.machines.includes(nn.id));
        ch.addEventListener('change', () => { if (u.serves.machines === 'all') u.serves.machines = ms.map((x) => x.id); if (ch.checked) { if (!u.serves.machines.includes(nn.id)) u.serves.machines.push(nn.id); } else u.serves.machines = u.serves.machines.filter((x) => x !== nn.id); persist(); });
        body.append(H('label', { class: 'toggle-row' }, [ch, nn.name || 'machine'])); });
    }
  }
  body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' }, 'Drag this unit on the floor to set its home (standard) location.'));
}
function addMover(kind) { const u = makeMover(kind, floorCentre(model), model.movers.length); model.movers.push(u); setupOpenMover = u.id; ensureMoverAssumption(); persist(); renderSetup(); }
function removeMover(id) { model.movers = model.movers.filter((u) => u.id !== id); persist(); }
/* ---- Setup: parallel resource groups (Phase 3.7) ---- */
let setupOpenGroup = null;
function groupSummary(g) { return `${g.members.filter((m) => node(m)).length} machines · ${g.rule === 'even' ? 'even split' : 'shortest queue'}`; }
function renderSetupGroups() {
  const host = $('setupGroups'); if (!host) return; host.innerHTML = '';
  const resources = model.nodes.filter((n) => n.kind === 'resource');
  const add = H('div', { class: 'setup-add' });
  const ab = H('button', { class: 'btn btn-ghost' }, '+ Group'); ab.disabled = resources.length < 2;
  ab.addEventListener('click', () => addGroup()); add.append(ab); host.append(add);
  if (resources.length < 2) { host.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'Add two or more workcenters first, then group them so one operation can be served by any of them.')); return; }
  if (!model.groups.length) { host.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'No groups. A group lets one routing step be served by any of several machines — chosen by even split or shortest queue.')); return; }
  const list = H('div', { class: 'setup-list' });
  model.groups.forEach((g) => {
    const open = setupOpenGroup === g.id;
    const card = H('div', { class: 'setup-card' + (open ? ' open' : '') });
    const head = H('div', { class: 'setup-card-h' }, [H('span', { class: 'setup-kind' }, 'group'),
      H('span', { class: 'setup-cardname' }, g.name || 'Group'), H('span', { class: 'setup-sum' }, open ? '' : groupSummary(g))]);
    head.append(mini('✕', () => { removeGroup(g.id); if (setupOpenGroup === g.id) setupOpenGroup = null; renderSetup(); }));
    head.addEventListener('click', (e) => { if (e.target.classList.contains('mini')) return; setupOpenGroup = open ? null : g.id; renderSetupGroups(); });
    card.append(head);
    if (open) { const bd = H('div', { class: 'setup-card-b stack' }); groupEditor(g, bd); card.append(bd); }
    list.append(card);
  });
  host.append(list);
}
function groupEditor(g, body) {
  body.append(field('Name', textInput(g.name, (v) => { g.name = v || 'Group'; persist(); render(); renderSetupSummary(); })));
  body.append(field('Selection rule', segmented([{ value: 'shortest', label: 'Shortest queue' }, { value: 'even', label: 'Even split' }], g.rule, (v) => { g.rule = v; persist(); render(); }, 'Selection rule')));
  body.append(factorButton(`group:${g.id}:rule`, { name: `Rule — ${g.name || 'Group'}`, unit: '', baseline: g.rule, description: 'The member-selection rule for this parallel group (shortest queue vs even split). Vary to study state-dependent vs blind routing.' }, renderSetupGroups));
  body.append(factorButton(`group:${g.id}:membercount`, { name: `Members — ${g.name || 'Group'}`, unit: 'machines', baseline: String(g.members.filter((m) => node(m)).length), description: 'Number of parallel machines in this group. Vary to study pooling — how added capacity cuts queueing, WIP and cycle time (theory-notes §5.5).' }, renderSetupGroups));
  body.append(H('p', { class: 'subhead' }, 'Member machines'));
  model.nodes.filter((n) => n.kind === 'resource').forEach((n) => {
    const inOther = model.groups.some((x) => x.id !== g.id && x.members.includes(n.id));
    const ch = H('input', { type: 'checkbox' }); ch.checked = g.members.includes(n.id); ch.disabled = inOther;
    ch.addEventListener('change', () => { if (ch.checked) { if (!g.members.includes(n.id)) g.members.push(n.id); } else g.members = g.members.filter((m) => m !== n.id);
      if (!g.members.length) stripGroupFromRoutes(g.id);   // an empty group can't be routed through — drop it from routes/feeders
      persist(); render(); renderSetupGroups(); renderSetupRoutes(); renderSetupSummary(); });   // route picker offers a group once it has members
    body.append(H('label', { class: 'toggle-row' }, [ch, (n.name || 'machine') + (inOther ? ' (in another group)' : '')]));
  });
  body.append(H('p', { class: 'floor-hint', style: 'margin:var(--s-2) 0 0' }, 'Then add this group to a part’s route in step 3 — its operation is shared across these machines.'));
}
function addGroup() {
  const id = uid('grp');
  model.groups.push({ id, name: 'Group ' + (model.groups.length + 1), rule: 'shortest', members: [] });
  setupOpenGroup = id; persist(); renderSetup();
}
// remove a group id from every route + feeder path (without deleting the group itself)
function stripGroupFromRoutes(id) {
  for (const p of model.parts) { p.route = p.route.filter((x) => x !== id);
    for (const f of partFeeders(p)) f.path = (f.path || []).filter((x) => x !== id); }
}
function removeGroup(id) {
  model.groups = model.groups.filter((g) => g.id !== id);
  stripGroupFromRoutes(id);   // drop the group from every route + feeder
  if (selected && selected.kind === 'group' && selected.id === id) selected = null;
  persist();
}
// live "at a glance" counts in the rail (fills the sidebar; helps a student track progress)
function renderSetupSummary() {
  const host = $('setupSummary'); if (!host) return;
  const comp = componentPidSet();
  const products = model.parts.filter((p) => !comp.has(p.id)).length;
  const sold = model.parts.filter((p) => p.demand && p.demand.on).length;
  const routed = model.parts.filter((p) => p.route.length >= 2).length;
  const rows = [['Products', products], ['Parts total', model.parts.length], ['Stations', model.nodes.length], ['Routes set', `${routed}/${model.parts.length}`], ['Sold to demand', sold]];
  host.innerHTML = rows.map(([k, v]) => `<div class="setup-sum-row"><span>${k}</span><b class="num">${v}</b></div>`).join('');
}

const STATION_KINDS = [['source', 'Source'], ['resource', 'Workcenter'], ['storage', 'Storage'], ['sink', 'Sink']];
let setupOpenStation = null;   // id of the station whose editor is expanded (accordion)
function stationSummary(n) {
  if (n.kind === 'resource') return `${n.machines || 1}× · ${DISTS[n.service.type].label} μ=${distMean(n.service).toFixed(2)}${n.assembly ? ' · assembly' : ''}${(n.batch && n.batch.on) ? ` · batch ${n.batch.size}` : ''}${n.scrap ? ` · scrap ${(n.scrap * 100) | 0}%` : ''}${n.brk && n.brk.on ? ' · brk' : ''}`;
  if (n.kind === 'source') return `${DISTS[n.interarrival.type].label} μ=${distMean(n.interarrival).toFixed(2)}`;
  if (n.kind === 'storage') return `cap ${n.cap}`;
  return '';
}
function renderSetupStations() {
  const host = $('setupStations'); if (!host) return; host.innerHTML = '';
  const add = H('div', { class: 'setup-add' });
  STATION_KINDS.forEach(([k, label]) => { const btn = H('button', { class: 'btn btn-ghost' }, '+ ' + label); btn.addEventListener('click', () => addStation(k)); add.append(btn); });
  host.append(add);
  if (!model.nodes.length) { host.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'No stations yet — add a source, one or more workcenters, and a sink.')); return; }
  const list = H('div', { class: 'setup-list' });
  model.nodes.forEach((n) => {
    const open = setupOpenStation === n.id;
    const card = H('div', { class: 'setup-card' + (open ? ' open' : '') });
    const head = H('div', { class: 'setup-card-h' }, [
      H('span', { class: 'setup-kind' }, n.kind), H('span', { class: 'setup-cardname' }, n.name || n.kind),
      H('span', { class: 'setup-sum' }, open ? '' : stationSummary(n)),
    ]);
    head.append(mini('✕', () => { removeNode(n.id); if (setupOpenStation === n.id) setupOpenStation = null; renderSetup(); }));
    head.addEventListener('click', (e) => { if (e.target.classList.contains('mini')) return; setupOpenStation = open ? null : n.id; renderSetupStations(); });
    card.append(head);
    if (open) { const b = H('div', { class: 'setup-card-b stack' }); stationEditor(n, b, renderSetupStations); card.append(b); }
    list.append(card);
  });
  host.append(list);
}
function addStation(kind) {
  const i = model.nodes.length;
  const n = makeNode(kind, 8 + (i % 6) * 12, 10 + Math.floor(i / 6) * 12);   // temp spot; autoLayout fixes it on Apply
  setupOpenStation = n.id;                                                    // open the new station for editing
  persist(); renderSetup();
}
function renderSetupRoutes() {
  const host = $('setupRoutes'); if (!host) return; host.innerHTML = '';
  if (!model.nodes.length) { host.append(H('p', { class: 'floor-hint', style: 'margin:0' }, 'Add stations and parts first, then order each part’s route here.')); return; }
  model.parts.forEach((p, idx) => {
    const block = H('div', { class: 'route-block' });
    const dot = H('span', { class: 'part-dot' }); dot.style.background = partColor(idx);
    block.append(H('div', { class: 'route-block-h' }, [dot, H('span', { class: 'part-name' }, p.name)]));
    const chips = H('div', { class: 'route-seqs' });
    p.route.forEach((id, i) => {
      const isG = isGroupId(id);
      const chip = H('span', { class: 'route-chip' + (isG ? ' route-chip-group' : '') }, (i + 1) + '. ' + (isG ? '⋔ ' : '') + routeName(id));
      chip.append(mini('✕', () => { p.route.splice(i, 1); persist(); renderSetupRoutes(); renderSetupMini(); }));
      chips.append(chip);
      if (i < p.route.length - 1) chips.append(H('span', { class: 'route-arrow' }, '→'));
    });
    if (!p.route.length) chips.append(H('span', { class: 'floor-hint', style: 'margin:0' }, '(no route yet)'));
    block.append(chips);
    const sel = H('select', { class: 'input' });
    sel.append(H('option', { value: '' }, '+ add station or group to route…'));
    model.nodes.forEach((nd) => sel.append(H('option', { value: nd.id }, (nd.name || nd.kind) + ' · ' + nd.kind)));
    (model.groups || []).filter((g) => g.members.filter((m) => node(m)).length).forEach((g) => sel.append(H('option', { value: g.id }, '⋔ ' + (g.name || 'Group') + ' · group (parallel)')));
    sel.addEventListener('change', () => { if (sel.value) { p.route.push(sel.value); persist(); renderSetupRoutes(); renderSetupMini(); } });
    block.append(sel);
    renderFeeders(p, block);   // Phase 3.8 — extra upstream streams of this same part, converging into the route
    host.append(block);
  });
}
// feeder lines: additional upstream streams of the SAME part that converge into a node on its route
function renderFeeders(p, block) {
  const wrap = H('div', { class: 'feeders' });
  partFeeders(p).forEach((f, fi) => {
    const row = H('div', { class: 'feeder-row' });
    row.append(H('span', { class: 'feeder-tag' }, '⋎ feeder ' + (fi + 1)));
    const chips = H('div', { class: 'route-seqs' });
    (f.path || []).forEach((id, i) => {
      const isG = isGroupId(id);
      const chip = H('span', { class: 'route-chip' + (isG ? ' route-chip-group' : '') }, (isG ? '⋔ ' : '') + routeName(id));
      chip.append(mini('✕', () => { f.path.splice(i, 1); persist(); renderSetupRoutes(); renderSetupMini(); }));
      chips.append(chip);
      if (i < f.path.length - 1) chips.append(H('span', { class: 'route-arrow' }, '→'));
    });
    const join = feederJoin(p, f.path || []);
    chips.append(H('span', { class: 'feeder-join' + (join ? '' : ' warn') }, join ? `↳ merges at ${routeName(join)}` : '↳ end at a station on the route above'));
    row.append(chips);
    const sel = H('select', { class: 'input' });
    sel.append(H('option', { value: '' }, '+ add station to this feeder…'));
    model.nodes.forEach((nd) => sel.append(H('option', { value: nd.id }, (nd.name || nd.kind) + ' · ' + nd.kind)));
    (model.groups || []).filter((g) => g.members.filter((m) => node(m)).length).forEach((g) => sel.append(H('option', { value: g.id }, '⋔ ' + (g.name || 'Group') + ' · group')));
    sel.addEventListener('change', () => { if (sel.value) { (f.path = f.path || []).push(sel.value); persist(); renderSetupRoutes(); renderSetupMini(); } });
    row.append(sel);
    row.append(mini('✕ remove feeder', () => { p.feeders.splice(fi, 1); persist(); renderSetupRoutes(); renderSetupMini(); }));
    wrap.append(row);
  });
  const add = H('button', { class: 'btn btn-ghost', style: 'margin-top:var(--s-2)' }, '+ Feeder line (converge another stream)');
  add.disabled = p.route.length < 1;
  add.addEventListener('click', () => { (p.feeders = p.feeders || []).push({ path: [] }); persist(); renderSetupRoutes(); renderSetupMini(); });
  wrap.append(add);
  // the number of converging streams is an experimental factor (study the superposition / pooling effect)
  if (partFeeders(p).length) wrap.append(factorButton(`merge:${p.id}:streams`, { name: `Converging streams — ${p.name}`, unit: 'streams', baseline: String(1 + partFeeders(p).length), description: 'How many upstream streams of this part converge at the merge. Vary to study how superposing more feeders loads the downstream line (variability superposition, theory-notes §4.5; pooling §4.6).' }, () => { renderSetupRoutes(); renderSetupMini(); }));
  block.append(wrap);
}
// Layered auto-layout: column = longest-path depth along route edges; row = a lane per part.
function computeLayout() {
  const nodes = model.nodes; const pos = {}; if (!nodes.length) return pos;
  const depth = {}, succ = {}, indeg = {};
  nodes.forEach((n) => { depth[n.id] = 0; succ[n.id] = []; indeg[n.id] = 0; });
  for (const p of model.parts) for (const path of partPaths(p)) for (const [a, b] of routeLegPairs(path)) {   // primary + feeder edges; groups expanded
    if (depth[a] == null || depth[b] == null) continue;
    succ[a].push(b); indeg[b]++;
  }
  const q = nodes.filter((n) => indeg[n.id] === 0).map((n) => n.id);
  while (q.length) { const a = q.shift(); for (const b of succ[a]) { depth[b] = Math.max(depth[b], depth[a] + 1); if (--indeg[b] === 0) q.push(b); } }
  const COLX = 16, ROWY = 13, X0 = 8, Y0 = 9; let lane = 0;
  for (const p of model.parts) {
    for (const path of partPaths(p)) {                              // primary route, then each feeder, on its own lane
      let used = false, span = 1;
      for (const id of path) {
        const units = routeUnits(id);                               // a group places all its members in its column
        units.forEach((u, ui) => { if (pos[u] || depth[u] == null) return;
          pos[u] = { x: X0 + depth[u] * COLX, y: Y0 + (lane + ui) * ROWY }; used = true; });
        span = Math.max(span, units.length);
      }
      if (used) lane += span;
    }
  }
  for (const n of nodes) if (!pos[n.id]) { pos[n.id] = { x: X0 + (depth[n.id] || 0) * COLX, y: Y0 + lane * ROWY }; lane++; }
  return pos;
}
function autoLayout() { const pos = computeLayout(); for (const n of model.nodes) if (pos[n.id]) { n.x = pos[n.id].x; n.y = pos[n.id].y; } }
// A faithful thumbnail of the model: uses the nodes' CURRENT positions (so it matches the floor)
// once any have been placed, else the proposed auto-layout. Uniform scale (no stretching), real
// legs + supply legs, and each part's route drawn in its colour.
function renderSetupMini() {
  const host = $('setupMini'); if (!host) return;
  const ns = model.nodes;
  if (!ns.length) { host.innerHTML = '<p class="floor-hint" style="margin:0">Add stations to preview the layout.</p>'; return; }
  const placed = ns.some((n) => (n.x || n.y));
  const pos = {}; if (placed) ns.forEach((n) => { pos[n.id] = { x: n.x || 0, y: n.y || 0 }; }); else Object.assign(pos, computeLayout());
  // a group has no node — give it a synthetic position (its members' centroid) so a route polyline
  // through the group passes neatly through the member cluster
  for (const g of (model.groups || [])) { const ms = g.members.map((m) => pos[m]).filter(Boolean);
    if (ms.length) pos[g.id] = { x: ms.reduce((a, q) => a + q.x, 0) / ms.length, y: ms.reduce((a, q) => a + q.y, 0) / ms.length }; }
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const n of ns) { const p = pos[n.id]; if (!p) continue; minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const W = 380, H = 250, pad = 40;   // smaller viewBox → everything renders larger / clearer
  const s = Math.min((maxX - minX) ? (W - pad * 2) / (maxX - minX) : 1, (maxY - minY) ? (H - pad * 2) / (maxY - minY) : 1);  // uniform scale → keep aspect
  const X = (x) => (W - (maxX - minX) * s) / 2 + (x - minX) * s, Y = (y) => (H - (maxY - minY) * s) / 2 + (y - minY) * s;
  let g = '';
  // structural legs (quiet, behind the routes)
  const legSet = new Set([...allLegKeys(), ...bomDepLinks().map((d) => `${d.from}>${d.to}`)]);
  for (const key of legSet) { const [a, b] = key.split('>'); if (!pos[a] || !pos[b]) continue; g += `<line x1="${X(pos[a].x).toFixed(1)}" y1="${Y(pos[a].y).toFixed(1)}" x2="${X(pos[b].x).toFixed(1)}" y2="${Y(pos[b].y).toFixed(1)}" stroke="var(--line-strong)" stroke-width="2" stroke-linecap="round" opacity=".35"/>`; }
  // each part's route AND its feeder paths — thick, coloured, with a direction arrowhead near the end
  model.parts.forEach((p, idx) => {
    const col = partColor(idx);
    for (const path of partPaths(p)) {
      const r = path.map((id) => pos[id]).filter(Boolean); if (r.length < 2) continue;
      g += `<polyline points="${r.map((q) => `${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`;
      const a = r[r.length - 2], b = r[r.length - 1], ang = Math.atan2(Y(b.y) - Y(a.y), X(b.x) - X(a.x));
      const ex = X(b.x) - Math.cos(ang) * 17, ey = Y(b.y) - Math.sin(ang) * 17, ah = 8;
      g += `<polygon points="${ex.toFixed(1)},${ey.toFixed(1)} ${(ex - Math.cos(ang - 0.5) * ah).toFixed(1)},${(ey - Math.sin(ang - 0.5) * ah).toFixed(1)} ${(ex - Math.cos(ang + 0.5) * ah).toFixed(1)},${(ey - Math.sin(ang + 0.5) * ah).toFixed(1)}" fill="${col}" opacity=".9"/>`;
    }
  });
  // nodes — bigger, type-distinct shapes (filled in/out dots, accent ⊕ assemblers, dashed storage)
  for (const n of ns) { const q = pos[n.id]; if (!q) continue; const x = X(q.x), y = Y(q.y);
    if (n.kind === 'resource') {
      g += `<rect x="${(x - 20).toFixed(1)}" y="${(y - 14).toFixed(1)}" width="40" height="28" rx="7" fill="var(--surface)" stroke="${n.assembly ? 'var(--accent)' : 'var(--ink-2)'}" stroke-width="${n.assembly ? 2.5 : 2}"/>`;
      if (n.assembly) g += `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-size="15" fill="var(--accent)">⊕</text>`;
    } else if (n.kind === 'storage') {
      g += `<rect x="${(x - 19).toFixed(1)}" y="${(y - 13).toFixed(1)}" width="38" height="26" rx="7" fill="var(--surface-2)" stroke="var(--ink-2)" stroke-width="2" stroke-dasharray="5 3"/>`;
    } else if (n.kind === 'source') {
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>`;
    } else {   // sink
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>`;
    }
    g += `<text x="${x.toFixed(1)}" y="${(y - 19).toFixed(1)}" text-anchor="middle" font-size="13" font-weight="500" fill="var(--ink-2)">${esc((n.name || n.kind).slice(0, 16))}</text>`;
  }
  host.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block">${g}</svg>`;
}

/* ---- pointer interaction ------------------------------------------------ */
function onPointerDown(e) {
  if (playing) return;          // pause to edit the floor
  // Floor is physical-only: reposition nodes / mover homes / conveyor bends, select a leg, or pan.
  const svg = $('svg'); const grp = e.target.closest('[data-node]'); const legHit = e.target.closest('[data-leg]');
  const wpHit = e.target.closest('[data-wp]'); const mvHit = e.target.closest('[data-mover]');
  if (wpHit && selected && selected.kind === 'leg') { drag = { wp: +wpHit.getAttribute('data-wp'), key: selected.key, moved: false }; svg.setPointerCapture(e.pointerId); }
  else if (mvHit) { const id = mvHit.getAttribute('data-mover'); selectMover(id); drag = { mover: id, moved: false }; svg.setPointerCapture(e.pointerId); }
  else if (grp) { const id = grp.getAttribute('data-node'); selectNode(id); drag = { id, moved: false }; svg.setPointerCapture(e.pointerId); }
  else if (legHit) selectLeg(legHit.getAttribute('data-leg'));
  else { panning = { sx: e.clientX, sy: e.clientY, cx: view.cx, cy: view.cy }; svg.classList.add('panning'); svg.setPointerCapture(e.pointerId); }
}
function onPointerMove(e) {
  if (panning) { const r = $('svg').getBoundingClientRect();
    view.cx = panning.cx - (e.clientX - panning.sx) * (BASE_W / view.z) / r.width;
    view.cy = panning.cy - (e.clientY - panning.sy) * (BASE_H / view.z) / r.height; setViewBox(); return; }
  if (!drag) return; const p = svgPoint(e);
  if (drag.mover) { const u = model.movers.find((m) => m.id === drag.mover); if (u) { u.home = { x: Math.max(0, p.x / S), y: Math.max(0, p.y / S) }; drag.moved = true; render(); } return; }
  if (drag.wp != null) { const w = (model.legs[drag.key] || {}).waypoints; if (w && w[drag.wp]) { w[drag.wp] = { x: Math.max(0, p.x / S), y: Math.max(0, p.y / S) }; drag.moved = true; render(); } return; }
  const n = node(drag.id); if (!n) return;
  n.x = Math.max(1.5, p.x / S); n.y = Math.max(1.5, p.y / S); drag.moved = true; render();
}
function onPointerUp() {
  if (panning) { $('svg').classList.remove('panning'); panning = null; }
  if (drag) { if (drag.moved) { persist(); if (!$('tablePanel').hidden) renderTable(); } drag = null; }
}
function selectMover(id) { selected = { kind: 'mover', id }; activateTab('inspect'); refreshAll(); }

/* ---- init --------------------------------------------------------------- */
function init() {
  const svg = $('svg');
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointermove', onHover);
  svg.addEventListener('pointerleave', () => { hoverNodeId = null; hideTip(); });
  window.addEventListener('pointerup', onPointerUp);
  // Setup drawer (the system builder)
  $('setupBtn').addEventListener('click', openSetup);
  $('setupApply').addEventListener('click', applySetup);
  $('setupCancel').addEventListener('click', closeSetup);
  $('setupDrawer').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeSetup(); });
  document.querySelectorAll('.setup-nav a').forEach((a) => a.addEventListener('click', () => {   // rail step nav → jump to a section
    const t = document.getElementById(a.dataset.target); if (!t) return;
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('.setup-nav a').forEach((x) => x.classList.toggle('on', x === a));
  }));
  // BOM magnify modal close (Done, backdrop, Escape)
  $('bomDone').addEventListener('click', closeBomModal);
  $('bomModal').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeBomModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('bomModal').hidden) closeBomModal(); else if (setupOpen()) closeSetup(); } });
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

  let deep = false;
  if (location.hash === '#example') { loadExample(); const r = model.nodes.find((n) => n.kind === 'resource'); if (r) selected = { kind: 'node', id: r.id }; deep = true; }
  else if (location.hash === '#example2') { loadExample2(); const b = model.nodes.find((n) => n.kind === 'storage'); if (b) selected = { kind: 'node', id: b.id }; deep = true; }   // bottleneck + buffer demo
  else if (location.hash === '#example3') { loadExample3(); const b = model.nodes.find((n) => n.kind === 'resource' && n.batch && n.batch.on); if (b) selected = { kind: 'node', id: b.id }; deep = true; }   // batch-processing demo
  else if (location.hash === '#example4') { loadExample4(); deep = true; }   // assembly / multi-part demo
  else if (location.hash === '#example5') { loadExample5(); deep = true; }   // 3-level BOM, sub-assembly also sold
  else if (location.hash === '#example6') { loadExample6(); deep = true; }   // Phase 3.6 transport showcase
  else if (location.hash === '#example7') { loadExample7(); deep = true; }   // the works (most intricate)
  else if (location.hash === '#example8') { loadExample8(); deep = true; }   // grand demo: groups + convergence + cell
  if (model.movers.length || ['agv', 'operator'].includes(model.defaultMover) || Object.values(model.legs).some((l) => l.mover === 'agv' || l.mover === 'operator')) ensureMoverAssumption();
  render(); renderInspector(); renderTransport(); renderBomInset();
  activateTab('inspect'); setPlayLabel(); updateClock(); zoomFit();
  if (['#play', '#example2', '#example3', '#example4', '#example5', '#example6', '#example7', '#example8'].includes(location.hash)) { if (!model.parts.some((p) => p.route.length >= 2)) loadExample(); play(); }   // deep-link: open running
  else if (!deep && model.nodes.length === 0) openSetup();   // empty model → start in the system builder
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
