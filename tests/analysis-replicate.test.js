// Output-analysis driver tests — Phase 4 (theory-notes §3, Law ch 9).
// Built up milestone by milestone:
//   M1 (4.1) — replications + confidence: CI coverage of an analytic value; the
//              half-width shrinks ~1/√N as replications increase.
//   M2 (4.2) — warm-up: deletion reduces initialisation bias (added later).
//   M4 (4.4) — paired scenario comparison (added later).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDist } from '../src/distributions.js';
import { replicate, responsesAtCutoff, wipTimeseries, windowResponse } from '../src/analysis/replicate.js';
import { summarizeReplications, repsForPrecision, welchWarmup, pairedDifference } from '../src/analysis/output_analysis.js';
import { applyFactor } from '../app/js/scenario.js';

// A clean M/M/1: source -> server -> sink, all co-located so transport is zero.
// λ = 1/iaMean, μ = 1/svcMean, ρ = λ/μ. Analytic steady state: L = ρ/(1-ρ),
// W (time in system) = (1/μ)/(1-ρ). Instant (zero-time) transport keeps it pure M/M/1.
function mm1({ iaMean, svcMean }) {
  return {
    schema: 'des-floor/v1',
    units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'instant', speed: 100, legs: {} },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'srv', name: 'Server', x: 0, y: 0, machines: 1, service: newDist('exp', { mean: svcMean }) },
      { kind: 'sink', id: 'snk', x: 0, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'srv', 'snk'], demand: newDist('exp', { mean: iaMean }) }],
  };
}

const metric = (summary, name) => summary.find((s) => s.metric === name);

test('M/M/1: the replicated mean CI covers the analytic value at ~nominal rate', () => {
  // ρ = 0.5 ⇒ L = 1.0, W = 2.0. Low utilisation ⇒ small start-empty bias, so a
  // long horizon with no warm-up is close enough to read coverage cleanly.
  const model = mm1({ iaMean: 2, svcMean: 1 });
  const L = 1.0, W = 2.0;                         // ρ/(1-ρ), (1/μ)/(1-ρ)
  const horizon = 4000, reps = 12, macro = 24;   // 24 independent CIs of 12 reps each
  let coverWIP = 0, coverCT = 0;
  for (let e = 0; e < macro; e++) {
    const res = replicate(model, { reps, horizon, gridPoints: 50, baseSeed: 1 + e * reps });
    const { rows } = responsesAtCutoff(res, 0);
    const sum = summarizeReplications(rows, ['avgWIP', 'cycleTime']);
    const wip = metric(sum, 'avgWIP'), ct = metric(sum, 'cycleTime');
    if (L >= wip.ci_low && L <= wip.ci_high) coverWIP++;
    if (W >= ct.ci_low && W <= ct.ci_high) coverCT++;
  }
  // Nominal 95% coverage; allow generous slack for finite macro count + mild init bias.
  assert.ok(coverWIP / macro >= 0.75, `WIP coverage ${coverWIP}/${macro} too low`);
  assert.ok(coverCT / macro >= 0.75, `CT coverage ${coverCT}/${macro} too low`);
});

test('half-width shrinks roughly as 1/√N as replications increase', () => {
  // Same model; compare the half-width from the first 8 reps vs all 32. √(8/32)=0.5,
  // so we expect the 32-rep half-width near half the 8-rep one (with sampling noise).
  const model = mm1({ iaMean: 2, svcMean: 1 });
  const res = replicate(model, { reps: 32, horizon: 3000, gridPoints: 40, baseSeed: 101 });
  const { rows } = responsesAtCutoff(res, 0);
  const hw = (n) => metric(summarizeReplications(rows.slice(0, n), ['avgWIP']), 'avgWIP').halfwidth;
  const hw8 = hw(8), hw32 = hw(32);
  assert.ok(hw32 < hw8, `expected hw to shrink: hw8=${hw8.toFixed(4)} hw32=${hw32.toFixed(4)}`);
  const ratio = hw32 / hw8;                       // ideal 0.5
  assert.ok(ratio > 0.3 && ratio < 0.75, `1/√N ratio off: ${ratio.toFixed(3)} (ideal ~0.5)`);
});

test('warm-up deletion reduces initialisation bias on a system started empty (M2)', () => {
  // ρ = 0.85 ⇒ a large, slow transient: started empty, WIP climbs over a long stretch toward
  // steady state. Many reps (80) average out replication noise so the initialisation bias is the
  // dominant signal. Grid step = 2400/120 = 20 time units.
  const model = mm1({ iaMean: 1, svcMean: 0.85 });
  const res = replicate(model, { reps: 80, horizon: 2400, gridPoints: 120, baseSeed: 7 });

  // (a) the Welch method the UI uses must detect a warm-up: the empty-start dip is below the
  //     plateau and the suggested cut-off is positive.
  const w = welchWarmup(wipTimeseries(res), 'wip');
  assert.ok(w.ybar[0] < w.plateau, `empty-start WIP (${w.ybar[0].toFixed(2)}) should be below the plateau (${w.plateau.toFixed(2)})`);
  assert.ok((w.cutoff_time || 0) > 0, 'Welch should suggest a positive warm-up cut-off');

  // (b) deletion reduces bias: an estimate that KEEPS the empty-start window [0,200] is biased low
  //     relative to the converged tail [1200,2400]; deleting the warm-up ([600,2400]) recovers it.
  const mean = (a) => { const f = a.filter(Number.isFinite); return f.reduce((s, v) => s + v, 0) / f.length; };
  const winWIP = (a, b) => mean(res.reps.map((r) => windowResponse(r.snapshots[a], r.snapshots[b]).avgWIP));
  const keepEmptyStart = winWIP(0, 10);   // [0, 200] — includes the near-empty start
  const deleted = winWIP(30, 120);        // [600, 2400] — warm-up removed
  const truth = winWIP(60, 120);          // [1200, 2400] — converged tail (steady-state proxy)
  assert.ok(Math.abs(keepEmptyStart - truth) > Math.abs(deleted - truth),
    `deletion should reduce bias: keep-start |${keepEmptyStart.toFixed(2)}-${truth.toFixed(2)}| should exceed deleted |${deleted.toFixed(2)}-${truth.toFixed(2)}|`);
});

