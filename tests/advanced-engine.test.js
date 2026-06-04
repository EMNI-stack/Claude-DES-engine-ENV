// Tests for the multi-part factory engine (AdvancedSim) — BOMs, routings,
// assembly synchronisation, breakdowns, supply and demand modes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdvancedSim, normalizeFactory } from '../src/advanced-engine.js';
import { newDist } from '../src/distributions.js';

/* ---- the default teaching factory: Frame and Assembly are shared ---- */
function factory(over = {}) {
  return normalizeFactory({
    resources: [
      { id: 'cutting', name: 'Cutting', capacity: 1, service: newDist('exp', { mean: 1.5 }), brk: false },
      { id: 'welding', name: 'Welding', capacity: 1, service: newDist('normal', { mean: 2.0, sd: 0.3 }), brk: false },
      { id: 'assembly', name: 'Assembly', capacity: 1, service: newDist('exp', { mean: 1.0 }), brk: false },
      { id: 'quality', name: 'Quality Check', capacity: 1, service: newDist('triangular', { min: 0.5, mode: 0.8, max: 1.5 }), brk: false },
    ],
    parts: [
      { id: 'frame', name: 'Frame', color: '#36e0c8', type: 'produced', bom: [],
        arrival: newDist('exp', { mean: 3 }),
        routing: [{ resourceId: 'cutting', service: newDist('exp', { mean: 1.5 }) }] },
      { id: 'body', name: 'Body', color: '#f2b13c', type: 'produced', bom: [],
        arrival: newDist('exp', { mean: 3 }),
        routing: [{ resourceId: 'welding', service: newDist('normal', { mean: 2.0, sd: 0.3 }) }] },
      { id: 'controller', name: 'Controller', color: '#8fb3c4', type: 'purchased', bom: [], routing: [],
        arrival: newDist('exp', { mean: 3 }) },
      { id: 'widget', name: 'Widget', color: '#ff8753', type: 'produced',
        bom: [{ partId: 'frame', qty: 1 }, { partId: 'body', qty: 1 }],
        routing: [{ resourceId: 'assembly', service: newDist('exp', { mean: 1.0 }) },
                  { resourceId: 'quality', service: newDist('triangular', { min: 0.5, mode: 0.8, max: 1.5 }) }] },
      { id: 'gadget', name: 'Gadget', color: '#c792ea', type: 'produced',
        bom: [{ partId: 'frame', qty: 1 }, { partId: 'controller', qty: 1 }],
        routing: [{ resourceId: 'assembly', service: newDist('exp', { mean: 1.0 }) },
                  { resourceId: 'quality', service: newDist('triangular', { min: 0.5, mode: 0.8, max: 1.5 }) }] },
    ],
    demand: [{ partId: 'widget', qty: 1 }, { partId: 'gadget', qty: 1 }],
    supplyMode: 'stream',
    demandMode: 'instant',
    demandDist: newDist('exp', { mean: 3 }),
    ...over,
  });
}

function runTo(sim, n) { for (let i = 0; i < n && sim.fel.length; i++) sim.step(); }

/* ================================================================
   1. Job conservation: created = completed + currently in system
   ================================================================ */
test('job conservation: created = completed + in system', () => {
  const sim = new AdvancedSim(factory(), 4242);
  runTo(sim, 100_000);
  assert.ok(sim.jobsCompleted > 2000, 'not enough completions');
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.WIP(),
    `created=${sim.jobsCreated} != completed(${sim.jobsCompleted})+WIP(${sim.WIP()})`);
  // per part type the same identity holds via the wip counters
  for (const p of sim.parts) {
    const st = sim.pstats[p.id];
    assert.equal(st.created, st.completed + st.wip, `part ${p.id} job count mismatch`);
  }
});

/* ================================================================
   2. Component conservation: every Widget consumed exactly 1 Frame
      and 1 Body; every Gadget exactly 1 Frame and 1 Controller.
      Frames produced - frames consumed = frames on hand.
   ================================================================ */
