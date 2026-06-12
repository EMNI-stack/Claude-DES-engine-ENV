// Breakdown semantics — pins down exactly WHAT a breakdown does, in both engines:
//
//  1. A FAIL event preempts the in-progress job immediately (preempt-resume):
//     the job stays ON the broken machine with its remaining work saved — it is
//     never released back to the queue.
//  2. After repair, the preempted job resumes its REMAINDER first, ahead of every
//     queued job (queued work just waits; FIFO order among them is preserved).
//  3. Total service time is conserved: work done before the failure is not lost
//     and not repeated (depTime after resume = fail time + repair + remainder).
//  4. An operator unit that is mid-operation when the machine fails is HELD
//     (state 'operating', still attached) for the whole repair — it is NOT
//     released to serve other machines or transport requests, and its busy-time
//     clock keeps running through the repair.
//  5. An operator DISPATCHED to a machine that breaks down before it arrives IS
//     released on arrival (the down machine raises a fresh request after repair).
//
// All scenarios use const distributions so every event time is exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, station } from '../src/engine.js';
import { FloorSim } from '../src/floor-engine.js';
import { newDist } from '../src/distributions.js';

const C = (v) => newDist('const', { value: v });
// process every event with time <= T (run({until}) overshoots by one event)
const stepTo = (sim, T) => { while (sim.fel.length && sim.fel[0].time <= T) sim.step(); };

/* ================================================================
   Core engine (src/engine.js)
   Arrivals every 2, service 10 → jobs 1..4 run [2,12)...[32,42),
   job 5 runs [42,52). TTF=50 (clock from t=0) → FAIL at 50 preempts
   job 5 with 2 min remaining. TTR=20 → repaired at 70, job 5 resumes
   and completes at 72; only then does queued job 6 start.
   ================================================================ */
test('core engine: breakdown preempts the running job; job stays on the machine and resumes ahead of the queue', () => {
  const cfg = {
    source: C(2),
    stations: [station('M', 1, false, Infinity, C(10), 0, true, C(50), C(20))],
  };
  const sim = new Sim(cfg, 1);
  const st = sim.stations[0], m = st.machines[0];

  stepTo(sim, 48);   // mid-service of job 5
  assert.equal(m.busy, true);
  assert.equal(m.down, false);
  assert.equal(m.part.id, 5);

  stepTo(sim, 51);   // FAIL at t=50 has fired
  assert.equal(m.down, true, 'machine should be down');
  assert.equal(m.busy, false, 'service is interrupted immediately (preempt)');
  assert.equal(m.part.id, 5, 'preempted job stays ON the machine');
  assert.equal(m.remaining, 2, 'remaining work saved (10 - 8 done)');
  assert.ok(st.queue.length > 0, 'queued jobs are waiting');
  assert.ok(st.queue.every((p) => p.id !== 5), 'preempted job is NOT pushed back to the queue');

  stepTo(sim, 69);   // still under repair
  assert.equal(m.down, true);
  assert.equal(m.part.id, 5);

  stepTo(sim, 71);   // REP at t=70: the preempted job resumes FIRST
  assert.equal(m.down, false);
  assert.equal(m.busy, true);
  assert.equal(m.part.id, 5, 'resumed job has priority over all queued jobs');
  assert.ok(Math.abs(m.depTime - 72) < 1e-9, 'work conserved: 8 done + 20 repair + 2 remainder');

  stepTo(sim, 73);   // job 5 done at 72; FIFO queue head starts
  assert.equal(st.processed, 5);
  assert.equal(m.part.id, 6, 'after the resumed job, the oldest queued job starts');
});

/* ================================================================
   Floor engine (src/floor-engine.js) — identical scenario & timeline.
   ================================================================ */
function floorModel({ operatorRequired = false, ttf = 50, ttr = 20, movers = undefined, service = 10, interarrival = 2 } = {}) {
  return {
    schema: 'des-floor/v1',
    units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', movers },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', name: 'A', x: 0, y: 0, machines: 1, operatorRequired,
        service: C(service), brk: { on: true, ttf: C(ttf), ttr: C(ttr) } },
      { kind: 'sink', id: 'snk', x: 0, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'snk'], demand: C(interarrival) }],
  };
}

