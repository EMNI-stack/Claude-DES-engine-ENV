// JS port of des_analysis.output_analysis — warm-up detection and CIs.
import { mean, sampleVar, confidenceInterval, finite, studentTppf } from './stats.js';
import { groupBy } from './ingest.js';

export { confidenceInterval };

/**
 * How many replications for a target precision (theory-notes §3.5 / Law Eq 9.2–9.3).
 * Holds the current variance estimate fixed and finds the smallest n ≥ n0 whose
 * t-half-width meets the target — the practical "you need ~N reps (M more)" helper.
 *
 * @param {number[]} values  the per-rep response values collected so far
 * @param {object} opts
 *   alpha   significance (default 0.05 → 95%)
 *   target  precision target: a relative fraction γ (kind 'relative') or an
 *           absolute half-width β (kind 'absolute'). Default γ = 0.15.
 *   kind    'relative' | 'absolute' (default 'relative')
 *   maxReps cap on the search (default 2000)
 * @returns {object} current_n, mean, sd, current_halfwidth, current_rel,
 *   needed_n, more, achieved, target, kind, capped
 */
export function repsForPrecision(values, { alpha = 0.05, target = 0.15, kind = 'relative', maxReps = 2000 } = {}) {
  const a = finite(values);
  const n0 = a.length;
  if (n0 < 2) return { current_n: n0, mean: n0 ? a[0] : NaN, sd: NaN, current_halfwidth: NaN, current_rel: NaN, needed_n: Math.max(n0, 2), more: Math.max(0, 2 - n0), achieved: false, target, kind, capped: false };
  const xbar = mean(a);
  const s2 = sampleVar(a);
  const hwAt = (n) => studentTppf(1 - alpha / 2, n - 1) * Math.sqrt(s2 / n);
  // γ' = γ/(1+γ) corrects the relative criterion (the half-width is relative to the
  // *estimated* mean, which itself carries error) — Law Eq 9.3.
  const gprime = kind === 'relative' ? target / (1 + target) : null;
  const meets = (n) => kind === 'relative'
    ? (Math.abs(xbar) > 0 && hwAt(n) / Math.abs(xbar) <= gprime)
    : (hwAt(n) <= target);
  const current_hw = hwAt(n0);
  const current_rel = Math.abs(xbar) > 0 ? current_hw / Math.abs(xbar) : NaN;
  let needed = n0;
  if (!meets(n0)) { needed = n0 + 1; while (needed < maxReps && !meets(needed)) needed++; }
  return {
    current_n: n0, mean: xbar, sd: Math.sqrt(s2),
    current_halfwidth: current_hw, current_rel,
    needed_n: needed, more: Math.max(0, needed - n0),
    achieved: meets(n0), target, kind, gprime, capped: needed >= maxReps,
  };
}

/** Per-metric mean, sd, t-CI across replications. `scalars` = array of row objects. */
export function summarizeReplications(scalars, metrics = null, alpha = 0.05) {
  if (!scalars.length) return [];
  if (!metrics) {
    const skip = new Set(['rep', 'seed', 'now', 'events']);
    metrics = Object.keys(scalars[0]).filter((c) => {
      if (skip.has(c)) return false;
      return scalars.some((r) => typeof r[c] === 'number' && Number.isFinite(r[c]));
    });
  }
  return metrics.map((m) => {
    const ci = confidenceInterval(scalars.map((r) => r[m]), alpha);
    const rel = (ci.mean && Number.isFinite(ci.halfwidth)) ? ci.halfwidth / Math.abs(ci.mean) : NaN;
    return { metric: m, mean: ci.mean, sd: ci.sd, n: ci.n,
      ci_low: ci.low, ci_high: ci.high, halfwidth: ci.halfwidth, rel_halfwidth: rel };
  });
}

/** Average `metric` across replications at each aligned grid time. */
export function welchAverage(timeseries, metric = 'wip') {
  if (!timeseries.length) return { t: [], ybar: [] };
  const reps = new Set(timeseries.map((r) => r.rep));
  const nReps = reps.size;
  const byT = groupBy(timeseries, (r) => r.t);
  const ts = [];
  for (const [t, rows] of byT) {
    const vals = finite(rows.map((r) => r[metric]));
    if (rows.length === nReps && vals.length === nReps) ts.push([Number(t), mean(vals)]);
  }
  ts.sort((a, b) => a[0] - b[0]);
  return { t: ts.map((x) => x[0]), ybar: ts.map((x) => x[1]) };
}

/** Centered moving average of half-width w (window shrinks at the edges). */
export function movingAverage(y, w) {
  const n = y.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - w), hi = Math.min(n, i + w + 1);
    out[i] = mean(y.slice(lo, hi));
  }
  return out;
}

/** Welch warm-up estimate (smoothed across-rep mean flattening within tol). */
export function welchWarmup(timeseries, metric = 'wip', window = null, tol = 0.05) {
  const { t, ybar } = welchAverage(timeseries, metric);
  const n = ybar.length;
  if (n === 0) return { t, ybar, smoothed: ybar, window: 0, cutoff_index: 0, cutoff_time: 0, converged: false, plateau: NaN, tol };
  if (window == null) window = Math.max(1, Math.min(Math.floor(n / 10), 50));
  const sm = movingAverage(ybar, window);
  const tail = sm.slice(Math.max(0, n - Math.max(1, Math.floor(n / 3))));
  const plateau = mean(tail);
  const scale = plateau !== 0 ? Math.abs(plateau) : (Math.max(...sm.map(Math.abs)) || 1);
  const within = sm.map((v) => Math.abs(v - plateau) <= tol * scale);
  let cutoff = n - 1;
  for (let i = 0; i < n; i++) {
    let allSettled = true;
    for (let j = i; j < n; j++) if (!within[j]) { allSettled = false; break; }
    if (allSettled) { cutoff = i; break; }
  }
  const converged = cutoff < 0.6 * n;
  return { t, ybar, smoothed: sm, window, cutoff_index: cutoff,
    cutoff_time: n ? t[cutoff] : 0, plateau, converged, tol };
}

/** MSER-5 truncation point on a single series (batches of 5). */
export function mser5(series) {
  const a = finite(series);
  const k = Math.floor(a.length / 5);
  if (k < 4) return { batch_index: 0, obs_index: 0, n_batches: k };
  const batches = [];
  for (let i = 0; i < k; i++) batches.push(mean(a.slice(i * 5, i * 5 + 5)));
  let bestD = 0, bestVal = Infinity;
  for (let d = 0; d < k - 1; d++) {
    const kept = batches.slice(d);
    const val = sampleVar(kept) / kept.length;
    if (val < bestVal) { bestVal = val; bestD = d; }
  }
  return { batch_index: bestD, obs_index: bestD * 5, n_batches: k, mser: bestVal };
}

/** Batch-means CI from a single long run. */
export function batchMeans(series, nBatches = 10, warmup = 0, alpha = 0.05) {
  let a = finite(series).slice(warmup);
  if (a.length < nBatches * 2) nBatches = Math.max(1, Math.floor(a.length / 2));
  if (nBatches < 2) {
    return { mean: a.length ? mean(a) : NaN, halfwidth: NaN, low: NaN, high: NaN,
      n_batches: nBatches, batch_size: a.length };
  }
  const bsize = Math.floor(a.length / nBatches);
  const means = [];
  for (let i = 0; i < nBatches; i++) means.push(mean(a.slice(i * bsize, (i + 1) * bsize)));
  const ci = confidenceInterval(means, alpha);
  return { ...ci, n_batches: nBatches, batch_size: bsize };
}
