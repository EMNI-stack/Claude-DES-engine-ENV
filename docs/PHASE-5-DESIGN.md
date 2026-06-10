# Phase 5 — Factory Physics overlays (design note)

> **Milestone 0.** Design only. Charter §3 (Factory Physics = the hard quantitative framework to **test
> results against**; FP-for-Managers = qualitative intuition) and §7 (the overlay). DESIGN-LANGUAGE §5
> (theory as **dashed, labelled reference lines**; quiet, grayscale-legible). theory-notes §4 (Little's
> Law, utilisation, VUT/Kingman, best/worst/PWC, variability) and §6 (buffers, efficiency/flexibility).
> **No new simulation mechanics** — a pure interpretive overlay on the Phase-4 analysis. Builds on the
> already-tested `src/analysis/characteristic.js` + `metrics.js` and the Phase-4 driver.
> *(Autonomous run: built straight through M1–M4; the applicability rules below are the thing to review.)*

## 1. The one idea
Lay closed-form Factory Physics **alongside** the simulated responses. Where they **agree** (clean
cases: a single-station, exponential, no-blocking line) both are validated. Where they **diverge**
(blocking, non-exponential service, breakdowns, batching, assembly/convergence) the formula has left
its domain — **and that gap is exactly why DES exists.** The overlay must therefore always state, per
comparison, whether the formula is **exact**, **approximate**, or **out-of-range** for *this* model —
honesty about applicability is the lesson, not a footnote.

## 2. The four comparisons (basics only)

### 2.1 Little's Law — `WIP = TH × CT`  (theory-notes §4.1)
WIP, TH, CT are each measured **independently** by the engine (area method, completions/T, sample mean),
so their agreement is a genuine consistency check. Show `TH×CT` vs measured WIP, the relative error, and
a ✓/✗ within tolerance.
- **Applicability: ALWAYS EXACT** (long-run averages, any distribution, any discipline, any topology).
  This is the one law that never leaves its domain — it is the backbone validation.

### 2.2 Utilisation — `u = ra·te / m`  (theory-notes §4.2, §8)
Predicted per-station utilisation from arrival rate × effective process time ÷ machines, vs measured.
- **EXACT** for a stable, single-class serial line (conservation of flow: every station sees the line
  rate `ra`).
- **APPROXIMATE** when **scrap/yield** changes the rate a station sees, or **assembly/BOM** and
  **convergence** make per-station rates differ from the line rate, or **groups** split the rate across
  members. We then compute `u` from each resource's *own* throughput where available and flag it.

### 2.3 VUT / Kingman queue time — `CTq ≈ ((ca²+ce²)/2)·(u/(1−u))·te`  (theory-notes §4.4, Eq 8.25)
The G/G/1 approximation; **exact for M/M/1**. Show the V·U·T structure and plot `CTq` vs utilisation
with the simulated queue time (CI) on it.
- **EXACT** — single station, 1 machine, exponential arrivals **and** service (ca²=ce²=1), no blocking,
  no breakdowns, no batching.
- **APPROXIMATE** — G/G/1 or G/G/m with non-exponential but finite-variance service/arrivals (use the
  Sakasegawa `m`-form for multi-machine, theory-notes §4.4); breakdowns folded into te/ce² (theory-notes
  §4.4) make it approximate, not exact.
- **OUT-OF-RANGE** — finite buffers / blocking (couples stations, Kingman assumes an infinite queue),
  **batching** (wait-to-batch is control variability with no CV — behaves like the worst case),
  **assembly/fork-join** and **convergence/merge** (multi-class superposition), pure transport-dominated
  delay. Show the line **muted** with "approximation only — simulation needed here."
- **Per-station scope:** we compute VUT at the **bottleneck** station (highest u). `ca²` at the first
  station = the arrival distribution's SCV; downstream we use the linking equation
  `cd² = u²·ce² + (1−u²)·ca²` (theory-notes §4.5) to propagate, and flag the propagated value as
  approximate.

