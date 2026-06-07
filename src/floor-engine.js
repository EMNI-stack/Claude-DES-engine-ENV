/* ============================================================================
   Floor engine — transport-aware discrete-event simulation for the 2D floor.

   A NEW, separate next-event engine (Charter §4): it does not touch engine.js /
   advanced-engine.js. It REUSES the proven patterns (binary min-heap FEL,
   area-method time-persistent stats, seeded RNG) and the shared distribution
   samplers (src/distributions.js), at the cost of some event-loop duplication —
   which protects the validated engines.

   Model shape: see docs/PHASE-3-DESIGN.md §3 (`des-floor/v1`). The model is
   graph-/assembly-capable; THIS milestone (Phase 3.1) implements the LINEAR path
   with INSTANT (uncapacitated) transport — a job in transit is in the system, so
   travel time appears in cycle time and WIP. Conveyor/worker-pool resource limits
   (Milestone 2) and BOM/assembly matching (Milestone 2b) are layered on later.

   Units (fixed contract, docs/PHASE-3-DESIGN.md §2): time = minutes,
   distance = metres, speed = m/min, travelTime = distance / speed.
   ========================================================================== */

import { mulberry32, sample } from './distributions.js';

/* Euclidean distance between two placed nodes (metres). Isolated so the metric
   is a one-line change if we ever switch to Manhattan. */