test('component conservation through assembly', () => {
  const cfg = factory();
  // frames feed BOTH products — arrive fast enough that neither starves
  cfg.parts[0].arrival = newDist('exp', { mean: 1.6 });
  const sim = new AdvancedSim(cfg, 9090);
  runTo(sim, 100_000);

  const wid = sim.pstats.widget.created, gad = sim.pstats.gadget.created;
  assert.ok(wid > 500 && gad > 500, 'not enough assemblies');
  assert.equal(sim.bomConsumed.widget.frame, wid, 'widget: frames consumed != widgets started');
  assert.equal(sim.bomConsumed.widget.body, wid, 'widget: bodies consumed != widgets started');
  assert.equal(sim.bomConsumed.gadget.frame, gad, 'gadget: frames consumed != gadgets started');
  assert.equal(sim.bomConsumed.gadget.controller, gad, 'gadget: controllers consumed != gadgets started');
  // material balance for the shared component
  const framesProduced = sim.pstats.frame.completed;
  const framesConsumed = sim.bomConsumed.widget.frame + sim.bomConsumed.gadget.frame;
  assert.equal(framesProduced - framesConsumed, sim.inventory.frame, 'frame material balance broken');
  assert.ok(sim.inventory.frame >= 0, 'negative frame inventory');
});

/* ================================================================
   3. Shared workcenter load: Cutting serves every Frame (demanded
      by both products). Utilisation = frame arrival rate × mean
      cutting time = (1/3) × 1.5 = 0.5; Assembly utilisation =
      (widget rate + gadget rate) × mean assembly time.
   ================================================================ */
test('shared workcenter utilisation adds up across products', () => {
  const sim = new AdvancedSim(factory(), 5151);
  runTo(sim, 200_000);
  const T = sim.now;

  const cutting = sim.resources[0];
  const utilCut = cutting.aBusy / T;            // capacity 1
  const theory = (1 / 3) * 1.5;                 // λ_frame × E[cut] = 0.5
  assert.ok(Math.abs(utilCut - theory) / theory < 0.05,
    `Cutting util ${utilCut.toFixed(3)} should be ≈ ${theory} (frame flow × mean cut time)`);

  const assembly = sim.resources[2];
  const utilAsm = assembly.aBusy / T;
  const rateBoth = (sim.pstats.widget.created + sim.pstats.gadget.created) / T;
  const expectAsm = rateBoth * 1.0;             // both products' assembly ops share it
  assert.ok(Math.abs(utilAsm - expectAsm) / expectAsm < 0.05,
    `Assembly util ${utilAsm.toFixed(3)} should be ≈ ${expectAsm.toFixed(3)} (sum of both products)`);
});

/* ================================================================
   4. Little's Law per workcenter: avg #jobs at the workcenter
      equals throughput × mean time at the workcenter (aN/T = sumFlow/T).
   ================================================================ */
test("Little's Law holds at every workcenter", () => {
  const sim = new AdvancedSim(factory(), 7777);
  runTo(sim, 200_000);
  const T = sim.now;
  for (const R of sim.resources) {
    if (R.processed < 500) continue;
    const avgN = R.aN / T;                       // time-average number present
    const thXw = (R.processed / T) * (R.sumFlow / R.processed);   // TH × mean flow time
    const rel = Math.abs(avgN - thXw) / avgN;
    assert.ok(rel < 0.05,
      `${R.cfg.name}: avgN=${avgN.toFixed(3)} vs TH×W=${thXw.toFixed(3)} (${(rel * 100).toFixed(1)}% off)`);
  }
});

/* ================================================================
   5. Assembly synchronisation: no assembly may start unless ALL BOM
      components are simultaneously available — component inventory
      must never go negative, even with breakdowns and demand streams.
   ================================================================ */
