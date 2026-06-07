/* 2D floor builder (Milestone 3.1): place nodes, define a linear route, and run
   the transport-aware engine to see how placement affects performance.
   Persists into the shared study project at `project.model` (des-floor/v1). */

import { load, save, uid, newAssumption } from './project.js';
import { FloorSim, legDistance } from '../../src/floor-engine.js';
import { newDist } from '../../src/distributions.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 10;                 // px per metre (display); model coords are metres
const $ = (id) => document.getElementById(id);

let project = load();
let model = ensureModel(project.model);
let tool = 'move';
let selected = null;
let drag = null;              // { id, moved }

function ensureModel(m) {
  const base = { defaultMover: 'instant', conveyor: { cap: 3, speed: 30 }, workers: { count: 2, speed: 40 } };
  if (m && m.schema === 'des-floor/v1') {
    m.nodes = m.nodes || []; m.routeOrder = m.routeOrder || [];
    m.params = m.params || { speed: 40, arrivalMean: 3 };
    m.defaultMover = m.defaultMover || base.defaultMover;
    m.conveyor = m.conveyor || base.conveyor;
    m.workers = m.workers || base.workers;
    return m;
  }
  return { schema: 'des-floor/v1', scale: S, units: { time: 'min', distance: 'm', speed: 'm/min' },
    nodes: [], routeOrder: [], params: { speed: 40, arrivalMean: 3 }, ...base };
}
function persist() { project.model = model; save(project); }

/* ---- geometry helpers --------------------------------------------------- */
const px = (m) => m * S;
function node(id) { return model.nodes.find((n) => n.id === id); }
function svgPoint(e) {
  const svg = $('svg'); const pt = svg.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: loc.x, y: loc.y };               // viewBox px
}

/* ---- SVG element helper ------------------------------------------------- */
function E(tag, attrs = {}, kids = []) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  for (const c of [].concat(kids)) if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}

/* ---- render ------------------------------------------------------------- */
function render() {
  const svg = $('svg'); svg.innerHTML = '';
  // faint dotted grid (every 5 m)
  const grid = E('g', {});
  for (let x = 0; x <= 820; x += 5 * S) for (let y = 0; y <= 520; y += 5 * S) grid.append(E('circle', { cx: x, cy: y, r: 0.8, class: 'grid-dot' }));
  svg.append(grid);

  // legs (route order), beneath nodes — line style conveys the mover
  const legG = E('g', {});
  const mover = model.defaultMover;
  const legSpeed = mover === 'conveyor' ? (model.conveyor.speed || 30)
    : mover === 'worker' ? (model.workers.speed || 40) : (model.params.speed || 40);
  const cls = mover === 'conveyor' ? 'leg leg-conv' : mover === 'worker' ? 'leg leg-worker' : 'leg';
  for (let i = 0; i < model.routeOrder.length - 1; i++) {
    const a = node(model.routeOrder[i]), b = node(model.routeOrder[i + 1]);
    if (!a || !b) continue;
    const ax = px(a.x), ay = px(a.y), bx = px(b.x), by = px(b.y);
    legG.append(E('line', { class: cls, x1: ax, y1: ay, x2: bx, y2: by }));
    const dist = legDistance(a, b);
    const tt = (legSpeed > 0 ? dist / legSpeed : 0);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (mover === 'worker' && dist > 0.5) {        // small worker marker mid-leg
      legG.append(E('circle', { class: 'worker-mark', cx: mx, cy: my, r: 6 }));
      legG.append(E('text', { class: 'worker-mark-t', x: mx, y: my + 3, 'text-anchor': 'middle' }, 'W'));
    }
    if (dist > 0.5) legG.append(E('text', { class: 'leg-label', x: mx + 9, y: my - 6 }, `${dist.toFixed(0)} m · ${tt.toFixed(1)} min`));
  }
  svg.append(legG);

  // nodes
  for (const n of model.nodes) svg.append(nodeEl(n));
}

