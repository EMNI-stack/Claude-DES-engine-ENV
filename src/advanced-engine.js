// AdvancedSim — multi-part factory simulation with BOMs and routings.
// Jobs flow through workcenter routings; completed units land in component
// inventories; assembly starts only when ALL BOM components are available
// simultaneously (the synchronisation logic). Terminology per
// Reference/theory-notes.md: workcenter, routing, operation, BOM, WIP,
// utilisation, cycle time, throughput (Little's Law: WIP = TH × CT).
import { sample, mulberry32, newDist } from './distributions.js';

// Private min-heap on (time, seq) — src/engine.js keeps its heap as class
// methods, so a small standalone re-implementation lives here.
class MinHeap {
  constructor() { this.a = []; }
  get length() { return this.a.length; }
  peek() { return this.a[0]; }
  less(x, y) { return x.time < y.time || (x.time === y.time && x.seq < y.seq); }
  push(e) {
    const a = this.a; a.push(e); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0; const n = a.length;
      for (;;) {
        const l = 2 * i + 1, r = 2 * i + 2; let s = i;
        if (l < n && this.less(a[l], a[s])) s = l;
        if (r < n && this.less(a[r], a[s])) s = r;
        if (s !== i) { [a[i], a[s]] = [a[s], a[i]]; i = s; } else break;
      }
    }
    return top;
  }
}

const DEF_ARRIVAL = () => newDist('exp', { mean: 3 });

export class AdvancedSim {
  constructor(cfg, seed) {
    this.cfg = cfg;
    this.rng = mulberry32(seed);
    this.now = 0; this.seq = 0; this.events = 0; this.lastT = 0;
    this.fel = new MinHeap();
    this.supplyMode = cfg.supplyMode === 'stream' ? 'stream' : 'limitless';
    this.demandMode = cfg.demandMode === 'stream' ? 'stream' : 'instant';
    this.demandDist = cfg.demandDist || DEF_ARRIVAL();
    this.jobId = 0; this.jobsCreated = 0; this.jobsCompleted = 0;
    this.aWIP = 0; this.logbuf = [];

    // Workcenters: FIFO queue + capacity slots with preempt-resume breakdowns
    this.resources = cfg.resources.map((r) => ({
      cfg: r,
      queue: [],
      slots: Array.from({ length: Math.max(1, r.capacity | 0) }, () => ({
        job: null, busy: false, down: false, remaining: 0, endTime: 0, depSeq: 0, failSeq: 0,
      })),
      // time-integral accumulators
      aBusy: 0, aDown: 0, aQ: 0, aN: 0,
      sumFlow: 0,            // Σ (time at workcenter: queue + service) over departures
      processed: 0,
    }));
    this.resIdx = new Map(cfg.resources.map((r, i) => [r.id, i]));

    // Parts: component inventory + per-part-type statistics
    this.parts = cfg.parts;
    this.partIdx = new Map(cfg.parts.map((p, i) => [p.id, i]));
    this.inventory = {};      // completed units on hand, per part id
    this.pstats = {};         // per part type: created/completed/sumCycle/wip
    this.bomConsumed = {};    // product id -> component id -> units consumed
    for (const p of cfg.parts) {
      this.inventory[p.id] = 0;
      this.pstats[p.id] = { created: 0, completed: 0, sumCycle: 0, wip: 0 };
      this.bomConsumed[p.id] = {};
      for (const b of (p.bom || [])) this.bomConsumed[p.id][b.partId] = 0;
    }
    this.demand = cfg.demand || [];
    this.demandStats = {};    // per demand product: demanded/fulfilled/stockouts
    for (const d of this.demand) this.demandStats[d.partId] = { demanded: 0, fulfilled: 0, stockouts: 0 };

    // Source parts: purchased, or produced from raw material only (empty BOM)
    this.sourceParts = cfg.parts.filter((p) => this.isSource(p));

    // breakdowns
    this.resources.forEach((R, ri) => {
      if (R.cfg.brk) R.slots.forEach((s, si) => this.scheduleFail(ri, si));
    });
    // supply
    if (this.supplyMode === 'stream') {
      for (const p of this.sourceParts) {
        this.schedule(sample(p.arrival || DEF_ARRIVAL(), this.rng), { t: 'ARR', pid: p.id });
      }
    } else {
      // limitless: purchased components are always available
      for (const p of cfg.parts) if (p.type === 'purchased') this.inventory[p.id] = Infinity;
    }
    // demand streams (one independent stream per demand product)
    if (this.demandMode === 'stream') {
      for (const d of this.demand) this.schedule(sample(this.demandDist, this.rng), { t: 'DEM', pid: d.partId });
    }
    if (this.supplyMode === 'limitless') this.feedSources();
    this.tryAssembleAll();
  }

