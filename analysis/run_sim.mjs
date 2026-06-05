// analysis/run_sim.mjs — data bridge between the DES engines and the Python
// analysis companion. Imports the SAME engine code the browser app uses, runs
// N seeded replications of the simple line (Sim) and the advanced factory
// (AdvancedSim), samples WIP/FG/output on a uniform clock grid, and writes the
// `des-analysis/v1` JSON schema documented in analysis/NOTES.md.
//
// Usage:
//   node analysis/run_sim.mjs [--kind both|simple|advanced] [--reps N]
//        [--time T] [--samples M] [--seed BASE] [--outdir DIR]
// Defaults: --kind both --reps 12 --time 20000 --samples 500 --seed 1000
//           --outdir analysis/sample_data
//
// The browser "Download data (JSON)" buttons emit the same schema for a single
// live run, so harness files and browser files are interchangeable downstream.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

import { Sim, defaultConfig } from '../src/engine.js';
import { AdvancedSim, normalizeFactory } from '../src/advanced-engine.js';
import { newDist, distMean, distScv } from '../src/distributions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* ---------- tiny CLI ---------- */
function parseArgs(argv) {
  const a = { kind: 'both', reps: 12, time: 20000, samples: 500, seed: 1000, outdir: 'analysis/sample_data',
    control: null, demand: null, supply: null, conwip: 6, scenario: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--kind') a.kind = argv[++i];
    else if (k === '--reps') a.reps = parseInt(argv[++i], 10);
    else if (k === '--time') a.time = parseFloat(argv[++i]);
    else if (k === '--samples') a.samples = parseInt(argv[++i], 10);
    else if (k === '--seed') a.seed = parseInt(argv[++i], 10);
    else if (k === '--outdir') a.outdir = argv[++i];
    else if (k === '--control') a.control = argv[++i];     // push | pull
    else if (k === '--demand') a.demand = argv[++i];       // instant | stream
    else if (k === '--supply') a.supply = argv[++i];       // limitless | stream
    else if (k === '--conwip') a.conwip = parseInt(argv[++i], 10);
    else if (k === '--scenario') a.scenario = argv[++i];   // output filename stem
    else if (k === '--sweep') a.sweep = true;              // CONWIP characteristic-curve sweep
    else if (k === '--wipMax') a.wipMax = parseInt(argv[++i], 10);
  }
  return a;
}

// Apply CLI control/demand/supply overrides to an advanced config in place.
function applyAdvancedOverrides(cfg, opts) {
  if (opts.supply) cfg.supplyMode = opts.supply;
  if (opts.demand) cfg.demandMode = opts.demand;
  if (opts.control) cfg.controlMode = opts.control;
  if (cfg.controlMode === 'pull') {
    cfg.demandMode = 'stream';
    for (const d of cfg.demand) d.conwip = Math.max(1, opts.conwip | 0 || 6);
    if (!cfg.demandDist) cfg.demandDist = newDist('exp', { mean: 3 });
  }
  return cfg;
}
// Apply overrides to a simple-line config in place.
function applySimpleOverrides(cfg, opts) {
  if (opts.supply) cfg.supply = opts.supply;
  if (opts.control) cfg.control = opts.control;
  if (opts.demand === 'stream' && (!cfg.demand || cfg.demand.mode !== 'stream')) {
    cfg.demand = { mode: 'stream', dist: newDist('exp', { mean: 2.5 }) };
  }
  return cfg;
}

const r = (v, d = 4) => {
  if (v == null || !isFinite(v)) return v == null ? null : v;
  const m = 10 ** d; return Math.round(v * m) / m;
};