function nodeEl(n) {
  const g = E('g', { class: 'node' + (selected === n.id ? ' sel' : ''), 'data-node': n.id, transform: `translate(${px(n.x)},${px(n.y)})` });
  if (n.kind === 'resource') {
    g.append(E('rect', { class: 'node-rect', x: -34, y: -22, width: 68, height: 44, rx: 6 }));
    g.append(E('text', { class: 'node-kind', x: 0, y: -8, 'text-anchor': 'middle' }, `RESOURCE · ${n.machines || 1}m`));
    g.append(E('text', { class: 'node-label', x: 0, y: 9, 'text-anchor': 'middle' }, n.name || 'Resource'));
  } else if (n.kind === 'storage') {
    g.append(E('path', { class: 'bracket', d: 'M -22 -18 l -7 0 l 0 36 l 7 0' }));
    g.append(E('path', { class: 'bracket', d: 'M 22 -18 l 7 0 l 0 36 l -7 0' }));
    g.append(E('text', { class: 'node-kind', x: 0, y: -2, 'text-anchor': 'middle' }, 'WIP'));
    g.append(E('text', { class: 'node-label', x: 0, y: 32, 'text-anchor': 'middle' }, n.name || 'Storage'));
  } else { // source / sink
    g.append(E('circle', { class: 'endpoint', r: 15 }));
    g.append(E('circle', { class: 'endpoint-dot', r: 4 }));
    g.append(E('text', { class: 'node-kind', x: 0, y: 30, 'text-anchor': 'middle' }, n.kind.toUpperCase()));
    g.append(E('text', { class: 'node-label', x: 0, y: 43, 'text-anchor': 'middle' }, n.name || (n.kind === 'source' ? 'In' : 'Out')));
  }
  return g;
}

/* ---- route list + properties ------------------------------------------- */
function renderRoute() {
  const ul = $('routeList'); ul.innerHTML = '';
  model.routeOrder.forEach((id, i) => {
    const n = node(id); if (!n) return;
    const li = document.createElement('li');
    if (selected === id) li.className = 'sel';
    li.innerHTML = `<span class="rn">${i + 1}</span><span class="rname"></span><span class="rk">${n.kind}</span>`;
    li.querySelector('.rname').textContent = n.name || n.kind;
    const up = mini('↑', () => moveInRoute(i, -1));
    const dn = mini('↓', () => moveInRoute(i, +1));
    const rm = mini('✕', () => removeNode(id));
    li.append(up, dn, rm);
    li.addEventListener('click', (e) => { if (e.target.classList.contains('mini')) return; selectNode(id); });
    ul.append(li);
  });
  $('routeHint').textContent = model.nodes.length
    ? 'Order = flow direction. The first node is where jobs enter, the last is where they leave.'
    : 'No nodes yet. Pick a tool above and click the canvas.';
  renderProps();
}
function mini(label, on) { const b = document.createElement('button'); b.className = 'mini'; b.textContent = label; b.addEventListener('click', (e) => { e.stopPropagation(); on(); }); return b; }

function renderProps() {
  const panel = $('propPanel'), grid = $('propGrid');
  const n = selected ? node(selected) : null;
  if (!n) { panel.hidden = true; return; }
  panel.hidden = false;
  $('propTitle').textContent = n.name || n.kind;
  grid.innerHTML = '';
  grid.append(field('Name', textInput(n.name || '', (v) => { n.name = v; persist(); render(); renderRoute(); }), true));
  if (n.kind === 'resource') {
    grid.append(field('Machines', numInput(n.machines || 1, 1, 1, (v) => { n.machines = Math.max(1, v | 0); persist(); render(); })));
    grid.append(field('Service mean (min)', numInput(n.serviceMean ?? 1, 0.1, 0.1, (v) => { n.serviceMean = Math.max(0.01, v); persist(); })));
  } else if (n.kind === 'storage') {
    grid.append(field('Capacity', numInput(n.cap ?? 10, 1, 1, (v) => { n.cap = Math.max(1, v | 0); persist(); })));
  }
}
function field(label, input, full) {
  const d = document.createElement('div'); d.className = 'field' + (full ? ' full' : '');
  const l = document.createElement('label'); l.textContent = label; l.className = 'small';
  d.append(l, input); return d;
}
function textInput(v, on) { const i = document.createElement('input'); i.className = 'input'; i.type = 'text'; i.value = v; i.addEventListener('input', () => on(i.value)); return i; }
function numInput(v, min, step, on) { const i = document.createElement('input'); i.className = 'input num'; i.type = 'number'; i.value = v; i.min = min; i.step = step; i.addEventListener('input', () => on(parseFloat(i.value))); return i; }

