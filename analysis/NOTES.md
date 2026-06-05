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
- [x] D1 Data bridge: run_sim.mjs harness + schema + sample_data/.
- [x] D1 Browser: "Download data (JSON)" buttons in index.html + advanced.html (same schema).
- [x] D2 Python core: ingest → tidy DataFrames; Factory-Physics metrics; Little's Law check.
- [x] D2 Python core: Welch warm-up, MSER-5, t-CIs, batch means; pytest.
- [x] D3 Dashboard: Streamlit + Plotly, dark theme, KPI header + views + exports.
- [x] D4 Site integration: "Open analysis dashboard" popup button; README.
- [x] Iterate-1: harness scenario flags (--control/--demand/--supply/--conwip/--scenario);
      Welch window slider; Steady-state (batch-means) tab for single-replication browser exports;
      pull-mode sample dataset; smoke test now covers every committed sample.
- [x] Iterate-2: TH/CT-vs-WIP characteristic curve (best / practical-worst / worst envelope, §6).
      Driven by `--sweep` in the harness via a single-product CONWIP-cap line (clean total-WIP knob);
      `sweep-v1` schema, `characteristic.py` reference curves, dashboard `render_sweep` view,
      `sweep_line.json` sample, and `test_characteristic.py` (Little's-Law invariant on each curve).
- [x] Iterate-2: VUT / flow-factor. `metrics.flow_factor` (CT÷T0, value-added vs waiting split),
      `congestion_by_resource` (Little's-Law wait Wq=Lq/λ, M/M/1 reference u/(1−u)·t_e, implied
      variability V), `part_flow_factor` (advanced). New dashboard "Congestion" tab: where-cycle-time-
      accrues stacked bar, VUT congestion-vs-utilization curve, per-part flow-factor bar. Tests in
      test_congestion.py.
- [ ] Iterate-2: per-resource interdeparture-CV propagation view (theory-notes §9), if exportable.

## Decisions (continued)

- **Warm-up detector.** Primary cutoff = Welch moving-average flattening within a
  relative tolerance band (the textbook visual method); `converged=False` when it
  only settles past 60% of the run (near-saturation / non-stationary). MSER-5 is
  kept as a separate single-run statistic (it over-truncates clean plateaus, so
  it's reported, not used as the primary cutoff).
- **Single-replication files.** Browser exports are n=1, where the i.i.d.
  replication CI is degenerate; the Steady-state tab uses batch means on one
  post-warm-up run instead. Both paths are in the dashboard.

## Status log (overnight)

- D1–D4 complete and committed. 32 npm tests green; 27→ Python tests green
  (math + ingest + exporters + headless dashboard render of every sample).
- Iterate-1 complete: scenario flags, batch-means tab, Welch window slider,
  pull sample; parametrized dashboard smoke test passes for all 3 samples.
- 2026-06-05 — Iterate-2 characteristic curve: fixed a dashboard regression
  (`main()` referenced an undefined `resolve_dataset`; now resolves a raw dict,
  routes `sweep-v1` files to `render_sweep`, else wraps in `Dataset`). Added
  `test_characteristic.py`. 37 Python tests green; 32 npm tests green.
- 2026-06-05 — Iterate-2 flow factor / VUT: added flow-factor + congestion
  metrics and a "Congestion" dashboard tab (where-cycle-time-accrues bar, VUT
  curve vs M/M/1, per-part flow factor). 41 Python tests green.
