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
