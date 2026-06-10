// Phase 5 — Factory Physics reference computations.
//
// Pure functions that derive closed-form Factory-Physics reference values from a run-model
// (as produced by app/js/run-model.js) plus the Phase-4 measured responses, and decide — per
// comparison — whether the formula is EXACT, APPROXIMATE, or OUT-OF-RANGE for this model.
// Honesty about applicability is the teaching point: a formula is only truth under its
// assumptions; beyond them the simulation is what you trust. Formulas/conventions: theory-notes
// §4 (Little's Law, utilisation, VUT/Kingman, best/worst/PWC, variability) and §8. No engine change.

import { distMean, distScv } from '../distributions.js';
import { bestCase, practicalWorstCase, worstCase, referenceCurves } from './characteristic.js';

export { bestCase, practicalWorstCase, worstCase, referenceCurves };

const isResource = (n) => n && n.kind === 'resource';
const near = (x, y, eps = 1e-6) => Math.abs(x - y) <= eps;

/** Effective process time + SCV for a station, including breakdown inflation (theory-notes §4.4). */
export function effectiveProcess(node) {
  const t0 = distMean(node.service);
  const c02 = distScv(node.service);
  const brk = node.brk && node.brk.on ? node.brk : null;
  if (!brk) return { t0, c02, A: 1, mttr: 0, te: t0, ce2: c02, hasBreakdown: false };
  const mf = distMean(brk.ttf);            // mean time to failure
  const mr = distMean(brk.ttr);            // mean time to repair
  const cr2 = distScv(brk.ttr);
  const A = mf + mr > 0 ? mf / (mf + mr) : 1;
  const te = A > 0 ? t0 / A : t0;
  // ce² = c0² + (1+cr²)·A(1−A)·(mr/t0)   [HS p.273]
  const ce2 = c02 + (1 + (Number.isFinite(cr2) ? cr2 : 1)) * A * (1 - A) * (t0 > 0 ? mr / t0 : 0);
  return { t0, c02, A, mttr: mr, te, ce2, hasBreakdown: true };
}

/** The interarrival distribution for the primary part (single-part: `demand`; process: `arrival`). */
function arrivalDist(runModel) {
  const p = (runModel.parts || [])[0] || {};
  return p.arrival || p.demand || null;
}

/**
 * Line parameters for the primary route: per-station te/ce²/utilisation, bottleneck, rb, T0, W0, ra.
 * Stations = resource nodes on parts[0].routing (group ids are skipped — flagged elsewhere).
 */
export function lineParams(runModel) {
  const byId = {};
  for (const n of (runModel.nodes || [])) byId[n.id] = n;
  const ad = arrivalDist(runModel);
  const am = ad ? distMean(ad) : NaN;
  const ra = am > 0 ? 1 / am : NaN;                         // arrival / line rate
  const arrivalScv = ad ? distScv(ad) : NaN;
  const route = ((runModel.parts || [])[0] || {}).routing || [];
  const stations = [];
  for (const id of route) {
    const n = byId[id];
    if (!isResource(n)) continue;
    const ep = effectiveProcess(n);
    const m = Math.max(1, n.machines || 1);
    const u = Number.isFinite(ra) ? ra * ep.te / m : NaN;   // u = ra·te/m
    stations.push({ id, name: n.name || id, m, ...ep, u });
  }
  const T0 = stations.reduce((s, st) => s + st.te, 0);
  let bottleneck = null;
  for (const st of stations) if (!bottleneck || st.u > bottleneck.u) bottleneck = st;
  const rb = bottleneck ? bottleneck.m / bottleneck.te : NaN;   // bottleneck rate = m/te
  const W0 = Number.isFinite(rb) ? rb * T0 : NaN;
  return { ra, arrivalScv, stations, bottleneck, rb, T0, W0 };
}

/** Little's Law consistency: WIP vs TH×CT, each measured independently. Always exact in the long run. */
export function littlesLawCheck(wip, th, ct, tol = 0.05) {
  const thct = th * ct;
  const absErr = Math.abs(wip - thct);
  const relErr = wip ? absErr / Math.abs(wip) : (thct ? absErr / Math.abs(thct) : 0);
  return { wip, th, ct, thct, absErr, relErr, consistent: Number.isFinite(relErr) && relErr <= tol };
}

/**
 * VUT / Kingman queue time. G/G/1: ((ca²+ce²)/2)·(u/(1−u))·te. G/G/m (Sakasegawa):
 * ((ca²+ce²)/2)·(u^(√(2(m+1))−1)/(m(1−u)))·te. (theory-notes §4.4)
 */
export function vutQueueTime({ ca2, ce2, u, te, m = 1 }) {
  if (!(u >= 0) || u >= 1 || !(te >= 0)) return Infinity;
  const V = (ca2 + ce2) / 2;
  const U = m === 1 ? u / (1 - u) : Math.pow(u, Math.sqrt(2 * (m + 1)) - 1) / (m * (1 - u));
  return V * U * te;
}

/** VUT queue-time curve over a utilisation range (for the overlay). */
export function vutCurve({ ca2, ce2, te, m = 1 }, us) {
  return us.map((u) => ({ u, ctq: vutQueueTime({ ca2, ce2, u, te, m }) }));
}