export function legDistance(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export class FloorSim {
  constructor(model, seed = 1) {
    this.model = model;
    this.rng = mulberry32((seed >>> 0) || 1);
    this.now = 0; this.lastT = 0; this.seq = 0; this.fel = [];

    // counters / accumulators
    this.wip = 0;          // jobs in system (queue + service + in transit)
    this.inTransit = 0;    // jobs currently on a transport leg
    this.areaWIP = 0; this.areaTransit = 0;
    this.entered = 0; this.completed = 0;
    this.sumCycle = 0;     // Σ (exit − entry) over completions
    this.sumJobTransit = 0; // Σ per-job total transport time over completions
    this.pid = 0;

    // node index
    this.nodes = {};
    for (const n of model.nodes) this.nodes[n.id] = n;

    // resource runtime state
    this.res = {};
    for (const n of model.nodes) {
      if (n.kind === 'resource') {
        this.res[n.id] = {
          node: n,
          machines: Array.from({ length: Math.max(1, n.machines || 1) }, () => ({ busy: false })),
          queue: [],
          aBusy: 0, aQ: 0, processed: 0,
        };
      }
    }

    this.transport = model.transport || {};
    this.defaultSpeed = this.transport.speed || 60; // m/min, for default/instant legs

    // schedule first arrival for each part that has a demand stream
    for (const p of (model.parts || [])) {
      if (p.demand) this.schedule(sample(p.demand, this.rng), { t: 'ARRIVE', part: p.id });
      else this.schedule(0, { t: 'ARRIVE', part: p.id, once: true }); // saturate fallback: one job
    }
  }

  /* ---- heap FEL (min by time, then insertion seq) ---------------------- */
  schedule(dt, ev) { ev.time = this.now + Math.max(0, dt); ev.seq = this.seq++; this._push(ev); }
  _push(ev) {
    const h = this.fel; h.push(ev); let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this._less(h[i], h[p])) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else break; }
  }
  _pop() {
    const h = this.fel; const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; const n = h.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, s = i;
        if (l < n && this._less(h[l], h[s])) s = l;
        if (r < n && this._less(h[r], h[s])) s = r;
        if (s === i) break; [h[i], h[s]] = [h[s], h[i]]; i = s; } }
    return top;
  }
  _less(a, b) { return a.time < b.time || (a.time === b.time && a.seq < b.seq); }

  /* ---- time-persistent stats (area method) ----------------------------- */
  accumulate(t) {
    const dt = t - this.lastT;
    if (dt > 0) {
      for (const id in this.res) {
        const r = this.res[id];
        let busy = 0; for (const m of r.machines) if (m.busy) busy++;
        r.aBusy += busy * dt; r.aQ += r.queue.length * dt;
      }
      this.areaWIP += this.wip * dt;
      this.areaTransit += this.inTransit * dt;
    }
    this.lastT = t;
  }

  /* ---- routing helpers -------------------------------------------------- */
  partOf(id) { return this.model.parts.find((p) => p.id === id); }
  legSpeed(fromId, toId) {
    const legs = this.transport.legs || {};
    const leg = legs[`${fromId}>${toId}`];
    if (leg && leg.speed) return leg.speed;
    if (this.transport.workers && this.transport.workers.speed && leg && leg.mover === 'worker') return this.transport.workers.speed;
    return this.defaultSpeed;
  }

  /* ---- event loop ------------------------------------------------------- */
  step() {
    const ev = this._pop(); if (!ev) return false;
    this.accumulate(ev.time); this.now = ev.time;
    if (ev.t === 'ARRIVE') this.onArrive(ev);
    else if (ev.t === 'ARRIVE_NODE') this.onArriveNode(ev);
    else if (ev.t === 'COMPLETE') this.onComplete(ev);
    return true;
  }
  run({ until = Infinity, maxEvents = 5_000_000 } = {}) {
    let n = 0;
    while (this.fel.length && this.now < until && n < maxEvents) { if (!this.step()) break; n++; }
    return this;
  }

  onArrive(ev) {
    const p = this.partOf(ev.part); if (!p) return;
    const job = { id: ++this.pid, part: p.id, routing: p.routing, step: 0, entry: this.now, transit: 0 };
    this.entered++; this.wip++;
    // schedule the next arrival for this part's stream
    if (p.demand && !ev.once) this.schedule(sample(p.demand, this.rng), { t: 'ARRIVE', part: p.id });
    this.arriveAtNode(job, 0);
  }

  arriveAtNode(job, step) {
    job.step = step;
    const nodeId = job.routing[step];
    const node = this.nodes[nodeId];
    if (!node || node.kind === 'sink' || step >= job.routing.length - 1) { this.exit(job); return; }
    if (node.kind === 'resource') {
      const r = this.res[nodeId];
      r.queue.push(job);
      this.tryStart(nodeId);
    } else {
      // source / storage waypoint — no processing or capacity in Milestone 1
      this.depart(job);
    }
  }

  tryStart(nodeId) {
    const r = this.res[nodeId];
    for (const m of r.machines) {
      if (m.busy || !r.queue.length) continue;
      const job = r.queue.shift();
      m.busy = true; m.job = job;
      const st = Math.max(0, sample(r.node.service, this.rng));
      this.schedule(st, { t: 'COMPLETE', node: nodeId, m, job });
    }
  }

  onComplete(ev) {
    ev.m.busy = false; ev.m.job = null;
    this.res[ev.node].processed++;
    this.depart(ev.job);
    this.tryStart(ev.node);
  }

  /* leave the current node toward the next routing step via a transport leg */
  depart(job) {
    const step = job.step;
    if (step >= job.routing.length - 1) { this.exit(job); return; }
    const fromId = job.routing[step], toId = job.routing[step + 1];
    const from = this.nodes[fromId], to = this.nodes[toId];
    const dist = legDistance(from, to);
    const speed = this.legSpeed(fromId, toId);
    const tt = speed > 0 ? dist / speed : 0;
    this.inTransit++; job.transit += tt;
    this.schedule(tt, { t: 'ARRIVE_NODE', job, step: step + 1 });
  }

  onArriveNode(ev) {
    this.inTransit--;
    this.arriveAtNode(ev.job, ev.step);
  }

  exit(job) {
    this.wip--; this.completed++;
    this.sumCycle += this.now - job.entry;
    this.sumJobTransit += job.transit;
  }

  /* ---- metrics ---------------------------------------------------------- */
  metrics() {
    const T = this.now || 1;
    const util = {};
    for (const id in this.res) util[id] = this.res[id].aBusy / (this.res[id].machines.length * T);
    return {
      time: this.now,
      entered: this.entered,
      completed: this.completed,
      inSystem: this.wip,
      throughput: this.completed / T,
      avgWIP: this.areaWIP / T,
      avgCycleTime: this.completed ? this.sumCycle / this.completed : 0,
      avgTransitPerJob: this.completed ? this.sumJobTransit / this.completed : 0,
      avgInTransit: this.areaTransit / T,
      utilisation: util,
    };
  }
}
