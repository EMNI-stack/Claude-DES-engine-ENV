// Floor-engine CONVERGENCE / MERGE tests — Phase 3.8. Several upstream streams of the SAME part
// combine into one shared FIFO downstream queue consumed by a single downstream op. A flow merge,
// NOT assembly synchronisation — a single part flows straight through, no partner wait. See
// docs/PHASE-3-8-DESIGN.md. Existing suites stay green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

const C = (v) => newDist('const', { value: v });
const E = (m) => newDist('exp', { mean: m });

// Two feeders of the SAME part (sources sA/sB → ops opA/opB) converging at merge node M → sink.
// opts: distinct first-op service, merge service, transport, optional batch on feeder B, layout.
function twoFeeder({ iaA = 1, iaB = 1, sOp = 0.2, sM = 0.3, mover = 'instant', legs, batchB = null,
  control = 'push', supply = 'stream', opAx = 100, opBx = 100, Mx = 400 } = {}) {
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: mover, speed: 50, legs: legs || {} },
    control, supply,
    nodes: [
      { kind: 'source', id: 'sA', x: 0, y: -20 }, { kind: 'source', id: 'sB', x: 0, y: 20 },
      { kind: 'resource', id: 'opA', x: opAx, y: -20, machines: 1, service: C(sOp) },
      { kind: 'resource', id: 'opB', x: opBx, y: 20, machines: 1, service: C(sOp), batch: batchB },
      { kind: 'resource', id: 'M', x: Mx, y: 0, machines: 1, service: C(sM) },
      { kind: 'sink', id: 'snk', x: Mx + 100, y: 0 },
    ],
    parts: [{ id: 'X', name: 'X', kind: 'product',
      routing: ['sA', 'opA', 'M', 'snk'],                               // primary (back-compat field)
      routings: [['sA', 'opA', 'M', 'snk'], ['sB', 'opB', 'M', 'snk']], // two feeder streams of the SAME part
      arrivals: [E(iaA), E(iaB)], bom: [] }],
  };
}

test('Two feeders of the same part converge into one shared queue; conservation holds', () => {
  const sim = new FloorSim(twoFeeder({ iaA: 1, iaB: 1, sM: 0.3 }), 3);
  sim.run({ until: 6000 });
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip,
    `conservation: entered ${sim.entered} = completed ${sim.completed} + scrapped ${sim.scrapped} + wip ${sim.wip}`);
  // both feeders actually fed (each ~6000 arrivals → ~12000 entered; one feeder alone would be ~6000)
  assert.ok(sim.entered > 9000, `both feeders fed the merge (entered ${sim.entered})`);
  assert.ok(sim.res.opA.processed > 0 && sim.res.opB.processed > 0, 'both feeder ops processed parts');
  // the merge node sees the COMBINED stream: it processed ~ what the two feeders delivered
  assert.ok(sim.res.M.processed >= sim.res.opA.processed + sim.res.opB.processed - 5,
    `merge consumed the combined stream (M ${sim.res.M.processed}, opA ${sim.res.opA.processed}, opB ${sim.res.opB.processed})`);
});

test('Downstream sees the combined stream: throughput ~ sum of feeder rates; neither feeder starves', () => {
  // two feeders at lambda=1/min each → offered 2/min; merge capacity 5/min keeps up → throughput ~ 2/min
  const two = new FloorSim(twoFeeder({ iaA: 1, iaB: 1, sM: 0.2 }), 5);
  two.run({ until: 8000 });
  const r2 = two.metrics();
  assert.ok(r2.throughput > 1.8 && r2.throughput < 2.2,
    `the merge clears the COMBINED feeder rate (~2/min), got ${r2.throughput.toFixed(3)}`);
  // no feeder starves: both first-ops carry a comparable share of the combined stream
  const a = two.res.opA.processed, b = two.res.opB.processed;
  assert.ok(Math.min(a, b) / Math.max(a, b) > 0.8, `both feeders served comparably (opA ${a}, opB ${b})`);
});

test('Coexistence: feeders reach the merge via their own transport legs (time differs by layout); a batch feeder still merges', () => {
  // feeder A op near the merge, feeder B op far → different leg lengths; feeder B is a BATCH resource
  const legs = { 'opA>M': { mover: 'conveyor', speed: 50, cap: 50 }, 'opB>M': { mover: 'conveyor', speed: 50, cap: 50 } };
  const sim = new FloorSim(twoFeeder({ iaA: 1.2, iaB: 1.2, sOp: 0.2, sM: 0.3,
    mover: 'instant', legs, batchB: { size: 2, setup: 0.1 }, opAx: 350, opBx: 100, Mx: 400 }), 7);
  assert.notEqual(sim.legLen('opA', 'M'), sim.legLen('opB', 'M'), 'each feeder has its own leg length (placement matters)');
  sim.run({ until: 8000 });
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip, 'conservation holds across the transported + batched merge');
  assert.ok(sim.res.opB.batchesStarted > 0, 'the batch feeder formed batches');
  assert.ok(sim.res.opA.processed > 0 && sim.res.opB.processed > 0, 'both feeders (plain + batch) merged');
  assert.ok(sim.metrics().avgTransitPerJob > 0, 'parts spend real transport time reaching the merge');
});

test("Little's Law holds across the merge", () => {
  const sim = new FloorSim(twoFeeder({ iaA: 1.5, iaB: 1.5, sOp: 0.25, sM: 0.35 }), 11);
  sim.run({ until: 20000 });
  const r = sim.metrics();
  const little = r.throughput * r.avgCycleTime;
  assert.ok(Math.abs(r.avgWIP - little) / r.avgWIP < 0.06,
    `WIP = TH x CT across the merge: avgWIP ${r.avgWIP.toFixed(2)} vs TH*CT ${little.toFixed(2)}`);
});

test('A flow merge needs NO synchronisation: a part flows through with no wait for a partner', () => {
  // feeder B is essentially silent (arrivals ~never). If this were an assembly join, feeder A would
  // wait for a B "partner" and almost nothing would complete. As a flow merge, A flows freely.
  const sim = new FloorSim(twoFeeder({ iaA: 1, iaB: 1e9, sM: 0.3 }), 4);
  sim.run({ until: 6000 });
  assert.ok(sim.res.opA.processed > 4000, `feeder A flows through unsynchronised (opA processed ${sim.res.opA.processed})`);
  assert.ok(sim.res.opB.processed <= 1, `feeder B is effectively silent (opB processed ${sim.res.opB.processed})`);
  assert.ok(sim.completed > 4000, `parts complete without waiting for a partner (completed ${sim.completed})`);
});