test('assembly never starts without all components (no negative inventory)', () => {
  const cfg = factory({ demandMode: 'stream', demandDist: newDist('exp', { mean: 2.5 }) });
  cfg.resources[2].brk = true;   // stress: Assembly breaks down
  cfg.resources[2].ttf = newDist('exp', { mean: 20 });
  cfg.resources[2].ttr = newDist('exp', { mean: 4 });
  const sim = new AdvancedSim(cfg, 1212);
  for (let i = 0; i < 80_000 && sim.fel.length; i++) {
    sim.step();
    for (const p of sim.parts) {
      const inv = sim.inventory[p.id];
      assert.ok(inv === Infinity || inv >= 0,
        `negative inventory for ${p.id} (${inv}) at t=${sim.now.toFixed(2)}`);
    }
  }
  assert.ok(sim.pstats.widget.created > 500, 'widgets were assembled');
  // demand conservation while we are at it
  for (const d of sim.demand) {
    const ds = sim.demandStats[d.partId];
    assert.equal(ds.demanded, ds.fulfilled + ds.stockouts, `${d.partId} demand counts broken`);
  }
});

/* ================================================================
   6. Limitless supply saturates the raw-material workcenters:
      Cutting and Welding never starve (utilisation ≈ 100%), and
      purchased components are always available (Infinity).
   ================================================================ */
test('limitless supply keeps first operations saturated', () => {
  const sim = new AdvancedSim(factory({ supplyMode: 'limitless' }), 6464);
  runTo(sim, 120_000);
  const T = sim.now;
  assert.ok(sim.resources[0].aBusy / T > 0.999, 'Cutting should never starve under limitless supply');
  assert.ok(sim.resources[1].aBusy / T > 0.999, 'Welding should never starve under limitless supply');
  assert.equal(sim.inventory.controller, Infinity, 'purchased part should be limitless');
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.WIP(), 'conservation under limitless supply');
});

/* ================================================================
   7. Scrap conservation per routing step:
      entered = completed-through + scrapped + still-at-step.
      (A blocked slot's job has finished the step, so it counts as
      done; jobs queued or in service count as still-at-step.)
   ================================================================ */
test('scrap conservation: entered = done + scrapped + at step', () => {
  const cfg = factory();
  cfg.parts[0].routing[0].scrapProbability = 0.08;     // frame @ cutting
  cfg.parts[3].routing[0].scrapProbability = 0.05;     // widget @ assembly
  cfg.parts[3].routing[1].scrapProbability = 0.12;     // widget @ quality
  cfg.parts[4].routing[1].scrapProbability = 0.10;     // gadget @ quality
  const sim = new AdvancedSim(cfg, 2468);
  runTo(sim, 120_000);

  assert.ok(sim.jobsScrapped > 200, 'not enough scrap events to be meaningful');
  // count jobs physically sitting at each (part, step) right now
  const atStep = {};
  for (const p of sim.parts) atStep[p.id] = (p.routing || []).map(() => 0);
  for (const R of sim.resources) {
    for (const job of R.queue) atStep[job.pid][job.step]++;
    for (const s of R.slots) if (s.job && !s.blocked) atStep[s.job.pid][s.job.step]++;
  }
  for (const p of sim.parts) {
    (p.routing || []).forEach((step, si) => {
      const ss = sim.stepStats[p.id][si];
      assert.equal(ss.entered, ss.done + ss.scrapped + atStep[p.id][si],
        `${p.id} op ${si + 1}: entered=${ss.entered} != done(${ss.done})+scrapped(${ss.scrapped})+atStep(${atStep[p.id][si]})`);
    });
  }
  // global: created = completed + scrapped + in system
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.jobsScrapped + sim.WIP(),
    'global conservation with scrap broken');
  // yield sanity for widget: ~ (1-.05)(1-.12)
  const st = sim.pstats.widget;
  const y = st.completed / (st.completed + st.scrapped);
  const expect = 0.95 * 0.88 / (0.95 * 0.88 + (1 - 0.95 * 0.88));   // per-job survival = yield
  assert.ok(Math.abs(y - expect) < 0.05, `widget yield ${y.toFixed(3)} ≈ ${expect.toFixed(3)} expected`);
});

/* ================================================================
   8. Finite queue capacity: no queue ever exceeds it, and upstream
      slots actually spend time blocked (amber state).
   ================================================================ */
