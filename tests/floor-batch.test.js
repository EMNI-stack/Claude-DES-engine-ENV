// Floor-engine batch-processing tests — Phase 3.4 (Milestone 1).
// A resource flagged batch={size B, setup} accumulates jobs, waits for a FULL batch of B,
// pays setup once, processes the whole batch together (service dist = whole-batch time), and
// releases all B at once. Covers: full-batch start + steady throughput, setup-once, finish-
// together, conservation, Little's Law (wait-to-batch counts), regression (no-batch identical),
// and the starvation/deadlock surface. See docs/PHASE-3-4-DESIGN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

const C = (value) => newDist('const', { value });

/* source -> M -> sink, instant transport, zero distances (no travel time). M may be a batch
   resource. `arr` is the (constant unless overridden) interarrival; omit demand for a single
   one-shot arrival (used by the starvation test). */
function batchFloor({ B = null, setup = 0, proc = C(4), arr = C(1), oneShot = false,
  scrap = 0, supply = 'stream' } = {}) {
  const part = { id: 'p', kind: 'product', routing: ['src', 'M', 'snk'] };
  if (!oneShot) part.demand = arr;
  const M = { kind: 'resource', id: 'M', name: 'M', x: 0, y: 0, machines: 1, service: proc, scrap };
  if (B != null) M.batch = { size: B, setup };
  return {
    schema: 'des-floor/v1',
    units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 10, legs: {} },
    supply,
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      M,
      { kind: 'sink', id: 'snk', x: 0, y: 0 },
    ],
    parts: [part],
  };
}

test('full-batch start: a batch resource produces B every (setup+process), capacity-limited', () => {
  // B=3, setup=2, whole-batch proc=4 => one batch every 6 time units => TH -> 3/6 = 0.5/min.
  // Arrivals at rate 1/min exceed capacity, so the queue grows but throughput saturates at 0.5.
  const sim = new FloorSim(batchFloor({ B: 3, setup: 2, proc: C(4), arr: C(1) }), 1);
  sim.run({ until: 1000 });
  const r = sim.metrics();
  assert.ok(Math.abs(r.throughput - 0.5) < 0.02, `batch throughput ${r.throughput.toFixed(3)} should be ~0.5`);
  assert.equal(r.completed % 3, 0, `completions must come in whole batches of 3, got ${r.completed}`);
  assert.ok(r.batch.M && r.batch.M.batchesStarted > 100, `expected many batches, got ${r.batch.M && r.batch.M.batchesStarted}`);
  assert.equal(r.deadlock, false, 'a steadily-fed batch resource is not deadlocked');
});

test('setup is applied once per batch, not per part', () => {
  // setup=10, proc≈0, B=5, arrivals at 1/min. The 5th part arrives at t=5, the batch starts,
  // and completes ~t=15 (start + setup). If setup were charged per part it would be t=5+50=55.
  const at = (until) => { const s = new FloorSim(batchFloor({ B: 5, setup: 10, proc: C(0.001), arr: C(1) }), 1); s.run({ until }); return s.completed; };
  assert.equal(at(14), 0, 'no batch can finish before start(5)+setup(10)=15');
  assert.equal(at(16), 5, 'exactly the first batch of 5 has finished by t=16 (setup paid once)');
  assert.equal(at(26), 10, 'two batches by t=26 — each pays setup once, period = setup+proc');
});

test('whole-batch process time applies to all B together (they finish in one instant)', () => {
  // Deterministic: B=4, setup=3, proc=5. Sample completions either side of the first finish.
  // First batch fills at t=4, starts, finishes at 4+3+5=12. All 4 leave together.
  const at = (until) => { const s = new FloorSim(batchFloor({ B: 4, setup: 3, proc: C(5), arr: C(1) }), 1); s.run({ until }); return s.completed; };
  assert.equal(at(11.9), 0, 'nothing completes before the whole batch finishes at t=12');
  assert.equal(at(12.1), 4, 'all 4 parts of the batch finish together at t=12');
});

test('conservation holds with batching (entered = completed + scrapped + in-system)', () => {
  const sim = new FloorSim(batchFloor({ B: 3, setup: 1, proc: newDist('exp', { mean: 4 }), arr: newDist('exp', { mean: 2 }), scrap: 0.1 }), 7);
  sim.run({ until: 5000 });
  assert.ok(sim.scrapped > 20, `expected some scrap within batches, got ${sim.scrapped}`);
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip,
    `conservation: ${sim.entered} != ${sim.completed} + ${sim.scrapped} + ${sim.wip}`);
});

test("Little's Law holds with batching (wait-to-batch counts toward WIP and cycle time)", () => {
  // Stable: capacity = B/(setup+E[proc]) = 3/(1+4) = 0.6 > arrival rate 0.4 (interarrival mean 2.5).
  const sim = new FloorSim(batchFloor({ B: 3, setup: 1, proc: newDist('exp', { mean: 4 }), arr: newDist('exp', { mean: 2.5 }) }), 3);
  sim.run({ until: 40000 });
  const r = sim.metrics();
  const lhs = r.avgWIP, rhs = r.throughput * r.avgCycleTime;
  const relErr = Math.abs(lhs - rhs) / rhs;
  assert.ok(relErr < 0.05, `Little's Law: WIP ${lhs.toFixed(3)} vs TH*CT ${rhs.toFixed(3)} (relErr ${relErr.toFixed(3)})`);
  assert.ok(r.avgWIP > 1, `wait-to-batch should keep WIP above one, got ${r.avgWIP.toFixed(2)}`);
});

test('regression: an identical model with NO batch flag is unaffected by the batch branch', () => {
  // Single-job resource, deterministic. proc=2, arrivals at 1/min => capacity 0.5 saturates.
  const sim = new FloorSim(batchFloor({ B: null, proc: C(2), arr: C(1) }), 1);
  sim.run({ until: 1000 });
  const r = sim.metrics();
  assert.ok(Math.abs(r.throughput - 0.5) < 0.02, `single-job throughput ${r.throughput.toFixed(3)} should be ~0.5`);
  assert.deepEqual(r.batch, {}, 'no-batch model reports no batch diagnostics');
  assert.equal(r.deadlock, false, 'a steadily-fed single-job line is not deadlocked');
});

test('starvation: fewer than B parts never starts a batch — the deadlock is surfaced, not hung', () => {
  // One-shot supply delivers exactly 1 part; B=2 can never fill. The model jams: the event list
  // drains with the part stranded. The engine must SURFACE this (deadlock flag + diagnostics).
  const sim = new FloorSim(batchFloor({ B: 2, setup: 1, proc: C(4), oneShot: true }), 1);
  sim.run({ until: 10000 });
  const r = sim.metrics();
  assert.equal(r.completed, 0, 'a partial batch must never start, so nothing completes');
  assert.equal(r.deadlock, true, 'the drained-FEL-with-WIP jam must be surfaced as a deadlock');
  assert.equal(r.batch.M.batchesStarted, 0, 'no batch was ever started');
  assert.equal(r.batch.M.waitingForBatch, 1, 'the stranded part is reported as waiting for a batch');
});
