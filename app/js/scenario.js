/* Scenario application — Phase 4.4.
   A scenario = the base authoring model (des-floor/v1) with ONE declared experimental
   factor overridden to a level. The factor's binding key (stored on the declared factor's
   `bindingHint`, e.g. "resource:<id>:machines") names exactly what to change. Comparing two
   scenarios on the SAME seeds (common random numbers) is what the paired-t in
   output_analysis.js then tests. Pure functions of the model — no DOM, callable in tests. */

function clone(m) { return JSON.parse(JSON.stringify(m)); }

function setDistMean(dist, mean) {
  if (!dist || !dist.params || !Number.isFinite(mean)) return;
  if ('mean' in dist.params) dist.params.mean = mean;
  else if ('value' in dist.params) dist.params.value = mean;
}

function floorCentre(m) {
  const ns = (m.nodes || []).filter((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  if (!ns.length) return { x: 0, y: 0 };
  return { x: ns.reduce((s, n) => s + n.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.y, 0) / ns.length };
}

// set the number of movers of `kind` to `count` (clone the prototype to add; trim to remove)
function setMoverCount(m, kind, count) {
  m.movers = Array.isArray(m.movers) ? m.movers : [];
  const same = m.movers.filter((u) => u.kind === kind);
  const other = m.movers.filter((u) => u.kind !== kind);
  const units = same.slice(0, count);
  const proto = same[0] || { kind, speed: m.defaultSpeed || 40, home: floorCentre(m),
    serves: kind === 'operator' ? { links: 'all', machines: 'all' } : { links: 'all' } };
  let i = 0;
  while (units.length < count) { const u = clone(proto); u.kind = kind; u.id = `${kind}_s${i++}`; u.name = `${kind === 'operator' ? 'Operator' : 'AGV'} ${units.length + 1}`; units.push(u); }
  m.movers = [...other, ...units];
}

/** Which binding keys the comparator can apply (others are structural and out of scope here). */
export function isComparableFactor(bindingKey) {
  if (!bindingKey) return false;
  const p = bindingKey.split(':');
  if (p[0] === 'resource') return p[2] === 'machines' || p[2] === 'batch.size';
  if (p[0] === 'part') return p[2] === 'demand.mean' || p[2] === 'conwip';
  if (p[0] === 'movers') return p[2] === 'count';
  if (p[0] === 'mover') return p[2] === 'speed';
  if (p[0] === 'group') return p[2] === 'rule';
  return false;   // group:membercount, merge:streams need structural cloning — not supported here
}

/**
 * Return a clone of `model` with the factor named by `bindingKey` set to `value`.
 * @param {object} model      des-floor/v1 authoring model
 * @param {string} bindingKey e.g. "resource:r_1:machines", "movers:agv:count", "group:g_1:rule"
 * @param {number|string} value  the level (numbers parsed; group rule is a string)
 */
export function applyFactor(model, bindingKey, value) {
  const m = clone(model);
  const [scope, a, b] = bindingKey.split(':');
  const num = parseFloat(value);
  if (scope === 'resource') {
    const n = (m.nodes || []).find((x) => x.id === a); if (!n) return m;
    if (b === 'machines') n.machines = Math.max(1, Math.round(num));
    else if (b === 'batch.size') { n.batch = n.batch || {}; n.batch.on = true; n.batch.size = Math.max(2, Math.round(num)); }
  } else if (scope === 'part') {
    const p = (m.parts || []).find((x) => x.id === a); if (!p) return m;
    if (b === 'demand.mean') { p.demand = p.demand || {}; setDistMean(p.demand.dist, num); }
    else if (b === 'conwip') { p.demand = p.demand || {}; p.demand.conwip = Math.max(1, Math.round(num)); }
  } else if (scope === 'movers') {
    setMoverCount(m, a, Math.max(0, Math.round(num)));   // a = 'agv' | 'operator'
  } else if (scope === 'mover') {
    const u = (m.movers || []).find((x) => x.id === a); if (u && b === 'speed') u.speed = Math.max(0.0001, num);
  } else if (scope === 'group') {
    const g = (m.groups || []).find((x) => x.id === a); if (g && b === 'rule') g.rule = String(value).toLowerCase().includes('even') ? 'even' : 'shortest';
  }
  return m;
}
