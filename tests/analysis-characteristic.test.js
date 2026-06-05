import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referenceCurves, bestCase, practicalWorstCase, measuredPoints, isSweep }
  from '../src/analysis/characteristic.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

const T0 = 1.0 + 1.3 + 0.9, RB = 1 / 1.3, W0 = RB * T0;
const WS = Array.from({ length: 20 }, (_, i) => i + 1);

test("Little's Law TH*CT = w holds on every reference curve", () => {
  for (const r of referenceCurves(T0, RB, W0, WS)) {
    close(r.best_th * r.best_ct, r.w);
    close(r.pwc_th * r.pwc_ct, r.w);
    close(r.worst_th * r.worst_ct, r.w);
  }
});

test('all curves coincide at w=1 (TH=1/T0, CT=T0)', () => {
  const r = referenceCurves(T0, RB, W0, [1])[0];
  for (const th of [r.best_th, r.pwc_th, r.worst_th]) close(th, 1 / T0);
  for (const ct of [r.best_ct, r.pwc_ct, r.worst_ct]) close(ct, T0);
});

test('best-case throughput saturates at the bottleneck rate', () => {
  assert.ok(bestCase(100, T0, RB).th <= RB + 1e-12);
  close(bestCase(W0, T0, RB).th, W0 / T0);   // still ramping at the critical WIP
  close(bestCase(1e6, T0, RB).th, RB);
});

test('PWC throughput is below r_b and rises toward it', () => {
  const a = practicalWorstCase(2, T0, RB, W0).th;
  const b = practicalWorstCase(20, T0, RB, W0).th;
  assert.ok(a < b && b < RB);
  close(practicalWorstCase(1e6, T0, RB, W0).th, RB, 1e-3);
});

test('measuredPoints aggregates reps and drops null cycle times', () => {
  const sweep = { points: [
    { wipCap: 1, wip: [0.9, 1.1, 1.0], throughput: [0.30, 0.31, 0.29], cycleTime: [3.2, 3.3, 3.1] },
    { wipCap: 2, wip: [1.8, 2.0, 1.9], throughput: [0.45, 0.46, 0.44], cycleTime: [4.0, 4.1, null] },
  ] };
  const pts = measuredPoints(sweep);
  assert.deepEqual(pts.map((p) => p.wip_cap), [1, 2]);
  close(pts[0].th_mean, (0.30 + 0.31 + 0.29) / 3, 1e-9);
  close(pts[1].ct_mean, (4.0 + 4.1) / 2, 1e-9);
});

test('isSweep discriminates schema', () => {
  assert.ok(isSweep({ schema: 'des-analysis/sweep-v1' }));
  assert.ok(!isSweep({ schema: 'des-analysis/v1' }));
  assert.ok(!isSweep(null));
});
