import { mulberry32, sample, newDist } from './distributions.js';

export class Sim {
  constructor(cfg, seed) {
    this.cfg = cfg; this.rng = mulberry32(seed);
    this.now = 0; this.seq = 0; this.fel = []; this.heapInit();
    this.pid = 0; this.events = 0; this.lastT = 0;
    this.entered = 0; this.completed = 0; this.scrapped = 0; this.rejected = 0;
    this.areaWIP = 0; this.sumCycle = 0; this.cycles = []; this.logbuf = []; this.exits = [];
    // Explicit buffers: [k] = input buffer of station k (raw material for k=0,
    // WIP otherwise), [n] = finished goods. Fall back to the per-station
    // finite/cap fields so legacy configs behave exactly as before.
    const n = cfg.stations.length;
    const bufCfg = (cfg.buffers && cfg.buffers.length === n + 1)
      ? cfg.buffers
      : [...cfg.stations.map((s) => ({ finite: s.finite, cap: s.cap, init: 0 })),
         { finite: false, cap: 0, init: 0 }];
    this.buffers = bufCfg.map((b) => ({
      cap: b.finite ? b.cap : Infinity,
      init: Math.max(0, Math.floor(b.init) || 0),
    }));
    // Control mode: 'push' releases work whenever input + machine are free;
    // 'pull' additionally requires a downstream production authorization
    // (kanban base-stock: produce only while downstream on-hand + own
    // in-process work is below that buffer's target level).
    this.control = cfg.control === 'pull' ? 'pull' : 'push';
    this.targets = bufCfg.map((b) =>
      Math.max(1, Math.floor(b.target) || (b.finite ? b.cap : 8)));
    // Customer demand at the finished-goods end. 'instant' consumes every
    // finished unit immediately — the classic push-to-sink behavior.
    this.demand = (cfg.demand && cfg.demand.mode === 'stream') ? cfg.demand : { mode: 'instant' };
    this.fgCap = this.buffers[n].cap;
    this.fg = Math.min(this.buffers[n].init, this.fgCap,
      this.control === 'pull' ? this.targets[n] : Infinity);
    this.demanded = 0; this.fulfilled = 0; this.stockouts = 0; this.aFG = 0;
    this.stations = cfg.stations.map((s, k) => ({
      cfg: s, cap: this.buffers[k].cap,
      machines: Array.from({ length: s.machines }, () => ({
        part: null, busy: false, down: false, blocked: false,
        remaining: 0, depTime: 0, depSeq: 0, failSeq: 0,
      })),
      queue: [], processed: 0, scrapped: 0,
      aBusy: 0, aDown: 0, aBlk: 0, aQ: 0,
    }));
    this.schedule(sample(cfg.source, this.rng), { t: 'ARR' });
    this.stations.forEach((st, k) => {
      if (st.cfg.brk) {
        st.machines.forEach((m, mi) => this.scheduleFail(k, mi));
      }
    });
    if (this.demand.mode === 'stream') {
      this.schedule(sample(this.demand.dist, this.rng), { t: 'DEM' });
    }
    // Seed initial inventory (units present at time 0) into station buffers,
    // clamped at capacity; excess units are silently dropped. In pull mode,
    // seed downstream-first (so authorization checks see seeded levels) and
    // clamp each buffer at its kanban target.
    const seedOrder = [...this.stations.keys()];
    if (this.control === 'pull') seedOrder.reverse();
    for (const k of seedOrder) {
      const lim = this.control === 'pull'
        ? Math.min(this.buffers[k].init, this.targets[k])
        : this.buffers[k].init;
      for (let i = 0; i < lim; i++) {
        const part = { id: ++this.pid, tA: 0 };
        if (!this.tryAccept(k, part)) break;
        this.entered++;
      }
    }
  }

  heapInit() { this.fel = []; }
  hLess(a, b) { return a.time < b.time || (a.time === b.time && a.seq < b.seq); }
  push(e) {
    const a = this.fel; a.push(e); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (this.hLess(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break; }
  }
  pop() {
    const a = this.fel, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0, n = a.length;
      while (1) {
        let l = 2 * i + 1, r = 2 * i + 2, s = i;
        if (l < n && this.hLess(a[l], a[s])) s = l;
        if (r < n && this.hLess(a[r], a[s])) s = r;
        if (s !== i) { [a[i], a[s]] = [a[s], a[i]]; i = s; } else break;
      }
    }
    return top;
  }
  schedule(dt, ev) { ev.time = this.now + dt; ev.seq = this.seq++; this.push(ev); }
  scheduleFail(k, mi) {
    const st = this.stations[k], m = st.machines[mi];
    this.schedule(sample(st.cfg.ttf, this.rng), { t: 'FAIL', k, mi, seq2: ++m.failSeq });
  }
  scheduleRepair(k, mi) {
    const st = this.stations[k];
    this.schedule(sample(st.cfg.ttr, this.rng), { t: 'REP', k, mi });
  }