test('queues never exceed capacity; blocking time accrues', () => {
  const cfg = factory({ supplyMode: 'limitless' });
  cfg.resources[2].queueCap = 2;   // Assembly queue holds at most 2
  cfg.resources[3].queueCap = 1;   // Quality Check holds at most 1
  const sim = new AdvancedSim(cfg, 1357);
  for (let i = 0; i < 80_000 && sim.fel.length; i++) {
    sim.step();
    assert.ok(sim.resources[2].queue.length <= 2,
      `Assembly queue ${sim.resources[2].queue.length} > 2 at t=${sim.now.toFixed(2)}`);
    assert.ok(sim.resources[3].queue.length <= 1,
      `Quality queue ${sim.resources[3].queue.length} > 1 at t=${sim.now.toFixed(2)}`);
  }
  assert.ok(sim.resources[2].aBlk > 0, 'Assembly never blocked on the tiny Quality queue');
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.jobsScrapped + sim.WIP(),
    'conservation with blocking broken');
});

/* ================================================================
   9. CONWIP pull: per-product jobs in flight never exceed the
      conwip limit at any point; demand backlog conservation holds.
   ================================================================ */
test('pull mode: in-flight jobs never exceed CONWIP limits', () => {
  const cfg = factory({
    supplyMode: 'limitless',
    controlMode: 'pull',
    demandMode: 'stream',
    demandDist: newDist('exp', { mean: 1.0 }),   // hungry demand → limits bind
  });
  cfg.demand[0].conwip = 4;   // widget
  cfg.demand[1].conwip = 3;   // gadget
  const sim = new AdvancedSim(cfg, 8642);
  for (let i = 0; i < 100_000 && sim.fel.length; i++) {
    sim.step();
    assert.ok(sim.pstats.widget.wip <= 4,
      `widget in-flight ${sim.pstats.widget.wip} > CONWIP 4 at t=${sim.now.toFixed(2)}`);
    assert.ok(sim.pstats.gadget.wip <= 3,
      `gadget in-flight ${sim.pstats.gadget.wip} > CONWIP 3 at t=${sim.now.toFixed(2)}`);
  }
  for (const d of sim.demand) {
    const ds = sim.demandStats[d.partId];
    assert.ok(ds.fulfilled > 500, `${d.partId}: pull line barely produced`);
    assert.equal(ds.demanded, ds.fulfilled + ds.backlog,
      `${d.partId}: demanded != fulfilled + backlog (no lost sales in pull)`);
    assert.equal(ds.stockouts, 0, 'pull mode defers demand instead of losing it');
  }
});

/* ================================================================
   11. Per-product demand streams: each demand product samples its OWN
       interarrival distribution, so two products with very different
       means generate demand counts in the expected (inverse-mean) ratio.
   ================================================================ */
test('per-product demand streams fire at their own rates', () => {
  const cfg = factory({ demandMode: 'stream' });
  cfg.demand[0].dist = newDist('exp', { mean: 2 });   // widget — fast (4× the events)
  cfg.demand[1].dist = newDist('exp', { mean: 8 });   // gadget — slow
  const sim = new AdvancedSim(cfg, 31415);
  runTo(sim, 200_000);

  const wd = sim.demandStats.widget.demanded;
  const gd = sim.demandStats.gadget.demanded;
  assert.ok(wd > 1000 && gd > 200, `not enough demand events (widget=${wd}, gadget=${gd})`);
  const ratio = wd / gd;                       // means 8:2 ⇒ rates 1/2 : 1/8 ⇒ counts ≈ 4:1
  assert.ok(Math.abs(ratio - 4) / 4 < 0.1,
    `widget/gadget demand ratio ${ratio.toFixed(2)} should be ≈ 4 (independent per-product streams)`);
});

/* ================================================================
   12. Fair allocation of a scarce shared component: Frame feeds BOTH
       Widget and Gadget, and is supplied slower than the two products
       combined could consume it. Round-robin must keep either product
       from monopolising the shared Frame — each gets a meaningful share
       instead of one getting ~all and the other ~none.
   ================================================================ */
