// Floor-engine PARALLEL-RESOURCE tests — Phase 3.7. A routing operation targets a resource GROUP;
// any member can serve it, chosen by even-split or shortest-queue at ready-time (in board()), with
// no jockeying. Members may differ (incl. batch / operator-required) and are each reached via their
// own transport leg. Existing suites stay green; see docs/PHASE-3-7-DESIGN.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FloorSim } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

const C = (v) => newDist('const', { value: v });
const E = (m) => newDist('exp', { mean: m });
const op = (id, home, speed = 50, serves) => ({ id, kind: 'operator', speed, home, serves: serves || { links: 'all', machines: 'all' } });
const agv = (id, home, speed = 50, serves) => ({ id, kind: 'agv', speed, home, serves: serves || { links: 'all' } });

// src -> [group of members] -> snk. members: [{id, x, y, service, machines?, batch?, opReq?}]
function grouped({ rule = 'even', members, ia = 0.5, mover = 'instant', movers, conveyor, legs, srcX = 0, snkX = 1000 } = {}) {
  const nodes = [{ kind: 'source', id: 'src', x: srcX, y: 0 }];
  for (const m of members) nodes.push({ kind: 'resource', id: m.id, x: m.x, y: m.y, machines: m.machines || 1,
    service: m.service, batch: m.batch, operatorRequired: !!m.opReq });
  nodes.push({ kind: 'sink', id: 'snk', x: snkX, y: 0 });
  const model = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: mover, speed: 50, legs: legs || {} },
    nodes,
    groups: [{ id: 'grp', name: 'Group', rule, members: members.map((m) => m.id) }],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'grp', 'snk'], demand: E(ia) }],
  };
  if (movers) model.transport.movers = movers;
  if (conveyor) model.transport.conveyor = conveyor;
  return model;
}
// plain single-resource line (no group) for the pooling contrast
function singleLine({ id = 'A', service, machines = 1, ia = 0.5 } = {}) {
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 50, legs: {} },
    nodes: [{ kind: 'source', id: 'src', x: 0, y: 0 }, { kind: 'resource', id, x: 100, y: 0, machines, service },
      { kind: 'sink', id: 'snk', x: 1000, y: 0 }],
    parts: [{ id: 'p', kind: 'product', routing: ['src', id, 'snk'], demand: E(ia) }],
  };
}

test('Even split: members of a group receive ~equal shares over many parts', () => {
  const members = [{ id: 'm0', x: 100, y: -20, service: C(0.2) }, { id: 'm1', x: 100, y: 0, service: C(0.2) },
    { id: 'm2', x: 100, y: 20, service: C(0.2) }];
  const sim = new FloorSim(grouped({ rule: 'even', members, ia: 0.3 }), 7);
  sim.run({ until: 6000 });
  const counts = members.map((m) => sim.res[m.id].processed);
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(total > 3000, `enough parts flowed (${total})`);
  for (let i = 0; i < counts.length; i++) {
    const share = counts[i] / total;
    assert.ok(share > 0.28 && share < 0.39, `member ${i} share ${share.toFixed(3)} should be ~1/3 (even split)`);
  }
});

test('Shortest queue: load goes to the least-loaded member; queues stay bounded', () => {
  // asymmetric members under heavy load — the faster machine stays less loaded, so it earns MORE work
  const members = [{ id: 'fast', x: 100, y: -10, service: C(0.2) }, { id: 'slow', x: 100, y: 10, service: C(0.6) }];
  const sim = new FloorSim(grouped({ rule: 'shortest', members, ia: 0.3 }), 3);
  sim.run({ until: 6000 });
  const fast = sim.res.fast.processed, slow = sim.res.slow.processed;
  assert.ok(fast > slow * 1.3, `shortest-queue sends more to the faster (less-loaded) member: fast ${fast}, slow ${slow}`);
  // neither member's queue runs away — shortest-queue balances committed load
  assert.ok(sim.res.fast.queue.length < 50 && sim.res.slow.queue.length < 50,
    `queues stay bounded (fast ${sim.res.fast.queue.length}, slow ${sim.res.slow.queue.length})`);
});