  occupancy(st) { let n = st.queue.length; for (const m of st.machines) if (m.part) n++; return n; }
  WIP() { let n = 0; for (const st of this.stations) n += this.occupancy(st); return n; }
  idleMachine(st) { for (let i = 0; i < st.machines.length; i++) { const m = st.machines[i]; if (!m.part && !m.down) return i; } return -1; }
  inProcess(k) { let c = 0; for (const m of this.stations[k].machines) if (m.part) c++; return c; }

  // Pull authorization (kanban base-stock): station k may start a job only
  // while its downstream buffer's on-hand plus its own in-process work is
  // below that buffer's target level. Push mode is always authorized.
  authorized(k) {
    if (this.control !== 'pull') return true;
    const down = (k + 1 >= this.stations.length) ? this.fg : this.stations[k + 1].queue.length;
    return this.inProcess(k) + down < this.targets[k + 1];
  }

  // Pull cascade: a unit was just consumed from buffer k, which may authorize
  // station k-1; if it starts (consuming from buffer k-1), keep walking
  // upstream toward raw material.
  cascade(k) {
    if (this.control !== 'pull') return;
    for (let j = k - 1; j >= 0; j--) {
      const st = this.stations[j]; let started = false;
      while (st.queue.length && this.authorized(j)) {
        const mi = this.idleMachine(st); if (mi < 0) break;
        this.startService(j, mi, st.queue.shift()); started = true;
      }
      if (!started) break;   // buffer j untouched → upstream authorization unchanged
    }
  }

  startService(k, mi, part) {
    const st = this.stations[k], m = st.machines[mi];
    m.part = part; m.busy = true; m.blocked = false;
    const w = sample(st.cfg.service, this.rng); m.remaining = w; m.depTime = this.now + w;
    this.schedule(w, { t: 'DEP', k, mi, seq2: m.depSeq = (m.depSeq + 1) });
  }

  tryAccept(k, part) {
    const st = this.stations[k];
    if (this.occupancy(st) >= st.cap) return false;
    const mi = this.idleMachine(st);
    if (mi >= 0 && this.authorized(k)) this.startService(k, mi, part); else st.queue.push(part);
    return true;
  }

  freeAndPull(k, mi) {
    const st = this.stations[k], m = st.machines[mi];
    m.part = null; m.busy = false; m.blocked = false;
    if (!m.down && st.queue.length && this.authorized(k)) {
      const p = st.queue.shift(); this.startService(k, mi, p);
      this.cascade(k);
    }
    this.notifyUpstream(k);
  }

  notifyUpstream(k) {
    if (k - 1 < 0) return;
    const up = this.stations[k - 1];
    for (let mi = 0; mi < up.machines.length; mi++) {
      const m = up.machines[mi];
      if (m.blocked && !m.down && m.part) {
        if (this.tryAccept(k, m.part)) { m.part = null; m.blocked = false; this.freeAndPull(k - 1, mi); }
      }
    }
  }

  advance(k, mi, part) {
    if (k + 1 >= this.stations.length) {
      // Last station releases into the finished-goods buffer. With a demand
      // stream and a full finite FG buffer, the machine blocks (same rule as
      // a full downstream WIP buffer). Instant mode never accumulates FG.
      if (this.demand.mode !== 'instant' && this.fg >= this.fgCap) {
        this.stations[k].machines[mi].blocked = true; return;
      }
      this.completed++;
      const ct = this.now - part.tA; this.sumCycle += ct;
      this.cycles.push(ct); if (this.cycles.length > 4000) this.cycles.shift();
      if (this.demand.mode !== 'instant') this.fg++;
      this.exit(part, k, 'done');
      this.freeAndPull(k, mi); return;
    }
    if (this.tryAccept(k + 1, part)) { this.freeAndPull(k, mi); }
    else { this.stations[k].machines[mi].blocked = true; }
  }

  // A freed finished-goods slot may release machines blocked at the last station.
  pullFromLast() {
    const k = this.stations.length - 1, st = this.stations[k];
    for (let mi = 0; mi < st.machines.length && this.fg < this.fgCap; mi++) {
      const m = st.machines[mi];
      if (m.blocked && !m.down && m.part) this.advance(k, mi, m.part);
    }
  }

  accumulate(t) {
    const dt = t - this.lastT; if (dt > 0) {
      for (const st of this.stations) {
        let b = 0, d = 0, bl = 0;
        for (const m of st.machines) { if (m.down) d++; else if (m.busy) b++; else if (m.blocked) bl++; }
        st.aBusy += b * dt; st.aDown += d * dt; st.aBlk += bl * dt; st.aQ += st.queue.length * dt;
      }
      this.areaWIP += this.WIP() * dt;
      this.aFG += this.fg * dt;
    }
    this.lastT = t;
  }

