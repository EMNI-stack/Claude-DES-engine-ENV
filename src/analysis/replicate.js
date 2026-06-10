// Replication driver — Phase 4.1.
//
// Robinson's core message made operational: a single run is ONE sample path, not
// "the answer". This runs an engine model for N independent replications (distinct
// reproducible seeds) and, so warm-up deletion can later be explored WITHOUT
// re-running, records read-only accumulator SNAPSHOTS on a time grid for each rep.
//
// A response over a window [a, b] is then a pure delta of two snapshots, so the
// per-rep response scalars (and hence the across-rep confidence interval) recompute
// instantly for any warm-up cut-off `a`. See docs/PHASE-4-DESIGN.md §3 and
// theory-notes §3 (Law ch 9). No engine changes — every field read here is a public
// FloorSim accumulator, and FloorSim.accumulate(t) is the same call floor.js uses.

import { FloorSim } from '../floor-engine.js';

/**
 * Read-only snapshot of the cumulative (area + counter) accumulators at time t.
 * Calls sim.accumulate(t) to bring the time-persistent areas up to t even when the
 * last event fell short of t (idempotent: accumulate only accrues dt = t - lastT > 0,
 * so resuming the run afterwards never double-counts).
 */
export function snapshot(sim, t) {
  sim.accumulate(t);
  const perRes = {};
  for (const id in sim.res) {
    const r = sim.res[id];
    perRes[id] = { name: (r.node && r.node.name) || id, machines: r.machines.length, aBusy: r.aBusy };
  }
  const perPart = {};
  if (sim.pstats) for (const pid in sim.pstats) perPart[pid] = { completed: sim.pstats[pid].completed, sumCycle: sim.pstats[pid].sumCycle };
  // demand totals: prefer the per-part demand stats (process model), else the single-part counters.
  let demanded = sim.demanded || 0, fulfilled = sim.fulfilled || 0;
  if (sim.demandStats && Object.keys(sim.demandStats).length) {
    demanded = 0; fulfilled = 0;
    for (const k in sim.demandStats) { demanded += sim.demandStats[k].demanded; fulfilled += sim.demandStats[k].fulfilled; }
  }
  return {
    t,
    completed: sim.completed, scrapped: sim.scrapped,
    areaWIP: sim.areaWIP, sumCycle: sim.sumCycle,
    sumJobTransit: sim.sumJobTransit, areaTransit: sim.areaTransit,
    demanded, fulfilled, perPart, perRes,
  };
}

/**
 * Run `runModel` for `reps` independent replications, each stepped on a time grid
 * to `horizon`, recording a snapshot at every grid point (including t=0).
 *
 * @param {object} runModel  an engine run-model (as produced by app/js/run-model.js)
 * @param {object} opts
 *   reps        number of replications (default 10)
 *   horizon     run length in model time units (default 480)
 *   gridPoints  snapshots after t=0 (default 200); grid step = horizon / gridPoints
 *   baseSeed    first seed; rep k uses baseSeed + k (default 1) — same base across
 *               scenarios later gives the common-random-numbers pairing
 * @returns {{ reps: Array, grid: number[], horizon, gridPoints, baseSeed,
 *             topPartIds: string[] }}
 */
export function replicate(runModel, { reps = 10, horizon = 480, gridPoints = 200, baseSeed = 1 } = {}) {
  reps = Math.max(1, reps | 0);
  gridPoints = Math.max(1, gridPoints | 0);
  const step = horizon / gridPoints;
  const grid = [];
  for (let g = 0; g <= gridPoints; g++) grid.push(g === gridPoints ? horizon : g * step);

  const out = [];
  let topPartIds = null;
  for (let k = 0; k < reps; k++) {
    const seed = baseSeed + k;
    const sim = new FloorSim(runModel, seed);
    const snaps = [snapshot(sim, 0)];
    for (let g = 1; g < grid.length; g++) {
      sim.run({ until: grid[g] });
      snaps.push(snapshot(sim, grid[g]));
    }
    if (!topPartIds) topPartIds = topLevelParts(runModel);
    out.push({ seed, deadlocked: !!sim.deadlocked, snapshots: snaps });
  }
  return { reps: out, grid, horizon, gridPoints, baseSeed, topPartIds: topPartIds || [] };
}

/** Part ids that are products / sold output (not consumed as a component by another part). */
function topLevelParts(runModel) {
  const parts = runModel.parts || [];
  const components = new Set();
  for (const p of parts) for (const b of (p.bom || [])) components.add(b.partId);
  const top = parts.filter((p) => !components.has(p.id)).map((p) => p.id);
  return top.length ? top : parts.map((p) => p.id);
}

