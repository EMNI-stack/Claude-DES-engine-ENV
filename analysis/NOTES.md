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
  "arrivalScv": <n|null>,          # simple only: entry interarrival SCV (null under limitless supply)
  "resources": [ { "id","name","capacity","serviceMean","serviceScv","scrap","brk" } ],   # workcenters/stations
  "parts": [ { "id","name","type","bom":[{partId,qty}],"route":[resourceId,...],"routingMean":<n>,"isDemand":bool } ]  # advanced only
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
- [x] Iterate-2: variability propagation view (theory-notes §9). Analytic `distVar`/`distScv` added to
      distributions.js (no behavioural change); harness + browser export per-resource `serviceScv` and
      simple-line entry `arrivalScv`. `metrics.variability_propagation` applies the multi-machine linking
      equation c²_d = 1 + (1−u²)(c²ₐ−1) + (u²/√m)(c²ₑ−1) down the serial line; dashboard Congestion tab
      charts c²ₐ/c²ₑ/c²_d per station. New `stream_line` sample (external arrivals). test_propagation.py.

## Iteration backlog — Iterate-3 (highest value first)

- [x] Scenario comparison: sidebar "Compare scenarios" toggle → multiselect of run
      samples; `compare.py` (compare_kpis / compare_utilization / compare_flow_factor /
      best_scenario); dashboard grouped CI bars per KPI, winner badges, grouped
      utilization, flow-factor bars, KPI table. test_compare.py + compare-mode smoke.
- [x] Sankey / flow map: BOM-aware material flow. Schema gains per-part `route`
      (ordered workcenter ids; harness + browser). `metrics.routing_flow` builds a
      conserving Start→workcenter→(BOM feed)→Assembly→Finished graph weighted by
      part rates; Sankey in the Resources tab (bottleneck node amber); arcs also in
      the tidy export (`process_flow` sheet). test_routing_flow.py.
- [ ] "Teaching captions" pass: one-glance takeaway per chart, plain-language.

## In-browser dashboard (2026-06-05)

- **Why.** The Streamlit dashboard needed a local Python server (`localhost:8501`),
  which confused the deploy story ("connection refused" when not running). The
  simulator already runs in the browser, so the analysis was reimplemented as a
  static, client-side page — no server, ships with GitHub Pages.
- **Plotly** vendored at `vendor/plotly.min.js` (v2.35.2, MIT, full bundle for
  Sankey + gauge). One ~4.5 MB cached asset, no CDN, no build step.
- **`src/analysis/*.js`** is a faithful ES-module port of `des_analysis`
  (stats/ingest/output_analysis/metrics/characteristic/compare). The Student-t
  quantile is implemented via the regularized incomplete beta + bisection
  (matches scipy `t.ppf`). `tests/analysis-*.test.js` cross-check the JS output
  against Python on every committed sample, so the two dashboards can't drift.
- **`analysis.html`** mirrors the Streamlit views (Overview/Flow/Cycle/Resources/
  Congestion/Replications/Steady state/Export + sweep + compare). Data sources:
  sessionStorage handoff ("Analyze this run"), file upload, bundled samples.
  Deep-linkable via `#tab` and `?sample=`. Both simulator pages now hand the live
  run off to it instead of opening the Python server.

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
- 2026-06-05 — Iterate-2 variability propagation (§9): analytic distVar/distScv;
  serviceScv + arrivalScv now in the schema (harness + both browser exports);
  linking-equation propagation metric + Congestion-tab chart; new stream_line
  sample. 48 Python tests green; 32 npm tests green. Iterate-2 backlog cleared.
- 2026-06-05 — Iterate-3: tidy export now carries the flow-factor/congestion/
  per-part/propagation tables; README refreshed. Scenario-comparison feature
  (compare.py + sidebar toggle + grouped-CI view). 56 Python tests green.
- 2026-06-05 — Iterate-3 material-flow Sankey: per-part `route` added to the
  schema (harness + browser); BOM-aware routing_flow graph + Resources-tab Sankey
  + process_flow export sheet. 60 Python tests green; 32 npm tests green.
- 2026-06-05 — MORNING SUMMARY. Session recovered a broken dashboard (undefined
  resolve_dataset) and then cleared the whole Iterate-2 backlog (characteristic-
  curve tests; flow-factor/VUT congestion tab; linking-equation variability
  propagation) and most of Iterate-3 (richer tidy export; README refresh;
  scenario-comparison view; BOM-aware material-flow Sankey). 4 new sample/schema
  fields (serviceScv, arrivalScv, route; new stream_line sample). 60 Python tests
  + 32 npm tests green; tree clean. Only the optional "teaching captions" polish
  item remains open.
