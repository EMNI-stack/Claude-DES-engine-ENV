// Floor-engine TRANSPORT-REVISION tests — Phase 3.6. Four leg modes (instant, conveyor
// straight/bent, AGV, operator), placed flexible units with a home location (travel-to-pickup,
// return-home, re-dispatch mid-return), the operator<->machine coupling, and a single fixed
// dispatch rule. Existing suites stay green; see docs/PHASE-3-6-DESIGN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

const C = (v) => newDist('const', { value: v });
const E = (m) => newDist('exp', { mean: m });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// src -> A -> snk, all legs `mover`. Optional flexible movers + operatorRequired on A.
function line({ mover = 'instant', movers, opReq = false, sA = 0.5, ia = 3, ax = 100, speed = 50,
  legs, conveyor } = {}) {
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: mover, speed, legs: legs || {} },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', x: ax, y: 0, machines: 1, service: E(sA), operatorRequired: opReq },
      { kind: 'sink', id: 'snk', x: 2 * ax, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'snk'], demand: E(ia) }],
  };
  if (movers) m.transport.movers = movers;
  if (conveyor) m.transport.conveyor = conveyor;
  return m;
}
const op = (id, home, speed = 50, serves) => ({ id, kind: 'operator', speed, home, serves: serves || { links: 'all', machines: 'all' } });
const agv = (id, home, speed = 50, serves) => ({ id, kind: 'agv', speed, home, serves: serves || { links: 'all' } });

test('Instant link adds zero transport time', () => {
  const sim = new FloorSim(line({ mover: 'instant', ax: 500 /* far, but instant ⇒ 0 */ }), 1);
  sim.run({ until: 3000 });
  const r = sim.metrics();
  assert.equal(r.avgTransitPerJob, 0, `instant transport must add 0 time, got ${r.avgTransitPerJob}`);
  assert.ok(r.throughput > 0, 'line still produces');
});

test('Conveyor with bends times by the full (polyline) path length', () => {
  // A(100,0) -> B(110,0): straight = 10; via waypoints (100,20),(110,20) the path = 20 + 10 + 20 = 50.
  const legs = { 'A>B': { mover: 'conveyor', speed: 10, cap: 50, waypoints: [{ x: 100, y: 20 }, { x: 110, y: 20 }] } };
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 100, legs },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', x: 100, y: 0, machines: 1, service: C(0.1) },
      { kind: 'resource', id: 'B', x: 110, y: 0, machines: 1, service: C(0.1) },
      { kind: 'sink', id: 'snk', x: 200, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'B', 'snk'], demand: E(2) }],
  };
  const sim = new FloorSim(m, 1);
  assert.equal(sim.legLen('A', 'B'), 50, 'bent conveyor path length = sum of polyline segments');
  // straight version for contrast
  const straight = new FloorSim({ ...m, transport: { default: 'instant', speed: 100, legs: { 'A>B': { mover: 'conveyor', speed: 10, cap: 50 } } } }, 1);
  assert.equal(straight.legLen('A', 'B'), 10, 'straight conveyor uses node-to-node distance');
});

test('AGV fleet is a bottleneck: travel-to-pickup is counted; more units raise throughput', () => {
  const home = { x: 100, y: 0 };
  const few = new FloorSim(line({ mover: 'agv', ax: 200, sA: 0.2, ia: 3, speed: 50, movers: [agv('a1', home)] }), 4);
  const many = new FloorSim(line({ mover: 'agv', ax: 200, sA: 0.2, ia: 3, speed: 50, movers: [agv('a1', home), agv('a2', home), agv('a3', home)] }), 4);
  few.run({ until: 12000 }); many.run({ until: 12000 });
  const rf = few.metrics(), rm = many.metrics();
  assert.ok(rf.movers.utilisation > 0.85, `1 AGV should saturate (incl. travel-to-pickup), util ${rf.movers.utilisation.toFixed(2)}`);
  assert.ok(rm.throughput > rf.throughput * 1.2, `more AGVs raise throughput: few ${rf.throughput.toFixed(3)}, many ${rm.throughput.toFixed(3)}`);
  assert.ok(rm.movers.utilisation < rf.movers.utilisation, 'adding AGVs lowers per-unit utilisation');
  assert.ok(rf.movers.avgQueue > rm.movers.avgQueue + 0.5, 'the small fleet has a longer transport-request queue');
});

