# Phase 5 — Factory Physics overlays · visual research (PRE-DESIGN, info-gathering only)

> **Status: information collection, not a build plan and not ratified.** No code, no Milestone-0
> commitment yet. This gathers the Factory-Physics theory worth visualising, the teaching payoff of
> each, what data each needs, and — importantly — **what is already built and tested** so Phase 5 is
> mostly *overlays + a data bridge*, not new math. Sources: theory-notes §4 (Hopp & Spearman), §6
> (FP for Managers), §8 (formula quick-ref); `Reference/_notes/{hopp-spearman,fp-managers}.md`;
> Charter §7; DESIGN-LANGUAGE §5 (quiet, grayscale-legible, dashed reference lines). Scope guard:
> Charter "basics taught well, no advanced extremities" — Phase 5 = compare sim to closed-form theory
> and interpret it, **not** an optimisation/metamodelling layer.

## 0. What Phase 5 is (Charter §7, physics.html intent)
After a run, let the student **compare simulation output to Factory Physics theory**: overlay
best/worst/practical-worst-case curves, the VUT prediction, and Little's-Law consistency on the
simulated output; interpret qualitatively in the Managers' vocabulary (the three buffers; the
efficiency / flexibility / sustainability lens). **The teaching payoff is the gap**: where sim and
closed-form agree, and where blocking, non-exponential service, and breakdowns make the formulas
break down — which is the whole reason DES exists.

---

## 1. Already built & tested — REUSE, don't rebuild

The prior Python companion was ported to JS and is covered by `tests/analysis-*.test.js`:

- **`src/analysis/characteristic.js`** — `bestCase`, `practicalWorstCase`, `worstCase`,
  `referenceCurves(T0, rb, W0, ws)` (the whole characteristic-curve family), and
  `measuredPoints(sweep)` (per-WIP-cap mean+CI of WIP/TH/CT for a CONWIP sweep). **This is the core of
  the headline Phase-5 visual, done.**
- **`src/analysis/metrics.js`** — `littlesLaw` (independent WIP vs TH×CT consistency), `bottleneck`/
  `utilizationSummary`, `scv`, `cycleTimeStats` (quantiles), `flowFactor` (CT/T0, value-added vs queue
  fraction), `partFlowFactor`, **`congestionByResource`** (VUT-style ρ/(1−ρ), Wq vs M/M/1, implied V),
  **`variabilityPropagation`** (the linking equation cd² per station), **`routingFlow`** (Sankey
  process-flow map).
