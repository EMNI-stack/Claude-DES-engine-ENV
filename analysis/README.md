# DES factory — analysis & visualization companion

A **local, offline** Python companion for the DES factory simulator. It ingests
simulation output, computes Factory-Physics and simulation-output-analysis
metrics, and renders an interactive dashboard. It is **not** part of the
GitHub Pages deployment — the browser app stays fully static and backend-free.

```
 browser app  ──Download data (JSON)──┐
                                       ├──►  des-analysis/v1 JSON  ──►  dashboard.py
 run_sim.mjs  ──N replications────────┘                                (Streamlit + Plotly)
```

## What's here

| Path | What it is |
|---|---|
| `run_sim.mjs` | Node harness — runs the real engines over N seeded replications, writes the JSON schema |
| `des_analysis/` | Pure Python package: `ingest`, `metrics`, `output_analysis`, `characteristic`, `exporters` |
| `dashboard.py` | Streamlit + Plotly dashboard |
| `sample_data/` | Committed example datasets (so the dashboard demos with zero setup) |
| `tests/` | pytest suite for the analysis math + a headless dashboard smoke test |
| `NOTES.md` | Decisions log, the JSON schema, formulas + sources, and the backlog |
| `exports/` | (generated, gitignored) tidy CSV / Excel written by the dashboard |

## Install (one time)

Requires Python 3.11+ and Node 18+. An isolated virtual environment keeps your
system Python clean:

```bash
python -m venv analysis/.venv
# Windows:
analysis/.venv/Scripts/python.exe -m pip install pandas numpy scipy plotly streamlit openpyxl pytest
# macOS/Linux:
analysis/.venv/bin/python   -m pip install pandas numpy scipy plotly streamlit openpyxl pytest
```

(All commands below use `analysis/.venv/Scripts/python.exe`; on macOS/Linux use
`analysis/.venv/bin/python`.)

## End-to-end flow

**1 — Generate data.** Either:

- **From the browser app:** open `index.html` (simple line) or `advanced.html`
  (factory), run the simulation, then click **⬇ Download data (JSON)**. This
  writes a 1-replication `des-analysis/v1` file.
- **From the harness** (multi-replication, needed for confidence intervals):

  ```bash
  node analysis/run_sim.mjs --kind both --reps 12 --time 20000 --samples 500
  # writes analysis/sample_data/simple_line.json and advanced_factory.json
  ```

  Flags: `--kind both|simple|advanced`, `--reps N`, `--time T` (sim clock per
  replication), `--samples M` (time-series grid points), `--seed BASE`,
  `--outdir DIR`. Scenario overrides: `--control push|pull`, `--supply
  limitless|stream`, `--demand instant|stream`, `--conwip K`, `--scenario NAME`
  (output filename stem).

  **CONWIP sweep** (characteristic curve). Sweep a single-product line's WIP cap
  to trace its throughput/cycle-time curve against the best / practical-worst /
  worst-case bounds:

  ```bash
  node analysis/run_sim.mjs --sweep --reps 12 --time 8000 --wipMax 16
  # writes analysis/sample_data/sweep_line.json  (sweep-v1 schema)
  ```

**2 — Launch the dashboard.**

```bash
analysis/.venv/Scripts/python.exe -m streamlit run analysis/dashboard.py
# or jump straight to a file:
analysis/.venv/Scripts/python.exe -m streamlit run analysis/dashboard.py -- --path analysis/sample_data/advanced_factory.json
```

It opens at **http://localhost:8501**. Pick a sample dataset in the sidebar or
upload a JSON you exported from the browser.

**3 — From the browser app, one click.** The apps have a **📊 Analysis dashboard**
button that opens `http://localhost:8501` in a popup. The dashboard must already
be running locally (step 2) — the button just opens the window; it does not start
the server.

**4 — Export tidy data.** In the dashboard's **Export** tab, write labeled CSVs
and a multi-sheet Excel workbook to `analysis/exports/`.

## Dashboard views

- **KPI header** — throughput, average WIP, cycle time, fill rate, bottleneck.
- **Overview** — Little's Law consistency gauge (WIP vs TH·CT) + per-replication scatter.
- **Flow over time** — WIP/FG/output with the Welch warm-up cutoff shaded; warns
  honestly when no steady state is reached (near-saturation / unstable).
- **Cycle time** — distribution with p50/p90/p95 markers and a per-part SCV table.
- **Resources** — utilization bar with the bottleneck highlighted; per-resource and per-part tables.
- **Congestion** — flow factor (CT ÷ raw process time), where cycle time accrues
  (process vs waiting) per resource, a VUT congestion-vs-utilization curve against
  the M/M/1 reference, per-part flow factor, and — for a serial line — how
  variability propagates station to station via the linking equations.
- **Replications** — means with 95% Student-t confidence intervals + summary table.
- **Steady state** — single-run batch-means estimate (for 1-replication browser exports).
- **Export** — tidy CSV/Excel download (now including the flow-factor, congestion,
  per-part and variability-propagation tables).

A **CONWIP-sweep** file (`sweep-v1`) opens into a dedicated characteristic-curve
view instead of the tabs above: simulated TH/CT vs WIP overlaid on the best /
practical-worst / worst-case reference bounds.

## Run the tests

```bash
analysis/.venv/Scripts/python.exe -m pytest analysis/tests -q
```

Covers the metric math (Little's Law, SCV, bottleneck), output analysis (Welch
warm-up, MSER-5, t-CIs with a calibration check, batch means), JSON ingest, the
exporters, and a headless render of the dashboard.

## Notes

- The analysis layer reads the `des-analysis/v1` schema only; the schema is
  documented in `NOTES.md`. Browser-exported and harness-exported files are
  interchangeable.
- Reference material (Factory Physics; simulation-output-analysis texts) lives
  in the repo's local-only `Reference/` folder; methods here are paraphrased.
