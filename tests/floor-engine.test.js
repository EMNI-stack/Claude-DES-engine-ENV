// Floor-engine tests — Phase 3. Uses node:test + node:assert, no deps.
// Milestone 1 (3.1): distance-based instant transport, placement sensitivity,
// conservation with transport, Little's Law including transport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim, legDistance } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

/* A linear floor: source -> A -> B -> sink. Resources at given coordinates,
   single fabricated/product part with an interarrival stream. Instant transport
   at a fixed speed, so travel time = distance / speed. */
function linearFloor({ aXY = [0, 0], bXY = [0, 0], srcXY = [0, 0], sinkXY = [0, 0],
  speed = 10, sA = 1.0, sB = 1.0, machines = 1, interarrival = 2.0 } = {}) {
  return {
    schema: 'des-floor/v1',
    units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed, legs: {} },
    nodes: [
      { kind: 'source', id: 'src', x: srcXY[0], y: srcXY[1] },
      { kind: 'resource', id: 'A', name: 'A', x: aXY[0], y: aXY[1], machines, service: newDist('exp', { mean: sA }) },
      { kind: 'resource', id: 'B', name: 'B', x: bXY[0], y: bXY[1], machines, service: newDist('exp', { mean: sB }) },
      { kind: 'sink', id: 'snk', x: sinkXY[0], y: sinkXY[1] },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'B', 'snk'], demand: newDist('exp', { mean: interarrival }) }],
  };
}

test('legDistance is Euclidean', () => {
  assert.equal(legDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(legDistance({ x: 1, y: 1 }, { x: 1, y: 1 }), 0);
});

test('distance correctness: a known leg adds distance/speed to transport time', () => {
  // Deterministic geometry: src(0,0) A(100,0) B(100,0) sink(100,0), speed 10.
  // Only the src->A leg has length 100 => travel 10; A->B and B->sink are 0.
  // With near-zero service we can read the transport time directly.
  const m = linearFloor({ srcXY: [0, 0], aXY: [100, 0], bXY: [100, 0], sinkXY: [100, 0],
    speed: 10, sA: 0.0001, sB: 0.0001, interarrival: 5 });
  const sim = new FloorSim(m, 7);
  sim.run({ until: 5000 });
  const r = sim.metrics();
  assert.ok(r.completed > 100, `expected many completions, got ${r.completed}`);
  // total transport per job = 100/10 + 0 + 0 = 10 (exactly; instant transport is deterministic)
  assert.ok(Math.abs(r.avgTransitPerJob - 10) < 1e-6, `transit/job ${r.avgTransitPerJob} != 10`);
  // cycle time >= transport time (plus tiny service)
  assert.ok(r.avgCycleTime >= 10, `CT ${r.avgCycleTime} should exceed transport 10`);
});

test('placement matters: moving B farther increases transport time and cycle time', () => {
  const near = new FloorSim(linearFloor({ aXY: [0, 0], bXY: [50, 0], speed: 10, sA: 0.5, sB: 0.5 }), 11);
  const far = new FloorSim(linearFloor({ aXY: [0, 0], bXY: [500, 0], speed: 10, sA: 0.5, sB: 0.5 }), 11);
  near.run({ until: 6000 }); far.run({ until: 6000 });
  const rn = near.metrics(), rf = far.metrics();
  assert.ok(rf.avgTransitPerJob > rn.avgTransitPerJob + 5,
    `farther layout should add transport: near ${rn.avgTransitPerJob}, far ${rf.avgTransitPerJob}`);
  assert.ok(rf.avgCycleTime > rn.avgCycleTime,
    `farther layout should raise cycle time: near ${rn.avgCycleTime}, far ${rf.avgCycleTime}`);
});

test('conservation: entered = completed + in-system (jobs in transit counted)', () => {
  const sim = new FloorSim(linearFloor({ aXY: [0, 0], bXY: [200, 0], speed: 5, sA: 1.0, sB: 1.0, interarrival: 1.5 }), 3);
  sim.run({ until: 3000 });
  const r = sim.metrics();
  assert.equal(r.entered, r.completed + r.inSystem,
    `conservation: entered ${r.entered} != completed ${r.completed} + inSystem ${r.inSystem}`);
  assert.ok(r.inSystem >= 0);
});

test("Little's Law holds with transport included (WIP = TH x CT)", () => {
  const sim = new FloorSim(linearFloor({ aXY: [0, 0], bXY: [120, 0], speed: 8, sA: 0.8, sB: 0.9, interarrival: 1.4 }), 5);
  sim.run({ until: 20000 });
  const r = sim.metrics();
  const lhs = r.avgWIP;
  const rhs = r.throughput * r.avgCycleTime;
  const relErr = Math.abs(lhs - rhs) / rhs;
  assert.ok(relErr < 0.05, `Little's Law: WIP ${lhs.toFixed(3)} vs TH*CT ${rhs.toFixed(3)} (relErr ${relErr.toFixed(3)})`);
});

test('transport time is part of cycle time (CT >= transit per job)', () => {
  const sim = new FloorSim(linearFloor({ aXY: [0, 0], bXY: [300, 0], speed: 6, sA: 0.7, sB: 0.7, interarrival: 1.6 }), 9);
  sim.run({ until: 8000 });
  const r = sim.metrics();
  assert.ok(r.avgCycleTime >= r.avgTransitPerJob,
    `CT ${r.avgCycleTime} should be >= transit ${r.avgTransitPerJob}`);
  assert.ok(r.avgTransitPerJob > 0, 'transport time should be positive when nodes are apart');
});
