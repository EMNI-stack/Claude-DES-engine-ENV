// Floor-engine PROCESS-MODEL tests — Phase 3.5. Multi-part / BOM / assembly /
// per-product supply-demand-control, reproduced on the transport-aware floor engine
// (logic ported from the validated src/advanced-engine.js). Existing single-part
// suites stay green; these exercise the new multi-part path. See docs/PHASE-3-5-DESIGN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

const C = (v) => newDist('const', { value: v });
const at = (id, x = 0, y = 0) => ({ x, y });

/* A widget = 1 body (fabricated: srcBody→Cut→Assy) + N bolts (purchased: srcBolt→Assy),
   assembled at Assy, then shipped. All nodes co-located (instant, zero travel) unless
   coords are passed. Supply stream by default; control push, demand instant. */
function widgetFactory({ bolts = 4, bodyArr = C(2), boltArr = C(0.4), assy = C(1), cut = C(1),
  control = 'push', supply = 'stream', demand = null, coords = {} } = {}) {
  const xy = (id) => coords[id] || { x: 0, y: 0 };
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 10, legs: {} },
    control, supply,
    nodes: [
      { kind: 'source', id: 'srcBody', ...xy('srcBody') },
      { kind: 'source', id: 'srcBolt', ...xy('srcBolt') },
      { kind: 'resource', id: 'Cut', name: 'Cut', machines: 1, service: cut, ...xy('Cut') },
      { kind: 'resource', id: 'Assy', name: 'Assy', machines: 1, service: assy, ...xy('Assy') },
      { kind: 'sink', id: 'Ship', ...xy('Ship') },
    ],
    parts: [
      { id: 'body', name: 'Body', kind: 'fabricated', arrival: bodyArr, routing: ['srcBody', 'Cut', 'Assy'] },
      { id: 'bolt', name: 'Bolt', kind: 'purchased', arrival: boltArr, routing: ['srcBolt', 'Assy'] },
      { id: 'widget', name: 'Widget', kind: 'product', bom: [{ partId: 'body', qty: 1 }, { partId: 'bolt', qty: bolts }],
        routing: ['Assy', 'Ship'] },
    ],
    demand: demand || [],
  };
}

test('assembly never starts without all BOM components (no negative inventory)', () => {
  // Bodies are the scarce input (mean 2) vs plentiful bolts (mean 0.4). Widgets are paced by bodies.
  const sim = new FloorSim(widgetFactory({ bolts: 4 }), 1);
  sim.run({ until: 4000 });
  for (const pid in sim.inventory) assert.ok(sim.inventory[pid] >= 0, `inventory ${pid} negative: ${sim.inventory[pid]}`);
  const w = sim.pstats.widget.completed;
  assert.ok(w > 100, `expected widgets assembled, got ${w}`);
  assert.ok(w <= sim.pstats.body.completed, `widgets ${w} cannot exceed bodies produced ${sim.pstats.body.completed}`);
});

test('BOM quantities respected: components consumed = qty × products assembled', () => {
  const sim = new FloorSim(widgetFactory({ bolts: 4 }), 3);
  sim.run({ until: 4000 });
  const widgetsStarted = sim.pstats.widget.created;     // each created widget consumed its BOM
  assert.equal(sim.bomConsumed.widget.body, widgetsStarted * 1, 'one body per widget');
  assert.equal(sim.bomConsumed.widget.bolt, widgetsStarted * 4, 'four bolts per widget');
});

test('conservation holds with multiple parts + assembly (created = completed + scrapped + WIP)', () => {
  const f = widgetFactory({ bolts: 4 });
  f.nodes.find((n) => n.id === 'Cut').scrap = 0.1;       // scrap on the body line
  const sim = new FloorSim(f, 7);
  sim.run({ until: 4000 });
  assert.ok(sim.scrapped > 10, `expected scrap, got ${sim.scrapped}`);
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip,
    `conservation: ${sim.entered} != ${sim.completed} + ${sim.scrapped} + ${sim.wip}`);
});

test('per-product demand uses its OWN interarrival distribution', () => {
  // Two independent products, demand means 2 and 8 → demand counts in ~4:1 ratio.
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 10, legs: {} }, control: 'push', supply: 'stream',
    nodes: [
      { kind: 'source', id: 'sP', x: 0, y: 0 }, { kind: 'source', id: 'sQ', x: 0, y: 0 },
      { kind: 'resource', id: 'MP', name: 'MP', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'resource', id: 'MQ', name: 'MQ', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'sink', id: 'out', x: 0, y: 0 },
    ],
    parts: [
      { id: 'P', name: 'P', kind: 'fabricated', arrival: C(1), routing: ['sP', 'MP', 'out'] },
      { id: 'Q', name: 'Q', kind: 'fabricated', arrival: C(1), routing: ['sQ', 'MQ', 'out'] },
    ],
    demand: [
      { partId: 'P', dist: newDist('exp', { mean: 2 }), qty: 1 },
      { partId: 'Q', dist: newDist('exp', { mean: 8 }), qty: 1 },
    ],
  };
  const sim = new FloorSim(m, 5);
  sim.run({ until: 40000 });
  const dP = sim.demandStats.P.demanded, dQ = sim.demandStats.Q.demanded;
  const ratio = dP / dQ;
  assert.ok(ratio > 3.3 && ratio < 4.7, `P:Q demand ratio ${ratio.toFixed(2)} should be ~4 (own dists)`);
});