test('scarce shared component is split fairly between products', () => {
  const cfg = factory({ supplyMode: 'stream', demandMode: 'instant' });
  // Frame (the shared input) is gated by Cutting at ~1/1.5 = 0.67/min, while
  // Body and Controller are plentiful — so Frame is the single binding
  // constraint that both products compete for.
  cfg.parts[0].arrival = newDist('exp', { mean: 1.0 });   // frame  -> cutting (the bottleneck)
  cfg.parts[1].arrival = newDist('exp', { mean: 0.3 });   // body   -> plentiful (widget's other input)
  cfg.parts[2].arrival = newDist('exp', { mean: 0.3 });   // controller (purchased) -> plentiful
  const sim = new AdvancedSim(cfg, 24680);
  runTo(sim, 200_000);

  const w = sim.pstats.widget.completed;
  const g = sim.pstats.gadget.completed;
  const total = w + g;
  assert.ok(total > 1000, `not enough assemblies (widget=${w}, gadget=${g})`);
  assert.ok(w / total >= 0.3 && g / total >= 0.3,
    `neither product starved of the shared Frame: widget ${(100 * w / total).toFixed(0)}%, ` +
    `gadget ${(100 * g / total).toFixed(0)}% of ${total} (round-robin should keep both ≥30%)`);

  // correctness unaffected: Frame material balance still holds exactly
  const framesConsumed = sim.bomConsumed.widget.frame + sim.bomConsumed.gadget.frame;
  assert.equal(sim.pstats.frame.completed - framesConsumed, sim.inventory.frame,
    'frame material balance broken under round-robin');
});

/* ================================================================
   10. Little's Law per workcenter still holds with scrap, finite
       queues (blocking) and breakdowns all active. Uses departure
       counts (blocked time at a workcenter belongs to its flow time).
   ================================================================ */
test("Little's Law holds per workcenter with scrap + blocking + breakdowns", () => {
  const cfg = factory();
  cfg.parts[3].routing[1].scrapProbability = 0.1;
  cfg.resources[3].queueCap = 2;
  cfg.resources[2].brk = true;
  cfg.resources[2].ttf = newDist('exp', { mean: 30 });
  cfg.resources[2].ttr = newDist('exp', { mean: 3 });
  const sim = new AdvancedSim(cfg, 9753);
  runTo(sim, 200_000);
  const T = sim.now;
  for (const R of sim.resources) {
    if (R.departed < 500) continue;
    const avgN = R.aN / T;
    const thXw = (R.departed / T) * (R.sumFlow / R.departed);
    const rel = Math.abs(avgN - thXw) / avgN;
    assert.ok(rel < 0.05,
      `${R.cfg.name}: avgN=${avgN.toFixed(3)} vs TH×W=${thXw.toFixed(3)} (${(rel * 100).toFixed(1)}% off)`);
  }
});

/* ================================================================
   13. Dependent demand in pull mode (the reported bug): an intermediate
       ("Computer") is BOTH a demand product with RARE external demand AND
       a component of a parent ("Upgraded PC") with FREQUENT demand. The
       parent must actually be produced — i.e. the intermediate is pulled
       to satisfy dependent demand, not throttled to its own rare external
       backlog (which would starve the parent to ~0).
   ================================================================ */
