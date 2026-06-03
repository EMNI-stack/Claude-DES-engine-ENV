import { mulberry32, sample, newDist } from './distributions.js';

export class Sim {
  constructor(cfg, seed) {
    this.cfg = cfg; this.type = cfg.type; this.rng = mulberry32(seed);
    this.now = 0; this.seq = 0; this.fel = []; this.heapInit();
    this.pid = 0; this.events = 0; this.lastT = 0;
    this.entered = 0; this.completed = 0; this.scrapped = 0; this.rejected = 0;
    this.areaWIP = 0; this.sumCycle = 0; this.cycles = []; this.logbuf = []; this.exits = [];
    this.stations = cfg.stations.map((s) => ({
      cfg: s, cap: s.finite ? s.cap : Infinity,
      machines: Array.from({ length: s.machines }, () => ({
        part: null, busy: false, down: false, blocked: false,
        remaining: 0, depTime: 0, depSeq: 0, failSeq: 0,
      })),
      queue: [], processed: 0, scrapped: 0,
      aBusy: 0, aDown: 0, aBlk: 0, aQ: 0,
    }));
    this.schedule(sample(cfg.source, this.rng), { t: 'ARR' });
    this.stations.forEach((st, k) => {
      if (this.type === 'production' && st.cfg.brk) {
        st.machines.forEach((m, mi) => this.scheduleFail(k, mi));
      }
    });
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
    if (mi >= 0) this.startService(k, mi, part); else st.queue.push(part);
    return true;
  }

  freeAndPull(k, mi) {
    const st = this.stations[k], m = st.machines[mi];
    m.part = null; m.busy = false; m.blocked = false;
    if (!m.down && st.queue.length) { const p = st.queue.shift(); this.startService(k, mi, p); }
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
      this.completed++;
      const ct = this.now - part.tA; this.sumCycle += ct;
      this.cycles.push(ct); if (this.cycles.length > 4000) this.cycles.shift();
      this.freeAndPull(k, mi); return;
    }
    if (this.tryAccept(k + 1, part)) { this.freeAndPull(k, mi); }
    else { this.stations[k].machines[mi].blocked = true; }
  }

  accumulate(t) {
    const dt = t - this.lastT; if (dt > 0) {
      for (const st of this.stations) {
        let b = 0, d = 0, bl = 0;
        for (const m of st.machines) { if (m.down) d++; else if (m.busy) b++; else if (m.blocked) bl++; }
        st.aBusy += b * dt; st.aDown += d * dt; st.aBlk += bl * dt; st.aQ += st.queue.length * dt;
      }
      this.areaWIP += this.WIP() * dt;
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
      const part = { id: ++this.pid, tA: this.now }; this.entered++;
      if (this.tryAccept(0, part)) this.log('arr', { id: part.id });
      else { this.rejected++; this.exit(part, 0, 'rej'); this.log('rej', { id: part.id }); }
    } else if (ev.t === 'DEP') {
      if (ev.seq2 !== m.depSeq) return true;
      m.busy = false; st.processed++;
      const part = m.part;
      if (this.type === 'production' && st.cfg.scrap > 0 && this.rng() < st.cfg.scrap) {
        st.scrapped++; this.scrapped++; this.exit(part, k, 'scrap'); this.freeAndPull(k, mi);
        this.log('scrap', { id: part.id, k });
      } else { this.log('dep', { id: part.id, k }); this.advance(k, mi, part); }
    } else if (ev.t === 'FAIL') {
      if (ev.seq2 !== m.failSeq || m.down) return true;
      if (m.busy) { m.depSeq++; m.remaining = Math.max(0, m.depTime - this.now); m.busy = false; m.down = true; }
      else { m.down = true; }
      this.scheduleRepair(k, mi); this.log('fail', { k, mi });
    } else if (ev.t === 'REP') {
      m.down = false; this.scheduleFail(k, mi); this.log('rep', { k, mi });
      if (m.part) {
        if (m.blocked) { this.advance(k, mi, m.part); }
        else { m.busy = true; m.depTime = this.now + m.remaining; this.schedule(m.remaining, { t: 'DEP', k, mi, seq2: m.depSeq = (m.depSeq + 1) }); }
      } else if (st.queue.length) { const p = st.queue.shift(); this.startService(k, mi, p); }
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

export function defaultConfig(type) {
  if (type === 'server') {
    return {
      type: 'server',
      source: newDist('exp', { mean: 0.7 }),
      stations: [station('Service desk', 3, false, 8, newDist('exp', { mean: 1.0 }))],
    };
  }
  return {
    type: 'production',
    source: newDist('exp', { mean: 1.6 }),
    stations: [
      station('Cutting', 2, true, 6, newDist('lognormal', { mean: 1.4, sd: 0.4 }), 0.02, true,
        newDist('weibull', { shape: 1.8, scale: 40 }), newDist('exp', { mean: 4 })),
      station('Welding', 1, true, 5, newDist('normal', { mean: 1.2, sd: 0.3 }), 0.05, true,
        newDist('weibull', { shape: 1.5, scale: 30 }), newDist('exp', { mean: 5 })),
      station('Inspection', 2, true, 6, newDist('triangular', { min: 0.6, mode: 1.0, max: 1.8 }), 0.0, false,
        newDist('weibull', { shape: 2, scale: 50 }), newDist('exp', { mean: 3 })),
    ],
  };
}