test('per-product CONWIP bounds hold (pull caps each product\'s in-flight WIP)', () => {
  const sim = new FloorSim(widgetFactory({ bolts: 2, control: 'pull', supply: 'limitless',
    demand: [{ partId: 'widget', dist: newDist('exp', { mean: 1.5 }), qty: 1, conwip: 3 }] }), 2);
  let maxW = 0;
  for (let i = 0; i < 60000 && sim.fel.length; i++) { sim.step(); if (sim.pstats.widget.wip > maxW) maxW = sim.pstats.widget.wip; }
  assert.ok(maxW <= 3, `widget in-flight WIP ${maxW} must not exceed its CONWIP cap 3`);
  assert.ok(sim.pstats.widget.completed > 50, `pull line should still produce, got ${sim.pstats.widget.completed}`);
});

test('shared-component fairness: neither product monopolises a scarce shared component', () => {
  // Two products X, Y each need 1 unit of shared component S (slow supply). Round-robin
  // assembly should split S between them rather than starving one.
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 10, legs: {} }, control: 'push', supply: 'stream',
    nodes: [
      { kind: 'source', id: 'sS', x: 0, y: 0 },
      { kind: 'resource', id: 'Ax', name: 'Ax', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'resource', id: 'Ay', name: 'Ay', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'sink', id: 'out', x: 0, y: 0 },
    ],
    parts: [
      { id: 'S', name: 'S', kind: 'purchased', arrival: C(1), routing: ['sS', 'Ax'] },  // S delivered to Ax... see note
      { id: 'X', name: 'X', kind: 'product', bom: [{ partId: 'S', qty: 1 }], routing: ['Ax', 'out'] },
      { id: 'Y', name: 'Y', kind: 'product', bom: [{ partId: 'S', qty: 1 }], routing: ['Ay', 'out'] },
    ],
    demand: [],
  };
  // S is a pure component; its single route can only deposit at one assembly node, but the
  // GLOBAL inventory pool (E2) is shared, so both X and Y draw from it with round-robin fairness.
  const sim = new FloorSim(m, 4);
  sim.run({ until: 6000 });
  const x = sim.pstats.X.completed, y = sim.pstats.Y.completed;
  assert.ok(x > 100 && y > 100, `both products must be made, got X=${x} Y=${y}`);
  assert.ok(Math.abs(x - y) / (x + y) < 0.15, `shared component should be split fairly: X=${x} Y=${y}`);
});

test("Little's Law holds including transport (overall WIP = TH × CT)", () => {
  // Give the body line real travel distance so transport is part of cycle time.
  const coords = { srcBody: { x: 0, y: 0 }, Cut: { x: 100, y: 0 }, Assy: { x: 200, y: 0 },
    srcBolt: { x: 200, y: 0 }, Ship: { x: 300, y: 0 } };
  const m = widgetFactory({ bolts: 2, bodyArr: newDist('exp', { mean: 2 }),
    boltArr: newDist('exp', { mean: 0.8 }), assy: newDist('exp', { mean: 1 }), cut: newDist('exp', { mean: 1 }), coords });
  m.transport.default = 'conveyor'; m.transport.speed = 10;   // Phase 3.6: instant is now zero-time, so use a timed mover for the transport-contributes assertion
  const sim = new FloorSim(m, 9);
  sim.run({ until: 40000 });
  const r = sim.metrics();
  const lhs = r.avgWIP, rhs = r.throughput * r.avgCycleTime, relErr = Math.abs(lhs - rhs) / rhs;
  assert.ok(relErr < 0.05, `Little's Law: WIP ${lhs.toFixed(3)} vs TH*CT ${rhs.toFixed(3)} (relErr ${relErr.toFixed(3)})`);
  assert.ok(r.avgTransitPerJob > 0, 'transport should contribute to cycle time');
});