test('Home location: an idle unit returns home, and a unit en route home is re-dispatched from its current position', () => {
  // one AGV, home far from the line so returning takes real time; exponential gaps give both
  // full returns (long gaps) and mid-return re-dispatches (short gaps).
  const home = { x: 600, y: 0 };
  const sim = new FloorSim(line({ mover: 'agv', ax: 100, sA: 0.2, ia: 18, speed: 40, movers: [agv('a1', home, 40)] }), 7);
  const prev = new Map(); const seen = { returning: false, homeIdle: false, redispatch: false };
  let guard = 0;
  while (sim.fel.length && sim.now < 6000 && guard++ < 400000) {
    sim.step();
    for (const u of sim.movers) {
      if (u.state === 'returning') seen.returning = true;
      if (u.state === 'idle' && dist(u.pos, u.home) < 1) seen.homeIdle = true;
      if (prev.get(u.id) === 'returning' && u.state === 'toPickup') seen.redispatch = true;
      prev.set(u.id, u.state);
    }
  }
  assert.ok(seen.returning, 'an idle unit should head back toward its home location');
  assert.ok(seen.homeIdle, 'after a long-enough idle gap the unit should reach home and sit idle there');
  assert.ok(seen.redispatch, 'a unit en route home should be re-dispatched (returning → toPickup) from its current position');
});

test('Operator-required machine cannot process without a free operator; adding one relieves it; an automatic machine is unaffected', () => {
  const home = { x: 100, y: 0 };
  const none = new FloorSim(line({ mover: 'instant', opReq: true, sA: 0.5, ia: 2, movers: [] }), 2);          // operator-required, NO operators
  const oneOp = new FloorSim(line({ mover: 'instant', opReq: true, sA: 0.5, ia: 2, movers: [op('o1', home)] }), 2);
  const auto = new FloorSim(line({ mover: 'instant', opReq: false, sA: 0.5, ia: 2, movers: [] }), 2);          // automatic, no operators
  none.run({ until: 2000 }); oneOp.run({ until: 2000 }); auto.run({ until: 2000 });
  assert.equal(none.metrics().throughput, 0, 'operator-required machine with no operators must not process');
  assert.ok(oneOp.metrics().throughput > 0, `adding an operator lets it process, got ${oneOp.metrics().throughput.toFixed(3)}`);
  assert.ok(auto.metrics().throughput > 0, 'an automatic machine runs with no operators');
});

test('Operator contention: a move-hogged single operator stalls an operator-required machine; a second operator relieves it', () => {
  // Line 1 (parts "haul"): src1 -> H -> snk1 over long OPERATOR legs → soaks up operator time moving.
  // Line 2 (parts "make"): src2 -> M(operatorRequired) -> snk2 over instant legs → needs the operator to OPERATE.
  function twoLines(movers) {
    return {
      schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
      transport: { default: 'instant', speed: 50,
        legs: { 'src1>H': { mover: 'operator' }, 'H>snk1': { mover: 'operator' } },
        movers },
      nodes: [
        { kind: 'source', id: 'src1', x: 0, y: 0 }, { kind: 'resource', id: 'H', x: 300, y: 0, machines: 1, service: C(0.1) }, { kind: 'sink', id: 'snk1', x: 600, y: 0 },
        { kind: 'source', id: 'src2', x: 0, y: 50 }, { kind: 'resource', id: 'M', x: 50, y: 50, machines: 1, service: C(0.5), operatorRequired: true }, { kind: 'sink', id: 'snk2', x: 100, y: 50 },
      ],
      parts: [
        { id: 'haul', kind: 'product', routing: ['src1', 'H', 'snk1'], demand: E(1) },
        { id: 'make', kind: 'product', routing: ['src2', 'M', 'snk2'], demand: E(2) },
      ],
    };
  }
  const home = { x: 50, y: 25 };
  const one = new FloorSim(twoLines([op('o1', home, 40)]), 5);
  const two = new FloorSim(twoLines([op('o1', home, 40), op('o2', home, 40)]), 5);
  one.run({ until: 8000 }); two.run({ until: 8000 });
  const m1 = one.metrics().parts.make.throughput, m2 = two.metrics().parts.make.throughput;
  assert.ok(m2 > m1 * 1.2, `a second operator should relieve the stalled machine: 1op ${m1.toFixed(3)} vs 2op ${m2.toFixed(3)}`);
});

