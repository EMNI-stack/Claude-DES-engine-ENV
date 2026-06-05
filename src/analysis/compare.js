// JS port of des_analysis.compare — side-by-side scenario comparison.
import { summarizeReplications } from './output_analysis.js';
import { utilizationSummary, flowFactor } from './metrics.js';

// KPI key, label, higher-is-better.
export const KPIS = [
  ['throughput', 'Throughput', true],
  ['avgWIP', 'Avg WIP', false],
  ['avgCycleTime', 'Avg cycle time', false],
  ['fillRate', 'Fill rate', true],
  ['yield', 'Yield', true],
];

/** datasets: array of {name, ds}. One row per (scenario, metric). */
export function compareKpis(datasets, alpha = 0.05) {
  const rows = [];
  for (const { name, ds } of datasets) {
    const summ = {};
    for (const r of summarizeReplications(ds.scalars(), null, alpha)) summ[r.metric] = r;
    for (const [key, label, higher] of KPIS) {
      const r = summ[key];
      if (!r || !Number.isFinite(r.mean)) continue;
      rows.push({ scenario: name, metric: key, label, higher_is_better: higher,
        mean: r.mean, halfwidth: r.halfwidth, ci_low: r.ci_low, ci_high: r.ci_high, n_reps: ds.nReps });
    }
  }
  return rows;
}

export function compareUtilization(datasets) {
  const rows = [];
  for (const { name, ds } of datasets) {
    for (const r of utilizationSummary(ds)) rows.push({ scenario: name, resource: r.name, utilization: r.utilization });
  }
  return rows;
}

export function compareFlowFactor(datasets) {
  return datasets.map(({ name, ds }) => {
    const ff = flowFactor(ds);
    return { scenario: name, flow_factor: ff.flow_factor, cycle_time: ff.cycle_time,
      raw_process_time: ff.raw_process_time, value_added_fraction: ff.value_added_fraction,
      queue_fraction: ff.queue_fraction };
  });
}

/** Winning scenario name for one metric (respecting higher/lower-is-better). */
export function bestScenario(kpis, metric) {
  const sub = kpis.filter((r) => r.metric === metric);
  if (!sub.length) return null;
  const higher = sub[0].higher_is_better;
  let best = sub[0];
  for (const r of sub) {
    if (higher ? r.mean > best.mean : r.mean < best.mean) best = r;
  }
  return best.scenario;
}
