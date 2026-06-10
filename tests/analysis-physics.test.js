// Phase 5 — Factory Physics overlay tests (theory-notes §4).
// Agreement in clean cases; honest applicability + detected divergence in complex cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDist } from '../src/distributions.js';
import { replicate, responsesAtCutoff } from '../src/analysis/replicate.js';
import { confidenceInterval } from '../src/analysis/output_analysis.js';
import {
  bestCase, practicalWorstCase, worstCase, lineParams, vutQueueTime,
  littlesLawCheck, modelFeatures, applicability,
} from '../src/analysis/factory_physics.js';

// engine run-model: source -> server(s) -> sink, co-located (instant zero transport) = M/M/1.
function mm1({ iaMean, svcMean, machines = 1, extra = {}, transportDefault = 'instant', bufferCap, scrap = 0, brk = null }) {
  const srv = { kind: 'resource', id: 'srv', name: 'Server', x: 0, y: 0, machines, service: newDist('exp', { mean: svcMean }), scrap, brk, ...(bufferCap != null ? { bufferCap } : {}) };
  return {
    schema: 'des-floor/v1', units: { time: 'min', distance: 'm', speed: 'm/min' },
    transport: { default: transportDefault, speed: 100, legs: {} }, groups: [],
    nodes: [{ kind: 'source', id: 'src', x: 0, y: 0 }, srv, { kind: 'sink', id: 'snk', x: 0, y: 0 }],
    parts: [{ id: 'p', kind: 'product', routing: ['src', 'srv', 'snk'], demand: newDist('exp', { mean: iaMean }) }],
    ...extra,
  };
}
const mean = (a) => { const f = a.filter(Number.isFinite); return f.reduce((s, v) => s + v, 0) / f.length; };

test('best/worst/PWC match theory-notes §4.3 for Penny Fab One (rb=0.5, T0=8, W0=4)', () => {
  const rb = 0.5, T0 = 8, W0 = 4, w = 4;
  const b = bestCase(w, T0, rb), p = practicalWorstCase(w, T0, rb, W0), wc = worstCase(w, T0);
  assert.ok(Math.abs(b.th - 0.5) < 1e-9 && Math.abs(b.ct - 8) < 1e-9, `best ${JSON.stringify(b)}`);
  assert.ok(Math.abs(p.th - 2 / 7) < 1e-9 && Math.abs(p.ct - 14) < 1e-9, `pwc ${JSON.stringify(p)}`);
  assert.ok(Math.abs(wc.th - 0.125) < 1e-9 && Math.abs(wc.ct - 32) < 1e-9, `worst ${JSON.stringify(wc)}`);
  // every reference point satisfies TH·CT = w (Little's-Law invariant)
  for (const r of [b, p, wc]) assert.ok(Math.abs(r.th * r.ct - w) < 1e-6, `TH·CT≠w for ${JSON.stringify(r)}`);
});

test('lineParams derives ra, te, utilisation, rb, T0, W0 from the model', () => {
  const lp = lineParams(mm1({ iaMean: 2, svcMean: 1 }));   // ra=0.5, te=1, u=0.5
  assert.ok(Math.abs(lp.ra - 0.5) < 1e-9, `ra ${lp.ra}`);
  assert.ok(Math.abs(lp.stations[0].te - 1) < 1e-9 && Math.abs(lp.stations[0].u - 0.5) < 1e-9);
  assert.ok(Math.abs(lp.rb - 1) < 1e-9 && Math.abs(lp.T0 - 1) < 1e-9 && Math.abs(lp.W0 - 1) < 1e-9);
});

