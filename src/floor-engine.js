/* ============================================================================
   Floor engine — transport-aware discrete-event simulation for the 2D floor.

   A NEW, separate next-event engine (Charter §4): it does not touch engine.js /
   advanced-engine.js. It REUSES the proven patterns (binary min-heap FEL,
   area-method stats, seeded RNG, occupancy/blocking + a settle() fixpoint) and
   the shared distribution samplers (src/distributions.js).

   Model: docs/PHASE-3-DESIGN.md §3 (`des-floor/v1`). Implemented so far:
   - Milestone 3.1: linear path, INSTANT (uncapacitated) transport.
   - Milestone 3.2: CONVEYOR legs (finite capacity; block-after-service backs up
     upstream when the downstream buffer fills) and a shared WORKER POOL (a move
     seizes a worker for the one-way trip; too few workers queue pending moves and
     show high utilisation). v1 simplification: worker empty-return is ignored.

   Units (docs/PHASE-3-DESIGN.md §2): time = minutes, distance = metres,
   speed = m/min, travelTime = distance / speed.
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

    this.wip = 0; this.inTransit = 0;
    this.areaWIP = 0; this.areaTransit = 0;
    this.entered = 0; this.completed = 0; this.scrapped = 0;
    this.sumCycle = 0; this.sumJobTransit = 0;
    this.pid = 0;
    this.arrivalBlocked = [];               // instant-delivered jobs awaiting a full buffer

    // node index + runtime state
    this.nodes = {};
    for (const n of model.nodes) this.nodes[n.id] = n;
    this.res = {}; this.hold = {};
    for (const n of model.nodes) {
      if (n.kind === 'resource') {
        this.res[n.id] = {
          node: n,
          machines: Array.from({ length: Math.max(1, n.machines || 1) }, () => ({
            busy: false, blocked: false, down: false, preempted: false, job: null,
            remaining: 0, depTime: 0, depSeq: 0, failSeq: 0,
          })),
          queue: [],
          cap: (n.bufferCap == null ? Infinity : n.bufferCap),  // total holding (queue + in-machine)
          aBusy: 0, aBlk: 0, aDown: 0, aQ: 0, processed: 0,
        };
      } else if (n.kind === 'source' || n.kind === 'storage') {
        this.hold[n.id] = { node: n, items: [], cap: (n.kind === 'source' ? Infinity : (n.cap == null ? Infinity : n.cap)), aOcc: 0 };
      }
    }

    this.transport = model.transport || {};
    this.defaultMover = this.transport.default || 'instant';
    this.defaultSpeed = this.transport.speed || 60;

    // worker pool (shared)
    const wp = this.transport.workers;
    this.workers = wp ? { count: Math.max(1, wp.count || 1), speed: wp.speed || this.defaultSpeed,
      busy: 0, pending: [], blocked: [], aBusy: 0, aPending: 0 } : null;

    // conveyor leg state (per edge), precomputed from all parts' routings
    this.conv = {};
    for (const p of (model.parts || [])) {
      const r = p.routing || [];
      for (let i = 0; i < r.length - 1; i++) {
        const key = `${r[i]}>${r[i + 1]}`;
        if (this.moverFor(r[i], r[i + 1]) === 'conveyor' && !this.conv[key]) {
          const leg = (this.transport.legs || {})[key] || {};
          const cd = this.transport.conveyor || {};            // floor-wide conveyor default
          const cap = leg.cap != null ? leg.cap : (cd.cap != null ? cd.cap : Infinity);
          const speed = leg.speed || cd.speed || this.defaultSpeed;
          this.conv[key] = { key, cap, speed, items: [], aBusy: 0 };
        }
      }
    }

    // breakdown clocks for machines whose resource has breakdowns enabled
    for (const id in this.res) {
      const r = this.res[id];
      if (r.node.brk && r.node.brk.on) r.machines.forEach((m, mi) => this.scheduleFail(id, mi));
    }

    // control / supply / demand — ported from the original engine, adapted to the floor.
    // control: 'push' (release whenever supplied) | 'conwip' (cap the WIP in the line).
    // supply:  'stream' (arrivals per interarrival dist) | 'limitless' (raw always available).
    // demand:  'instant' (consume at the sink) | 'stream' (finished goods + demand arrivals).
    this.control = model.control === 'conwip' ? 'conwip' : 'push';
    this.conwipCap = Math.max(1, model.conwipCap || 10);
    this.supply = model.supply === 'limitless' ? 'limitless' : 'stream';
    this.demandCfg = (model.demand && model.demand.mode === 'stream' && model.demand.dist)
      ? { mode: 'stream', dist: model.demand.dist } : { mode: 'instant' };
    this.mainPart = (model.parts && model.parts[0]) || null;
    this.lineWip = 0; this.maxLineWip = 0; this.rawBacklog = 0;
    this.fg = 0; this.fgQueue = []; this.aFG = 0;
    this.demanded = 0; this.fulfilled = 0; this.stockouts = 0;

    // arrivals: stream supply schedules them; limitless seeds one FEED to kick settle()
    for (const p of (model.parts || [])) {
      if (this.supply === 'stream') {
        if (p.demand) this.schedule(sample(p.demand, this.rng), { t: 'ARRIVE', part: p.id });
        else this.schedule(0, { t: 'ARRIVE', part: p.id, once: true });
      }
    }
    if (this.supply === 'limitless') this.schedule(0, { t: 'FEED' });
    if (this.demandCfg.mode === 'stream') this.schedule(sample(this.demandCfg.dist, this.rng), { t: 'DEM' });
  }

  /* ---- heap FEL --------------------------------------------------------- */
  schedule(dt, ev) { ev.time = this.now + Math.max(0, dt); ev.seq = this.seq++; this._push(ev); }
  _push(ev) { const h = this.fel; h.push(ev); let i = h.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this._less(h[i], h[p])) { [h[i], h[p]] = [h[p], h[i]]; i = p; } else break; } }
  _pop() { const h = this.fel; const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; const n = h.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, s = i;
        if (l < n && this._less(h[l], h[s])) s = l;
        if (r < n && this._less(h[r], h[s])) s = r;
        if (s === i) break; [h[i], h[s]] = [h[s], h[i]]; i = s; } }
    return top; }
  _less(a, b) { return a.time < b.time || (a.time === b.time && a.seq < b.seq); }

  /* ---- leg config ------------------------------------------------------- */
  moverFor(fromId, toId) {
    const leg = (this.transport.legs || {})[`${fromId}>${toId}`];
    return (leg && leg.mover) || this.defaultMover;
  }
  legSpeed(fromId, toId, mover) {
    const leg = (this.transport.legs || {})[`${fromId}>${toId}`];
    if (leg && leg.speed) return leg.speed;
    if (mover === 'conveyor' && this.transport.conveyor && this.transport.conveyor.speed) return this.transport.conveyor.speed;
    if (mover === 'worker' && this.workers) return this.workers.speed;
    return this.defaultSpeed;
  }

  /* ---- time-persistent stats ------------------------------------------- */
  accumulate(t) {
    const dt = t - this.lastT;
    if (dt > 0) {
      for (const id in this.res) { const r = this.res[id];
        let b = 0, bl = 0, dn = 0; for (const m of r.machines) { if (m.busy) b++; if (m.blocked) bl++; if (m.down) dn++; }
        r.aBusy += b * dt; r.aBlk += bl * dt; r.aDown += dn * dt; r.aQ += r.queue.length * dt; }
      for (const id in this.hold) this.hold[id].aOcc += this.hold[id].items.length * dt;
      for (const k in this.conv) this.conv[k].aBusy += this.conv[k].items.length * dt;
      if (this.workers) { this.workers.aBusy += this.workers.busy * dt; this.workers.aPending += this.workers.pending.length * dt; }
      this.areaWIP += this.wip * dt; this.areaTransit += this.inTransit * dt; this.aFG += this.fg * dt;
    }
    this.lastT = t;
  }

  /* ---- event loop ------------------------------------------------------- */
  step() {
    const ev = this._pop(); if (!ev) return false;
    this.accumulate(ev.time); this.now = ev.time;
    if (ev.t === 'ARRIVE') this.onArrive(ev);
    else if (ev.t === 'ARRIVE_NODE') this.onArriveNode(ev);
    else if (ev.t === 'COMPLETE') this.onComplete(ev);
    else if (ev.t === 'CONVEYOR_END') this.onConveyorEnd(ev);
    else if (ev.t === 'MOVE_END') this.onMoveEnd(ev);
    else if (ev.t === 'FAIL') this.onFail(ev);
    else if (ev.t === 'REP') this.onRep(ev);
    else if (ev.t === 'DEM') this.onDemand(ev);
    else if (ev.t === 'FEED') { /* limitless seed: settle() does the release */ }
    this.settle();
    return true;
  }
  run({ until = Infinity, maxEvents = 5_000_000 } = {}) {
    let n = 0; while (this.fel.length && this.now < until && n < maxEvents) { if (!this.step()) break; n++; } return this;
  }

  partOf(id) { return this.model.parts.find((p) => p.id === id); }

  onArrive(ev) {
    const p = this.partOf(ev.part); if (!p) return;
    if (p.demand && !ev.once) this.schedule(sample(p.demand, this.rng), { t: 'ARRIVE', part: p.id });
    this.rawBacklog++;                         // a raw unit is waiting; tryRelease() (in settle) admits it
  }

  /* ---- release control (push / CONWIP, stream / limitless supply) ------- */
  tryRelease() {
    let guard = 0;
    while (guard++ < 100000) {
      if (this.control === 'conwip' && this.lineWip >= this.conwipCap) break;
      if (this.supply === 'stream') { if (this.rawBacklog <= 0) break; }
      else if (!this.firstCanAccept()) break;  // limitless: feed only while the first node has room
      if (this.supply === 'stream') this.rawBacklog--;
      this.releaseJob();
    }
  }
  firstCanAccept() {
    const r = this.mainPart && this.mainPart.routing; if (!r) return false;
    const srcHold = this.hold[r[0]];
    if (srcHold && srcHold.items.length > 0) return false;     // one in flight from the source at a time
    for (const id of r) if (this.res[id]) return this.occ(id) < this.res[id].cap;
    return false;
  }
  releaseJob() {
    const p = this.mainPart; if (!p) return;
    const job = { id: ++this.pid, part: p.id, routing: p.routing, step: 0, entry: this.now, transit: 0 };
    this.entered++; this.wip++; this.lineWip++;
    if (this.lineWip > this.maxLineWip) this.maxLineWip = this.lineWip;
    this.admit(job, 0);
  }
  onDemand() {
    this.schedule(sample(this.demandCfg.dist, this.rng), { t: 'DEM' });
    this.demanded++;
    if (this.fg > 0) { this.fg--; this.fulfilled++; const job = this.fgQueue.shift(); if (job) this.exit(job); }
    else this.stockouts++;
  }
  onSinkArrival(job) {
    this.lineWip = Math.max(0, this.lineWip - 1);   // the job has left the production line
    if (this.demandCfg.mode === 'instant') this.exit(job);
    else { this.fg++; this.fgQueue.push(job); }      // becomes finished-goods inventory
  }

  /* admit a job to the node at routing[toStep]; returns true if accepted */
  admit(job, toStep) {
    const id = job.routing[toStep]; const node = this.nodes[id];
    if (!node || node.kind === 'sink') { this.onSinkArrival(job); return true; }  // reach the sink
    if (node.kind === 'resource') {
      const r = this.res[id];
      if (this.occ(id) >= r.cap) return false;
      job.step = toStep; r.queue.push(job); return true;
    }
    // source / storage
    const h = this.hold[id];
    if (h.items.length >= h.cap) return false;
    job.step = toStep; h.items.push(job); return true;
  }
  occ(resId) { const r = this.res[resId]; let n = r.queue.length; for (const m of r.machines) if (m.busy || m.blocked) n++; return n; }

  onArriveNode(ev) {
    this.inTransit--;
    if (!this.admit(ev.job, ev.step)) this.arrivalBlocked.push({ job: ev.job, step: ev.step });
  }

  onComplete(ev) {
    if (ev.seq2 !== ev.m.depSeq) return;           // stale (a breakdown preempted this service)
    const r = this.res[ev.node]; r.processed++;
    if (r.node.scrap && this.rng() < r.node.scrap) {  // Bernoulli scrap fallout
      ev.m.busy = false; ev.m.blocked = false; ev.m.job = null;
      this.scrap(ev.job);
    } else {
      ev.m.busy = false; ev.m.blocked = true;      // hold finished job until it can move
    }
    // settle() (called by step) boards the job (if any) and frees the machine
  }

  /* ---- breakdowns (preempt-resume) ------------------------------------- */
  scheduleFail(id, mi) {
    const r = this.res[id], m = r.machines[mi];
    m.failSeq++;
    this.schedule(sample(r.node.brk.ttf, this.rng), { t: 'FAIL', node: id, mi, fseq: m.failSeq });
  }
  onFail(ev) {
    const m = this.res[ev.node].machines[ev.mi];
    if (ev.fseq !== m.failSeq) return;
    if (m.busy) {                                  // preempt the in-progress service
      m.depSeq++; m.remaining = Math.max(0, m.depTime - this.now); m.busy = false; m.preempted = true;
    }
    m.down = true;
    this.schedule(sample(this.res[ev.node].node.brk.ttr, this.rng), { t: 'REP', node: ev.node, mi: ev.mi });
  }
  onRep(ev) {
    const m = this.res[ev.node].machines[ev.mi];
    m.down = false;
    if (m.preempted) {                             // resume the saved remainder
      m.preempted = false; m.busy = true; m.depSeq++; m.depTime = this.now + m.remaining;
      this.schedule(m.remaining, { t: 'COMPLETE', node: ev.node, m, job: m.job, seq2: m.depSeq });
    }
    this.scheduleFail(ev.node, ev.mi);             // next time-to-failure clock
  }

  onConveyorEnd(ev) { ev.item.arrived = true; /* settle() tries to deposit */ }

  onMoveEnd(ev) {
    // worker arrived at destination; try to deposit, else block the worker
    if (this.admit(ev.job, ev.step)) { this.workers.busy--; this.inTransit--; }
    else this.workers.blocked.push({ job: ev.job, step: ev.step });
  }

  /* ---- board a job from its current node onto the leg to step+1 --------- */
  board(job) {
    const fromStep = job.step, toStep = fromStep + 1;
    if (toStep > job.routing.length - 1) { this.exit(job); return true; }
    const fromId = job.routing[fromStep], toId = job.routing[toStep];
    const mover = this.moverFor(fromId, toId);
    const tt = this._tt(fromId, toId, mover);
    if (mover === 'conveyor') {
      const leg = this.conv[`${fromId}>${toId}`];
      if (leg.items.length >= leg.cap) return false;       // conveyor full → caller stays blocked
      const item = { job, step: toStep, arrived: false };
      leg.items.push(item); this.inTransit++; job.transit += tt;
      this.schedule(tt, { t: 'CONVEYOR_END', item, leg });
      return true;
    }
    if (mover === 'worker' && this.workers) {
      this.workers.pending.push({ job, step: toStep });    // wait for a free worker (transport queue)
      return true;                                          // job leaves the node into the pending queue
    }
    // instant (uncapacitated delay)
    this.inTransit++; job.transit += tt;
    this.schedule(tt, { t: 'ARRIVE_NODE', job, step: toStep });
    return true;
  }
  _tt(fromId, toId, mover) { const d = legDistance(this.nodes[fromId], this.nodes[toId]); const s = this.legSpeed(fromId, toId, mover); return s > 0 ? d / s : 0; }

  /* ---- settle: resolve all moves that can happen at this instant -------- */
  settle() {
    this.tryRelease();                          // release new jobs per control + supply
    let changed = true, guard = 0;
    while (changed && guard++ < 100000) {
      changed = false;

      // 1. instant arrivals that were blocked by a full buffer
      for (let i = this.arrivalBlocked.length - 1; i >= 0; i--) {
        const a = this.arrivalBlocked[i];
        if (this.admit(a.job, a.step)) { this.arrivalBlocked.splice(i, 1); changed = true; }
      }
      // 2. conveyor exits waiting to deposit downstream
      for (const k in this.conv) { const leg = this.conv[k];
        for (let i = 0; i < leg.items.length; i++) { const it = leg.items[i];
          if (it.arrived && this.admit(it.job, it.step)) { leg.items.splice(i, 1); i--; this.inTransit--; changed = true; } } }
      // 3. workers blocked at deposit
      if (this.workers) for (let i = this.workers.blocked.length - 1; i >= 0; i--) {
        const b = this.workers.blocked[i];
        if (this.admit(b.job, b.step)) { this.workers.blocked.splice(i, 1); this.workers.busy--; this.inTransit--; changed = true; } }
      // 4. assign free workers to pending moves
      if (this.workers) while (this.workers.busy < this.workers.count && this.workers.pending.length) {
        const req = this.workers.pending.shift(); this.workers.busy++;
        const job = req.job, fromId = job.routing[job.step], toId = job.routing[req.step];
        const tt = this._tt(fromId, toId, 'worker'); this.inTransit++; job.transit += tt;
        this.schedule(tt, { t: 'MOVE_END', job, step: req.step }); changed = true; }
      // 5. resources: board finished (blocked) jobs, then start new services
      for (const id in this.res) { const r = this.res[id];
        for (const m of r.machines) { if (m.blocked && m.job) { if (this.board(m.job)) { m.blocked = false; m.job = null; changed = true; } } }
        for (const m of r.machines) { if (!m.busy && !m.blocked && !m.down && r.queue.length) {
          const job = r.queue.shift(); m.busy = true; m.job = job;
          const st = Math.max(0, sample(r.node.service, this.rng));
          m.depSeq++; m.depTime = this.now + st;
          this.schedule(st, { t: 'COMPLETE', node: id, m, job, seq2: m.depSeq }); changed = true; } } }
      // 6. holding nodes (source/storage): push head jobs onward
      for (const id in this.hold) { const h = this.hold[id];
        while (h.items.length) { const job = h.items[0]; if (this.board(job)) { h.items.shift(); changed = true; } else break; } }
    }
  }

  exit(job) { this.wip--; this.completed++; this.sumCycle += this.now - job.entry; this.sumJobTransit += job.transit; }
  scrap(job) { this.wip--; this.scrapped++; }     // job leaves the system as scrap (not completed)

  /* ---- metrics ---------------------------------------------------------- */
  metrics() {
    const T = this.now || 1;
    const util = {}, blocked = {}, down = {};
    for (const id in this.res) { const m = this.res[id].machines.length;
      util[id] = this.res[id].aBusy / (m * T); blocked[id] = this.res[id].aBlk / (m * T); down[id] = this.res[id].aDown / (m * T); }
    const conveyors = {};
    for (const k in this.conv) conveyors[k] = { utilisation: this.conv[k].aBusy / ((this.conv[k].cap === Infinity ? 1 : this.conv[k].cap) * T) };
    return {
      time: this.now, entered: this.entered, completed: this.completed, scrapped: this.scrapped, inSystem: this.wip,
      throughput: this.completed / T,
      yield: (this.completed + this.scrapped) ? this.completed / (this.completed + this.scrapped) : 1,
      avgWIP: this.areaWIP / T,
      avgCycleTime: this.completed ? this.sumCycle / this.completed : 0,
      avgTransitPerJob: this.completed ? this.sumJobTransit / this.completed : 0,
      avgInTransit: this.areaTransit / T,
      utilisation: util,
      blockedFraction: blocked,
      downFraction: down,
      conveyors,
      workers: this.workers ? {
        count: this.workers.count,
        utilisation: this.workers.aBusy / (this.workers.count * T),
        avgQueue: this.workers.aPending / T,
      } : null,
      control: this.control, conwipCap: this.conwipCap, supply: this.supply,
      maxLineWip: this.maxLineWip, avgFG: this.aFG / T,
      demand: this.demandCfg.mode, demanded: this.demanded, fulfilled: this.fulfilled, stockouts: this.stockouts,
      fillRate: this.demanded ? this.fulfilled / this.demanded : 1,
    };
  }
}