test('Mixed members: a batch member + an operator-required member route correctly; conservation holds', () => {
  const members = [
    { id: 'batch', x: 120, y: -15, service: C(0.4), batch: { size: 2, setup: 0.1 } },   // batch resource
    { id: 'manual', x: 120, y: 15, service: C(0.4), opReq: true },                       // operator-required
  ];
  const sim = new FloorSim(grouped({ rule: 'even', members, ia: 0.5, movers: [op('o1', { x: 120, y: 0 })] }), 5);
  sim.run({ until: 6000 });
  assert.ok(sim.res.batch.processed > 0, 'the batch member processed parts');
  assert.ok(sim.res.manual.processed > 0, 'the operator-required member processed parts');
  assert.ok(sim.res.batch.batchesStarted > 0, 'the batch member actually formed batches');
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.wip,
    `conservation: entered ${sim.entered} = completed ${sim.completed} + scrapped ${sim.scrapped} + wip ${sim.wip}`);
});

test('Transport coexistence: members reached via their own legs; Little\'s Law holds across the group', () => {
  // members at different distances from src -> transport time differs by which member is chosen.
  // AGV fleet is sized comfortably above the arrival rate so the system reaches steady state.
  const members = [{ id: 'near', x: 120, y: 0, service: C(0.3) }, { id: 'far', x: 300, y: 0, service: C(0.3) }];
  // AGV only on the inbound group legs (the focus); the exit leg is instant. Fleet sized above arrivals.
  const sim = new FloorSim(grouped({ rule: 'even', members, ia: 6, mover: 'instant', snkX: 360,
    legs: { 'src>near': { mover: 'agv' }, 'src>far': { mover: 'agv' } },
    movers: [agv('a1', { x: 150, y: 0 }, 60), agv('a2', { x: 150, y: 0 }, 60), agv('a3', { x: 150, y: 0 }, 60)] }), 9);
  // static: the two members have different leg lengths from the source (placement matters)
  assert.notEqual(sim.legLen('src', 'near'), sim.legLen('src', 'far'), 'each member is its own leg with its own length');
  sim.run({ until: 24000 });
  const r = sim.metrics();
  assert.ok(sim.res.near.processed > 0 && sim.res.far.processed > 0, 'both members were reached via transport');
  assert.ok(r.avgTransitPerJob > 0, 'parts spend real transport time reaching the members');
  const little = r.throughput * r.avgCycleTime;          // WIP = TH x CT (incl. transport WIP)
  assert.ok(Math.abs(r.avgWIP - little) / r.avgWIP < 0.08,
    `Little's Law across the group incl. transport: avgWIP ${r.avgWIP.toFixed(2)} vs TH*CT ${little.toFixed(2)}`);
});

test('Pooling lesson: a group of N members queues far less than forcing all flow through one member', () => {
  const service = C(0.4);                                  // each machine: 2.5 parts/min
  const ia = 0.2;                                          // arrivals: 5 parts/min — one machine is overloaded (rho=2)
  const group = new FloorSim(grouped({ rule: 'shortest',
    members: [{ id: 'g0', x: 100, y: -15, service }, { id: 'g1', x: 100, y: 0, service }, { id: 'g2', x: 100, y: 15, service }],
    ia }), 4);
  const one = new FloorSim(singleLine({ service, ia }), 4);
  group.run({ until: 6000 }); one.run({ until: 6000 });
  const rg = group.metrics(), ro = one.metrics();
  assert.ok(rg.throughput > ro.throughput * 1.4, `the group clears far more (group ${rg.throughput.toFixed(2)}, one ${ro.throughput.toFixed(2)})`);
  assert.ok(rg.avgCycleTime * 5 < ro.avgCycleTime, `pooling slashes cycle time (group ${rg.avgCycleTime.toFixed(2)}, one ${ro.avgCycleTime.toFixed(1)})`);
  assert.ok(rg.avgWIP * 5 < ro.avgWIP, `pooling slashes WIP (group ${rg.avgWIP.toFixed(1)}, one ${ro.avgWIP.toFixed(1)})`);
});
