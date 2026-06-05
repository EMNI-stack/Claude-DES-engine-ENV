// JS port of des_analysis.characteristic — CONWIP characteristic-curve bounds.
// Best:  TH=min(w/T0, rb),          CT=max(T0, w/rb)
// PWC:   TH=w/(W0+w-1)*rb,          CT=T0+(w-1)/rb
// Worst: TH=1/T0,                   CT=w*T0
import { confidenceInterval } from './stats.js';

export function bestCase(w, T0, rb) {
  return { th: Math.min(w / T0, rb), ct: Math.max(T0, w / rb) };
}
export function practicalWorstCase(w, T0, rb, W0) {
  return { th: w / (W0 + w - 1) * rb, ct: T0 + (w - 1) / rb };
}
export function worstCase(w, T0) {
  return { th: 1 / T0, ct: w * T0 };
}

/** Reference curves over an array of WIP levels `ws`. */
export function referenceCurves(T0, rb, W0, ws) {
  return ws.map((w) => {
    const b = bestCase(w, T0, rb), p = practicalWorstCase(w, T0, rb, W0), wc = worstCase(w, T0);
    return { w, best_th: b.th, best_ct: b.ct, pwc_th: p.th, pwc_ct: p.ct, worst_th: wc.th, worst_ct: wc.ct };
  });
}

/** Per-WIP-cap measured WIP/TH/CT mean + CI half-width across replications. */
export function measuredPoints(sweep, alpha = 0.05) {
  return (sweep.points || []).map((p) => {
    const wip = confidenceInterval(p.wip || [], alpha);
    const th = confidenceInterval(p.throughput || [], alpha);
    const ct = confidenceInterval((p.cycleTime || []).filter((c) => c != null), alpha);
    return {
      wip_cap: p.wipCap,
      wip_mean: wip.mean, wip_hw: wip.halfwidth,
      th_mean: th.mean, th_hw: th.halfwidth,
      ct_mean: ct.mean, ct_hw: ct.halfwidth,
    };
  });
}

export function isSweep(raw) {
  return !!raw && typeof raw === 'object' && raw.schema === 'des-analysis/sweep-v1';
}
