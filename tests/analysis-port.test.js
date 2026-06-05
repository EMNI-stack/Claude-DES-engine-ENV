// Cross-checks the JS analysis port against values computed by the Python
// des_analysis package on the SAME committed sample files (parity guarantee).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadResults } from '../src/analysis/ingest.js';
import * as m from '../src/analysis/metrics.js';
import * as oa from '../src/analysis/output_analysis.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, '..', 'analysis', 'sample_data');
const load = (f) => loadResults(readFileSync(join(SAMPLES, `${f}.json`), 'utf8'));
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b} (±${eps})`);

// Python reference values (des_analysis on the committed samples).
const REF = {
  simple_line:      { th: 0.666367, wip: 7.578242, ct: 10.816175, bn: 'Welding', bn_u: 0.842217, ff: 2.897216, ll: 0.048964, th_hw: 0.003404, welch_cut: 0.0,    welch_conv: true },
  advanced_factory: { th: 1.581933, wip: 21.30705, ct: 13.459325, bn: 'Cutting', bn_u: 0.938608, ff: null,     ll: 0.000549, th_hw: 0.008035, welch_cut: 20000,  welch_conv: false },
  stream_line:      { th: 0.552158, wip: 5.099633, ct: 8.777783,  bn: 'Welding', bn_u: 0.697833, ff: 2.351213, ll: 0.049471, th_hw: 0.004093, welch_cut: 0.0,    welch_conv: true },
  advanced_pull:    { th: 1.5749,   wip: 17.266042, ct: 10.954008, bn: 'Cutting', bn_u: 0.931075, ff: null,    ll: 0.000484, th_hw: 0.007648, welch_cut: 20000,  welch_conv: false },
};

for (const [name, ref] of Object.entries(REF)) {
  test(`${name}: KPIs / bottleneck / flow factor match Python`, () => {
    const ds = load(name);
    const q = m.qualitySummary(ds);
    close(q.throughput, ref.th); close(q.avg_wip, ref.wip); close(q.avg_cycle_time, ref.ct);
    const bn = m.bottleneck(ds);
    assert.equal(bn.name, ref.bn); close(bn.utilization, ref.bn_u);
    const ff = m.flowFactor(ds).flow_factor;
    if (ref.ff == null) assert.ok(Number.isNaN(ff)); else close(ff, ref.ff);
  });

  test(`${name}: Little's-Law rel error + throughput CI + Welch match Python`, () => {
    const ds = load(name);
    const ll = m.littlesLaw(ds);
    close(ll.reduce((a, r) => a + r.rel_error, 0) / ll.length, ref.ll);
    const summ = oa.summarizeReplications(ds.scalars());
    const thr = summ.find((r) => r.metric === 'throughput');
    close(thr.halfwidth, ref.th_hw, 1e-4);
    const w = oa.welchWarmup(ds.timeseries(), 'wip');
    close(w.cutoff_time, ref.welch_cut, 1);
    assert.equal(w.converged, ref.welch_conv);
  });
}

test('congestion: Welding row of simple_line matches Python (VUT)', () => {
  const c = m.congestionByResource(load('simple_line')).find((r) => r.name === 'Welding');
  close(c.t_e, 1.2); close(c.utilization, 0.842217); close(c.wq_measured, 5.448311);
  close(c.wq_mm1, 6.405366); close(c.implied_v, 0.850586);
});

test('variability propagation cd2 chain matches Python (stream_line)', () => {
  const vp = m.variabilityPropagation(load('stream_line'));
  const cd2 = vp.map((r) => r.cd2);
  [0.888017, 0.486014, 0.470435].forEach((v, i) => close(cd2[i], v));
});

test('BOM-aware routing flow arcs match Python (advanced_factory)', () => {
  const fl = m.routingFlow(load('advanced_factory'));
  const got = fl.links.map((l) => [l.source_name, l.target_name, Math.round(l.value * 1e4) / 1e4]).sort();
  const exp = [['Assembly', 'Quality Check', 0.624], ['Cutting', 'Assembly', 0.624],
    ['Purchased', 'Assembly', 0.3118], ['Quality Check', 'Finished', 0.624],
    ['Start', 'Cutting', 0.6241], ['Start', 'Welding', 0.3337], ['Welding', 'Assembly', 0.3122]];
  assert.deepEqual(got, exp);
});