test('multi-level dependent demand: a part that is product AND component is produced, not starved', () => {
  // R -> M (product w/ external demand) ; M -> T (product w/ external demand). Under pull,
  // T's demand must explode into M production so T is assembled, not starved by M's own demand.
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 10, legs: {} }, control: 'pull', supply: 'limitless',
    nodes: [
      { kind: 'source', id: 'sR', x: 0, y: 0 },
      { kind: 'resource', id: 'Am', name: 'Am', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'resource', id: 'At', name: 'At', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'sink', id: 'shipM', x: 0, y: 0 }, { kind: 'sink', id: 'shipT', x: 0, y: 0 },
    ],
    parts: [
      { id: 'R', name: 'R', kind: 'purchased', arrival: C(1), routing: ['sR', 'Am'] },
      { id: 'M', name: 'M', kind: 'product', bom: [{ partId: 'R', qty: 1 }], routing: ['Am', 'shipM'] },
      { id: 'T', name: 'T', kind: 'product', bom: [{ partId: 'M', qty: 1 }], routing: ['At', 'shipT'] },
    ],
    demand: [
      { partId: 'M', dist: newDist('exp', { mean: 2 }), qty: 1, conwip: 5 },
      { partId: 'T', dist: newDist('exp', { mean: 2 }), qty: 1, conwip: 5 },
    ],
  };
  const sim = new FloorSim(m, 6);
  sim.run({ until: 30000 });
  assert.ok(sim.pstats.T.completed > 50, `T (depends on M) must be produced, got ${sim.pstats.T.completed}`);
  assert.ok(sim.demandStats.T.fulfilled > 50, `T demand must be served, got ${sim.demandStats.T.fulfilled}`);
  assert.ok(sim.demandStats.M.fulfilled > 0, `M external demand should also be partly served, got ${sim.demandStats.M.fulfilled}`);
});

test('shared sub-assembly is physically delivered into its parent assembler (transport-gated supply leg)', () => {
  // M is sold AND a component of T. M finishes at its own sink (shipM); to build a T, an M is pulled
  // from the shared shelf and DELIVERED along a real (non-zero) supply leg Am→At before T is assembled.
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 20, legs: {} }, control: 'pull', supply: 'limitless',
    nodes: [
      { kind: 'source', id: 'sR', x: 0, y: 0 },
      { kind: 'resource', id: 'Am', name: 'Am', machines: 1, service: C(0.5), x: 0, y: 0 },
      { kind: 'sink', id: 'shipM', x: 10, y: 0 },
      { kind: 'resource', id: 'At', name: 'At', machines: 1, service: C(0.5), x: 60, y: 0 },   // far from Am → real transit
      { kind: 'sink', id: 'shipT', x: 80, y: 0 },
    ],
    parts: [
      { id: 'R', name: 'R', kind: 'purchased', arrival: C(0.5), routing: ['sR', 'Am'] },
      { id: 'M', name: 'M', kind: 'product', bom: [{ partId: 'R', qty: 1 }], routing: ['Am', 'shipM'] },
      { id: 'T', name: 'T', kind: 'product', bom: [{ partId: 'M', qty: 1 }], routing: ['At', 'shipT'] },
    ],
    demand: [
      { partId: 'M', dist: newDist('exp', { mean: 4 }), qty: 1, conwip: 5 },
      { partId: 'T', dist: newDist('exp', { mean: 2 }), qty: 1, conwip: 5 },
    ],
  };
  const sim = new FloorSim(m, 11);
  sim.run({ until: 30000 });
  assert.ok(sim.supplyLegs.T && sim.supplyLegs.T.M && sim.supplyLegs.T.M.from === 'Am' && sim.supplyLegs.T.M.to === 'At',
    'a supply leg Am→At is created for the shared component M (its route ends at shipM, not At)');
  assert.ok(sim.pstats.T.completed > 50, `T must be built from delivered M, got ${sim.pstats.T.completed}`);
  assert.ok(sim.demandStats.M.fulfilled > 10, `M is also sold as a finished good, got ${sim.demandStats.M.fulfilled}`);
  assert.ok(sim.demandStats.T.fulfilled > 10, `T demand served, got ${sim.demandStats.T.fulfilled}`);
  assert.ok(sim.bomConsumed.T.M + sim.demandStats.M.fulfilled <= sim.pstats.M.completed + 1,
    `M used-in-T (${sim.bomConsumed.T.M}) + M sold (${sim.demandStats.M.fulfilled}) must not exceed M produced (${sim.pstats.M.completed})`);
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip, 'conservation holds with deliveries');
  assert.ok(sim.metrics().avgInTransit > 0, 'the shared component spends real time travelling its supply leg');
});

test('regression: a single produced part with a demand[] array still flows and conserves', () => {
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 10, legs: {} }, control: 'push', supply: 'stream',
    nodes: [
      { kind: 'source', id: 's', x: 0, y: 0 },
      { kind: 'resource', id: 'M', name: 'M', machines: 1, service: C(1), x: 0, y: 0 },
      { kind: 'sink', id: 'out', x: 0, y: 0 },
    ],
    parts: [{ id: 'p', name: 'P', kind: 'fabricated', arrival: C(2), routing: ['s', 'M', 'out'] }],
    demand: [{ partId: 'p', dist: newDist('exp', { mean: 2 }), qty: 1 }],
  };
  const sim = new FloorSim(m, 1);
  sim.run({ until: 2000 });
  assert.ok(sim.multiPart, 'a demand[] array selects the process path');
  assert.ok(sim.pstats.p.completed > 100, `should produce, got ${sim.pstats.p.completed}`);
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip, 'conservation holds');
});