  log(t, extra) { this.logbuf.unshift(Object.assign({ time: this.now, t }, extra)); if (this.logbuf.length > 40) this.logbuf.pop(); }

  step() {
    if (!this.fel.length) return false;
    const ev = this.pop(); this.accumulate(ev.time); this.now = ev.time; this.events++;
    const k = ev.k, mi = ev.mi;
    const st = k != null ? this.stations[k] : null;
    const m = st ? st.machines[mi] : null;

    if (ev.t === 'ARR') {
      this.schedule(sample(this.cfg.source, this.rng), { t: 'ARR' });
      // In pull mode the source is a supplier replenishing raw material:
      // deliveries are accepted only while raw on-hand is below its target
      // (a pull line orders material only to replenish what was consumed).
      if (this.control === 'pull' && this.stations[0].queue.length >= this.targets[0]) return true;
      const part = { id: ++this.pid, tA: this.now }; this.entered++;
      if (this.tryAccept(0, part)) this.log('arr', { id: part.id });
      else { this.rejected++; this.exit(part, 0, 'rej'); this.log('rej', { id: part.id }); }
    } else if (ev.t === 'DEP') {
      if (ev.seq2 !== m.depSeq) return true;
      m.busy = false; st.processed++;
      const part = m.part;
      if (st.cfg.scrap > 0 && this.rng() < st.cfg.scrap) {
        st.scrapped++; this.scrapped++; this.exit(part, k, 'scrap'); this.freeAndPull(k, mi);
        this.log('scrap', { id: part.id, k });
      } else { this.log('dep', { id: part.id, k }); this.advance(k, mi, part); }
    } else if (ev.t === 'FAIL') {
      if (ev.seq2 !== m.failSeq || m.down) return true;
      if (m.busy) { m.depSeq++; m.remaining = Math.max(0, m.depTime - this.now); m.busy = false; m.down = true; }
      else { m.down = true; }
      this.scheduleRepair(k, mi); this.log('fail', { k, mi });
    } else if (ev.t === 'DEM') {
      this.schedule(sample(this.demand.dist, this.rng), { t: 'DEM' });
      this.demanded++;
      if (this.fg > 0) {
        this.fg--; this.fulfilled++; this.log('dem', {});
        this.pullFromLast();
        this.cascade(this.stations.length);   // FG draw-down may authorize the last station
      } else { this.stockouts++; this.log('stk', {}); }
    } else if (ev.t === 'REP') {
      m.down = false; this.scheduleFail(k, mi); this.log('rep', { k, mi });
      if (m.part) {
        if (m.blocked) { this.advance(k, mi, m.part); }
        else { m.busy = true; m.depTime = this.now + m.remaining; this.schedule(m.remaining, { t: 'DEP', k, mi, seq2: m.depSeq = (m.depSeq + 1) }); }
      } else if (st.queue.length && this.authorized(k)) {
        const p = st.queue.shift(); this.startService(k, mi, p);
        this.cascade(k);
      }
    }
    return true;
  }

  exit(part, k, kind) { this.exits.push({ id: part.id, k, kind }); }

  pctile(p) {
    if (!this.cycles.length) return 0;
    const a = [...this.cycles].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(p * a.length))];
  }
}

export function station(name, machines, finite, cap, service, scrap = 0, brk = false, ttf = null, ttr = null) {
  return {
    name, machines, finite, cap, service, scrap, brk,
    ttf: ttf || newDist('weibull', { shape: 1.5, scale: 40 }),
    ttr: ttr || newDist('exp', { mean: 4 }),
  };
}

export function buffer(finite = false, cap = 10, init = 0, target = null) {
  return { finite, cap, init, target: target != null ? target : (finite ? cap : 8) };
}

export function defaultConfig() {
  return {
    control: 'push',
    source: newDist('exp', { mean: 1.6 }),
    stations: [
      station('Cutting', 2, true, 6, newDist('lognormal', { mean: 1.4, sd: 0.4 }), 0.02, true,
        newDist('weibull', { shape: 1.8, scale: 40 }), newDist('exp', { mean: 4 })),
      station('Welding', 1, true, 5, newDist('normal', { mean: 1.2, sd: 0.3 }), 0.05, true,
        newDist('weibull', { shape: 1.5, scale: 30 }), newDist('exp', { mean: 5 })),
      station('Inspection', 2, true, 6, newDist('triangular', { min: 0.6, mode: 1.0, max: 1.8 }), 0.0, false,
        newDist('weibull', { shape: 2, scale: 50 }), newDist('exp', { mean: 3 })),
    ],
    buffers: [buffer(true, 6, 0), buffer(true, 5, 0), buffer(true, 6, 0), buffer(false, 12, 0, 6)],
    demand: { mode: 'instant', dist: newDist('exp', { mean: 2.5 }) },
  };
}