  isSource(p) { return p.type === 'purchased' || !(p.bom && p.bom.length); }
  inDemand(pid) { return this.demandStats[pid] != null; }
  schedule(dt, ev) { ev.time = this.now + Math.max(0, dt); ev.seq = this.seq++; this.fel.push(ev); }
  scheduleFail(ri, si) {
    const R = this.resources[ri], s = R.slots[si];
    this.schedule(sample(R.cfg.ttf, this.rng), { t: 'FAIL', ri, si, seq2: ++s.failSeq });
  }
  log(t, extra) { this.logbuf.unshift(Object.assign({ time: this.now, t }, extra)); if (this.logbuf.length > 40) this.logbuf.pop(); }

  freeSlot(R) { for (let i = 0; i < R.slots.length; i++) { const s = R.slots[i]; if (!s.job && !s.down) return i; } return -1; }
  WIP() { let n = 0; for (const R of this.resources) { n += R.queue.length; for (const s of R.slots) if (s.job) n++; } return n; }

  /* ---- job lifecycle ---- */
  createJob(p) {
    const job = { id: ++this.jobId, pid: p.id, step: 0, tA: this.now, tEnterRes: this.now };
    this.jobsCreated++; this.pstats[p.id].created++; this.pstats[p.id].wip++;
    if (p.routing && p.routing.length) this.enterStep(job);
    else this.finishJob(job);   // no operations — assembled instantly
    return job;
  }

  enterStep(job) {
    const p = this.parts[this.partIdx.get(job.pid)];
    const stepDef = p.routing[job.step];
    const ri = stepDef ? this.resIdx.get(stepDef.resourceId) : undefined;
    if (ri == null) {   // dangling workcenter reference — skip the operation
      job.step++;
      if (job.step < p.routing.length) return this.enterStep(job);
      return this.finishJob(job);
    }
    const R = this.resources[ri];
    job.tEnterRes = this.now;
    const si = this.freeSlot(R);
    if (si >= 0) this.startOp(ri, si, job); else R.queue.push(job);
  }

  startOp(ri, si, job) {
    const R = this.resources[ri], s = R.slots[si];
    const p = this.parts[this.partIdx.get(job.pid)];
    const w = sample(p.routing[job.step].service, this.rng);
    s.job = job; s.busy = true; s.remaining = w; s.endTime = this.now + w;
    this.schedule(w, { t: 'COMPLETE', ri, si, seq2: ++s.depSeq });
  }

  pullQueue(ri) {
    const R = this.resources[ri];
    let si;
    while (R.queue.length && (si = this.freeSlot(R)) >= 0) this.startOp(ri, si, R.queue.shift());
  }

  finishJob(job) {
    const p = this.parts[this.partIdx.get(job.pid)];
    this.jobsCompleted++;
    const st = this.pstats[job.pid];
    st.completed++; st.wip--; st.sumCycle += this.now - job.tA;
    if (this.demandMode === 'instant' && this.inDemand(job.pid)) {
      // instant demand consumes every finished unit of a demand product
      const ds = this.demandStats[job.pid]; ds.demanded++; ds.fulfilled++;
    } else {
      this.inventory[job.pid]++;   // into component inventory / finished goods
    }
  }

  /* ---- assembly synchronisation ---- */
  canAssemble(p) {
    for (const b of p.bom) if (!(this.inventory[b.partId] >= b.qty)) return false;
    return true;
  }
  // Start every assembly whose BOM is fully available. A BOM made entirely of
  // limitless purchased components is an unbounded generator, so it is gated
  // on a free slot at its first operation (like the limitless source feed).
  tryAssembleAll() {
    let guard = 1000, again = true;
    while (again && guard-- > 0) {
      again = false;
      for (const p of this.parts) {
        if (p.type !== 'produced' || !p.bom || !p.bom.length) continue;
        if (!this.canAssemble(p)) continue;
        const allInfinite = p.bom.every((b) => this.inventory[b.partId] === Infinity);
        if (allInfinite) {
          if (!p.routing || !p.routing.length) continue;           // degenerate generator — skip
          const ri = this.resIdx.get(p.routing[0].resourceId);
          if (ri == null || this.freeSlot(this.resources[ri]) < 0) continue;
        }
        for (const b of p.bom) {
          this.inventory[b.partId] -= b.qty;                       // Infinity stays Infinity
          this.bomConsumed[p.id][b.partId] = (this.bomConsumed[p.id][b.partId] || 0) + b.qty;
        }
        this.createJob(p);
        again = true;
      }
    }
  }

  // Limitless supply: raw-material parts (produced, empty BOM) are released
  // the moment their first workcenter has a free slot — never starved.
  feedSources() {
    if (this.supplyMode !== 'limitless') return;
    let progress = true;
    while (progress) {
      progress = false;
      for (const p of this.sourceParts) {
        if (p.type !== 'produced' || !p.routing || !p.routing.length) continue;
        const ri = this.resIdx.get(p.routing[0].resourceId);
        if (ri == null || this.freeSlot(this.resources[ri]) < 0) continue;
        this.createJob(p);
        progress = true;
      }
    }
  }