test('pull: dependent demand pulls an intermediate to feed a frequent-demand parent', () => {
  const cfg = normalizeFactory({
    resources: [
      { id: 'wcA', name: 'Build Computer', capacity: 1, service: newDist('exp', { mean: 1.0 }), brk: false },
      { id: 'wcB', name: 'Build PC', capacity: 1, service: newDist('exp', { mean: 1.0 }), brk: false },
    ],
    parts: [
      { id: 'raw', name: 'Raw', color: '#888888', type: 'purchased', bom: [], routing: [] },
      { id: 'computer', name: 'Computer', color: '#36e0c8', type: 'produced',
        bom: [{ partId: 'raw', qty: 1 }], routing: [{ resourceId: 'wcA', service: newDist('exp', { mean: 1.0 }) }] },
      { id: 'upc', name: 'Upgraded PC', color: '#f2b13c', type: 'produced',
        bom: [{ partId: 'computer', qty: 1 }], routing: [{ resourceId: 'wcB', service: newDist('exp', { mean: 1.0 }) }] },
    ],
    demand: [
      { partId: 'computer', qty: 1, conwip: 8, dist: newDist('exp', { mean: 50 }) },   // RARE external demand
      { partId: 'upc', qty: 1, conwip: 5, dist: newDist('exp', { mean: 2 }) },          // FREQUENT external demand
    ],
    supplyMode: 'limitless', demandMode: 'stream', controlMode: 'pull',
  });
  const sim = new AdvancedSim(cfg, 13579);
  for (let i = 0; i < 200_000 && sim.fel.length; i++) {
    sim.step();
    assert.ok(sim.pstats.computer.wip <= 8, `computer in-flight ${sim.pstats.computer.wip} > CONWIP 8`);
    assert.ok(sim.pstats.upc.wip <= 5, `upc in-flight ${sim.pstats.upc.wip} > CONWIP 5`);
  }
  // the parent is genuinely produced (it would be ~0 without dependent-demand propagation)
  assert.ok(sim.pstats.upc.completed > 300,
    `Upgraded PC barely produced (${sim.pstats.upc.completed}) — dependent demand is not propagating`);
  // the intermediate was produced far beyond its own rare external demand
  assert.ok(sim.pstats.computer.completed > 300,
    `Computer not produced for dependent demand (${sim.pstats.computer.completed})`);
  assert.ok(sim.pstats.computer.completed >= sim.bomConsumed.upc.computer,
    'more computers consumed by PCs than were produced (negative balance)');
  // pull mode: no lost sales, demand conserved
  for (const d of sim.demand) {
    const ds = sim.demandStats[d.partId];
    assert.equal(ds.demanded, ds.fulfilled + ds.backlog, `${d.partId}: demanded != fulfilled + backlog`);
    assert.equal(ds.stockouts, 0, `${d.partId}: pull mode should not lose sales`);
  }
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.WIP(), 'job conservation broken');
});

/* ================================================================
   14. Multi-level BOM under pull: Grandparent -> Parent -> Component,
       only the grandparent is sold. Demand must explode all the way down
       (both intermediates get produced), CONWIP bounds hold on the sold
       part, and the un-capped intermediates do not run away.
   ================================================================ */
test('pull: demand propagates through a multi-level BOM (grandparent → parent → component)', () => {
  const cfg = normalizeFactory({
    resources: [
      { id: 'w1', name: 'Make Component', capacity: 1, service: newDist('exp', { mean: 0.8 }), brk: false },
      { id: 'w2', name: 'Make Parent', capacity: 1, service: newDist('exp', { mean: 0.8 }), brk: false },
      { id: 'w3', name: 'Make Grand', capacity: 1, service: newDist('exp', { mean: 0.8 }), brk: false },
    ],
    parts: [
      { id: 'raw', name: 'Raw', color: '#888888', type: 'purchased', bom: [], routing: [] },
      { id: 'comp', name: 'Component', color: '#36e0c8', type: 'produced',
        bom: [{ partId: 'raw', qty: 1 }], routing: [{ resourceId: 'w1', service: newDist('exp', { mean: 0.8 }) }] },
      { id: 'parent', name: 'Parent', color: '#f2b13c', type: 'produced',
        bom: [{ partId: 'comp', qty: 1 }], routing: [{ resourceId: 'w2', service: newDist('exp', { mean: 0.8 }) }] },
      { id: 'grand', name: 'Grandparent', color: '#c792ea', type: 'produced',
        bom: [{ partId: 'parent', qty: 1 }], routing: [{ resourceId: 'w3', service: newDist('exp', { mean: 0.8 }) }] },
    ],
    demand: [{ partId: 'grand', qty: 1, conwip: 6, dist: newDist('exp', { mean: 2 }) }],   // only the top is sold
    supplyMode: 'limitless', demandMode: 'stream', controlMode: 'pull',
  });
  const sim = new AdvancedSim(cfg, 24681);
  for (let i = 0; i < 200_000 && sim.fel.length; i++) {
    sim.step();
    assert.ok(sim.pstats.grand.wip <= 6, `grand in-flight ${sim.pstats.grand.wip} > CONWIP 6`);
    // intermediates are CONWIP-uncapped but bounded by the (capped) dependent demand — no runaway
    assert.ok(sim.pstats.comp.wip < 50 && sim.pstats.parent.wip < 50, 'intermediate WIP ran away');
    assert.ok(sim.inventory.comp < 100 && sim.inventory.parent < 100, 'intermediate inventory ran away');
  }
  assert.ok(sim.pstats.grand.completed > 300, `grand not produced (${sim.pstats.grand.completed})`);
  assert.ok(sim.pstats.parent.completed > 300, `parent dependent demand not propagated (${sim.pstats.parent.completed})`);
  assert.ok(sim.pstats.comp.completed > 300, `component dependent demand not propagated (${sim.pstats.comp.completed})`);
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.WIP(), 'job conservation broken');
  const ds = sim.demandStats.grand;
  assert.equal(ds.demanded, ds.fulfilled + ds.backlog, 'grand demand conservation broken');
  assert.equal(ds.stockouts, 0, 'pull mode should not lose sales');
});

