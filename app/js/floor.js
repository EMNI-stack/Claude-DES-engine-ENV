/* 2D floor builder. Place nodes, define a linear route, set full parameters per
   node and per transport leg, and run the transport-aware engine to see how the
   layout performs. Persists into the shared study project at `project.model`
   (des-floor/v1). Click any node or any leg to edit it; a table view gives an
   overview of every parameter. */

import { load, save, uid, newAssumption } from './project.js';
import { FloorSim, legDistance } from '../../src/floor-engine.js';
import { DISTS, newDist, distMean, distScv } from '../../src/distributions.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const S = 10;                 // px per metre (display); model coords are metres
const $ = (id) => document.getElementById(id);

let project = load();
let model = ensureModel(project.model);
let tool = 'move';
let selected = null;          // { kind:'node', id } | { kind:'leg', key } | null
let drag = null;

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
      if (!n.brk) n.brk = { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) };
    } else if (n.kind === 'source') {
      if (!n.interarrival) n.interarrival = newDist('exp', { mean: arr });
    } else if (n.kind === 'storage') {
      if (typeof n.cap !== 'number') n.cap = 10;
    }
  }
  return m;
}
function persist() { project.model = model; save(project); }

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

/* a bound distribution editor (type picker + parameter fields + mean/SCV) */
function distEditor(dist, onChange) {
  const wrap = H('div', { class: 'dist-ed' });
  function draw() {
    wrap.innerHTML = '';
    const sel = H('select', { class: 'select full' });
    for (const k of Object.keys(DISTS)) { const o = H('option', { value: k }, DISTS[k].label); if (k === dist.type) o.selected = true; sel.append(o); }
    sel.addEventListener('change', () => { dist.type = sel.value; const def = {}; for (const [key, , d] of DISTS[sel.value].f) def[key] = d; dist.params = def; onChange(); draw(); });
    wrap.append(field('Distribution', sel, true));
    const stat = H('div', { class: 'stat' });
    const refresh = () => { const m = distMean(dist), s = distScv(dist); stat.textContent = `mean ${isFinite(m) ? m.toFixed(2) : '—'} · SCV ${isFinite(s) ? s.toFixed(2) : '—'}`; };
    for (const [key, label, defv] of DISTS[dist.type].f) {
      wrap.append(field(label, numInput(dist.params[key] != null ? dist.params[key] : defv, 0, 0.1, (v) => { dist.params[key] = v; onChange(); refresh(); })));
    }
    wrap.append(stat); refresh();
  }
  draw(); return wrap;
}