test('clean M/M/1: simulation agrees with utilisation and VUT/Kingman predictions', () => {
  const model = mm1({ iaMean: 2, svcMean: 1 });            // ρ=0.5: u=0.5, CTq=1, CT=2
  const lp = lineParams(model);
  const predU = lp.stations[0].u;                          // 0.5
  const ctq = vutQueueTime({ ca2: 1, ce2: 1, u: predU, te: lp.stations[0].te });  // 1
  const predCT = lp.stations[0].te + ctq;                  // 2
  const res = replicate(model, { reps: 20, horizon: 6000, gridPoints: 60, baseSeed: 1 });
  // warm-up: delete the first ~5%
  const cut = 3;
  const { rows } = responsesAtCutoff(res, cut);
  const ctCI = confidenceInterval(rows.map((r) => r.cycleTime));
  const uCI = confidenceInterval(rows.map((r) => r['util:srv']));
  assert.ok(predU >= uCI.low - 1e-6 && predU <= uCI.high + 1e-6, `u ${predU} not in [${uCI.low.toFixed(3)}, ${uCI.high.toFixed(3)}]`);
  assert.ok(predCT >= ctCI.low && predCT <= ctCI.high, `CT ${predCT} not in [${ctCI.low.toFixed(2)}, ${ctCI.high.toFixed(2)}]`);
});

test("Little's Law consistency holds on a simulated run (WIP ≈ TH×CT)", () => {
  const res = replicate(mm1({ iaMean: 2, svcMean: 1 }), { reps: 16, horizon: 6000, gridPoints: 60, baseSeed: 5 });
  const { rows } = responsesAtCutoff(res, 3);
  const relErr = mean(rows.map((r) => littlesLawCheck(r.avgWIP, r.throughput, r.cycleTime).relErr));
  assert.ok(relErr < 0.05, `mean Little's-Law rel error ${relErr.toFixed(4)} should be small`);
  // the aggregate check the UI shows:
  const agg = littlesLawCheck(mean(rows.map((r) => r.avgWIP)), mean(rows.map((r) => r.throughput)), mean(rows.map((r) => r.cycleTime)));
  assert.ok(agg.consistent, `aggregate Little's Law inconsistent: relErr ${agg.relErr.toFixed(4)}`);
});

test('applicability: M/M/1 exact; blocking/non-exp/breakdown/batch/scrap correctly flagged', () => {
  const clean = applicability(modelFeatures(mm1({ iaMean: 2, svcMean: 1 })));
  assert.equal(clean.littlesLaw.level, 'exact');
  assert.equal(clean.utilisation.level, 'exact');
  assert.equal(clean.vut.level, 'exact');
  assert.equal(clean.characteristic.level, 'exact');

  const blocked = applicability(modelFeatures(mm1({ iaMean: 2, svcMean: 1, bufferCap: 3 })));
  assert.equal(blocked.vut.level, 'out-of-range', 'finite buffer ⇒ VUT out of range');

  const nonExp = applicability(modelFeatures(mm1({ iaMean: 2, svcMean: 1, extra: { nodes: [
    { kind: 'source', id: 'src', x: 0, y: 0 },
    { kind: 'resource', id: 'srv', name: 'Server', x: 0, y: 0, machines: 1, service: newDist('const', { value: 1 }) },
    { kind: 'sink', id: 'snk', x: 0, y: 0 }] } })));
  assert.equal(nonExp.vut.level, 'approximate', 'constant (non-exponential) service ⇒ VUT approximate');

  const down = applicability(modelFeatures(mm1({ iaMean: 2, svcMean: 1, brk: { on: true, ttf: newDist('exp', { mean: 50 }), ttr: newDist('exp', { mean: 5 }) } })));
  assert.equal(down.vut.level, 'approximate', 'breakdowns ⇒ VUT approximate');

  const batch = mm1({ iaMean: 2, svcMean: 1 });
  batch.nodes[1].batch = { size: 5, setup: 1 };
  assert.equal(applicability(modelFeatures(batch)).vut.level, 'out-of-range', 'batch ⇒ VUT out of range');

  const scrap = applicability(modelFeatures(mm1({ iaMean: 2, svcMean: 1, scrap: 0.2 })));
  assert.equal(scrap.utilisation.level, 'approximate', 'scrap ⇒ utilisation approximate');
});
