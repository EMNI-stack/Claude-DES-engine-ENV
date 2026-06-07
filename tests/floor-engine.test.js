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

/* ---- Milestone 3.2: transport as constrained resources ----------------- */

// Worker-served line: fast resources so worker travel dominates; long legs so
// each move costs real worker time; the worker pool is shared across all legs.
function workerFloor({ count = 1, speed = 50, dist = 200, service = 0.2, interarrival = 3 } = {}) {
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'worker', speed, workers: { count, speed } },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', x: dist / 10, y: 0, machines: 1, service: newDist('exp', { mean: service }) },
      { kind: 'resource', id: 'B', x: 2 * dist / 10, y: 0, machines: 1, service: newDist('exp', { mean: service }) },
      { kind: 'sink', id: 'snk', x: 3 * dist / 10, y: 0 },
    ],
    // place coords in metres directly so leg distance = dist
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'B', 'snk'], demand: newDist('exp', { mean: interarrival }) }],
  };
}
// fix coordinates so each consecutive leg is exactly `dist` metres apart
function workerFloorM(opts = {}) {
  const m = workerFloor(opts); const d = opts.dist || 200;
  m.nodes[0].x = 0; m.nodes[1].x = d; m.nodes[2].x = 2 * d; m.nodes[3].x = 3 * d;
  return m;
}

test('worker pool as bottleneck: too few workers queue moves and saturate; more relieve', () => {
  const few = new FloorSim(workerFloorM({ count: 1, dist: 200, speed: 50, service: 0.2, interarrival: 3 }), 4);
  const many = new FloorSim(workerFloorM({ count: 6, dist: 200, speed: 50, service: 0.2, interarrival: 3 }), 4);
  few.run({ until: 12000 }); many.run({ until: 12000 });
  const rf = few.metrics(), rm = many.metrics();
  assert.ok(rf.workers && rm.workers, 'worker stats present');
  assert.ok(rf.workers.utilisation > 0.85, `1 worker should saturate, util ${rf.workers.utilisation.toFixed(2)}`);
  assert.ok(rf.workers.avgQueue > rm.workers.avgQueue + 1, `few-worker transport queue ${rf.workers.avgQueue.toFixed(2)} should exceed many ${rm.workers.avgQueue.toFixed(2)}`);
  assert.ok(rm.throughput > rf.throughput * 1.2, `more workers should raise throughput: few ${rf.throughput.toFixed(3)}, many ${rm.throughput.toFixed(3)}`);
  assert.ok(rm.workers.utilisation < rf.workers.utilisation, 'adding workers lowers utilisation');
});

// Conveyor into a slow, small-buffer resource: the conveyor fills and the
// upstream resource blocks (block-after-service backs up).
function conveyorFloor({ cap = 1, convSpeed = 10, dist = 50, sA = 0.5, sB = 5, bBuf = 1, interarrival = 1 } = {}) {
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 100,
      legs: { 'A>B': { mover: 'conveyor', cap, speed: convSpeed } } },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', x: 10, y: 0, machines: 1, service: newDist('exp', { mean: sA }), bufferCap: Infinity },
      { kind: 'resource', id: 'B', x: 10 + dist, y: 0, machines: 1, service: newDist('exp', { mean: sB }), bufferCap: bBuf },
      { kind: 'sink', id: 'snk', x: 20 + dist, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'B', 'snk'], demand: newDist('exp', { mean: interarrival }) }],
  };
}

/* ---- control: push / CONWIP, supply, demand ---------------------------- */
function controlFloor({ control = 'push', conwipCap = 5, supply = 'stream', demand = null, sA = 1, sB = 1, interarrival = 0.6 } = {}) {
  const m = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 100 },
    control, conwipCap, supply, demand,
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', x: 10, y: 0, machines: 1, service: newDist('exp', { mean: sA }), bufferCap: Infinity },
      { kind: 'resource', id: 'B', x: 20, y: 0, machines: 1, service: newDist('exp', { mean: sB }), bufferCap: Infinity },
      { kind: 'sink', id: 'snk', x: 30, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'B', 'snk'], demand: newDist('exp', { mean: interarrival }) }],
  };
  return m;
}

test('CONWIP caps work-in-process; push does not', () => {
  // arrivals (mean 0.6) faster than the bottleneck (mean 1) → push WIP grows unbounded.
  const push = new FloorSim(controlFloor({ control: 'push', interarrival: 0.6 }), 8);
  const cw = new FloorSim(controlFloor({ control: 'conwip', conwipCap: 5, interarrival: 0.6 }), 8);
  push.run({ until: 6000 }); cw.run({ until: 6000 });
  const rp = push.metrics(), rc = cw.metrics();
  assert.ok(rc.maxLineWip <= 5, `CONWIP line WIP ${rc.maxLineWip} must never exceed cap 5`);
  assert.ok(rp.avgWIP > rc.avgWIP + 2, `push WIP ${rp.avgWIP.toFixed(1)} should far exceed CONWIP ${rc.avgWIP.toFixed(1)}`);
  assert.ok(rc.avgCycleTime < rp.avgCycleTime, 'CONWIP should hold cycle time below runaway push');
});