- **`src/analysis/compare.js`** — scenario KPI comparison (already used conceptually in Phase 4.4).
- **`src/distributions.js`** — `distMean(d)`, `distScv(d)` (so we can read te and ce² straight off any
  node's service distribution; exponential ⇒ ce²=1, constant ⇒ 0).

**The catch:** these consume a `Dataset` over a `des-analysis/v1` results object
(`raw.config` with `serviceMean`/`serviceScv`/`arrivalScv`/`routingMean`; `raw.replications[]` with
`scalars`/`resources`/`parts`/`timeseries`/`cycleSamples`) — the OLD shape, not the Phase-4
`replicate()` output. **So the one real engineering task is a bridge (see §4).**

---

## 2. The visual catalogue (prioritised)

FP-Managers explicitly names "**two killer curves for a dashboard**" + a stocks frontier — those are
the anchor set.

### A. Characteristic curve — TH & CT vs WIP  ★ headline
- **Plot:** measured (WIP-cap sweep) points with CI whiskers, over the three reference curves —
  **best case**, **practical worst case (PWC)**, **worst case** — as dashed lines. Mark **critical WIP
  W₀ = r_b·T₀**. Two panels (TH-vs-w and CT-vs-w) or one with twin axes.
- **Formulae (theory-notes §4.3, in characteristic.js):** best `TH=min(w/T₀, r_b)`,
  `CT=max(T₀, w/r_b)`; PWC `TH = w·r_b/(W₀+w−1)`, `CT = T₀+(w−1)/r_b`; worst `TH=1/T₀`, `CT=w·T₀`.
  Every curve satisfies `TH·CT = w` (a Little's-Law invariant — a built-in self-check).
- **Payoff:** a real line sits between best and worst; **above PWC = a "good/lean" line, below =
  "bad/fat".** To fix a bad line: unbalance it, add parallel machines, or cut variability below
  exponential — the three levers, made visible.
- **Needs:** a **CONWIP sweep** (run reps at several WIP caps) + `T₀ = Σ tₑ`, `r_b` = max-utilisation
  station rate, `W₀ = r_b·T₀`. Sweep capability is the new bit (Phase-4 driver runs one cap; loop it).

### B. VUT / congestion curve — CT vs utilisation  ★ killer curve #1
- **Plot:** cycle-time (or queue-time) vs utilisation u, with the **Kingman VUT prediction**
  `CTq ≈ ((ca²+ce²)/2)·(u/(1−u))·tₑ` as a dashed reference; overlay the simulated station's measured
  Wq. Show the blow-up as u→1. Optionally a per-station VUT table from `congestionByResource`.
- **Payoff (FP-Mgrs rule of thumb):** pushing u 70%→95% raises the U-factor 2.3→19 (~+714% queue
  time). The **product** structure V·U·T is the lesson: high variability *and* high utilisation
  together are catastrophic; either alone is survivable. Exact for M/M/1 — the gap vs sim shows where
  non-exponential / blocking / breakdowns bite.
- **Needs:** per-station u (have), tₑ=`distMean`, ce²=`distScv`, ca² (arrival SCV; exp arrivals ⇒ 1,
  or from `variabilityPropagation` upstream). Sweep u by varying arrival or service to draw the curve;
  or just plot the single operating point against the curve.

### C. Production-flow operating point + zones  ★ killer curve #2 (managerial twin of A)
- **Plot:** the same TH/CT-vs-WIP space but framed for decisions — shade the **starvation zone**
  (below W₀, throughput collapses), the **optimal WIP zone** (curve flattens — max TH, min CT), and
  the **overload zone** (WIP buys cycle time, not throughput). Drop the model's operating point in.
- **Payoff:** "zero inventory is not optimal — W₀ is the ideal"; one-piece-flow can push you into
  starvation (TH/revenue collapses). Robust WIP control (CONWIP) vs fragile throughput control.

### D. Little's Law consistency badge/scatter
- **Plot:** WIP vs TH×CT per replication (`littlesLaw`) — points hug the 45° line; show the mean
  relative error. A quiet "✓ consistent (err 0.4%)" badge.
- **Payoff:** the three quantities are measured **independently** in the engine, so agreement is a
  genuine validation, not a tautology — a white-box V&V check that ties back to Phase 4.

### E. Variability propagation — the linking equation
- **Plot:** a small per-station bar/step chart of ca²→cd² down the line
  (`cd² = u²·ce² + (1−u²)·ca²`, `metrics.variabilityPropagation`). Annotate SCV class (low/mod/high).
- **Payoff:** a busy station exports its own service variability (u→1 ⇒ cd²→ce²); a high-u, low-var
  station is a **filter** that smooths flow for everyone downstream. Explains where queues come from.

### F. Cycle-time distribution vs theory
- **Plot:** the measured cycle-time histogram/quantiles (`cycleTimeStats`) with the M/M/1 prediction
  (mean = W = (1/μ)/(1−ρ)) marked. p50/p90/p95 ticks.
- **Payoff:** lead-time (a policy constant) vs cycle-time (a random variable) — set lead time ≥ a high
  percentile. Ties the "confidence, not a point" message into a decision.

### G. Buffer-portfolio / VUT-for-stocks (FP-Managers, optional, basics-only)
- **Plot:** the **inventory-$ vs fill-rate efficient frontier** shape (blows up near 100% fill) and/or
  the three-buffers framing (inventory / capacity / time — "who or what is waiting?"). Likely
  qualitative/illustrative in v1; the engine has fill-rate + WIP but not $ cost.
- **Payoff:** the clearest decision vocabulary in the literature; the efficiency/flexibility/
  sustainability lens the course wants. **Watch scope** — keep illustrative, not a costing tool.

### H. Process-flow Sankey (`routingFlow`) — already computable
- **Plot:** flow rate × routing across stations (the from-to view). Ties layout → flow.

**Suggested v1 cut:** A (headline) + B + D + E, with C as the managerial framing of A, and F as a
ribbon on the Phase-4 cycle-time view. G/H are stretch / nice-to-have.

---

## 3. Where sim ≠ theory (the teaching gap to surface)
Closed-form FP assumes specific conditions; the sim relaxes them. Phase 5 should make the divergence
visible and *named*:
- **Blocking / finite buffers** — Kingman (infinite-queue) under-predicts; couples stations.
- **Non-exponential service** (ce²≠1) — PWC assumes exponential; lower variability sits above PWC.
- **Breakdowns** (preempt-resume) — inflate tₑ and ce² (theory-notes §4.4); the curve shifts.
- **Batching** — wait-to-batch is variability from *control*, carries no CV — behaves like worst case.
- **Assembly / fork-join, convergence, parallel groups** — beyond single-line closed forms.
Each is a "this is why you simulate" moment.

---

## 4. The one real engineering task — the bridge
Phase-4 `replicate()` output ≠ the `des-analysis/v1` `Dataset` the FP functions expect. Options:
- **(preferred) `floorDataset()` adapter** — package replication runs into a `des-analysis/v1`-shaped
  object: `config` from the run-model (`serviceMean`=distMean, `serviceScv`=distScv per resource;
  `arrivalScv` from the source dist; routing means), and `replications[]` with the scalars/resources/
  timeseries we already snapshot. Then `characteristic.js` + `metrics.js` + `compare.js` work
  unchanged (all tested). Lowest-risk, highest reuse.
- **CONWIP sweep helper** — for curve A/C: run `replicate()` at a ladder of WIP caps (reuse the
  Phase-4.4 `applyFactor('part:*:conwip', …)`/CONWIP) → `measuredPoints`.
- Compute `T₀, r_b, W₀` from the run-model: `T₀ = Σ` per-station `distMean`(service); station rate
  `= machines/tₑ`; `r_b` = max utilisation station's rate; `W₀ = r_b·T₀`.

No engine change needed — everything reads public run-model fields + existing accumulators.

## 5. Visual language (DESIGN-LANGUAGE §5)
Theory = **dashed reference lines, clearly labelled**; simulation = solid thin lines / dots with the
quiet CI band or whiskers from Phase 4. Grayscale-legible, mono tick labels, chart palette `--c1..c6`,
no neon. Reuse `app/js/charts.js` (already has line/dot/bar primitives); add a curve-family plot and a
twin-axis or zone-shaded variant. Keep the calm, "figure-in-a-report" feel.

## 6. Open questions to settle at Phase-5 Milestone 0
1. **Headline scope** — A+B+D+E+ (C framing) for v1? G/H deferred?
2. **Sweep cost** — a WIP-cap sweep is several `replicate()` runs; cap the ladder length + show
   progress (in-browser, synchronous, like Phase 4).
3. **r_b / T₀ for multi-part / assembly / groups** — closed-form FP is single-line; for richer models,
   show the curves for the dominant flow or gate the overlay with a clear "single-line theory" caveat.
4. **VUT operating-point vs swept curve** — draw the full CT-vs-u curve (needs a u sweep) or just plot
   the one point against the Kingman line? (Point is cheaper and still teaches the gap.)
5. **Bridge location** — `floorDataset()` in `src/analysis/` (engine-agnostic) vs `app/js/`.

> **Next step when you say go:** turn this into the Phase-5 Milestone-0 design note (like
> `docs/PHASE-4-DESIGN.md`), confirm the headline visual set + the bridge approach, then build.