/* ---- canvas render ------------------------------------------------------ */
function render() {
  const svg = $('svg'); svg.innerHTML = '';
  const grid = E('g', {});
  for (let x = 0; x <= 820; x += 5 * S) for (let y = 0; y <= 520; y += 5 * S) grid.append(E('circle', { cx: x, cy: y, r: 0.8, class: 'grid-dot' }));
  svg.append(grid);

  const legG = E('g', {});
  for (let i = 0; i < model.routeOrder.length - 1; i++) {
    const a = node(model.routeOrder[i]), b = node(model.routeOrder[i + 1]); if (!a || !b) continue;
    const key = legKeyAt(i), mover = effMover(key);
    const ax = px(a.x), ay = px(a.y), bx = px(b.x), by = px(b.y);
    const cls = 'leg ' + (mover === 'conveyor' ? 'leg-conv' : mover === 'worker' ? 'leg-worker' : '') + (selected && selected.kind === 'leg' && selected.key === key ? ' sel' : '');
    legG.append(E('line', { class: cls.trim(), x1: ax, y1: ay, x2: bx, y2: by }));
    legG.append(E('line', { class: 'leg-hit', 'data-leg': key, x1: ax, y1: ay, x2: bx, y2: by }));
    const dist = legDistance(a, b), tt = legSpeedFor(key, mover) > 0 ? dist / legSpeedFor(key, mover) : 0;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (mover === 'worker' && dist > 0.5) { legG.append(E('circle', { class: 'worker-mark', cx: mx, cy: my, r: 6 })); legG.append(E('text', { class: 'worker-mark-t', x: mx, y: my + 3, 'text-anchor': 'middle' }, 'W')); }
    if (dist > 0.5) legG.append(E('text', { class: 'leg-label', x: mx + 9, y: my - 6 }, `${dist.toFixed(0)} m · ${tt.toFixed(1)} min`));
  }
  svg.append(legG);
  for (const n of model.nodes) svg.append(nodeEl(n));
}
function nodeEl(n) {
  const sel = selected && selected.kind === 'node' && selected.id === n.id;
  const g = E('g', { class: 'node' + (sel ? ' sel' : ''), 'data-node': n.id, transform: `translate(${px(n.x)},${px(n.y)})` });
  if (n.kind === 'resource') {
    g.append(E('rect', { class: 'node-rect', x: -34, y: -22, width: 68, height: 44, rx: 6 }));
    g.append(E('text', { class: 'node-kind', x: 0, y: -8, 'text-anchor': 'middle' }, `RESOURCE · ${n.machines || 1}m`));
    g.append(E('text', { class: 'node-label', x: 0, y: 9, 'text-anchor': 'middle' }, n.name || 'Resource'));
  } else if (n.kind === 'storage') {
    g.append(E('path', { class: 'bracket', d: 'M -22 -18 l -7 0 l 0 36 l 7 0' }));
    g.append(E('path', { class: 'bracket', d: 'M 22 -18 l 7 0 l 0 36 l -7 0' }));
    g.append(E('text', { class: 'node-kind', x: 0, y: -2, 'text-anchor': 'middle' }, 'WIP'));
    g.append(E('text', { class: 'node-label', x: 0, y: 32, 'text-anchor': 'middle' }, n.name || 'Storage'));
  } else {
    g.append(E('circle', { class: 'endpoint', r: 15 }));
    g.append(E('circle', { class: 'endpoint-dot', r: 4 }));
    g.append(E('text', { class: 'node-kind', x: 0, y: 30, 'text-anchor': 'middle' }, n.kind.toUpperCase()));
    g.append(E('text', { class: 'node-label', x: 0, y: 43, 'text-anchor': 'middle' }, n.name || (n.kind === 'source' ? 'In' : 'Out')));
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
  const panel = $('propPanel'), body = $('propBody');
  if (!selected) { panel.hidden = true; return; }
  panel.hidden = false; body.innerHTML = '';
  if (selected.kind === 'node') inspectNode(node(selected.id), body);
  else inspectLeg(selected.key, body);
}
function inspectNode(n, body) {
  if (!n) { $('propPanel').hidden = true; return; }
  $('propKind').textContent = n.kind;
  $('propTitle').textContent = n.name || n.kind[0].toUpperCase() + n.kind.slice(1);
  body.append(field('Name', textInput(n.name || '', (v) => { n.name = v; persist(); render(); renderRoute(); })));
  if (n.kind === 'resource') {
    body.append(field('Machines (parallel)', numInput(n.machines || 1, 1, 1, (v) => { n.machines = Math.max(1, v | 0); persist(); render(); })));
    body.append(H('p', { class: 'subhead' }, 'Service time'));
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
  body.append(H('p', { class: 'small', style: 'margin:0' }, `Distance ${legDistance(from, to).toFixed(0)} m · this leg’s travel = distance ÷ speed.`));
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
    const svc = n.kind === 'resource' ? `${DISTS[n.service.type].label} · μ=${distMean(n.service).toFixed(2)}${n.scrap ? ` · scrap ${(n.scrap * 100).toFixed(0)}%` : ''}${n.brk.on ? ' · brk' : ''}` : n.kind === 'storage' ? `cap ${n.cap}` : n.kind === 'source' ? `${DISTS[n.interarrival.type].label} · μ=${distMean(n.interarrival).toFixed(2)}` : '—';
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
function selectNode(id) { selected = { kind: 'node', id }; refreshAll(); }
function selectLeg(key) { selected = { kind: 'leg', key }; refreshAll(); }
function refreshAll() { render(); renderRoute(); renderInspector(); if (!$('tablePanel').hidden) renderTable(); }

function addNode(kind, x, y) {
  const idp = { resource: 'res', storage: 'sto', source: 'src', sink: 'snk' }[kind] || 'n';
  const n = { kind, id: uid(idp), name: '', x, y };
  if (kind === 'resource') { n.machines = 1; n.service = newDist('exp', { mean: 1 }); n.buffer = { finite: false, cap: 10, init: 0, target: 8 }; n.scrap = 0; n.brk = { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) }; }
  if (kind === 'storage') n.cap = 10;
  if (kind === 'source') n.interarrival = newDist('exp', { mean: 3 });
  model.nodes.push(n); model.routeOrder.push(n.id);
  selected = { kind: 'node', id: n.id }; persist(); refreshAll();
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

/* ---- run ---------------------------------------------------------------- */
function buildRunModel() {
  const nodes = model.nodes.map((n) => n.kind === 'resource'
    ? { kind: 'resource', id: n.id, name: n.name, x: n.x, y: n.y, machines: n.machines || 1, service: n.service, bufferCap: n.buffer.finite ? n.buffer.cap : Infinity, scrap: n.scrap || 0, brk: n.brk }
    : { kind: n.kind, id: n.id, name: n.name, x: n.x, y: n.y, cap: n.cap });
  const src = model.nodes.find((n) => n.kind === 'source');
  const demand = src ? src.interarrival : newDist('exp', { mean: 3 });
  const transport = { default: model.defaultMover, speed: model.defaultSpeed, conveyor: model.conveyor, workers: model.workers, legs: model.legs };
  return { schema: 'des-floor/v1', scale: S, units: model.units, nodes,
    parts: [{ id: 'p', kind: 'product', routing: model.routeOrder.slice(), demand }], transport,
    control: model.control, conwipCap: model.conwipCap, supply: model.supply,
    demand: model.demand.mode === 'stream' ? { mode: 'stream', dist: model.demand.dist } : { mode: 'instant' } };
}
function runModel() {
  const results = $('results');
  if (model.routeOrder.length < 2) { results.innerHTML = '<p class="results-empty">Add at least two nodes and a route to run.</p>'; return; }
  const sim = new FloorSim(buildRunModel(), 1); sim.run({ until: 8000 });
  const r = sim.metrics(); const f = (x, d = 2) => Number.isFinite(x) ? x.toFixed(d) : '—';
  results.innerHTML = `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="kpi"><div class="kpi__label">Throughput</div><div class="kpi__value num">${f(r.throughput, 3)}<span class="kpi__unit">/min</span></div></div>
      <div class="kpi"><div class="kpi__label">Cycle time</div><div class="kpi__value num">${f(r.avgCycleTime)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">In transport</div><div class="kpi__value num">${f(r.avgTransitPerJob)}<span class="kpi__unit">min</span></div></div>
      <div class="kpi"><div class="kpi__label">Avg WIP</div><div class="kpi__value num">${f(r.avgWIP)}</div></div>
      <div class="kpi"><div class="kpi__label">Yield</div><div class="kpi__value num">${(100 * r.yield).toFixed(1)}<span class="kpi__unit">%</span></div></div>
    </div>
    <table class="table" style="margin-top:var(--s-4)"><thead><tr><th>Resource</th><th class="num">Util</th><th class="num">Down</th><th class="num">Blocked</th></tr></thead><tbody id="utilBody"></tbody></table>`;
  const tb = $('utilBody');
  model.nodes.filter((n) => n.kind === 'resource').forEach((n) => { const tr = H('tr', {}); tr.innerHTML = `<td></td><td class="num">${(100 * (r.utilisation[n.id] || 0)).toFixed(1)}%</td><td class="num">${(100 * (r.downFraction[n.id] || 0)).toFixed(1)}%</td><td class="num">${(100 * (r.blockedFraction[n.id] || 0)).toFixed(1)}%</td>`; tr.firstChild.textContent = n.name || 'Resource'; tb.append(tr); });
  const tRows = [];
  if (r.workers) tRows.push(`<tr><td>Workers (${r.workers.count})</td><td class="num">${(100 * r.workers.utilisation).toFixed(1)}% util</td><td class="num">${r.workers.avgQueue.toFixed(2)} queued</td></tr>`);
  const conv = Object.values(r.conveyors || {}); if (conv.length) tRows.push(`<tr><td>Conveyor (busiest)</td><td class="num">${(100 * Math.max(...conv.map((c) => c.utilisation))).toFixed(1)}% full</td><td class="num">—</td></tr>`);
  const blk = Math.max(0, ...Object.values(r.blockedFraction || {})); if (blk > 0.001) tRows.push(`<tr><td>Most-blocked resource</td><td class="num">${(100 * blk).toFixed(1)}% blocked</td><td class="num">—</td></tr>`);
  if (tRows.length) results.append(H('div', { html: `<p class="section-label" style="margin:var(--s-4) 0 var(--s-2)">Transport</p><table class="table"><tbody>${tRows.join('')}</tbody></table>` }));
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
    mk('resource', 'Press', 26, { machines: 1, service: newDist('lognormal', { mean: 2, sd: 0.5 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) } }),
    mk('storage', 'WIP', 44, { cap: 10 }),
    mk('resource', 'Inspect', 62, { machines: 1, service: newDist('triangular', { min: 0.8, mode: 1.2, max: 2 }), buffer: { finite: false, cap: 10, init: 0, target: 8 }, scrap: 0, brk: { on: false, ttf: newDist('weibull', { shape: 1.5, scale: 40 }), ttr: newDist('exp', { mean: 4 }) } }),
    mk('sink', 'Ship', 78),
  ];
  model.routeOrder = model.nodes.map((n) => n.id); model.legs = {}; selected = null; persist(); refreshAll();
}
function clearFloor() { model.nodes = []; model.routeOrder = []; model.legs = {}; selected = null; persist(); refreshAll(); $('results').innerHTML = '<p class="results-empty">Run the model to see throughput, cycle time, transport time and utilisation.</p>'; }

/* ---- pointer interaction ------------------------------------------------ */
function onPointerDown(e) {
  const svg = $('svg'); const grp = e.target.closest('[data-node]'); const legHit = e.target.closest('[data-leg]'); const p = svgPoint(e);
  if (tool === 'move') {
    if (grp) { const id = grp.getAttribute('data-node'); selectNode(id); drag = { id, moved: false }; svg.setPointerCapture(e.pointerId); }
    else if (legHit) selectLeg(legHit.getAttribute('data-leg'));
  } else if (!grp && !legHit) addNode(tool, p.x / S, p.y / S);
}
function onPointerMove(e) { if (!drag) return; const p = svgPoint(e); const n = node(drag.id); if (!n) return;
  n.x = Math.max(1.5, Math.min(80, p.x / S)); n.y = Math.max(1.5, Math.min(50, p.y / S)); drag.moved = true; render(); }
function onPointerUp() { if (drag) { if (drag.moved) { persist(); if (!$('tablePanel').hidden) renderTable(); } drag = null; } }

/* ---- init --------------------------------------------------------------- */
function init() {
  const svg = $('svg');
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  $('palette').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; tool = b.dataset.tool; $('palette').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('btnRun').addEventListener('click', runModel);
  $('btnSeed').addEventListener('click', loadExample);
  $('btnClear').addEventListener('click', clearFloor);
  $('btnTable').addEventListener('click', () => { const p = $('tablePanel'); p.hidden = !p.hidden; $('btnTable').setAttribute('aria-pressed', String(!p.hidden)); if (!p.hidden) renderTable(); });

  if (location.hash === '#example' && model.nodes.length === 0) { loadExample(); const r = model.nodes.find((n) => n.kind === 'resource'); if (r) selected = { kind: 'node', id: r.id }; }
  if (model.defaultMover === 'worker' || Object.values(model.legs).some((l) => l.mover === 'worker')) ensureWorkerAssumption();
  render(); renderRoute(); renderInspector(); renderTransport(); renderControl();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