test('demand stream: demanded = fulfilled + stockouts, fill rate in [0,1]', () => {
  const sim = new FloorSim(controlFloor({ control: 'conwip', conwipCap: 6, supply: 'limitless',
    demand: { mode: 'stream', dist: newDist('exp', { mean: 1.2 }) }, sA: 1, sB: 1 }), 3);
  sim.run({ until: 8000 });
  const r = sim.metrics();
  assert.ok(r.demanded > 100, `expected demand events, got ${r.demanded}`);
  assert.equal(r.demanded, r.fulfilled + r.stockouts, 'demand conservation');
  assert.ok(r.fillRate >= 0 && r.fillRate <= 1, `fill rate ${r.fillRate}`);
  assert.equal(r.entered, r.completed + r.scrapped + r.inSystem, 'conservation incl. finished-goods inventory');
});

test('CONWIP + limitless holds the line full at the cap', () => {
  const sim = new FloorSim(controlFloor({ control: 'conwip', conwipCap: 4, supply: 'limitless', sA: 1, sB: 1 }), 6);
  sim.run({ until: 6000 });
  const r = sim.metrics();
  assert.ok(r.maxLineWip <= 4, `line WIP ${r.maxLineWip} must not exceed cap 4`);
  assert.ok(r.avgWIP > 2.5, `limitless CONWIP should keep the line near full, avgWIP ${r.avgWIP.toFixed(2)}`);
});

/* ---- scrap & breakdowns (ported from the original engine) -------------- */
// Single saturated resource: source -> A -> sink, fast arrivals so A is busy.
function oneResource({ service = 1, scrap = 0, brk = null, interarrival = 0.5 } = {}) {
  const A = { kind: 'resource', id: 'A', x: 5, y: 0, machines: 1, service: newDist('exp', { mean: service }), bufferCap: Infinity, scrap };
  if (brk) A.brk = brk;
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 100 },
    nodes: [{ kind: 'source', id: 'src', x: 0, y: 0 }, A, { kind: 'sink', id: 'snk', x: 10, y: 0 }],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'snk'], demand: newDist('exp', { mean: interarrival }) }],
  };
}

test('scrap: yield approaches 1 - p and conservation includes scrap', () => {
  const sim = new FloorSim(oneResource({ service: 1, scrap: 0.2, interarrival: 0.5 }), 7);
  sim.run({ until: 20000 });
  const r = sim.metrics();
  assert.ok(r.scrapped > 50, `expected scrap, got ${r.scrapped}`);
  assert.ok(Math.abs(r.yield - 0.8) < 0.03, `yield ${r.yield.toFixed(3)} should be ~0.80`);
  assert.equal(r.entered, r.completed + r.scrapped + r.inSystem,
    `conservation: ${r.entered} != ${r.completed} + ${r.scrapped} + ${r.inSystem}`);
});

test('breakdowns: availability lowers throughput and shows downtime (preempt-resume)', () => {
  const brk = { on: true, ttf: newDist('exp', { mean: 20 }), ttr: newDist('exp', { mean: 5 }) }; // A = 20/25 = 0.8
  const up = new FloorSim(oneResource({ service: 1, interarrival: 0.5 }), 5);
  const dn = new FloorSim(oneResource({ service: 1, interarrival: 0.5, brk }), 5);
  up.run({ until: 20000 }); dn.run({ until: 20000 });
  const ru = up.metrics(), rd = dn.metrics();
  assert.ok(rd.downFraction['A'] > 0.1 && rd.downFraction['A'] < 0.32, `down fraction ${rd.downFraction['A'].toFixed(3)} ~ 0.2`);
  assert.ok(rd.throughput < ru.throughput, `breakdowns should cut throughput: up ${ru.throughput.toFixed(3)}, down ${rd.throughput.toFixed(3)}`);
  assert.ok(Math.abs(rd.throughput - 0.8) < 0.12, `throughput with A=0.8 should be ~0.8, got ${rd.throughput.toFixed(3)}`);
});

test('conveyor capacity/blocking: a full downstream buffer blocks the conveyor and backs up upstream', () => {
  // B is slow (mean 5) with a 1-slot buffer; conveyor cap 1; arrivals fast (1).
  const sim = new FloorSim(conveyorFloor({ cap: 1, convSpeed: 10, dist: 50, sA: 0.5, sB: 5, bBuf: 1, interarrival: 1 }), 2);
  sim.run({ until: 6000 });
  const r = sim.metrics();
  // upstream resource A should spend real time blocked (can't hand off downstream)
  assert.ok(r.blockedFraction['A'] > 0.1, `A should be blocked a substantial fraction, got ${r.blockedFraction['A'].toFixed(3)}`);
  // throughput is gated by the slow station B (~1/5), well below the arrival rate of 1/min
  assert.ok(r.throughput < 0.3, `throughput ${r.throughput.toFixed(3)} should be gated near B's rate ~0.2`);
  // a roomy line (big buffer, fast B, big conveyor) does NOT block A
  const free = new FloorSim(conveyorFloor({ cap: 50, convSpeed: 10, dist: 50, sA: 0.5, sB: 0.5, bBuf: 50, interarrival: 1 }), 2);
  free.run({ until: 6000 });
  const rf = free.metrics();
  assert.ok(rf.blockedFraction['A'] < 0.02, `unconstrained A should barely block, got ${rf.blockedFraction['A'].toFixed(3)}`);
  assert.ok(rf.throughput > r.throughput, 'the unconstrained line should out-throughput the blocked one');
});