test('mover (transport/operator) utilisation is captured and can be the bottleneck (M3)', () => {
  // One slow AGV serving a line over long legs: it is busy carrying loads, so its utilisation must be
  // collected per replication (in [0,1]) and surfaced as a named resource for the bottleneck readout.
  const home = { x: 200, y: 0 };
  const model = {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: 'agv', speed: 50, legs: {}, movers: [{ id: 'a1', kind: 'agv', name: 'AGV 1', speed: 30, home, serves: { links: 'all' } }] },
    nodes: [
      { kind: 'source', id: 'src', x: 0, y: 0 },
      { kind: 'resource', id: 'A', name: 'A', x: 200, y: 0, machines: 1, service: newDist('exp', { mean: 0.3 }) },
      { kind: 'sink', id: 'snk', x: 400, y: 0 },
    ],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'A', 'snk'], demand: newDist('exp', { mean: 3 }) }],
  };
  const res = replicate(model, { reps: 6, horizon: 600, gridPoints: 30, baseSeed: 3 });
  const { rows, moverNames, bottleneck } = responsesAtCutoff(res, 0);
  assert.equal(Object.keys(moverNames).length, 1, 'one mover should be named');
  const us = rows.map((r) => r['mover:a1']).filter(Number.isFinite);
  assert.equal(us.length, rows.length, 'every replication has a mover utilisation');
  const mu = us.reduce((s, v) => s + v, 0) / us.length;
  assert.ok(mu > 0 && mu <= 1.0001, `mover utilisation should be a fraction in (0,1]: ${mu.toFixed(3)}`);
  assert.ok(bottleneck && bottleneck.name === 'AGV 1 (mover)', `the slow AGV should be the bottleneck, got ${bottleneck && bottleneck.name}`);
});

test('paired scenario comparison detects a real difference and none when equivalent (M4)', () => {
  // base: ρ = 0.8 single server (id 'srv'). Compare 1 vs 2 machines on the same seeds (CRN).
  const base = mm1({ iaMean: 1, svcMean: 0.8 });
  const one = applyFactor(base, 'resource:srv:machines', 1);
  const two = applyFactor(base, 'resource:srv:machines', 2);
  const opts = { reps: 20, horizon: 2000, gridPoints: 40, baseSeed: 1 };
  const rowsOf = (m) => responsesAtCutoff(replicate(m, opts), 0).rows;
  const rOne = rowsOf(one), rTwo = rowsOf(two);

  // real difference: doubling capacity must cut cycle time — the paired CI on (1mc − 2mc) excludes 0, positive.
  const zReal = rOne.map((r, i) => r.cycleTime - rTwo[i].cycleTime);
  const real = pairedDifference(zReal);
  assert.ok(real.differs && real.low > 0,
    `1 vs 2 machines should differ with 1mc slower: CI [${real.low.toFixed(2)}, ${real.high.toFixed(2)}]`);

  // equivalent designs: the SAME model on the SAME seeds ⇒ identical paths ⇒ zero difference ⇒ no false positive.
  const rTwoAgain = rowsOf(two);
  const zNull = rTwo.map((r, i) => r.cycleTime - rTwoAgain[i].cycleTime);
  const none = pairedDifference(zNull);
  assert.ok(zNull.every((z) => z === 0), 'identical scenario on identical seeds must give exactly zero differences (CRN)');
  assert.equal(none.differs, false, 'equivalent designs should not be reported as different');
});

test('repsForPrecision: meets target ⇒ no more reps; tighter target ⇒ asks for more', () => {
  // Synthetic IID-ish values with a clear mean/spread.
  const vals = [10.2, 9.8, 10.5, 9.6, 10.1, 10.4, 9.9, 10.0, 10.3, 9.7];
  const loose = repsForPrecision(vals, { target: 0.5, kind: 'relative' });   // ±50% — trivially met
  assert.ok(loose.achieved, 'loose target should already be achieved');
  assert.equal(loose.more, 0);
  const tight = repsForPrecision(vals, { target: 0.01, kind: 'relative' });   // ±1% — needs more
  assert.ok(!tight.achieved, 'tight target should not be met by 10 reps');
  assert.ok(tight.needed_n > vals.length && tight.more > 0, `expected more reps, got needed=${tight.needed_n}`);
  // current half-width must be finite and positive
  assert.ok(Number.isFinite(tight.current_halfwidth) && tight.current_halfwidth > 0);
});