  /* ---- statistics ---- */
  accumulate(t) {
    const dt = t - this.lastT;
    if (dt > 0) {
      let wip = 0;
      for (const R of this.resources) {
        let busy = 0, down = 0, inSys = R.queue.length;
        for (const s of R.slots) { if (s.down) down++; if (s.job) inSys++; if (s.busy) busy++; }
        R.aBusy += busy * dt; R.aDown += down * dt; R.aQ += R.queue.length * dt; R.aN += inSys * dt;
        wip += inSys;
      }
      this.aWIP += wip * dt;
    }
    this.lastT = t;
  }

  /* ---- event loop ---- */
  step() {
    if (!this.fel.length) return false;
    const ev = this.fel.pop();
    this.accumulate(ev.time); this.now = ev.time; this.events++;

    if (ev.t === 'ARR') {
      // supply stream: raw-material arrival for a source part
      const p = this.parts[this.partIdx.get(ev.pid)];
      if (p) {
        this.schedule(sample(p.arrival || DEF_ARRIVAL(), this.rng), { t: 'ARR', pid: p.id });
        if (p.type === 'purchased') this.inventory[p.id]++;   // straight into component inventory
        else this.createJob(p);                               // raw part begins its routing
        this.log('arr', { pid: p.id });
      }
    } else if (ev.t === 'DEM') {
      const d = this.demand.find((x) => x.partId === ev.pid);
      if (d) {
        this.schedule(sample(this.demandDist, this.rng), { t: 'DEM', pid: d.partId });
        const ds = this.demandStats[d.partId]; ds.demanded++;
        const q = Math.max(1, d.qty | 0);
        if (this.inventory[d.partId] >= q) { this.inventory[d.partId] -= q; ds.fulfilled++; this.log('dem', { pid: d.partId }); }
        else { ds.stockouts++; this.log('stk', { pid: d.partId }); }
      }
    } else if (ev.t === 'COMPLETE') {
      const R = this.resources[ev.ri], s = R.slots[ev.si];
      if (ev.seq2 !== s.depSeq) return true;       // invalidated by a breakdown
      const job = s.job, p = this.parts[this.partIdx.get(job.pid)];
      s.job = null; s.busy = false;
      R.processed++; R.sumFlow += this.now - job.tEnterRes;
      job.step++;
      if (job.step < p.routing.length) this.enterStep(job); else this.finishJob(job);
      this.pullQueue(ev.ri);
      this.feedSources();
      this.log('op', { pid: job.pid, ri: ev.ri });
    } else if (ev.t === 'FAIL') {
      const R = this.resources[ev.ri], s = R.slots[ev.si];
      if (ev.seq2 !== s.failSeq || s.down) return true;
      if (s.busy) {            // preempt: remember remaining work
        s.depSeq++; s.remaining = Math.max(0, s.endTime - this.now); s.busy = false;
      }
      s.down = true;
      this.schedule(sample(R.cfg.ttr, this.rng), { t: 'REPAIR', ri: ev.ri, si: ev.si });
      this.log('fail', { ri: ev.ri });
    } else if (ev.t === 'REPAIR') {
      const R = this.resources[ev.ri], s = R.slots[ev.si];
      s.down = false; this.scheduleFail(ev.ri, ev.si);
      if (s.job) {             // resume the interrupted operation
        s.busy = true; s.endTime = this.now + s.remaining;
        this.schedule(s.remaining, { t: 'COMPLETE', ri: ev.ri, si: ev.si, seq2: ++s.depSeq });
      } else {
        this.pullQueue(ev.ri);
        this.feedSources();
      }
      this.log('rep', { ri: ev.ri });
    }

    this.tryAssembleAll();     // any inventory/slot change may enable assemblies
    return true;
  }
}

// Normalize a raw factory config (e.g. from a save file) into what
// AdvancedSim expects — fills missing arrival dists and modes.
export function normalizeFactory(cfg) {
  for (const r of cfg.resources) {
    if (!r.ttf) r.ttf = newDist('weibull', { shape: 1.5, scale: 40 });
    if (!r.ttr) r.ttr = newDist('exp', { mean: 4 });
  }
  for (const p of cfg.parts) {
    if (!p.arrival) p.arrival = DEF_ARRIVAL();
  }
  cfg.supplyMode = cfg.supplyMode === 'stream' ? 'stream' : 'limitless';
  cfg.demandMode = cfg.demandMode === 'stream' ? 'stream' : 'instant';
  if (!cfg.demandDist) cfg.demandDist = DEF_ARRIVAL();
  return cfg;
}