/**
 * Response scalars over the window [A.t, B.t] from two snapshots (area / counter deltas).
 * Time-persistent quantities (WIP, utilisation) use the area method; per-entity quantities
 * (cycle time, in-transport) are sample means over jobs completed IN the window.
 */
export function windowResponse(A, B) {
  const span = B.t - A.t;
  const nDone = B.completed - A.completed;
  const dDemanded = B.demanded - A.demanded;
  const util = {};
  for (const id in B.perRes) {
    const a = (A.perRes[id] || { aBusy: 0 }).aBusy, b = B.perRes[id].aBusy;
    const m = B.perRes[id].machines || 1;
    util[id] = span > 0 ? (b - a) / (m * span) : NaN;
  }
  const perPart = {};
  for (const pid in B.perPart) {
    const a = A.perPart[pid] || { completed: 0, sumCycle: 0 }, b = B.perPart[pid];
    const dc = b.completed - a.completed;
    perPart[pid] = { throughput: span > 0 ? dc / span : NaN, cycleTime: dc > 0 ? (b.sumCycle - a.sumCycle) / dc : NaN, completed: dc };
  }
  return {
    span,
    throughput: span > 0 ? nDone / span : NaN,
    avgWIP: span > 0 ? (B.areaWIP - A.areaWIP) / span : NaN,
    cycleTime: nDone > 0 ? (B.sumCycle - A.sumCycle) / nDone : NaN,
    inTransport: nDone > 0 ? (B.sumJobTransit - A.sumJobTransit) / nDone : NaN,
    avgInTransit: span > 0 ? (B.areaTransit - A.areaTransit) / span : NaN,
    fillRate: dDemanded > 0 ? (B.fulfilled - A.fulfilled) / dDemanded : NaN,
    completed: nDone,
    utilisation: util,
    perPart,
  };
}

/**
 * Per-rep response rows for a given warm-up cut-off (a grid index; 0 = no warm-up).
 * Each row is a flat object of named responses + per-resource utilisation
 * ("util:<id>"), suitable for summarizeReplications().
 * @returns {{ rows: object[], bottleneck: {id,name,util}|null, resNames: object }}
 */
export function responsesAtCutoff(result, cutoffIndex = 0) {
  const last = result.grid.length - 1;
  const ci = Math.max(0, Math.min(cutoffIndex | 0, last - 1));
  const rows = [];
  const resNames = {};
  for (const rep of result.reps) {
    const r = windowResponse(rep.snapshots[ci], rep.snapshots[last]);
    const row = {
      seed: rep.seed,
      throughput: r.throughput,
      avgWIP: r.avgWIP,
      cycleTime: r.cycleTime,
      inTransport: r.inTransport,
      avgInTransit: r.avgInTransit,
      fillRate: r.fillRate,
    };
    for (const id in r.utilisation) row['util:' + id] = r.utilisation[id];
    rows.push(row);
  }
  // resource display names from the first rep's last snapshot
  const lastSnap = result.reps[0].snapshots[last];
  for (const id in lastSnap.perRes) resNames[id] = lastSnap.perRes[id].name;
  // bottleneck = highest mean utilisation across reps
  let bottleneck = null;
  for (const id in resNames) {
    const us = rows.map((row) => row['util:' + id]).filter((v) => Number.isFinite(v));
    if (!us.length) continue;
    const mu = us.reduce((s, v) => s + v, 0) / us.length;
    if (!bottleneck || mu > bottleneck.util) bottleneck = { id, name: resNames[id], util: mu };
  }
  return { rows, bottleneck, resNames, cutoffIndex: ci, cutoffTime: result.grid[ci] };
}

/**
 * Welch-style per-grid-bucket time series of average WIP for each rep, aligned on
 * the common grid — the input to welchAverage()/welchWarmup() in M2. The bucket
 * average WIP is the area-method mean over (t_{g-1}, t_g], a proper time average.
 * @returns {Array<{rep:number, t:number, wip:number}>}
 */
export function wipTimeseries(result) {
  const ts = [];
  result.reps.forEach((rep, k) => {
    for (let g = 1; g < rep.snapshots.length; g++) {
      const A = rep.snapshots[g - 1], B = rep.snapshots[g];
      const dt = B.t - A.t;
      ts.push({ rep: k, t: B.t, wip: dt > 0 ? (B.areaWIP - A.areaWIP) / dt : 0 });
    }
  });
  return ts;
}