/* ================================================================
   15. Shared intermediate with BOTH consumers under pull: "Shared Module"
       is sold to customers AND consumed by "Product". Neither consumer may
       monopolise the finished pool — both must be served — and demand +
       entity conservation must hold.
   ================================================================ */
test('pull: an intermediate with both external and internal consumers serves both', () => {
  const cfg = normalizeFactory({
    resources: [
      { id: 'wS', name: 'Make Shared', capacity: 1, service: newDist('exp', { mean: 0.6 }), brk: false },
      { id: 'wP', name: 'Make Product', capacity: 1, service: newDist('exp', { mean: 0.9 }), brk: false },
    ],
    parts: [
      { id: 'raw', name: 'Raw', color: '#888888', type: 'purchased', bom: [], routing: [] },
      { id: 'shared', name: 'Shared Module', color: '#36e0c8', type: 'produced',
        bom: [{ partId: 'raw', qty: 1 }], routing: [{ resourceId: 'wS', service: newDist('exp', { mean: 0.6 }) }] },
      { id: 'product', name: 'Product', color: '#f2b13c', type: 'produced',
        bom: [{ partId: 'shared', qty: 1 }], routing: [{ resourceId: 'wP', service: newDist('exp', { mean: 0.9 }) }] },
    ],
    demand: [
      { partId: 'shared', qty: 1, conwip: 10, dist: newDist('exp', { mean: 4 }) },   // external customers
      { partId: 'product', qty: 1, conwip: 6, dist: newDist('exp', { mean: 3 }) },    // internal consumer
    ],
    supplyMode: 'limitless', demandMode: 'stream', controlMode: 'pull',
  });
  const sim = new AdvancedSim(cfg, 36912);
  for (let i = 0; i < 200_000 && sim.fel.length; i++) {
    sim.step();
    assert.ok(sim.pstats.shared.wip <= 10, `shared in-flight ${sim.pstats.shared.wip} > CONWIP 10`);
    assert.ok(sim.pstats.product.wip <= 6, `product in-flight ${sim.pstats.product.wip} > CONWIP 6`);
  }
  // BOTH consumers served — neither starved the other
  assert.ok(sim.demandStats.shared.fulfilled > 300,
    `external customers of the shared module starved (${sim.demandStats.shared.fulfilled})`);
  assert.ok(sim.pstats.product.completed > 300,
    `product (internal consumer) starved of the shared module (${sim.pstats.product.completed})`);
  for (const d of sim.demand) {
    const ds = sim.demandStats[d.partId];
    assert.equal(ds.demanded, ds.fulfilled + ds.backlog, `${d.partId}: demanded != fulfilled + backlog`);
    assert.equal(ds.stockouts, 0, `${d.partId}: pull mode should not lose sales`);
  }
  assert.equal(sim.jobsCreated, sim.jobsCompleted + sim.WIP(), 'job conservation broken');
});
