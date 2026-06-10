# Phase 4 — Output analysis & statistical rigour (design note)

> **Milestone 0.** Design only — no build yet. Charter §5 (output analysis surfaced in **Robinson's**
> terms; Law informs the implementation only) and the basics-over-extremities rule; DESIGN-LANGUAGE §5
> (quiet, grayscale-legible viz; confidence as shaded bands / error bars); theory-notes §3 (terminating
> vs steady-state, Welch warm-up, replications, t-CI, paired comparison, CRN). **No engine changes** —
> reuse `FloorSim` + `src/analysis/*`. **PAUSE for review after this note, and again after Milestone 1.**

## 1. The one idea

A single run is **one sample path of a stochastic process**, not "the answer" — and queueing output is
strongly autocorrelated, so a naive CI from one run is far too narrow (theory-notes §3.2). The app must
therefore **always** present a response as a **mean with a confidence interval / half-width** built from
**independent replications**, and — for steady-state studies — only after **warm-up deletion**.

## 2. What already exists (reuse, don't rebuild)

The statistical core is built and tested (`tests/analysis-*.test.js`):
- `src/analysis/stats.js` — `mean`, `sampleVar/Std`, `studentTppf`, **`confidenceInterval(values, α)`** →
  `{mean, sd, n, low, high, halfwidth}` (the Student-t interval, theory-notes §3.3).
- `src/analysis/output_analysis.js` — **`summarizeReplications`** (per-metric mean/CI/half-width across
  reps), **`welchWarmup`**/`welchAverage`/`movingAverage` (Welch's moving-average warm-up, §3.4),
  `mser5`, `batchMeans` (kept **behind the scenes** — not surfaced, per the no-advanced-extremities rule).
- `src/analysis/compare.js` — scenario KPI summaries.

**New, small additions to the analysis lib:** a replication **driver** (runs `FloorSim` across seeds and
collects snapshots), a **`repsForPrecision`** helper (§3.5 sequential rule), and a **`pairedDifference`**
(§3.6 paired-t). The **Run & Analyse view** (`app/analyse.html` + new `app/js/analyse.js`) is the main UI.

## 3. The replication driver (Milestone 1) — `src/analysis/replicate.js`

`replicate(runModel, {reps, horizon, grid})` runs the model `reps` times with **distinct, reproducible
seeds** (`seed = base + k`), each via `new FloorSim(runModel, seed)` then `run({until: horizon})`.

To support warm-up deletion *interactively without re-running* (§5), each rep is run **incrementally on
a time grid**: step `run({until: t_g})`, call `sim.accumulate(t_g)` to bring the area counters up to
`t_g`, and record a **snapshot** of the (read-only) accumulators at each grid point:
`{ t, wip, areaWIP, completed, sumCycle, sumJobTransit, areaTransit, perPart{completed,sumCycle},
   perRes{aBusy, machines}, demand{demanded, fulfilled} }`. (All are public `FloorSim` fields; no engine
change.) The per-rep **response scalars** are then a pure function of two snapshots — the chosen warm-up
cut-off and the end — so changing the cut-off recomputes instantly.

**Response from a window `[a, b]`** (a = warm-up cut-off, b = horizon), per rep:
- Throughput = `(completed_b − completed_a) / (b − a)`
- Average WIP = `(areaWIP_b − areaWIP_a) / (b − a)` (area method, §3.1)
- Cycle time = `(sumCycle_b − sumCycle_a) / (completed_b − completed_a)` (customer mean)
- In-transport = `(sumJobTransit_b − sumJobTransit_a) / (completed_b − completed_a)`
- Utilisation(res) = `(aBusy_b − aBusy_a) / (machines·(b − a))`
- Fill rate = `(fulfilled_b − fulfilled_a) / (demanded_b − demanded_a)`
(Multi-part headline uses product throughput/cycle; single-part uses overall — same fields.)

**Confidence:** feed the per-rep scalars to `summarizeReplications` → for each response a **mean ± t
half-width** at α (default 0.05 → 95%), plus the relative half-width. The view shows `mean ± h (95% CI)`
and the rel half-width prominently — **never a bare point**.

**Reps for a target precision** (`repsForPrecision(scalars, {target, kind})`): from the current `S²`,
the smallest `n` with `t_{n−1,1−α/2}·√(S²/n) ≤ β` (absolute) or `… /|X̄| ≤ γ′`, `γ′ = γ/(1+γ)` (relative)
— the sequential rule of §3.5. Reports "you need ~N reps (M more) for ±h". Rule-of-thumb floor ≥ 3–5.

## 4. Binding to the conceptual model

Responses are matched to the student's **declared** Phase-2 responses **by name** (the standard set:
Throughput, Average WIP, Cycle time, Fill rate), each mapped to the window-formula above. Per-resource
**utilisation** (incl. transport/operator movers) and **in-transport time** are always collected and
shown (bottleneck readout), even if not declared. A declared response with no known mapping is listed as
"not auto-measured" rather than faked. **Experimental factors** (declared via the `factorButton`
bindings — `resource:<id>:machines`, `…:batch.size`, `part:<id>:demand.mean`/`:conwip`,
`mover:<id>:speed`, `movers:agv|operator:count`, `group:<id>:rule|membercount`, `merge:<part>:streams`)
are the **axes** offered for scenario comparison (Milestone 4).

