# Analysis companion — working notes

Local-only Python analysis + visualization companion for the DES factory
simulator. Lives entirely under `analysis/`. NOT part of the GitHub Pages
deploy; the browser app stays static and backend-free.

## Decisions log

- **2026-06-04 — Environment.** Isolated venv at `analysis/.venv` (gitignored).
  Deps: pandas, numpy, scipy, plotly, streamlit, openpyxl, pytest. Python 3.13,
  Node 24, npm 11.
- **Engine touch (minimal, additive).** Added a capped `cycles[]` ring buffer to
  `AdvancedSim` (mirrors `Sim.cycles`) so per-part cycle-time distributions are
  exportable. `Sim` already kept `cycles[]`. No behavioural change — `npm test`
  stays green (32 tests).
- **Data bridge philosophy.** One JSON schema (`des-analysis/v1`) produced by
  BOTH the Node harness and the browser "Download data (JSON)" buttons, so files
  are interchangeable. The harness owns multi-replication runs; the browser
  exports a single live run as a 1-replication file.

## JSON results schema — `des-analysis/v1`

Top level:
```
{
  "schema": "des-analysis/v1",
  "kind": "simple" | "advanced",
  "generatedBy": "harness" | "browser",
  "generatedAt": <ISO string|null>,
  "config": { ... see below ... },
  "runLength": <number>,           # target sim-clock per replication
  "warmupHint": <number|null>,     # optional; Python estimates via Welch
  "replications": [ <replication>, ... ]
}
```

`config` (shared):
```
{ "control": "push"|"pull", "supply": "limitless"|"stream",
  "demandMode": "instant"|"stream", "summary": "<one-line>",
  "resources": [ { "id","name","capacity","serviceMean","scrap","brk" } ],   # workcenters/stations
  "parts": [ { "id","name","type","bom":[{partId,qty}],"routingMean":<n>,"isDemand":bool } ]  # advanced only
}
```

`replication`:
```
{
  "seed": <int>, "now": <clock>, "events": <int>,
  "scalars": {
    "throughput", "avgWIP", "avgCycleTime", "yield", "fillRate", "avgFG",
    "entered", "completed", "scrapped", "rejected",
    "demanded", "fulfilled", "stockouts"
  },
  "resources": [ {
    "id","name","capacity","utilization","blocked","down","avgQueue",
    "processed","throughput", "avgFlowTime"(adv only)
  } ],
  "parts": [ {                       # advanced only
    "id","name","created","completed","scrapped","wip","inventory","avgCycleTime"
  } ],
  "demand": [ { "id","demanded","fulfilled","stockouts","backlog" } ],   # advanced only
  "timeseries": { "t":[...], "wip":[...], "fg":[...], "completed":[...] },  # uniform clock grid, aligned across reps
  "cycleSamples": [ { "part":"<id|unit>", "ct":<number> }, ... ]
}
```

Notes:
- `timeseries` is sampled on the SAME uniform grid (`t = i·runLength/M`) for every
  replication, so Welch's method can average across replications at each grid point.
- `cycleSamples` is the engine's capped ring buffer (recent completions), enough
  for distribution shape + percentiles, not a full census.
- Utilization/blocked/down are fractions of capacity·time; avgQueue is in jobs.

## Formulas & sources (paraphrased — see Reference/)

- **Little's Law**: WIP = TH × CT (conservation; holds per station and system). [Factory Physics]
- **Utilization**: u = (busy machine-time)/(capacity·T). Queue time blows up as u→1.
- **SCV**: c² = σ²/μ² (dimensionless variability; exp ⇒ 1). [theory-notes.md]
- **Warm-up / initialization bias — Welch's method**: average a metric across
  replications at each time index, then apply a moving-average window of half-width
  w; the warm-up cutoff is where the smoothed curve flattens. [Simulation Modeling texts]
- **Steady-state CI (t-based)**: from n replication means x̄_i, report
  mean ± t_{n-1,1-α/2}·s/√n. Replications are i.i.d. so this is valid.
- **Batch means**: an alternative for a single long run — discard warm-up, split
  the remainder into k batches, treat batch means as approx-independent, t-CI on them.

## Iteration backlog (highest value first)

- [x] Engine: add AdvancedSim.cycles ring buffer (additive).
- [ ] D1 Data bridge: run_sim.mjs harness + schema + sample_data/.
- [ ] D1 Browser: "Download data (JSON)" buttons in index.html + advanced.html (same schema).
- [ ] D2 Python core: ingest → tidy DataFrames; Factory-Physics metrics; Little's Law check.
- [ ] D2 Python core: Welch warm-up, t-CIs, batch means; pytest.
- [ ] D3 Dashboard: Streamlit + Plotly, dark theme, KPI header + 6 views + exports.
- [ ] D4 Site integration: "Open analysis dashboard" popup button; README.
- [ ] Iterate: nicer charts, annotations, bottleneck deep-dive, VUT overlay, cost-of-variability views.

## Status log (overnight)

- Scaffolding done; venv installing; AdvancedSim.cycles added; npm test green (32).
