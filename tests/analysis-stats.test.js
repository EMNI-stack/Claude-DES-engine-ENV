import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mean, sampleStd, sampleVar, quantile, studentTppf, studentTcdf,
  confidenceInterval, betai } from '../src/analysis/stats.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b} (±${eps})`);

test('mean / sample variance / std match numpy ddof=1', () => {
  const x = [2, 4, 4, 4, 5, 5, 7, 9];
  close(mean(x), 5, 1e-12);
  close(sampleVar(x), 4.571428571, 1e-6);   // ddof=1
  close(sampleStd(x), 2.138089935, 1e-6);
});

test('mean/var ignore non-finite values', () => {
  close(mean([1, 2, null, NaN, 3]), 2, 1e-12);
});

test('linear quantile matches numpy default', () => {
  const x = [1, 2, 3, 4];
  close(quantile(x, 0.5), 2.5, 1e-12);
  close(quantile(x, 0.9), 3.7, 1e-12);
});

test('betai is symmetric: I_x(a,b) = 1 - I_{1-x}(b,a)', () => {
  close(betai(2, 3, 0.4), 1 - betai(3, 2, 0.6), 1e-9);
});

test('Student-t quantile matches scipy t.ppf(0.975, df)', () => {
  close(studentTppf(0.975, 1), 12.7062, 1e-3);
  close(studentTppf(0.975, 2), 4.30265, 1e-4);
  close(studentTppf(0.975, 5), 2.57058, 1e-4);
  close(studentTppf(0.975, 10), 2.22814, 1e-4);
  close(studentTppf(0.975, 30), 2.04227, 1e-4);
  close(studentTppf(0.975, 1000), 1.96234, 1e-3);   // → normal 1.96
});

test('Student-t quantile is symmetric and CDF inverts it', () => {
  close(studentTppf(0.025, 10), -studentTppf(0.975, 10), 1e-4);
  close(studentTcdf(studentTppf(0.9, 7), 7), 0.9, 1e-4);
  close(studentTppf(0.5, 5), 0, 1e-9);
});

test('confidence interval brackets the mean with t critical value', () => {
  const ci = confidenceInterval([10, 12, 11, 13, 9], 0.05);
  close(ci.mean, 11, 1e-9);
  assert.ok(ci.low < ci.mean && ci.high > ci.mean);
  // hw = t(0.975,4)*sd/sqrt(5)
  const expected = studentTppf(0.975, 4) * sampleStd([10, 12, 11, 13, 9]) / Math.sqrt(5);
  close(ci.halfwidth, expected, 1e-9);
});

test('CI degenerate for n<=1', () => {
  const ci = confidenceInterval([5]);
  close(ci.mean, 5, 1e-12);
  assert.ok(Number.isNaN(ci.halfwidth));
});