## 5. Warm-up & terminating vs steady-state (Milestone 2)

- **Terminating study** (Robinson): a natural end event (a shift, a finite order) — initial conditions
  are part of the model, **no warm-up**; analyse by replications over the full horizon (cut-off = 0).
- **Steady-state study**: no natural end; the start-empty bias must be removed by **warm-up deletion**.
  The view shows the **Welch across-replication mean of WIP(t)** (smoothed; the student can change the
  smoothing window) with the suggested cut-off (`welchWarmup`) shaded; the student **drags the cut-off**
  and every response recomputes from the post-cut-off window (§3). Default errs slightly **late** (trade
  a little variance for less bias, §3.4). The single-long-run alternatives (batch means / MSER) stay
  behind the scenes.

## 6. Scenario comparison + V&V loop (Milestone 4)

- A **scenario** = the base run-model with **one declared factor** overridden to a level (e.g. machines
  1 vs 2, batch 3 vs 6, AGV count 2 vs 3). A small applier parses the binding key and sets it on a model
  clone.
- Compare two scenarios with a **paired-t on the difference** `Zⱼ = R_A(seedⱼ) − R_B(seedⱼ)` over the
  **same seeds** (theory-notes §3.6, Eq 10.1) → a t-CI on the mean difference; if it **excludes 0** the
  designs genuinely differ (and by how much). Same seeds ≈ **common random numbers** — explained in
  plain terms, with the honest caveat that our single RNG stream gives *partial* (not per-stream
  synchronised) correlation, so the paired-t is what guarantees validity; we can show "same vs
  independent seeds" to watch the difference-variance shrink.
- **V&V loop:** with real output, the Phase-2 checklist can now reference it — flag a **category-C
  assumption** to test by **sensitivity** (vary its factor, observe the response CI), and surface
  **experimentation validation** (are warm-up, run length, and #reps adequate? — the rel half-width and
  the warm-up plot answer this). Reinforce: **confidence, never proof.**

## 7. Visualisation (Milestone 3) & export (Milestone 5)

- `app/analyse.html` becomes the real view (DESIGN-LANGUAGE §5): response **means with CI error bars**;
  **WIP-over-time** with the warm-up cut-off shaded; **cycle-time distribution** (histogram across
  reps/units); **utilisation** bars incl. transport/operator resources; a **bottleneck** readout.
  Grayscale-legible, mono numerics, calm — CI as a shaded band / whisker, no decoration.
- **Export** (M5) extends the study export with the analysis block: per-response mean/CI/half-width, the
  terminating/steady-state choice and warm-up cut-off, #reps and seeds, and any scenario comparison — so
  a student submits a complete, rigorous study.

## 8. Defaults & formulas to confirm

- **α = 0.05** (95% CI); **t-interval** `X̄ ± t_{n−1,1−α/2}·√(S²/n)` (already in `confidenceInterval`).
- **Reps default = 10** (≥ 5–10 for warm-up; rule-of-thumb floor 3–5).
- **Welch** moving average with half-window `w` (student-adjustable), cut-off where the smoothed curve
  flattens within a tolerance (already in `welchWarmup`).
- **Paired-t** difference CI (new `pairedDifference`); **reps-for-precision** sequential rule (new
  `repsForPrecision`).
- Time grid ≈ `horizon/200` points (cheap; in-browser, synchronous, with a progress indicator).

## 9. Tests planned (new `tests/analysis-replicate.test.js`; existing stay green)

1. **Coverage** — for a known steady-state M/M/1-style queue, the replicated mean's CI covers the
   analytic value at the stated level (across many seeds, ≈ nominal coverage).
2. **√N law** — the half-width shrinks roughly as `1/√N` as reps increase.
3. **Warm-up** — deletion reduces initialisation bias on a system started empty (post-cut-off mean
   closer to the analytic steady-state than the no-deletion mean).
4. **Paired comparison** — detects a real difference (CI excludes 0) and finds none when two designs are
   equivalent (CI contains 0).

## 10. To confirm before building (the PAUSE)

1. **No engine changes** — driver = `FloorSim(seed)` + incremental `run()` + `accumulate()` + read-only
   accumulator snapshots; warm-up deletion via window-deltas (instant, no re-run). ✔ proposed.
2. **Formulas:** Student-t CI (α=0.05), Welch moving-average warm-up, sequential reps-for-precision,
   paired-t on same-seed differences (CRN explained with the single-stream caveat). ✔ proposed.
3. **Binding:** responses matched to the declared Phase-2 responses by name; factors are the
   scenario-comparison axes. ✔ proposed.
4. **Scope:** replications + CI + warm-up + reps-for-precision + paired scenario comparison + V&V loop +
   export. Batch-means/MSER/R&S/metamodelling stay **behind the scenes or out**. ✔ proposed.
