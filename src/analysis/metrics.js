// JS port of des_analysis.metrics — Factory-Physics metrics over a Dataset.
import { mean, sampleStd, sampleVar, quantile, finite } from './stats.js';
import { groupBy } from './ingest.js';

// ---------------------------------------------------------------- Little's Law
export function littlesLaw(ds) {
  return ds.scalars().map((s) => {
    const wip = Number(s.avgWIP), th = Number(s.throughput), ct = Number(s.avgCycleTime);
    const th_ct = th * ct;
    const abs_error = Math.abs(wip - th_ct);
    return { rep: s.rep, wip, throughput: th, cycle_time: ct, th_ct,
      abs_error, rel_error: wip ? abs_error / wip : NaN };
  });
}

// ---------------------------------------------------------------- utilization / bottleneck
export function utilizationSummary(ds) {
  const rows = ds.resources();
  if (!rows.length) return [];
  const groups = groupBy(rows, (r) => r.id);
  const out = [];
  for (const [id, rs] of groups) {
    const util = rs.map((r) => Number(r.utilization));
    out.push({
      id, name: rs[0].name,
      utilization: mean(util),
      utilization_sd: rs.length > 1 ? sampleStd(util) : NaN,
      blocked: mean(rs.map((r) => Number(r.blocked))),
      down: mean(rs.map((r) => Number(r.down))),
      avg_queue: mean(rs.map((r) => Number(r.avgQueue))),
      throughput: mean(rs.map((r) => Number(r.throughput))),
    });
  }
  out.sort((a, b) => b.utilization - a.utilization);
  return out;
}

export function bottleneck(ds) {
  const u = utilizationSummary(ds);
  if (!u.length) return {};
  return {
    id: u[0].id, name: u[0].name, utilization: u[0].utilization,
    margin_over_next: u.length > 1 ? u[0].utilization - u[1].utilization : NaN,
  };
}

// ---------------------------------------------------------------- variability
export function scv(values) {
  const a = finite(values);
  if (a.length < 2) return NaN;
  const m = mean(a);
  if (m === 0) return NaN;
  return sampleVar(a) / (m * m);
}

export function cycleTimeStats(ds, quantiles = [0.5, 0.9, 0.95]) {
  const cs = ds.cycleSamples();
  if (!cs.length) return [];
  const rows = [];
  const row = (label, sub) => {
    const ct = sub.map((r) => Number(r.ct));
    const rec = { part: label, n: ct.length, mean: mean(ct),
      std: ct.length > 1 ? sampleStd(ct) : NaN, scv: scv(ct) };
    for (const q of quantiles) rec[`p${Math.round(q * 100)}`] = quantile(ct, q);
    return rec;
  };
  const groups = groupBy(cs, (r) => r.part);
  for (const [part, sub] of groups) rows.push(row(String(part), sub));
  if (groups.size > 1) rows.push(row('ALL', cs));
  return rows;
}

// ---------------------------------------------------------------- yield / fill rate
export function qualitySummary(ds) {
  const s = ds.scalars();
  const col = (k) => finite(s.map((r) => r[k]));
  return {
    yield: mean(col('yield')),
    fill_rate: mean(col('fillRate')),
    throughput: mean(col('throughput')),
    avg_wip: mean(col('avgWIP')),
    avg_cycle_time: mean(col('avgCycleTime')),
  };
}