/* ---------- the advanced default teaching factory (matches the app demo) ---------- */
function advancedDefaultConfig() {
  const cut = newDist('exp', { mean: 1.5 });
  const weld = newDist('normal', { mean: 2.0, sd: 0.3 });
  const asm = newDist('exp', { mean: 1.0 });
  const qc = newDist('triangular', { min: 0.5, mode: 0.8, max: 1.5 });
  return normalizeFactory({
    resources: [
      { id: 'cutting', name: 'Cutting', capacity: 1, service: newDist('exp', { mean: 1.5 }), brk: false },
      { id: 'welding', name: 'Welding', capacity: 1, service: newDist('normal', { mean: 2.0, sd: 0.3 }), brk: false },
      { id: 'assembly', name: 'Assembly', capacity: 1, service: newDist('exp', { mean: 1.0 }), brk: false },
      { id: 'quality', name: 'Quality Check', capacity: 1, service: newDist('triangular', { min: 0.5, mode: 0.8, max: 1.5 }), brk: false },
    ],
    parts: [
      { id: 'frame', name: 'Frame', color: '#36e0c8', type: 'produced', bom: [], arrival: newDist('exp', { mean: 1.6 }),
        routing: [{ resourceId: 'cutting', service: cloneOf(cut) }] },
      { id: 'body', name: 'Body', color: '#f2b13c', type: 'produced', bom: [], arrival: newDist('exp', { mean: 3 }),
        routing: [{ resourceId: 'welding', service: cloneOf(weld) }] },
      { id: 'controller', name: 'Controller', color: '#8fb3c4', type: 'purchased', bom: [], routing: [], arrival: newDist('exp', { mean: 3 }) },
      { id: 'widget', name: 'Widget', color: '#ff8753', type: 'produced',
        bom: [{ partId: 'frame', qty: 1 }, { partId: 'body', qty: 1 }],
        routing: [{ resourceId: 'assembly', service: cloneOf(asm) }, { resourceId: 'quality', service: cloneOf(qc) }] },
      { id: 'gadget', name: 'Gadget', color: '#c792ea', type: 'produced',
        bom: [{ partId: 'frame', qty: 1 }, { partId: 'controller', qty: 1 }],
        routing: [{ resourceId: 'assembly', service: cloneOf(asm) }, { resourceId: 'quality', service: cloneOf(qc) }] },
    ],
    demand: [{ partId: 'widget', qty: 1 }, { partId: 'gadget', qty: 1 }],
    supplyMode: 'stream',
    demandMode: 'instant',
    demandDist: newDist('exp', { mean: 3 }),
  });
}
const cloneOf = (d) => ({ type: d.type, params: { ...d.params }, variability: d.variability || 0 });

/* ---------- uniform-grid time sampler (carry-forward of post-event state) ---------- */
function peekTime(sim) {
  if (!sim.fel || !sim.fel.length) return Infinity;
  return typeof sim.fel.peek === 'function' ? sim.fel.peek().time : sim.fel[0].time;
}

function runReplication(sim, T, M, snap) {
  const dt = T / M;
  const ts = { t: [], wip: [], fg: [], completed: [] };
  for (let g = 0; g <= M; g++) {
    const gt = g * dt;
    // advance through every event scheduled at or before this grid point
    while (sim.fel.length && peekTime(sim) <= gt) sim.step();
    const s = snap(sim);                 // state is constant on [now, next event) ⊇ gt
    ts.t.push(r(gt, 3)); ts.wip.push(s.wip); ts.fg.push(s.fg); ts.completed.push(s.completed);
  }
  sim.accumulate(T); sim.now = T;        // finalize time-integrals over the tail interval
  return ts;
}

/* ---------- simple line (Sim) ---------- */
function simpleConfigSummary(cfg) {
  return {
    control: cfg.control === 'pull' ? 'pull' : 'push',
    supply: cfg.supply === 'limitless' ? 'limitless' : 'stream',
    demandMode: (cfg.demand && cfg.demand.mode === 'stream') ? 'stream' : 'instant',
    summary: `${cfg.stations.length}-station line, ${cfg.control || 'push'} / ${cfg.supply || 'stream'} supply`,
    // entry interarrival variability for the linking-equation propagation view;
    // null under limitless supply (station 0 is never starved → no external stream).
    arrivalScv: cfg.supply === 'limitless' ? null : (cfg.source ? r(distScv(cfg.source)) : null),
    resources: cfg.stations.map((s, k) => ({
      id: `s${k}`, name: s.name, capacity: s.machines,
      serviceMean: r(distMean(s.service)), serviceScv: r(distScv(s.service)),
      scrap: s.scrap || 0, brk: !!s.brk,
    })),
  };
}