/* ---- transport (movers) panel ------------------------------------------ */
function renderMoverPanel() {
  $('moverSel').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mover === model.defaultMover)));
  const params = $('moverParams'); params.innerHTML = '';
  const hint = $('moverHint');
  if (model.defaultMover === 'conveyor') {
    params.append(field('Capacity (items)', numInput(model.conveyor.cap ?? 3, 1, 1, (v) => { model.conveyor.cap = Math.max(1, v | 0); persist(); render(); })));
    params.append(field('Speed (m/min)', numInput(model.conveyor.speed ?? 30, 1, 5, (v) => { model.conveyor.speed = Math.max(1, v); persist(); render(); })));
    hint.textContent = 'A fixed link: items ride length ÷ speed. When the downstream buffer is full the belt backs up and blocks the upstream resource.';
  } else if (model.defaultMover === 'worker') {
    params.append(field('Workers', numInput(model.workers.count ?? 2, 1, 1, (v) => { model.workers.count = Math.max(1, v | 0); persist(); render(); })));
    params.append(field('Speed (m/min)', numInput(model.workers.speed ?? 40, 1, 5, (v) => { model.workers.speed = Math.max(1, v); persist(); render(); })));
    hint.textContent = 'A shared pool: each move seizes a worker for the one-way trip. Too few workers queue moves. Empty return trips are ignored — logged as a simplification in Methodology.';
  } else {
    hint.textContent = 'Uncapacitated time delay = distance ÷ speed (set Speed in the toolbar). No mover limits — useful as a baseline before adding constraints.';
  }
}
function setMover(m) {
  model.defaultMover = m;
  if (m === 'worker') ensureWorkerAssumption();
  persist(); renderMoverPanel(); render();
}
function ensureWorkerAssumption() {
  if (!project.assumptions.some((a) => a.id === 'a_worker_return')) {
    project.assumptions.push(newAssumption({
      id: 'a_worker_return', kind: 'simplification',
      description: 'Worker empty-return travel is ignored — only one-way loaded trips are modelled.',
      rationale: 'Out of v1 scope (Charter §6). Ignoring it understates worker utilisation, so it is flagged for sensitivity analysis later.',
      data: 'C', uncertainty: 'Real empty-return time depends on layout and dispatch.', sensitivity: true,
    }));
    save(project);
  }
}

/* ---- mutations ---------------------------------------------------------- */
function addNode(kind, x, y) {
  const idp = { resource: 'res', storage: 'sto', source: 'src', sink: 'snk' }[kind] || 'n';
  const n = { kind, id: uid(idp), name: '', x, y };
  if (kind === 'resource') { n.machines = 1; n.serviceMean = 1; }
  if (kind === 'storage') n.cap = 10;
  model.nodes.push(n); model.routeOrder.push(n.id);
  selected = n.id; persist(); render(); renderRoute();
}
function removeNode(id) {
  model.nodes = model.nodes.filter((n) => n.id !== id);
  model.routeOrder = model.routeOrder.filter((x) => x !== id);
  if (selected === id) selected = null;
  persist(); render(); renderRoute();
}
function moveInRoute(i, d) {
  const j = i + d; if (j < 0 || j >= model.routeOrder.length) return;
  const a = model.routeOrder; [a[i], a[j]] = [a[j], a[i]];
  persist(); render(); renderRoute();
}
function selectNode(id) { selected = id; render(); renderRoute(); }

/* ---- pointer interaction ------------------------------------------------ */
function onPointerDown(e) {
  const svg = $('svg');
  const grp = e.target.closest('[data-node]');
  const p = svgPoint(e);
  if (tool === 'move') {
    if (grp) { const id = grp.getAttribute('data-node'); selectNode(id);
      drag = { id, moved: false }; svg.setPointerCapture(e.pointerId); grp.classList.add('dragging'); }
  } else {
    if (!grp) addNode(tool, p.x / S, p.y / S);     // place at clicked metres
  }
}
function onPointerMove(e) {
  if (!drag) return;
  const p = svgPoint(e); const n = node(drag.id); if (!n) return;
  n.x = Math.max(1.5, Math.min(80, p.x / S));
  n.y = Math.max(1.5, Math.min(50, p.y / S));
  drag.moved = true; render();
}
function onPointerUp() {
  if (drag) { const g = $('svg').querySelector(`[data-node="${drag.id}"]`); if (g) g.classList.remove('dragging'); if (drag.moved) persist(); drag = null; }
}

