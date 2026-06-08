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
    this.pid = 0; this.events = 0;
    this.jobs = new Map();                  // live jobs in system, for animation
    this.scrapLog = [];                     // {node, t} per scrap event, for the drop animation
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
            batch: null, setupEnd: 0,                           // batch mode: jobs held as a group + setup-phase end
            remaining: 0, depTime: 0, depSeq: 0, failSeq: 0,
          })),
          queue: [],
          cap: (n.bufferCap == null ? Infinity : n.bufferCap),  // total holding (queue + in-machine)
          incoming: 0,                                          // slots reserved by parts in instant-transit toward here
          // batch mode (Phase 3.4): processes a group of B jobs together with one setup per batch.
          // Whole-batch process time = the node's service dist (sampled once). Needs all B to start.
          batch: (n.batch && n.batch.size >= 2) ? { size: n.batch.size | 0, setup: Math.max(0, n.batch.setup || 0) } : null,
          batchesStarted: 0,
          aBusy: 0, aBlk: 0, aDown: 0, aQ: 0, processed: 0,
        };
      } else if (n.kind === 'source' || n.kind === 'storage') {
        this.hold[n.id] = { node: n, items: [], cap: (n.kind === 'source' ? Infinity : (n.cap == null ? Infinity : n.cap)), incoming: 0, aOcc: 0 };
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

    // ---- mode detection (Phase 3.5) -------------------------------------
    // Multi-part PROCESS mode activates when the model declares >1 part, any BOM,
    // or a per-product demand[] array. A lone produced part with no BOM and an
    // object/absent `demand` stays on the single-product path (byte-identical to
    // pre-3.5 behaviour — the existing tests' regression guard).
    const parts = model.parts || [];
    this.multiPart = parts.length > 1 || parts.some((p) => p.bom && p.bom.length) || Array.isArray(model.demand);

    if (this.multiPart) {
      this.initProcess(model, parts);
    } else {
      // arrivals: stream supply schedules them; limitless seeds one FEED to kick settle()
      for (const p of parts) {
        if (this.supply === 'stream') {
          if (p.demand) this.schedule(sample(p.demand, this.rng), { t: 'ARRIVE', part: p.id });
          else this.schedule(0, { t: 'ARRIVE', part: p.id, once: true });
        }
      }
      if (this.supply === 'limitless') this.schedule(0, { t: 'FEED' });
      if (this.demandCfg.mode === 'stream') this.schedule(sample(this.demandCfg.dist, this.rng), { t: 'DEM' });
    }
  }

  /* ====================================================================== *
     PROCESS MODEL (Phase 3.5) — multi-part / BOM / assembly / per-product
     supply-demand-control. The scheduling logic is lifted from the validated
     src/advanced-engine.js (canAssemble, buildPullOrder, computePullNeeds,
     pullSatisfy/extTurn fairness, round-robin feed) and adapted to the floor:
     a component becomes "on hand" only after its last leg DELIVERS it to the
     assembly node (transport gates assembly), and jobs flow through the same
     transport/service/board/batch machinery as the single-part path.
   * ====================================================================== */
  initProcess(model, parts) {
    this.parts = parts;
    this.partsCapExceeded = parts.length > 10;   // E6: cap is enforced/surfaced in the UI; flag here too

    this.partIdx = new Map(parts.map((p, i) => [p.id, i]));
    this.inventory = {};          // finished units on hand, per part id (components + finished goods)
    this.pstats = {};             // per part: created/completed/scrapped/wip/sumCycle
    this.bomConsumed = {};        // product id -> component id -> units consumed
    for (const p of parts) {
      this.inventory[p.id] = 0;
      this.pstats[p.id] = { created: 0, completed: 0, scrapped: 0, wip: 0, sumCycle: 0 };
      this.bomConsumed[p.id] = {};
      for (const b of (p.bom || [])) this.bomConsumed[p.id][b.partId] = 0;
    }
    // which parts are consumed by some assembly (components) — for the deposit rule
    this.componentPids = new Set();
    for (const p of parts) for (const b of (p.bom || [])) this.componentPids.add(b.partId);
    // assembly nodes: the product whose route STARTS at a resource is assembled there;
    // components routed to that node are deposited (consumed), not processed.
    for (const p of parts) {
      if (p.bom && p.bom.length) {
        const nodeId = (p.routing || [])[0];
        if (this.res[nodeId]) this.res[nodeId].product = p.id;
      }
    }
    this.sourceParts = parts.filter((p) => this.isSource(p));

    // control: 'pull' (CONWIP) | 'push'. 'conwip' is accepted as a pull alias.
    this.pullMode = model.control === 'pull' || model.control === 'conwip';
    // demand: array of {partId, dist, qty, conwip}. Pull always runs a demand stream.
    this.demandList = Array.isArray(model.demand) ? model.demand : [];
    this.demandStats = {};
    for (const d of this.demandList) this.demandStats[d.partId] = { demanded: 0, fulfilled: 0, stockouts: 0, backlog: 0 };
    this.demandStream = this.pullMode || model.demandMode === 'stream' || this.demandList.some((d) => d.dist);
    // round-robin + pull-explosion state (advanced-engine)
    this.rrPtr = 0; this.rrFeed = 0; this.pullPlan = {}; this.extTurn = {}; this._pullOrder = null;

    // supply: stream schedules per-source arrivals; limitless seeds a FEED for feedMulti()
    if (this.supply === 'stream') {
      for (const p of this.sourceParts) this.schedule(sample(p.arrival || p.demand || { type: 'exp', mean: 3 }, this.rng), { t: 'ARRIVE', part: p.id });
    } else {
      this.schedule(0, { t: 'FEED' });
    }
    if (this.demandStream) {
      for (const d of this.demandList) this.schedule(sample(d.dist || { type: 'exp', mean: 3 }, this.rng), { t: 'DEM', part: d.partId });
    }
  }
  isSource(p) { return !(p.bom && p.bom.length); }
  inDemandM(pid) { return this.demandStats[pid] != null; }

  // create a job of part p and admit it to the first node of its route
  createAndAdmit(p) {
    const job = { id: ++this.pid, part: p.id, routing: p.routing, step: 0, entry: this.now, transit: 0, loc: null };
    this.jobs.set(job.id, job);
    this.entered++; this.wip++; this.pstats[p.id].created++; this.pstats[p.id].wip++;
    this.admit(job, 0);
  }
  // Room to admit one more job at a part's first RESOURCE (queue + machines). A shallow
  // ready queue (machines + 1) on an infinite buffer is the flood guard, as in the single-part
  // firstCanAccept. Used for assembly admission and stream arrivals into a line.
  firstResAccepts(p) {
    for (const id of (p.routing || [])) if (this.res[id]) {
      const R = this.res[id];
      if (this.occ(id) >= R.cap) return false;
      if (R.cap === Infinity && this.occ(id) >= R.machines.length + 1) return false;
      return true;
    }
    return true;   // no resource on the route (degenerate) — let it through
  }
  // max units of component `pid` consumed by a single assembly (its just-in-time on-hand need)
  componentNeed(pid) { let n = 0; for (const p of this.parts) for (const b of (p.bom || [])) if (b.partId === pid) n = Math.max(n, b.qty); return n || 1; }
  // Limitless feed gate. A COMPONENT deposits straight to inventory (never occupies a queue),
  // so the resource-occupancy guard can't bound it — bound it by its PIPELINE instead
  // (on-hand + in-flight ≤ a shallow buffer), so feed never out-runs assembly consumption.
  // A raw part feeding a line is bounded by its first workcenter's shallow ready queue.
  firstResFeedable(p) {
    if (this.componentPids.has(p.id)) return (this.inventory[p.id] + this.pstats[p.id].wip) < this.componentNeed(p.id) + 1;
    const srcHold = this.hold[(p.routing || [])[0]];
    if (srcHold && srcHold.items.length > 0) return false;   // one staged at the source at a time
    return this.firstResAccepts(p);
  }
  // limitless supply: release source parts while feedable (round-robin so they share a workcenter)
  feedMulti() {
    if (this.supply !== 'limitless') return false;
    const m = this.sourceParts.length; if (!m) return false;
    let progress = false, any = true, guard = 100000;
    while (any && guard-- > 0) {
      any = false;
      const base = this.rrFeed;
      for (let k = 0; k < m; k++) {
        const p = this.sourceParts[(base + k) % m];
        if (!this.firstResFeedable(p)) continue;
        this.createAndAdmit(p); this.rrFeed = ((base + k) % m + 1) % m; any = true; progress = true;
      }
    }
    return progress;
  }

  /* ---- assembly synchronisation (lifted from advanced-engine) ---- */
  canAssemble(p) { for (const b of p.bom) if (!(this.inventory[b.partId] >= b.qty)) return false; return true; }
  // Start every product whose BOM is on hand and whose assembly node can accept it;
  // starting CONSUMES the components. Round-robin so a scarce shared component is shared.
  tryAssembleMulti() {
    const parts = this.parts, n = parts.length;
    if (this.pullMode) this.computePullNeeds();
    let progress = false, again = true, guard = 100000;
    while (again && guard-- > 0) {
      again = false;
      const base = this.rrPtr;
      for (let k = 0; k < n; k++) {
        const idx = (base + k) % n;
        const p = parts[idx];
        if (!p.bom || !p.bom.length) continue;
        if (!this.canAssemble(p)) continue;
        if (!this.firstResAccepts(p)) continue;                 // assembly node's input is full
        if (this.pullMode && !(this.pullPlan[p.id] > 0)) continue;
        for (const b of p.bom) { this.inventory[b.partId] -= b.qty; this.bomConsumed[p.id][b.partId] += b.qty; }
        this.createAndAdmit(p);
        if (this.pullMode) this.pullPlan[p.id]--;
        this.rrPtr = (idx + 1) % n; again = true; progress = true;
      }
    }
    return progress;
  }
  releaseMulti() { let a = this.feedMulti(); let b = this.tryAssembleMulti(); return a || b; }

  /* ---- pull-mode dependent-demand explosion (lifted from advanced-engine) ---- */
  pullLimit(pid) { const d = this.demandList.find((x) => x.partId === pid); return d ? Math.max(1, d.conwip | 0 || 5) : Infinity; }
  buildPullOrder() {
    const ids = new Set(this.parts.filter((p) => p.bom && p.bom.length).map((p) => p.id));
    const state = {}, post = [];
    const visit = (pid) => {
      if (!ids.has(pid) || state[pid]) return;
      state[pid] = 1;
      const p = this.parts[this.partIdx.get(pid)];
      for (const b of p.bom) visit(b.partId);
      state[pid] = 2; post.push(pid);
    };
    for (const pid of ids) visit(pid);
    return post.reverse();
  }
  computePullNeeds() {
    if (!this._pullOrder) this._pullOrder = this.buildPullOrder();
    const gross = {}, plan = {};
    for (const pid of this._pullOrder) gross[pid] = 0;
    for (const d of this.demandList) if (gross[d.partId] != null) gross[d.partId] += this.demandStats[d.partId].backlog * Math.max(1, d.qty | 0);
    for (const pid of this._pullOrder) {
      const p = this.parts[this.partIdx.get(pid)];
      const inv = this.inventory[pid], wip = this.pstats[pid].wip;
      const netReq = Math.max(0, gross[pid] - inv - wip);
      const lim = this.pullLimit(pid);
      const headroom = lim === Infinity ? netReq : Math.max(0, lim - wip);
      plan[pid] = Math.min(netReq, headroom);
      for (const b of p.bom) if (gross[b.partId] != null) gross[b.partId] += plan[pid] * Math.max(1, b.qty | 0);
    }
    this.pullPlan = plan; return plan;
  }
  dependentPending(pid) {
    for (const p of this.parts) {
      if (!p.bom || !p.bom.length) continue;
      if (this.pullPlan[p.id] > 0 && p.bom.some((b) => b.partId === pid)) return true;
    }
    return false;
  }
  pullSatisfy(pid) {
    const d = this.demandList.find((x) => x.partId === pid); if (!d) return;
    const ds = this.demandStats[pid], q = Math.max(1, d.qty | 0);
    if (this.pullMode && this.dependentPending(pid)) {           // share fairly with parent assembly
      if (this.extTurn[pid] === false) { this.extTurn[pid] = true; return; }
      if (ds.backlog > 0 && this.inventory[pid] >= q) { this.inventory[pid] -= q; ds.backlog--; ds.fulfilled++; this.extTurn[pid] = false; }
      return;
    }
    while (ds.backlog > 0 && this.inventory[pid] >= q) { this.inventory[pid] -= q; ds.backlog--; ds.fulfilled++; }
  }

  /* ---- process-mode event handlers ---- */
  onArriveMulti(ev) {
    const p = this.parts[this.partIdx.get(ev.part)]; if (!p) return;
    this.schedule(sample(p.arrival || p.demand || { type: 'exp', mean: 3 }, this.rng), { t: 'ARRIVE', part: p.id });
    this.createAndAdmit(p);   // stream arrivals are self-pacing; admit to the source hold and let it flow
  }
  onDemandMulti(ev) {
    const d = this.demandList.find((x) => x.partId === ev.part); if (!d) return;
    this.schedule(sample(d.dist || { type: 'exp', mean: 3 }, this.rng), { t: 'DEM', part: d.partId });
    const ds = this.demandStats[d.partId]; ds.demanded++;
    if (this.pullMode) { ds.backlog++; this.pullSatisfy(d.partId); }
    else { const q = Math.max(1, d.qty | 0); if (this.inventory[d.partId] >= q) { this.inventory[d.partId] -= q; ds.fulfilled++; } else ds.stockouts++; }
  }
  // a job reached the end of its route: count it, then dispose (consumed by demand,
  // or onto the shelf as a component / finished good). Mirrors advanced-engine.finishJob.
  finishMulti(job) {
    const pid = job.part, st = this.pstats[pid], ct = this.now - job.entry;
    this.completed++; this.wip--; this.sumCycle += ct; this.sumJobTransit += job.transit;
    st.completed++; st.wip--; st.sumCycle += ct;
    this.jobs.delete(job.id);
    if (this.pullMode && this.inDemandM(pid)) { this.inventory[pid]++; this.pullSatisfy(pid); }
    else if (!this.demandStream && this.inDemandM(pid)) { const ds = this.demandStats[pid]; ds.demanded++; ds.fulfilled++; }   // instant demand
    else this.inventory[pid]++;                                  // component / finished-goods shelf
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
    this.events++;
    this.accumulate(ev.time); this.now = ev.time;
    if (ev.t === 'ARRIVE') this.multiPart ? this.onArriveMulti(ev) : this.onArrive(ev);
    else if (ev.t === 'ARRIVE_NODE') this.onArriveNode(ev);
    else if (ev.t === 'COMPLETE') this.onComplete(ev);
    else if (ev.t === 'CONVEYOR_END') this.onConveyorEnd(ev);
    else if (ev.t === 'MOVE_END') this.onMoveEnd(ev);
    else if (ev.t === 'FAIL') this.onFail(ev);
    else if (ev.t === 'REP') this.onRep(ev);
    else if (ev.t === 'DEM') this.multiPart ? this.onDemandMulti(ev) : this.onDemand(ev);
    else if (ev.t === 'FEED') { /* limitless seed: settle() does the release */ }
    this.settle();
    return true;
  }
  run({ until = Infinity, maxEvents = 5_000_000 } = {}) {
    let n = 0; while (this.fel.length && this.now < until && n < maxEvents) { if (!this.step()) break; n++; }
    // Deadlock guard: the event list drained while jobs remain in the system — the model jammed
    // (e.g. a batch resource that can never accumulate B behind a finite/limitless supply). Under
    // stream supply the FEL never empties, so this only fires for genuinely stuck models.
    this.deadlocked = (this.fel.length === 0 && this.wip > 0);
    return this;
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
    if (srcHold && srcHold.items.length > 0) return false;     // one staged at the source at a time
    for (const id of r) if (this.res[id]) {
      const R = this.res[id];
      if (this.occ(id) >= R.cap) return false;                 // respect a finite input buffer
      // Push has no WIP cap, so an INFINITE first buffer would let limitless supply
      // release a job on essentially every event and flood the line (WIP → ∞). Keep
      // only a shallow ready queue (machines + 1) so the first station stays fed
      // without WIP exploding. CONWIP bounds WIP via its cap, so it is exempt.
      if (this.control !== 'conwip' && R.cap === Infinity && this.occ(id) >= R.machines.length + 1) return false;
      return true;
    }
    return false;
  }
  releaseJob() {
    const p = this.mainPart; if (!p) return;
    const job = { id: ++this.pid, part: p.id, routing: p.routing, step: 0, entry: this.now, transit: 0, loc: null };
    this.jobs.set(job.id, job);
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
    else { this.fg++; this.fgQueue.push(job); job.loc = { k: 'fg', node: job.routing[job.routing.length - 1] }; }
  }

  /* admit a job to the node at routing[toStep]; returns true if accepted */
  admit(job, toStep) {
    const id = job.routing[toStep]; const node = this.nodes[id];
    if (!node || node.kind === 'sink') { this.multiPart ? this.finishMulti(job) : this.onSinkArrival(job); return true; }  // reach the sink
    if (node.kind === 'resource') {
      const r = this.res[id];
      // process-mode: a COMPONENT arriving at the assembly node is consumed (deposited to inventory),
      // not processed there. The node's own product (job.part === r.product) is processed normally.
      if (this.multiPart && r.product != null && job.part !== r.product) {
        job.step = toStep; this.finishMulti(job); return true;     // on hand → canAssemble can now see it
      }
      if (this.occ(id) >= r.cap) return false;
      job.step = toStep; job.loc = { k: 'queue', node: id }; r.queue.push(job); return true;
    }
    // source / storage
    const h = this.hold[id];
    if (h.items.length >= h.cap) return false;
    job.step = toStep; job.loc = { k: 'hold', node: id }; h.items.push(job); return true;
  }
  // Actual jobs physically present (queue + in-machine). A busy/blocked batch machine
  // holds m.batch.length units; a single machine holds 1. So a finite buffer accounts for
  // an in-process batch of B; non-batch behaviour is unchanged (still 1 per busy machine).
  occ(resId) { const r = this.res[resId]; let n = r.queue.length; for (const m of r.machines) n += m.batch ? m.batch.length : ((m.busy || m.blocked) ? 1 : 0); return n; }
  // Can node `id` take one more part right now? Counts current holding + parts
  // already reserved/in instant-transit toward it, so a finite buffer can't be
  // over-committed. The sink always accepts.
  canAcceptAt(id) {
    const node = this.nodes[id];
    if (!node || node.kind === 'sink') return true;
    if (node.kind === 'resource') { const r = this.res[id]; return this.occ(id) + r.incoming < r.cap; }
    const h = this.hold[id]; return h.items.length + h.incoming < h.cap;
  }

  onArriveNode(ev) {
    this.inTransit--;
    const dest = this.res[ev.dest] || this.hold[ev.dest];
    if (dest && dest.incoming > 0) dest.incoming--;                 // release the reserved slot
    if (!this.admit(ev.job, ev.step)) this.arrivalBlocked.push({ job: ev.job, step: ev.step });
  }

  onComplete(ev) {
    if (ev.seq2 !== ev.m.depSeq) return;           // stale (a breakdown preempted this service)
    const r = this.res[ev.node]; r.processed++; const m = ev.m;
    if (m.batch) {                                 // whole batch finishes together
      const survivors = [];
      for (const job of m.batch) {                 // scrap each part of the batch independently
        if (r.node.scrap && this.rng() < r.node.scrap) this.scrap(job); else survivors.push(job);
      }
      m.busy = false; m.batch = survivors.length ? survivors : null; m.blocked = survivors.length > 0;
      return;                                      // settle() boards survivors and frees the machine
    }
    if (r.node.scrap && this.rng() < r.node.scrap) {  // Bernoulli scrap fallout
      m.busy = false; m.blocked = false; m.job = null;
      this.scrap(ev.job);
    } else {
      m.busy = false; m.blocked = true;            // hold finished job until it can move
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
    if (toStep > job.routing.length - 1) { this.multiPart ? this.finishMulti(job) : this.exit(job); return true; }
    const fromId = job.routing[fromStep], toId = job.routing[toStep];
    const mover = this.moverFor(fromId, toId);
    const tt = this._tt(fromId, toId, mover);
    if (mover === 'conveyor') {
      const leg = this.conv[`${fromId}>${toId}`];
      if (leg.items.length >= leg.cap) return false;       // conveyor full → caller stays blocked
      const item = { job, step: toStep, arrived: false };
      leg.items.push(item); this.inTransit++; job.transit += tt;
      job.loc = { k: 'transit', from: fromId, to: toId, t0: this.now, t1: this.now + tt };
      this.schedule(tt, { t: 'CONVEYOR_END', item, leg });
      return true;
    }
    if (mover === 'worker' && this.workers) {
      this.workers.pending.push({ job, step: toStep });    // wait for a free worker (transport queue)
      job.loc = { k: 'pending', node: fromId };             // waiting at the from-node for a worker
      return true;                                          // job leaves the node into the pending queue
    }
    // instant transport — capacity-aware: a part only leaves its node if the
    // destination can take it (else the caller keeps it and the line backs up).
    // Reserve the slot for the trip so the settle() fixpoint can't over-fill a
    // finite buffer. A full downstream now backs WIP up into upstream storage.
    if (!this.canAcceptAt(toId)) return false;
    const dest = this.res[toId] || this.hold[toId];
    if (dest) dest.incoming++;
    this.inTransit++; job.transit += tt;
    job.loc = { k: 'transit', from: fromId, to: toId, t0: this.now, t1: this.now + tt };
    this.schedule(tt, { t: 'ARRIVE_NODE', job, step: toStep, dest: toId });
    return true;
  }
  legLen(fromId, toId) {                              // typed override (m) or placement distance
    const o = (this.transport.legs || {})[`${fromId}>${toId}`];
    if (o && o.length > 0) return o.length;
    return legDistance(this.nodes[fromId], this.nodes[toId]);
  }
  _tt(fromId, toId, mover) { const s = this.legSpeed(fromId, toId, mover); return s > 0 ? this.legLen(fromId, toId) / s : 0; }

  /* ---- settle: resolve all moves that can happen at this instant -------- */
  settle() {
    if (!this.multiPart) this.tryRelease();     // single-part release per control + supply
    let changed = true, guard = 0;
    while (changed && guard++ < 100000) {
      changed = false;
      // process-mode release: feed source parts (limitless) + start ready assemblies. Inside the
      // loop so a component delivered this instant (conveyor/instant) enables its assembly at once.
      if (this.multiPart && this.releaseMulti()) changed = true;

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
        job.loc = { k: 'transit', from: fromId, to: toId, t0: this.now, t1: this.now + tt };
        this.schedule(tt, { t: 'MOVE_END', job, step: req.step }); changed = true; }
      // 5. resources: board finished (blocked) jobs, then start new services
      for (const id in this.res) { const r = this.res[id];
        // board finished work — a batch machine holds B finished jobs; free it only when all have left
        for (const m of r.machines) {
          if (!m.blocked) continue;
          if (m.batch) {
            for (let i = 0; i < m.batch.length; i++) if (this.board(m.batch[i])) { m.batch.splice(i, 1); i--; changed = true; }
            if (m.batch.length === 0) { m.batch = null; m.blocked = false; changed = true; }
          } else if (m.job) {
            if (this.board(m.job)) { m.blocked = false; m.job = null; changed = true; }
          }
        }
        // start new services — batch resources wait until B jobs are present and seize them as one
        for (const m of r.machines) {
          if (m.busy || m.blocked || m.down) continue;
          if (r.batch) {
            if (r.queue.length >= r.batch.size) {
              const group = r.queue.splice(0, r.batch.size);
              m.busy = true; m.batch = group;
              for (const j of group) j.loc = { k: 'service', node: id };
              const proc = Math.max(0, sample(r.node.service, this.rng));   // whole-batch process time
              m.depSeq++; m.startTime = this.now; m.setupEnd = this.now + r.batch.setup;
              m.depTime = this.now + r.batch.setup + proc;                  // setup once, then process
              r.batchesStarted++;
              this.schedule(r.batch.setup + proc, { t: 'COMPLETE', node: id, m, seq2: m.depSeq });
              changed = true;
            }
          } else if (r.queue.length) {
            const job = r.queue.shift(); m.busy = true; m.job = job; job.loc = { k: 'service', node: id };
            const st = Math.max(0, sample(r.node.service, this.rng));
            m.depSeq++; m.startTime = this.now; m.depTime = this.now + st;
            this.schedule(st, { t: 'COMPLETE', node: id, m, job, seq2: m.depSeq }); changed = true;
          }
        } }
      // 6. holding nodes (source/storage): push head jobs onward
      for (const id in this.hold) { const h = this.hold[id];
        while (h.items.length) { const job = h.items[0]; if (this.board(job)) { h.items.shift(); changed = true; } else break; } }
    }
  }

  exit(job) { this.wip--; this.completed++; this.sumCycle += this.now - job.entry; this.sumJobTransit += job.transit; this.jobs.delete(job.id); }
  scrap(job) {                                                            // leaves as scrap (not completed)
    this.wip--; this.scrapped++;
    if (this.multiPart && this.pstats[job.part]) { this.pstats[job.part].scrapped++; this.pstats[job.part].wip--; }
    if (job.loc && job.loc.node != null) this.scrapLog.push({ node: job.loc.node, t: this.now });
    this.jobs.delete(job.id);
  }

  /* ---- metrics ---------------------------------------------------------- */
  metrics() {
    const T = this.now || 1;
    const util = {}, blocked = {}, down = {};
    for (const id in this.res) { const m = this.res[id].machines.length;
      util[id] = this.res[id].aBusy / (m * T); blocked[id] = this.res[id].aBlk / (m * T); down[id] = this.res[id].aDown / (m * T); }
    const conveyors = {};
    for (const k in this.conv) conveyors[k] = { utilisation: this.conv[k].aBusy / ((this.conv[k].cap === Infinity ? 1 : this.conv[k].cap) * T) };
    // batch diagnostics: how many batches each batch resource started, and how many parts are
    // stranded below B at the horizon (a starvation surface — never let the model silently hang).
    const batch = {};
    for (const id in this.res) { const r = this.res[id];
      if (r.batch) batch[id] = { size: r.batch.size, setup: r.batch.setup, batchesStarted: r.batchesStarted, waitingForBatch: r.queue.length }; }
    // process-mode: per-part production + on-hand inventory + per-product demand service
    let partsM = null, demandM = null;
    if (this.multiPart) {
      partsM = {}; demandM = {};
      for (const p of this.parts) { const s = this.pstats[p.id];
        partsM[p.id] = { name: p.name || p.id, created: s.created, completed: s.completed, scrapped: s.scrapped,
          wip: s.wip, onHand: this.inventory[p.id], throughput: s.completed / T, avgCycleTime: s.completed ? s.sumCycle / s.completed : 0 }; }
      for (const d of this.demandList) { const ds = this.demandStats[d.partId];
        demandM[d.partId] = { demanded: ds.demanded, fulfilled: ds.fulfilled, stockouts: ds.stockouts, backlog: ds.backlog,
          fillRate: ds.demanded ? ds.fulfilled / ds.demanded : 1 }; }
    }
    return {
      deadlock: !!this.deadlocked, batch,
      multiPart: !!this.multiPart, parts: partsM, demandByPart: demandM, partsCapExceeded: !!this.partsCapExceeded,
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