function simpleReplication(cfg, seed, T, M) {
  const sim = new Sim(cfg, seed);
  const snap = (s) => ({ wip: s.WIP(), fg: s.fg, completed: s.completed });
  const ts = runReplication(sim, T, M, snap);
  const Tn = sim.now || 1e-9;
  const fin = sim.completed + sim.scrapped;
  const resources = sim.stations.map((st, k) => {
    const Mc = st.machines.length;
    return {
      id: `s${k}`, name: st.cfg.name, capacity: Mc,
      utilization: r(st.aBusy / (Mc * Tn)), blocked: r(st.aBlk / (Mc * Tn)),
      down: r(st.aDown / (Mc * Tn)), avgQueue: r(st.aQ / Tn),
      processed: st.processed, throughput: r(st.processed / Tn),
    };
  });
  return {
    seed, now: r(sim.now, 3), events: sim.events,
    scalars: {
      throughput: r(sim.completed / Tn), avgWIP: r(sim.areaWIP / Tn),
      avgCycleTime: sim.completed ? r(sim.sumCycle / sim.completed) : null,
      yield: fin ? r(sim.completed / fin) : null,
      fillRate: sim.demanded ? r(sim.fulfilled / sim.demanded) : null,
      avgFG: r(sim.aFG / Tn),
      entered: sim.entered, completed: sim.completed, scrapped: sim.scrapped,
      rejected: sim.rejected, demanded: sim.demanded, fulfilled: sim.fulfilled, stockouts: sim.stockouts,
    },
    resources,
    cycleSamples: sim.cycles.map((ct) => ({ part: 'unit', ct: r(ct, 4) })),
    timeseries: ts,
  };
}

/* ---------- advanced factory (AdvancedSim) ---------- */
function advancedConfigSummary(cfg) {
  return {
    control: cfg.controlMode === 'pull' ? 'pull' : 'push',
    supply: cfg.supplyMode === 'stream' ? 'stream' : 'limitless',
    demandMode: cfg.demandMode === 'stream' ? 'stream' : 'instant',
    summary: `${cfg.resources.length} workcenters · ${cfg.parts.length} parts · ${cfg.controlMode || 'push'}`,
    resources: cfg.resources.map((rc) => ({
      id: rc.id, name: rc.name, capacity: Math.max(1, rc.capacity | 0),
      serviceMean: r(distMean(rc.service)), serviceScv: r(distScv(rc.service)), scrap: 0, brk: !!rc.brk,
    })),
    parts: cfg.parts.map((p) => ({
      id: p.id, name: p.name, type: p.type,
      bom: (p.bom || []).map((b) => ({ partId: b.partId, qty: b.qty })),
      routingMean: r((p.routing || []).reduce((a, s) => a + distMean(s.service), 0)),
      isDemand: (cfg.demand || []).some((d) => d.partId === p.id),
    })),
  };
}