test('floor engine: breakdown preempts the running job; job stays on the machine and resumes ahead of the queue', () => {
  const sim = new FloorSim(floorModel(), 1);
  const r = sim.res['A'], m = r.machines[0];

  stepTo(sim, 48);
  assert.equal(m.busy, true);
  assert.equal(m.down, false);
  assert.equal(m.job.id, 5);

  stepTo(sim, 51);   // FAIL at t=50
  assert.equal(m.down, true);
  assert.equal(m.busy, false);
  assert.equal(m.preempted, true);
  assert.equal(m.job.id, 5, 'preempted job stays ON the machine');
  assert.equal(m.remaining, 2);
  assert.ok(r.queue.length > 0, 'queued jobs are waiting');
  assert.ok(r.queue.every((j) => j.id !== 5), 'preempted job is NOT pushed back to the queue');

  stepTo(sim, 69);
  assert.equal(m.down, true);

  stepTo(sim, 71);   // REP at t=70
  assert.equal(m.down, false);
  assert.equal(m.busy, true);
  assert.equal(m.job.id, 5, 'resumed job has priority over all queued jobs');
  assert.ok(Math.abs(m.depTime - 72) < 1e-9, 'work conserved across the breakdown');

  stepTo(sim, 73);
  assert.equal(r.processed, 5);
  assert.equal(m.job.id, 6, 'queue is FIFO after the resumed job');
});

/* ================================================================
   Operator units. One operator, home at the machine (zero travel),
   service 10, arrivals every 2, TTF=50, TTR=30.
   Job 5 is preempted at t=50 with 2 min left; repaired at t=80.
   The operator that started the op is HELD through the repair.
   ================================================================ */
test('floor engine: an operator mid-op is held captive through the repair (not released)', () => {
  const movers = [{ id: 'op1', kind: 'operator', speed: 10, home: { x: 0, y: 0 }, serves: { links: 'all', machines: 'all' } }];
  const sim = new FloorSim(floorModel({ operatorRequired: true, ttr: 30, movers }), 1);
  const r = sim.res['A'], m = r.machines[0], op = sim.movers[0];

  stepTo(sim, 48);
  assert.equal(op.state, 'operating');
  assert.equal(m.job.id, 5);

  stepTo(sim, 51);   // FAIL at t=50
  assert.equal(m.down, true);
  assert.equal(m.operator, op, 'operator stays attached to the broken machine');
  assert.equal(op.state, 'operating', 'operator is NOT released when the machine fails');
  const busyAtFail = op.aBusy;

  stepTo(sim, 79);   // one event before REP at t=80 (last arrival at 78)
  assert.equal(m.down, true);
  assert.equal(op.state, 'operating', 'operator waits for the entire repair');
  assert.ok(Math.abs((op.aBusy - busyAtFail) - 28) < 1e-9,
    'the wait counts as operator busy time (utilisation includes repair waits)');

  stepTo(sim, 81);   // resumed
  assert.equal(m.busy, true);
  assert.equal(m.job.id, 5);
  assert.equal(m.operator, op, 'the same operator finishes the job it started');

  stepTo(sim, 83);   // COMPLETE at 82 releases the operator; it is re-seized for job 6
  assert.equal(r.processed, 5);
  assert.equal(m.job.id, 6);
});

/* ================================================================
   An operator dispatched to a machine that fails BEFORE it arrives is
   released on arrival. Home 10 m away at speed 10 → 1 min travel.
   Job 1 arrives at t=1 → operator arrives at t=2. TTF=2 → machine
   (idle) goes down at t=2 just before the operator arrives. TTR=4.
   After the repair at t=6 a fresh request is raised; service starts
   at t=7 and survives repeated preempt-resume cycles (TTF=2 again
   after every repair): 1+2+2+2+2 min of work → completes exactly at
   t=37 with zero work lost.
   ================================================================ */
test('floor engine: an operator arriving at a down machine is released; the machine re-requests after repair', () => {
  const movers = [{ id: 'op1', kind: 'operator', speed: 10, home: { x: 10, y: 0 }, serves: { links: 'all', machines: 'all' } }];
  const sim = new FloorSim(floorModel({ operatorRequired: true, ttf: 2, ttr: 4, movers, interarrival: 1 }), 1);
  const r = sim.res['A'], m = r.machines[0], op = sim.movers[0];

  stepTo(sim, 2);    // FAIL at t=2 fires before OP_ARRIVE at t=2 (earlier seq)
  assert.equal(m.down, true);
  assert.ok(!m.operator, 'operator is NOT seized by a down machine');
  assert.notEqual(op.state, 'operating', 'operator walks away (released) instead of waiting');
  assert.ok(r.queue.length >= 1, 'the job is still waiting in the queue');

  stepTo(sim, 7.5);  // REP at 6 → new op request → travel 1 → service starts at 7
  assert.equal(m.busy, true);
  assert.equal(m.operator, op, 'after repair the machine raises a fresh request and gets the operator back');

  stepTo(sim, 36.5); // service interrupted by FAILs at 8,14,20,26,32 — still not done
  assert.equal(r.processed, 0);

  stepTo(sim, 37.5); // 10 min of service accumulated across 5 up-windows → done at exactly t=37
  assert.equal(r.processed, 1, 'work is conserved across repeated breakdowns (completes at t=37)');
});