/** Propagate arrival SCV down the line (linking equation cd²=u²ce²+(1−u²)ca², theory-notes §4.5). */
export function propagateScv(stations, ca2_0) {
  let ca2 = Number.isFinite(ca2_0) ? ca2_0 : 1;
  return stations.map((st) => {
    const u = Number.isFinite(st.u) ? Math.min(st.u, 0.999) : 0;
    const here = ca2;
    const cd2 = Math.max(0, u * u * st.ce2 + (1 - u * u) * ca2);
    ca2 = cd2;
    return { id: st.id, ca2: here, cd2 };
  });
}

/** Boolean feature flags that decide formula applicability. */
export function modelFeatures(runModel) {
  const parts = runModel.parts || [];
  const nodes = runModel.nodes || [];
  const resources = nodes.filter(isResource);
  const legs = (runModel.transport && runModel.transport.legs) || {};
  const ad = arrivalDist(runModel);
  return {
    finiteBuffer: resources.some((n) => n.bufferCap != null && n.bufferCap !== Infinity),
    nonExponentialService: resources.some((n) => n.service && !near(distScv(n.service), 1, 1e-3)),
    nonExponentialArrival: !!ad && !near(distScv(ad), 1, 1e-3),
    breakdowns: resources.some((n) => n.brk && n.brk.on),
    batch: resources.some((n) => n.batch),
    convergence: parts.some((p) => Array.isArray(p.routings) && p.routings.length > 1),
    assembly: parts.some((p) => (p.bom || []).length) || resources.some((n) => n.assembly),
    groups: ((runModel.groups || []).length) > 0,
    multiMachine: resources.some((n) => (n.machines || 1) > 1),
    multiStation: resources.length > 1,
    multiPart: parts.length > 1,
    scrap: resources.some((n) => (n.scrap || 0) > 0),
    timedTransport: (runModel.transport && runModel.transport.default && runModel.transport.default !== 'instant')
      || Object.values(legs).some((l) => l && l.mover && l.mover !== 'instant'),
  };
}

const EXACT = 'exact', APPROX = 'approximate', OUT = 'out-of-range';

/**
 * Applicability of each comparison for the given features.
 * @returns {object} { littlesLaw, utilisation, vut, characteristic } each {level, reason}.
 */
export function applicability(f) {
  // Little's Law — holds for long-run averages regardless of distribution, blocking, or topology.
  const littlesLaw = { level: EXACT, reason: 'Holds for long-run averages regardless of distributions, blocking, or topology.' };

  // Utilisation u = ra·te/m — exact for a single-class serial line (flow conservation).
  let utilisation;
  if (f.scrap || f.assembly || f.convergence || f.groups || f.multiPart) {
    const why = f.scrap ? 'scrap changes the rate each station sees'
      : f.assembly ? 'assembly/BOM means stations see different rates'
        : f.convergence ? 'converging streams change per-station rates'
          : f.groups ? 'a resource group splits the rate across members'
            : 'multiple parts load stations at different rates';
    utilisation = { level: APPROX, reason: `Approximate — ${why}; measured per-resource utilisation is the honest value.` };
  } else {
    utilisation = { level: EXACT, reason: 'Exact for a stable single-class serial line (flow conservation).' };
  }

  // VUT / Kingman.
  let vut;
  if (f.finiteBuffer || f.batch || f.assembly || f.convergence) {
    const why = f.finiteBuffer ? 'finite buffers / blocking couple stations (Kingman assumes an infinite queue)'
      : f.batch ? 'batching adds wait-to-batch — control variability with no CV, behaving like the worst case'
        : f.assembly ? 'assembly is fork-join, not a single queue'
          : 'converging streams superpose multiple classes';
    vut = { level: OUT, reason: `Out of range — ${why}. This is where simulation is needed.` };
  } else if (!f.multiStation && !f.multiMachine && !f.nonExponentialService && !f.nonExponentialArrival && !f.breakdowns && !f.timedTransport) {
    vut = { level: EXACT, reason: 'Exact — a single M/M/1 station (exponential arrivals and service, no blocking).' };
  } else {
    const why = f.breakdowns ? 'breakdowns folded into te/ce²'
      : (f.nonExponentialService || f.nonExponentialArrival) ? 'non-exponential variability (G/G/1)'
        : f.multiMachine ? 'parallel machines (G/G/m, Sakasegawa)'
          : f.timedTransport ? 'transport time added between stations'
            : 'multi-station SCV propagation';
    vut = { level: APPROX, reason: `Approximate — ${why}; the formula predicts the trend, the sim gives the value.` };
  }

  // Best/Worst/PWC — curves exact by definition; the "where my line sits" reading needs a serial line.
  let characteristic;
  if (f.assembly || f.convergence || f.groups || f.multiPart) {
    characteristic = { level: APPROX, reason: 'Illustrative — T₀/r_b are for the dominant flow; the curve assumes a single-product serial line.' };
  } else {
    characteristic = { level: EXACT, reason: 'The reference curves are exact; the lean/fat reading applies to this serial line.' };
  }

  return { littlesLaw, utilisation, vut, characteristic };
}