function advancedReplication(cfg, seed, T, M) {
  const sim = new AdvancedSim(cfg, seed);
  const demandIds = new Set((cfg.demand || []).map((d) => d.partId));
  const fgOf = (s) => {
    let f = 0;
    for (const id of demandIds) { const inv = s.inventory[id]; if (inv !== Infinity && inv > 0) f += inv; }
    return f;
  };
  const snap = (s) => ({ wip: s.WIP(), fg: fgOf(s), completed: s.jobsCompleted });
  const ts = runReplication(sim, T, M, snap);
  const Tn = sim.now || 1e-9;

  const resources = sim.resources.map((R) => {
    const Mc = R.slots.length;
    return {
      id: R.cfg.id, name: R.cfg.name, capacity: Mc,
      utilization: r(R.aBusy / (Mc * Tn)), blocked: r(R.aBlk / (Mc * Tn)),
      down: r(R.aDown / (Mc * Tn)), avgQueue: r(R.aQ / Tn),
      processed: R.processed, throughput: r(R.departed / Tn),
      avgFlowTime: R.departed ? r(R.sumFlow / R.departed) : null,
    };
  });
  const parts = sim.parts.map((p) => {
    const st = sim.pstats[p.id];
    const inv = sim.inventory[p.id];
    return {
      id: p.id, name: p.name, created: st.created, completed: st.completed,
      scrapped: st.scrapped, wip: st.wip, inventory: inv === Infinity ? null : inv,
      avgCycleTime: st.completed ? r(st.sumCycle / st.completed) : null,
    };
  });
  const demand = (cfg.demand || []).map((d) => {
    const ds = sim.demandStats[d.partId];
    return { id: d.partId, demanded: ds.demanded, fulfilled: ds.fulfilled, stockouts: ds.stockouts, backlog: ds.backlog };
  });

  const completedTot = sim.parts.reduce((a, p) => a + sim.pstats[p.id].completed, 0);
  const scrappedTot = sim.parts.reduce((a, p) => a + sim.pstats[p.id].scrapped, 0);
  const cycleTot = sim.parts.reduce((a, p) => a + sim.pstats[p.id].sumCycle, 0);
  const demandedTot = demand.reduce((a, d) => a + d.demanded, 0);
  const fulfilledTot = demand.reduce((a, d) => a + d.fulfilled, 0);
  const stockoutTot = demand.reduce((a, d) => a + d.stockouts, 0);

  return {
    seed, now: r(sim.now, 3), events: sim.events,
    scalars: {
      throughput: r(sim.jobsCompleted / Tn), avgWIP: r(sim.aWIP / Tn),
      avgCycleTime: completedTot ? r(cycleTot / completedTot) : null,
      yield: (completedTot + scrappedTot) ? r(completedTot / (completedTot + scrappedTot)) : null,
      fillRate: demandedTot ? r(fulfilledTot / demandedTot) : null,
      avgFG: null,
      entered: sim.jobsCreated, completed: sim.jobsCompleted, scrapped: sim.jobsScrapped,
      rejected: 0, demanded: demandedTot, fulfilled: fulfilledTot, stockouts: stockoutTot,
    },
    resources, parts, demand,
    cycleSamples: sim.cycles.map((c) => ({ part: c.pid, ct: r(c.ct, 4) })),
    timeseries: ts,
  };
}

/* ---------- driver ---------- */
function buildDataset(kind, opts) {
  const reps = [];
  if (kind === 'simple') {
    const cfg = applySimpleOverrides(defaultConfig(), opts);
    for (let i = 0; i < opts.reps; i++) reps.push(simpleReplication(applySimpleOverrides(defaultConfig(), opts), opts.seed + i, opts.time, opts.samples));
    return { schema: 'des-analysis/v1', kind: 'simple', generatedBy: 'harness', generatedAt: null,
      config: simpleConfigSummary(cfg), runLength: opts.time, warmupHint: null, replications: reps };
  }
  const cfg = applyAdvancedOverrides(advancedDefaultConfig(), opts);
  for (let i = 0; i < opts.reps; i++) reps.push(advancedReplication(applyAdvancedOverrides(advancedDefaultConfig(), opts), opts.seed + i, opts.time, opts.samples));
  return { schema: 'des-analysis/v1', kind: 'advanced', generatedBy: 'harness', generatedAt: null,
    config: advancedConfigSummary(cfg), runLength: opts.time, warmupHint: null, replications: reps };
}

/* ---------- CONWIP characteristic-curve sweep (Factory-Physics §6) ----------
   A single-product line whose per-product CONWIP cap is a clean total-WIP knob.
   Sweeping the cap and measuring steady-state TH & CT traces the line's
   characteristic curve, to be compared against the best / practical-worst /
   worst-case reference curves (computed in Python from T0, rb, W0). */