### 2.4 Best / Worst / Practical-Worst-Case curves  (theory-notes §4.3; `characteristic.js`)
The CONWIP characteristic curves over WIP level `w`, with **critical WIP `W₀ = rb·T₀`** marked, and the
**simulated operating point** `(measured WIP, measured TH)` and `(measured WIP, measured CT)` plotted
with CI whiskers. Above PWC = a **good/lean** line; below = **bad/fat**.
- The reference **curves themselves are exact** definitions (best, worst, PWC=max-randomness balanced
  line); every curve satisfies `TH·CT = w` (a built-in invariant check).
- **The "where does my line sit" reading is EXACT** for a single-product serial CONWIP line;
  **APPROXIMATE/ILLUSTRATIVE** for multi-part, assembly, groups, or convergence (T₀/rb are computed for
  the dominant/main flow and labelled as such).
- We plot the **operating point**, not a swept curve (no extra runs) — cheaper and still teaches the
  lean/fat lesson. A WIP-cap sweep is explicitly **out of scope** for v1.

## 3. Line parameters (from the model, theory-notes §4.2/§8)
- `te = t0 / A` where `t0 = distMean(service)`; availability `A = MTTF/(MTTF+MTTR)` if breakdowns set,
  else `A=1`. `ce² = c0² + (1+cr²)·A(1−A)·(mr/t0)` with `c0² = distScv(service)` (breakdown inflation,
  theory-notes §4.4); batch setup folds in via the non-preemptive form when present.
- Station capacity rate `= m/te`; utilisation `u_i = ra·te_i/m_i`. **Bottleneck** = max-u station;
  `rb = m_b/te_b`. `T₀ = Σ te_i` over the main route; `W₀ = rb·T₀`. `ra` = arrival rate `= 1/E[interarrival]`.
- All read from public run-model fields + `distMean`/`distScv`; **no engine change**.

## 4. Applicability engine
A pure `modelFeatures(runModel)` → booleans: `finiteBuffer`, `nonExponentialService`,
`nonExponentialArrival`, `breakdowns`, `batch`, `convergence` (feeders), `assembly` (BOM), `groups`,
`multiMachine`, `multiStation`, `timedTransport`. Each comparison maps features → `exact | approximate |
out-of-range` **with a one-line reason** shown in the UI. This table is the honesty layer.

## 5. Qualitative read-out (M3, FP-for-Managers, theory-notes §6)
Plain-language panel: **which buffer absorbs the variability** (inventory = parts waiting / high WIP;
capacity = idle machines / low utilisation; time = the customer waits / low fill rate — "something or
someone is always waiting"); **the bottleneck** and its utilisation; **lean vs fat** vs PWC; and the
**efficiency / flexibility** implication (high u = efficient but fragile near 100%; a capacity buffer
buys flexibility/responsiveness). Decision-support framing, not new numbers.

## 6. V&V close-out (M4)
The theory agreement is **black-box validation** evidence (theory-notes §2.5): in the clean cases,
matching closed-form builds *confidence*; divergence in complex cases is *expected* and is where
simulation earns its place. Restate **confidence, never proof**; connect to the assumptions log (a
category-C assumption can be stress-tested against theory **and** sensitivity). Offer to tick the
**black-box validation** V&V checklist item.

## 7. Where it lives
The dedicated **`app/physics.html`** page (nav Step 04, currently a placeholder). `app/js/physics.js`
loads the study model, runs the Phase-4 replication driver (reusing settings), computes the theory via
the new `factory_physics.js`, and renders overlays + read-out, reusing `app/js/charts.js` (adding a
characteristic-curve plot and a VUT-curve plot). Analyse (Phase 4) stays unchanged.

## 8. Tests (`tests/analysis-physics.test.js`; existing stay green)
1. **Penny-Fab** best/worst/PWC values match theory-notes §4.3 (One: rb=0.5/h, T₀=8h, W₀=4).
2. **Little's Law** consistency on a sim run within tolerance.
3. **M/M/1 agreement** — simulated CT (CI) covers the VUT prediction; measured u covers `ra·te`.
4. **Applicability** — M/M/1 ⇒ VUT `exact`; with finite buffer / non-exponential / breakdown / batch ⇒
   `approximate`/`out-of-range`, and the sim–formula divergence is detected.

## 9. Out of scope
WIP-cap sweeps, metamodelling, optimisation, cost/$ frontiers, ranking-and-selection, anything beyond
theory-notes §4/§6. Pure interpretive overlay.