/* ---- run ---------------------------------------------------------------- */
function buildRunModel() {
  const speed = model.params.speed, arr = model.params.arrivalMean;
  const nodes = model.nodes.map((n) => n.kind === 'resource'
    ? { kind: 'resource', id: n.id, name: n.name, x: n.x, y: n.y, machines: n.machines || 1, service: newDist('exp', { mean: n.serviceMean || 1 }) }
    : { kind: n.kind, id: n.id, name: n.name, x: n.x, y: n.y, cap: n.cap });
  const transport = { default: model.defaultMover, speed, legs: {} };
  if (model.defaultMover === 'conveyor') transport.conveyor = { cap: model.conveyor.cap, speed: model.conveyor.speed };
  if (model.defaultMover === 'worker') transport.workers = { count: model.workers.count, speed: model.workers.speed };
  return {
    schema: 'des-floor/v1', scale: S, units: model.units,
    nodes, parts: [{ id: 'p', kind: 'product', routing: model.routeOrder.slice(), demand: newDist('exp', { mean: arr }) }],
    transport,
  };
}
function runModel() {
  const results = $('results');
  if (model.routeOrder.length < 2) { results.innerHTML = '<p class="results-empty">Add at least two nodes (e.g. a source and a resource) and a route to run.</p>'; return; }
  const sim = new FloorSim(buildRunModel(), 1);
  sim.run({ until: 8000 });
  const r = sim.metrics();
  const f = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';
  const utilRows = model.nodes.filter((n) => n.kind === 'resource')
    .map((n) => `<tr><td></td><td class="num">${(100 * (r.utilisation[n.id] || 0)).toFixed(1)}%</td></tr>`);
  // fill resource names safely
  results.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="kpi"><div class="kpi__label">Throughput</div><div class="kpi__value num">${f(r.throughput, 3)}<span class="kpi__unit">/min</span></div></div>
      <div class="kpi"><div class="kpi__label">Cycle time</div><div class="kpi__value num">${f(r.avgCycleTime)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">In transport</div><div class="kpi__value num">${f(r.avgTransitPerJob)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">Avg WIP</div><div class="kpi__value num">${f(r.avgWIP)}</div></div>
    </div>
    <table class="table" style="margin-top:var(--s-4)"><thead><tr><th>Resource</th><th class="num">Utilisation</th></tr></thead><tbody id="utilBody"></tbody></table>
    <p class="floor-hint" style="margin-top:var(--s-3)">Transport is ${f(100 * r.avgTransitPerJob / (r.avgCycleTime || 1), 0)}% of cycle time. Move a node and re-run to see it change.</p>`;
  const tb = $('utilBody');
  model.nodes.filter((n) => n.kind === 'resource').forEach((n) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td></td><td class="num">${(100 * (r.utilisation[n.id] || 0)).toFixed(1)}%</td>`;
    tr.firstChild.textContent = n.name || 'Resource';
    tb.append(tr);
  });

  // transport summary (movers as constrained resources)
  const tRows = [];
  if (r.workers) {
    tRows.push(`<tr><td>Workers (${r.workers.count})</td><td class="num">${(100 * r.workers.utilisation).toFixed(1)}% util</td><td class="num">${r.workers.avgQueue.toFixed(2)} queued</td></tr>`);
  }
  const convVals = Object.values(r.conveyors || {});
  if (convVals.length) {
    const maxU = Math.max(...convVals.map((c) => c.utilisation));
    tRows.push(`<tr><td>Conveyor (busiest)</td><td class="num">${(100 * maxU).toFixed(1)}% full</td><td class="num">—</td></tr>`);
  }
  const blk = Math.max(0, ...Object.values(r.blockedFraction || {}));
  if (blk > 0.001) tRows.push(`<tr><td>Most-blocked resource</td><td class="num">${(100 * blk).toFixed(1)}% blocked</td><td class="num">—</td></tr>`);
  if (tRows.length) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Transport</p>
      <table class="table"><tbody>${tRows.join('')}</tbody></table>`;
    $('results').append(wrap);
  }
}

/* ---- example + clear ---------------------------------------------------- */
function loadExample() {
  model.nodes = [
    { kind: 'source', id: uid('src'), name: 'Raw in', x: 8, y: 26 },
    { kind: 'resource', id: uid('res'), name: 'Press', x: 26, y: 26, machines: 1, serviceMean: 2 },
    { kind: 'storage', id: uid('sto'), name: 'WIP', x: 44, y: 26, cap: 10 },
    { kind: 'resource', id: uid('res'), name: 'Inspect', x: 62, y: 26, machines: 1, serviceMean: 1.5 },
    { kind: 'sink', id: uid('snk'), name: 'Ship', x: 78, y: 26 },
  ];
  model.routeOrder = model.nodes.map((n) => n.id);
  selected = null; persist(); render(); renderRoute();
}
function clearFloor() { model.nodes = []; model.routeOrder = []; selected = null; persist(); render(); renderRoute(); $('results').innerHTML = '<p class="results-empty">Run the model to see throughput, cycle time, transport time and utilisation.</p>'; }

/* ---- wiring ------------------------------------------------------------- */
function init() {
  const svg = $('svg');
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);

  $('palette').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    tool = b.dataset.tool;
    $('palette').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  });

  const speed = $('speed'), arr = $('arr');
  speed.value = model.params.speed; arr.value = model.params.arrivalMean;
  speed.addEventListener('input', () => { model.params.speed = Math.max(1, parseFloat(speed.value) || 40); persist(); render(); });
  arr.addEventListener('input', () => { model.params.arrivalMean = Math.max(0.1, parseFloat(arr.value) || 3); persist(); });

  $('moverSel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMover(b.dataset.mover); });

  $('btnRun').addEventListener('click', runModel);
  $('btnSeed').addEventListener('click', loadExample);
  $('btnClear').addEventListener('click', clearFloor);

  if (location.hash === '#example' && model.nodes.length === 0) loadExample();
  if (model.defaultMover === 'worker') ensureWorkerAssumption();
  render(); renderRoute(); renderMoverPanel();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
