// Shared editor→engine transformation. SINGLE SOURCE OF TRUTH for turning the
// authoring model (`des-floor/v1`, the shape `floor.js` edits and persists into
// the study project) into the run model `new FloorSim(...)` consumes.
//
// Both `floor.js` (interactive playback) and `analyse.js` (replication driver)
// build their simulation from THIS function, so the floor a student watches and
// the runs the analysis replicates are guaranteed identical. `floor.js` keeps its
// own rendering-oriented helpers; the *run* transformation lives only here.
//
// Every function is pure (a read-only function of the passed `model`) — no DOM,
// no module state — so it is equally callable in the browser and in tests.

import { newDist } from '../../src/distributions.js';

const node = (model, id) => model.nodes.find((n) => n.id === id);
const partFeeders = (p) => (Array.isArray(p.feeders) ? p.feeders : []);

// the node, latest in a feeder path, that also lies on the part's primary route —
// the merge point where the feeder stream joins (null = a dangling feeder).
const feederJoin = (p, path) => {
  for (let i = (path || []).length - 1; i >= 0; i--) if (p.route.includes(path[i])) return path[i];
  return null;
};

// primary route + each feeder spliced into a full routing (feeder upstream ++ route from the join on).
function partRoutings(p) {
  const out = [p.route.slice()];
  for (const f of partFeeders(p)) {
    const path = f.path || [], j = feederJoin(p, path);
    if (j) out.push([...path.slice(0, path.indexOf(j) + 1), ...p.route.slice(p.route.indexOf(j) + 1)]);
    else if (path.length) out.push(path.slice());   // dangling feeder (no join yet) — still a valid stream
  }
  return out;
}

// the model needs the full process engine (multi-part / BOM / CONWIP / explicit demand / convergence)
// rather than the legacy single-part fast path.
function isProcessModel(model) {
  return model.parts.length > 1 || model.parts.some((p) => p.bom && p.bom.length)
    || model.control === 'conwip' || model.parts.some((p) => p.demand && p.demand.on)
    || model.parts.some((p) => partFeeders(p).length);
}

function nodeForRun(n) {
  return n.kind === 'resource'
    ? { kind: 'resource', id: n.id, name: n.name, x: n.x, y: n.y, machines: n.machines || 1, service: n.service, bufferCap: n.buffer.finite ? n.buffer.cap : Infinity, scrap: n.scrap || 0, brk: n.brk, assembly: !!n.assembly, operatorRequired: !!n.operatorRequired, batch: (n.batch && n.batch.on) ? { size: Math.max(2, n.batch.size | 0), setup: Math.max(0, n.batch.setup || 0) } : null }
    : { kind: n.kind, id: n.id, name: n.name, x: n.x, y: n.y, cap: n.cap };
}

/**
 * Build the engine run-model from the authoring model.
 * @param {object} model  the `des-floor/v1` authoring model (project.model)
 * @param {number} S      display scale (px per metre); defaults to the app's 10.
 */
export function buildRunModel(model, S = 10) {
  const nodes = model.nodes.map(nodeForRun);
  const transport = { default: model.defaultMover, speed: model.defaultSpeed, conveyor: model.conveyor, movers: model.movers, legs: model.legs };
  const groups = (model.groups || []).map((g) => ({ id: g.id, name: g.name, rule: g.rule === 'even' ? 'even' : 'shortest', members: g.members.filter((m) => node(model, m)) }));
  const head = { schema: 'des-floor/v1', scale: S, units: model.units, nodes, transport, groups, control: model.control, supply: model.supply };
  if (!isProcessModel(model)) {
    // legacy single-part shape (exact pre-3.5 behaviour for the basics-first default)
    const p = model.parts[0];
    const src = node(model, (p.route || [])[0]);
    const demand = (src && src.kind === 'source') ? src.interarrival : (model.nodes.find((n) => n.kind === 'source') || {}).interarrival || newDist('exp', { mean: 3 });
    return { ...head, conwipCap: model.conwipCap,
      parts: [{ id: p.id, kind: 'product', routing: p.route.slice(), demand }],
      demand: { mode: 'instant' } };
  }
  // process shape — each part carries its route, arrival (from its source node), and BOM;
  // demand[] holds the per-product customer demand (each with its own interarrival distribution).
  const parts = model.parts.map((p) => {
    const routings = partRoutings(p);                                   // primary + spliced feeder routings (Phase 3.8)
    const arrivals = routings.map((r) => { const s = node(model, r[0]); return (s && s.kind === 'source') ? s.interarrival : undefined; });
    return { id: p.id, name: p.name, kind: p.kind, routing: p.route.slice(), routings, arrivals,
      arrival: arrivals[0] || ((node(model, (p.route || [])[0]) || {}).interarrival),
      bom: (p.bom || []).map((b) => ({ partId: b.partId, qty: Math.max(1, b.qty | 0) })) };
  });
  const demand = model.parts.filter((p) => p.demand && p.demand.on)
    .map((p) => ({ partId: p.id, dist: p.demand.dist, qty: Math.max(1, p.demand.qty | 0), conwip: Math.max(1, p.demand.conwip | 0) }));
  return { ...head, parts, demand };
}

// expose the process-model predicate too — analyse.js uses it to decide single vs multi-part headlines.
export { isProcessModel };