// ---------------------------------------------------------------- flow factor / congestion (VUT)
export function rawProcessTime(ds) {
  const res = ds.config.resources || [];
  if (ds.kind === 'simple' && res.length) {
    const vals = res.map((r) => r.serviceMean).filter((v) => v);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return null;
}

export function flowFactor(ds) {
  const t0 = rawProcessTime(ds);
  const ct = mean(finite(ds.scalars().map((r) => r.avgCycleTime)));
  const ff = (t0 && Number.isFinite(ct)) ? ct / t0 : NaN;
  const good = Number.isFinite(ff) && ff > 0;
  return { raw_process_time: t0, cycle_time: ct, flow_factor: ff,
    value_added_fraction: good ? 1 / ff : NaN, queue_fraction: good ? 1 - 1 / ff : NaN };
}

export function partFlowFactor(ds) {
  if (!ds.isAdvanced || !ds.parts().length) return [];
  const routing = {};
  for (const p of (ds.config.parts || [])) routing[p.id] = p.routingMean;
  const groups = groupBy(ds.parts(), (r) => r.id);
  const out = [];
  for (const [id, rs] of groups) {
    const pt = Number(routing[id]);
    if (!(pt > 0)) continue;
    const act = mean(finite(rs.map((r) => r.avgCycleTime)));
    out.push({ id, name: rs[0].name, avg_cycle_time: act, process_time: pt, flow_factor: act / pt });
  }
  return out;
}

export function congestionByResource(ds) {
  const u = utilizationSummary(ds);
  if (!u.length) return [];
  const te = {};
  for (const r of (ds.config.resources || [])) te[r.id] = r.serviceMean;
  return u.map((row) => {
    const t_e = Number(te[row.id]);
    const lam = row.throughput > 0 ? row.throughput : NaN;
    const wq_measured = row.avg_queue / lam;
    const rho = Math.min(row.utilization, 0.999);
    const congestion_mult = rho / (1 - rho);
    const wq_mm1 = congestion_mult * t_e;
    return { ...row, t_e, wq_measured, congestion_mult, wq_mm1,
      ct_station: t_e + wq_measured,
      implied_v: wq_mm1 > 0 ? wq_measured / wq_mm1 : NaN };
  });
}

// ---------------------------------------------------------------- variability propagation
export function variabilityPropagation(ds) {
  if (ds.kind !== 'simple') return [];
  const res = ds.config.resources || [];
  if (!res.length || res.some((r) => r.serviceScv == null)) return [];
  const uById = {};
  for (const row of utilizationSummary(ds)) uById[row.id] = row.utilization;
  const arrival = ds.config.arrivalScv;
  const entryAssumed = arrival == null;
  let ca2 = arrival != null ? Number(arrival) : Number(res[0].serviceScv);
  const rows = [];
  res.forEach((r, k) => {
    const ce2 = Number(r.serviceScv);
    const m = Math.max(1, parseInt(r.capacity, 10) || 1);
    let u = uById[r.id];
    u = Number.isFinite(u) ? Math.min(u, 0.999) : 0;
    let cd2 = 1 + (1 - u * u) * (ca2 - 1) + (u * u / Math.sqrt(m)) * (ce2 - 1);
    cd2 = Math.max(0, cd2);
    rows.push({ idx: k, id: r.id, name: r.name, capacity: m, utilization: u,
      ca2, ce2, cd2, entry_assumed: entryAssumed && k === 0 });
    ca2 = cd2;
  });
  return rows;
}

// ---------------------------------------------------------------- process-flow map (routing Sankey)
const FLOW_SEP = String.fromCharCode(31); // unit separator — safe vs names containing spaces

export function routingFlow(ds) {
  const partsCfg = ds.config.parts || [];
  const resCfg = ds.config.resources || [];
  if (!ds.isAdvanced || !partsCfg.length || !resCfg.length || !ds.parts().length) return null;
  if (!partsCfg.some((p) => (p.route || []).length)) return null;
  const T = ds.runLength || 0;
  if (T <= 0) return null;
  const nameById = {};
  for (const r of resCfg) nameById[r.id] = r.name;
  const byId = {};
  for (const p of partsCfg) byId[p.id] = p;
  const rate = {};
  for (const [id, rs] of groupBy(ds.parts(), (r) => r.id)) rate[id] = mean(rs.map((r) => Number(r.completed))) / T;
  const demandIds = new Set(partsCfg.filter((p) => p.isDemand).map((p) => p.id));
  const routeNames = (p) => (p.route || []).filter((rid) => rid in nameById).map((rid) => nameById[rid]);

  const agg = new Map();
  const add = (a, b, v) => { if (v > 0) agg.set(a + FLOW_SEP + b, (agg.get(a + FLOW_SEP + b) || 0) + v); };
  for (const p of partsCfg) {
    const route = routeNames(p);
    const rp = Number(rate[p.id] || 0);
    const bom = p.bom || [];
    for (let i = 0; i < route.length - 1; i++) add(route[i], route[i + 1], rp);
    if (route.length && !bom.length && p.type !== 'purchased') add('Start', route[0], rp);
    if (route.length && demandIds.has(p.id)) add(route[route.length - 1], 'Finished', rp);
    const first = route.length ? route[0] : 'Finished';
    for (const b of bom) {
      const comp = byId[b.partId];
      if (!comp) continue;
      const consume = Number(b.qty ?? 1) * rp;
      const cr = routeNames(comp);
      const src = cr.length ? cr[cr.length - 1] : 'Purchased';
      add(src, first, consume);
    }
  }
  if (!agg.size) return null;
  const order = ['Start', ...resCfg.map((r) => r.name), 'Purchased', 'Finished'];
  const used = new Set();
  for (const key of agg.keys()) { const [a, b] = key.split(FLOW_SEP); used.add(a); used.add(b); }
  const labels = order.filter((n) => used.has(n));
  const idx = {}; labels.forEach((l, i) => { idx[l] = i; });
  const links = [];
  for (const [key, v] of agg) {
    const [a, b] = key.split(FLOW_SEP);
    links.push({ source: idx[a], target: idx[b], value: Math.round(v * 1e4) / 1e4, source_name: a, target_name: b });
  }
  return { nodes: labels, links };
}