function sweepLineConfig(conwip) {
  return normalizeFactory({
    resources: [
      { id: 'op1', name: 'Op 1', capacity: 1, service: newDist('exp', { mean: 1.0 }), brk: false },
      { id: 'op2', name: 'Op 2 (bottleneck)', capacity: 1, service: newDist('exp', { mean: 1.3 }), brk: false },
      { id: 'op3', name: 'Op 3', capacity: 1, service: newDist('exp', { mean: 0.9 }), brk: false },
    ],
    parts: [
      { id: 'raw', name: 'Raw', color: '#8fb3c4', type: 'purchased', bom: [], routing: [], arrival: newDist('exp', { mean: 1 }) },
      { id: 'job', name: 'Job', color: '#36e0c8', type: 'produced', bom: [{ partId: 'raw', qty: 1 }],
        routing: [{ resourceId: 'op1', service: newDist('exp', { mean: 1.0 }) },
                  { resourceId: 'op2', service: newDist('exp', { mean: 1.3 }) },
                  { resourceId: 'op3', service: newDist('exp', { mean: 0.9 }) }] },
    ],
    demand: [{ partId: 'job', qty: 1, conwip }],
    supplyMode: 'limitless', demandMode: 'stream', controlMode: 'pull',
    demandDist: newDist('exp', { mean: 0.2 }),   // hungry demand → line rides at the CONWIP cap
  });
}

function buildSweep(opts) {
  const wipMax = opts.wipMax || 16;
  const tmpl = sweepLineConfig(1);
  const job = tmpl.parts.find((p) => p.id === 'job');
  const te = job.routing.map((s) => distMean(s.service));
  const T0 = te.reduce((a, b) => a + b, 0);
  const caps = tmpl.resources.map((rc) => Math.max(1, rc.capacity | 0) / distMean(rc.service));
  const rb = Math.min(...caps);
  const W0 = rb * T0;
  const bottleneckIdx = caps.indexOf(rb);
  const points = [];
  for (let w = 1; w <= wipMax; w++) {
    const wip = [], th = [], ct = [];
    for (let i = 0; i < opts.reps; i++) {
      const sim = new AdvancedSim(sweepLineConfig(w), opts.seed + w * 1000 + i);
      while (sim.fel.length && peekTime(sim) <= opts.time) sim.step();
      sim.accumulate(opts.time); sim.now = opts.time;
      const T = sim.now || 1e-9, comp = sim.pstats.job.completed;
      wip.push(r(sim.aWIP / T, 4)); th.push(r(sim.jobsCompleted / T, 5));
      ct.push(comp ? r(sim.pstats.job.sumCycle / comp, 4) : null);
    }
    points.push({ wipCap: w, wip, throughput: th, cycleTime: ct });
  }
  return {
    schema: 'des-analysis/sweep-v1', kind: 'sweep', generatedBy: 'harness', generatedAt: null,
    config: {
      summary: 'CONWIP sweep — single-product 3-operation line',
      T0: r(T0, 4), rb: r(rb, 4), W0: r(W0, 4),
      bottleneck: tmpl.resources[bottleneckIdx].name,
      resources: tmpl.resources.map((rc) => ({ id: rc.id, name: rc.name, capacity: rc.capacity, serviceMean: r(distMean(rc.service)) })),
    },
    reps: opts.reps, runLength: opts.time, wipMax, points,
  };
}

function defaultName(kind, opts) {
  if (opts.scenario) return `${opts.scenario}.json`;
  return kind === 'simple' ? 'simple_line.json' : 'advanced_factory.json';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outdir = join(ROOT, opts.outdir);
  mkdirSync(outdir, { recursive: true });

  if (opts.sweep) {
    const t0 = Date.now();
    const data = buildSweep(opts);
    const file = join(outdir, `${opts.scenario || 'sweep_line'}.json`);
    writeFileSync(file, JSON.stringify(data));
    console.log(`[sweep] WIP 1..${data.wipMax} × ${opts.reps} reps → ${file} (${Date.now() - t0} ms) ` +
      `T0=${data.config.T0} rb=${data.config.rb} W0=${data.config.W0}`);
    return;
  }

  const kinds = opts.kind === 'both' ? ['simple', 'advanced'] : [opts.kind];
  for (const kind of kinds) {
    const t0 = Date.now();
    const data = buildDataset(kind, opts);
    const file = join(outdir, defaultName(kind, opts));
    writeFileSync(file, JSON.stringify(data));
    const ms = Date.now() - t0;
    const ex = data.replications[0].scalars;
    console.log(`[${kind}] ${opts.reps} reps × t=${opts.time} → ${file} (${ms} ms) ` +
      `TH≈${ex.throughput} WIP≈${ex.avgWIP} CT≈${ex.avgCycleTime}`);
  }
}

main();