test('An operator is never moving and operating at the same time', () => {
  const home = { x: 40, y: 0 };
  // operator both moves loads (operator legs) and operates A → exercises both roles on one unit.
  // Tuned stable: fast unit + short legs so one operator keeps up with the arrivals.
  const sim = new FloorSim(line({ mover: 'operator', opReq: true, ax: 40, sA: 0.4, ia: 4, movers: [op('o1', home, 200)] }), 3);
  let guard = 0;
  while (sim.fel.length && sim.now < 4000 && guard++ < 400000) {
    sim.step();
    for (const u of sim.movers) {
      const moving = u.state === 'toPickup' || u.state === 'carrying' || u.state === 'toMachine' || u.state === 'blockedDrop';
      assert.ok(!(moving && u.state === 'operating'), 'state is a single value — cannot be moving and operating');
    }
    // every machine that holds an operator must have it in the operating state (not carrying a load)
    for (const id in sim.res) for (const mc of sim.res[id].machines) if (mc.operator) assert.equal(mc.operator.state, 'operating', 'an attached operator must be operating, not moving');
  }
  assert.ok(sim.completed > 50, 'the operator-served + operator-run line still produces');
});

test('Conservation and Little\'s Law hold with operator moves + an operator-required machine', () => {
  const home = { x: 40, y: 0 };
  const sim = new FloorSim(line({ mover: 'operator', opReq: true, ax: 40, sA: 0.4, ia: 3, movers: [op('o1', home, 200), op('o2', home, 200)] }), 9);
  sim.run({ until: 20000 });
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip, 'conservation: entered = completed + scrapped + WIP (transport + operator wait counted in WIP)');
  const r = sim.metrics();
  const lhs = r.avgWIP, rhs = r.throughput * r.avgCycleTime, relErr = Math.abs(lhs - rhs) / rhs;
  assert.ok(relErr < 0.06, `Little's Law: WIP ${lhs.toFixed(3)} vs TH*CT ${rhs.toFixed(3)} (relErr ${relErr.toFixed(3)})`);
  assert.ok(r.avgTransitPerJob > 0, 'operator transport contributes to cycle time');
});

test('Regression: a legacy worker-pool model migrates to operators and behaves sensibly', () => {
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'worker', speed: 60, workers: { count: 3, speed: 60 } },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', x: 100, y: 0, machines: 1, service: E(0.4) },
      { kind: 'sink', id: 'snk', x: 200, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'snk'], demand: E(1.5) }],
  };
  const sim = new FloorSim(m, 1);
  assert.equal(sim.movers.length, 3, 'a {count:3} worker pool migrates to 3 operator units');
  assert.ok(sim.movers.every((u) => u.kind === 'operator'), 'migrated units are operators');
  sim.run({ until: 6000 });
  assert.ok(sim.metrics().throughput > 0, 'migrated worker model still produces');
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip, 'conservation holds after migration');
});
