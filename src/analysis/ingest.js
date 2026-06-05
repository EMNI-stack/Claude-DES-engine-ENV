// JS port of des_analysis.ingest — wraps one des-analysis/v1 results object and
// exposes tidy row arrays (one observation per row), mirroring the pandas frames
// the Python companion built. Lazily computed + memoized.

export const SCHEMA = 'des-analysis/v1';

export class Dataset {
  constructor(raw) {
    this.raw = raw || {};
    this._cache = {};
  }

  get kind() { return this.raw.kind; }
  get isAdvanced() { return this.raw.kind === 'advanced'; }
  get generatedBy() { return this.raw.generatedBy || 'unknown'; }
  get runLength() { return Number(this.raw.runLength || 0); }
  get warmupHint() { return this.raw.warmupHint ?? null; }
  get config() { return this.raw.config || {}; }
  get summary() { return this.config.summary || this.kind || 'results'; }
  get replications() { return this.raw.replications || []; }
  get nReps() { return this.replications.length; }

  _memo(key, fn) {
    if (!(key in this._cache)) this._cache[key] = fn();
    return this._cache[key];
  }

  /** One row per replication: {rep, seed, now, events, ...scalars}. */
  scalars() {
    return this._memo('scalars', () => this.replications.map((rep, i) => ({
      rep: i, seed: rep.seed ?? i, now: rep.now, events: rep.events,
      ...(rep.scalars || {}),
    })));
  }

  /** One row per (rep, resource). */
  resources() {
    return this._memo('resources', () => {
      const rows = [];
      this.replications.forEach((rep, i) => (rep.resources || []).forEach((r) => rows.push({ rep: i, ...r })));
      return rows;
    });
  }

  /** One row per (rep, part) — advanced only. */
  parts() {
    return this._memo('parts', () => {
      const rows = [];
      this.replications.forEach((rep, i) => (rep.parts || []).forEach((p) => rows.push({ rep: i, ...p })));
      return rows;
    });
  }

  /** One row per (rep, demand product) — advanced only. */
  demand() {
    return this._memo('demand', () => {
      const rows = [];
      this.replications.forEach((rep, i) => (rep.demand || []).forEach((d) => rows.push({ rep: i, ...d })));
      return rows;
    });
  }

  /** Long time series: {rep, t, wip, fg, completed}. */
  timeseries() {
    return this._memo('timeseries', () => {
      const rows = [];
      this.replications.forEach((rep, i) => {
        const ts = rep.timeseries || {};
        const t = ts.t || [];
        for (let k = 0; k < t.length; k++) {
          rows.push({
            rep: i, t: t[k],
            wip: ts.wip ? ts.wip[k] : null,
            fg: ts.fg ? ts.fg[k] : null,
            completed: ts.completed ? ts.completed[k] : null,
          });
        }
      });
      return rows;
    });
  }

  /** Cycle-time samples: {rep, part, ct}. */
  cycleSamples() {
    return this._memo('cycleSamples', () => {
      const rows = [];
      this.replications.forEach((rep, i) => (rep.cycleSamples || []).forEach((c) =>
        rows.push({ rep: i, part: c.part ?? 'unit', ct: c.ct })));
      return rows;
    });
  }
}

export function loadResults(raw) {
  const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (obj.schema !== SCHEMA) throw new Error(`unexpected schema ${obj.schema}; expected ${SCHEMA}`);
  if (!['simple', 'advanced'].includes(obj.kind)) throw new Error(`unknown kind ${obj.kind}`);
  if (!(obj.replications || []).length) throw new Error('results file has no replications');
  return new Dataset(obj);
}

// ---- tiny tidy helpers shared by the metric modules ----
export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
