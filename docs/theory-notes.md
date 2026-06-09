# Theory Notes — Simulering og produktionslayout

> Canonical, paraphrased distillation of the reference material for the DES teaching app.
> Referenced by `CLAUDE.md`. **Local-only** (the whole `Reference/` folder is gitignored).
> **Never reproduce textbook sentences verbatim in the app** — everything here is paraphrased,
> with page citations so any claim can be traced back to the source.
>
> Per-book deep notes live in `Reference/_notes/{robinson,law,hopp-spearman,fp-managers}.md`.
> Extracted searchable text is in `Reference/_txt/*.txt` (PDF page markers `===PAGE N===`).
>
> Last updated: 2026-06-05.

## Source key

| Tag | Book | Role for this course |
|---|---|---|
| **[R]** | Robinson, *Simulation: The Practice of Model Development and Use*, 2nd ed. (2014) | **Primary text** — simulation as method: process, conceptual modelling, data, V&V, experimentation. |
| **[L]** | Law, *Simulation Modeling and Analysis*, 5th ed. (2015) | Statistical rigour — input modelling, RNG/variate generation, **output analysis**. |
| **[HS]** | Hopp & Spearman, *Factory Physics*, 3rd ed. (2008) | Authoritative **factory-dynamics formulas** the engine reproduces / the analysis overlays. |
| **[FPM]** | Pound, Bell & Spearman, *Factory Physics for Managers* (2014) | **Decision-support** framing; efficiency / flexibility / sustainability lens. |
| **[FPD]** | Garcia-Diaz & Smith, *Facilities Planning and Design* (Springer, 2024) | **Physical layout** — layout types, SLP, flow analysis, material handling, layout evaluation by simulation. |

Citations are to **printed book pages**, e.g. `[HS p.244]`. In the `_txt` files the page markers
are PDF indices; the offset to the printed page is roughly: Robinson −14, Law +14, Hopp −24, FPD −8.

---

## 0. The course this app serves (the anchor)

From *Simulering og produktionslayout* (5 ECTS) — translated/condensed learning objectives. Every
app feature should trace to one of these.

**Knowledge** — the student knows about:
- physical **layout** and principles of **layout optimisation**;
- **simulation** and how simulation models are applied;
- the connection between production **layout, flow, and decision basis**;
- the significance of **assumptions, data basis, and uncertainty** in simulation models.

**Skills** — the student can:
- **choose and justify** a production layout in a given context;
- **develop and apply** simulation models to analyse production & service systems;
- **experiment with, validate, and analyse** results from simulations;
- relate **critically** to simulation results, uncertainty, and limitations.

**Competence** — the student can:
- identify, analyse, evaluate techniques in production flow & layout;
- **design and carry out** simulation analyses;
- identify, analyse, discuss, recommend solutions for production flow & layout;
- translate simulation results into **decision support** in an organisational context, with regard
  to **efficiency, flexibility, and sustainability**.

### Objective → topic → source → candidate app feature

| Objective | Core topic | Source | App feature |
|---|---|---|---|
| Develop & apply models | DES mechanics, conceptual modelling | [R] ch 1–6, [L] ch 1 | Inspectable engine; conceptual-model scaffold |
| Layout & layout optimisation | Layout types, SLP, from-to/REL charts, material handling | [FPD] ch 1,4,6,7; [HS] ch 7,18 | Layout builder; from-to/REL tools; balance/flow comparison |
| Layout ↔ flow ↔ decisions | Factory dynamics, VUT, CONWIP; layout evaluation by sim | [HS] ch 7–10; [FPD] ch 8 | Live dynamics charts; what-if scenarios |
| Assumptions, data, uncertainty | Input modelling, sensitivity, V&V | [R] ch 5–7,12; [L] ch 5,6 | Assumptions log; sensitivity; data-quality flags |
| Experiment / validate / analyse | Output analysis, warm-up, replications, CIs | [L] ch 9–11; [R] ch 9–10 | Welch warm-up; reps-for-precision; CIs; compare |
| Critical of results / limits | Confidence not proof; coverage; approximations | [R] ch 12; [L] ch 4,9 | Half-widths everywhere; "model is never valid" framing |
| Decision support (eff/flex/sust) | Buffers; profit/flow; robustness | [FPM] ch 3–6 | Buffer-portfolio view; cost/efficiency readouts |

> **Scope note — layout is now covered.** [HS] and [FPM] supply the *dynamics* that let a student
> **justify and evaluate** a layout (flow line vs job shop, balanced vs unbalanced, cellular vs
> functional, parallel vs single machine, push vs pull). [FPD] (added later) supplies the **physical
> layout** half [HS] deferred: the layout types, Systematic Layout Planning, from-to/relationship
> charts, material handling, and — crucially — the argument that a layout must be **evaluated
> dynamically by simulation** ([FPD] ch 8). See §5. The remaining thin spot is a dedicated
> **sustainability** treatment (see §7).

---

## 1. Conventions & definitions (decide these once, use everywhere)

Following the build-recipe in `docs/BUILD-PLAYBOOK.md` §6: fix units and definitions up front.

- **Time** in consistent units (minutes or hours — pick one per model and label it). Rates are
  jobs per that unit.
- **Utilization** `u` = fraction of time a resource is busy doing real work (not idle for lack of
  parts, not blocked, not down) = `ra·te/m` [HS p.230]. Measured in the engine by the area method.
- **Cycle time / flow time** `CT` = time from a job's release into a routing to its exit [HS p.230].
  A **sample average** over completed jobs. (Robinson's vocabulary: "time in system".)
- **Lead time** = a *policy constant* used to promise customers; distinct from cycle time, which is
  a *random variable*. For 100% on-time delivery, lead time ≥ cycle time [FPM p.56].
- **Throughput** `TH` = average rate of good output [HS p.229].
- **WIP** = work in process (jobs in the system). A **time average** (area method).
- **SCV** = squared coefficient of variation `c² = σ²/μ²` [HS p.265]. Exponential ⇒ 1, constant ⇒ 0.
- **Time-average vs sample-average** (the distinction students most often conflate, [L p.17],
  [HS], `docs/…`): WIP / queue length / utilization are time-persistent ⇒ estimate by the **area
  method** `(1/T)∫x(t)dt`; delay / cycle time are per-entity ⇒ estimate by an ordinary **sample
  mean** over entities.
- **Experimental factor** = a model input the user varies; **response** = a measured output [R].
- **Scope** (what to include) vs **level of detail** (how finely) [R ch 5].
- **Assumption** = a choice that fills a *gap in knowledge* about the real system; **simplification**
  = a deliberate *reduction* to make the model tractable [R ch 5]. Track both explicitly.
- **Validity** is binary and purpose-specific; **accuracy** is a scale; **credibility** is the
  client's belief in the model [R ch 12]. A model is never "valid in general".

---

## 2. Simulation as a method — Robinson [R] (primary)

### 2.1 What simulation is, when to use it
Working definition: **experimentation with a simplified, computer-based imitation of an operations
system as it advances through time, in order to understand or improve that system** [R p.6]. It is
**decision support, not optimisation**: it predicts performance for a given set of inputs; the user
varies inputs and re-runs [R p.5].

Three properties of operations systems that defeat back-of-envelope reasoning and motivate
simulation [R p.9–12]:
- **Variability** (predictable, e.g. shift patterns; and unpredictable, e.g. random arrivals,
  breakdowns);
- **Interconnectedness** (a change in one part ripples through others);
- **Complexity** (combinatorial — number of parts/combinations; and *dynamic* — interaction over
  time, from feedback).

**The signature demo** [R p.10]: three sequential stages, each taking 9 min, with arrivals every
10 min. With **no variability**, mean time in system = 27 min. If those are *means* of exponential
distributions, mean time in system ≈ **270 min** (≈90 min per M/M/1 stage). Same averages, 10× the
delay — variability + interconnection compound. (A perfect first interaction for the app.)

**Advantages** over experimenting on the real system (cost, time-compression, controllability, the
system may not exist yet) and over analytic methods (models variability directly; few restrictive
assumptions; transparent/animated, builds non-expert confidence) [R p.13–16]. **Disadvantages:**
expensive, slow, data-hungry, expertise-heavy, and **danger of over-confidence** — an animated model
looks real and invites over-trust, so assumptions/simplifications/validity must stay visible
[R p.16; also a [L p.71] pitfall].

DES suits any system seen as a **queueing system**: entities flow *activity → queue → activity*,
queues forming when arrivals outpace the next activity [R p.5].

### 2.2 The simulation study process (lifecycle)
A **non-linear cycle** of four activities/deliverables, with repetition and iteration [R ch 4]:
**conceptual model → computer model (coding) → experimentation/solutions → implementation.** V&V is
**not a stage** — it runs continuously throughout. Roughly a third of effort each goes to
conceptual+data work, coding, and experimentation.

Law's compatible 10-step version [L p.66–70]: (1) formulate problem & objectives; (2) collect data &
build a model + **assumptions document**; (3) **validate the assumptions document** with SMEs;
(4) program & **verify**; (5) pilot runs; (6) is the programmed model **valid?**; (7) **design
experiments** (run length, warm-up, number of replications); (8) production runs; (9) **analyse
output**; (10) document & present. Iterative, not strictly sequential.

### 2.3 Conceptual modelling — the heart of "develop a model" [R ch 5–6]
A **conceptual model** is a *non-software* description of: **objectives**; **inputs** (experimental
factors); **outputs** (responses, incl. how you'll know objectives are met); **model content**
(scope × level of detail); and the **assumptions** and **simplifications**. Build the **simplest
model that meets the objectives** — accuracy has diminishing returns, and a smaller model is faster
to build, run, and validate, and easier to understand [R ch 5].

Four requirements of a good conceptual model [R ch 5]: **validity** (will it give results good enough
for the purpose?), **credibility** (will the client believe it?), **utility** (is it useful as a
decision aid?), **feasibility** (can it be built with the data/time/resources?).

Simplification methods [R ch 6]: aggregation/black-boxing, grouping entities, excluding rare events,
reducing the rule set, splitting models. *Worked example to copy:* the fast-food restaurant
objectives→outputs→inputs→content tables, with assumptions and simplifications called out.

### 2.4 Data and input modelling [R ch 7; deeper in [L] ch 6, see §3.5]
Data availability categories [R ch 7]: **A** = available; **B** = collectable; **C** =
**not available / not collectable**. For category-C data: estimate it (and *document* the estimate,
then run **sensitivity analysis**), or treat it as an **experimental factor**. Four ways to represent
input variability [R ch 7]: a **trace** (replay real data), an **empirical** distribution, a fitted
**statistical** distribution (usually preferred — smooths, extrapolates, compact), or **bootstrapping**.

### 2.5 Verification, validation & confidence [R ch 12]
- **Verification** = building the model *right* (the code matches the conceptual model).
- **Validation** = building the *right* model (it represents the real system well enough for the
  purpose). Verification is effectively a subset of validation.
- Forms of validation [R ch 12]: **conceptual-model**, **data**, **white-box** (internal/micro
  checks), **black-box** (overall output vs reality), **experimentation** (warm-up, run-length,
  replications adequate?), and **solution** validation.
- **You can never prove a model valid.** V&V tries to prove the model *wrong*; surviving such tests
  builds **confidence** [R ch 12]. This is exactly the course's "relate critically to results,
  uncertainty, and limitations" objective — make it a first-class message in the app.
- The **white-box trap** [R ch 12]: `Z = X+Y` and `Z = X·Y` both give 4 at `X=Y=2`; matching one
  output point doesn't validate the internals. Hence micro-level checks matter, not just black-box.
- Black-box comparison to real data uses a two-sample CI on the difference of means
  (`(X̄_S − X̄_R) ± t·√(S_S²/n + S_R²/n)`) — Law's Welch two-sample-t, §3.7.

### 2.6 Visual interactive simulation (VIS) — relevant to a browser app [R ch 3]
A model that **animates as it runs**, colour-coding element status, optionally with live charts, and
lets the user **pause, inspect, change, and continue**. Benefits: deeper understanding; easier V&V
(spurious on-screen behaviour exposes bugs; non-experts can comment); interactive experimentation;
better communication; supports group problem-solving/facilitation. This is the natural mode for a
teaching tool.

### 2.7 Three-phase executive (how DES software actually advances time) [R ch 2]
Classify events as **B (bound/booked)** — scheduled for a known future time (arrivals, activity
completions) — and **C (conditional)** — fire only when conditions hold (an activity *start* needs a
free server and a waiting entity). The loop: **A-phase** advance clock to the next event in the
time-ordered event list → **B-phase** execute all due B-events → **C-phase** attempt all C-events,
repeating until none can fire → back to A. (Our engine uses an event-scheduling variant with a heap
FEL; the three-phase view is the cleanest one to *teach*.)

---

## 3. Output analysis & statistical honesty — Law [L]

This is what makes "experiment, validate, analyse, and be critical of uncertainty" rigorous.

### 3.1 DES mechanics & the area method [L ch 1]
Single-server queue, the canonical model. State, clock, **event list**, statistical counters,
init/timing/event routines [L p.10]. **Next-event time advance**: jump to the most imminent event,
update state and counters, schedule/cancel future events; the clock advances in unequal jumps and
idle gaps are skipped [L p.7]. Delay recurrence: `D₁=0`, `D_{i+1}=max{Dᵢ+Sᵢ−A_{i+1}, 0}` [L p.13].
**Time averages via the integral/area method** (`∫Q(t)dt / T`, accumulated as `state·Δt` rectangles);
**customer averages via sample means** [L p.14–18].

### 3.2 Why a single run lies — autocorrelation [L ch 4]
Simulation output is a **stochastic process**, and queueing output is **strongly positively
autocorrelated** (M/M/1 at ρ=0.9: lag-1 correlation ≈ 0.99) [L p.227]. Consequently the usual
variance estimator `S²(n)/n` is biased **low** (`Var[X̄(n)] = (σ²/n)[1 + 2Σ(1−j/n)ρⱼ]`, [L p.231]),
so naive confidence intervals are far too narrow and **overstate confidence**. The fix everywhere:
**group output into approximately-IID units** (independent replications, or batches) and apply the
classic t-interval to those.

### 3.3 The t confidence interval [L ch 4 & 9]
`X̄(n) ± t_{n−1,1−α/2}·√(S²(n)/n)` [L Eq 4.12 / 9.1]. The added term is the **half-length**
(precision). Quadrupling `n` roughly halves it (√n law). **Coverage** degrades with skewness of the
per-unit statistic, so prefer the (wider) t over z, and report the half-length, never just a point.

### 3.4 Steady-state output analysis (the engine room)
- **Terminating vs non-terminating** [L ch 9]: a terminating run has a natural end event (bank
  closes, batch finished) and initial conditions are part of the model — analyse by independent
  replications, no warm-up. A non-terminating (steady-state) run needs **warm-up** handling.
- **Warm-up / initialisation bias — Welch's moving-average procedure** [L p.512–520], also in
  [R ch 9]: make `n ≥ 5–10` replications of length `m`; average across replications pointwise
  `Ȳᵢ = (1/n)Σⱼ Y_{ji}`; smooth with a **moving average** of half-window `w ≤ ⌊m/4⌋`
  (`Ȳᵢ(w) = Σ_{s=−w}^{w} Ȳ_{i+s} / (2w+1)`, with the shrinking-window form near the start); **plot**
  for several `w`, pick the smallest smooth one, set warm-up `l` where the curve flattens — and
  **err toward `l` too large** (trade a little variance for less bias). Robinson's alternative is
  **MSER** (pick the deletion point `d` minimising `MSER(d) = (1/(m−d)²)Σ_{i=d+1}^{m}(Yᵢ−Ȳ(m,d))²`,
  rejecting a `d` that lands in the second half).
- **Replication/deletion** — the recommended steady-state **default** [L p.523]: delete the first
  `l` observations of each of `n′` runs, form per-run means `Xⱼ = Σ_{i=l+1}^{m′}Y_{ji}/(m′−l)`, treat
  them as IID, apply the t-interval [L Eq 9.6].
- **Batch means** — a single long run [L p.526]: pass the warm-up once, then split the remaining `m`
  observations into `n` batches of size `k`; treat batch means as IID. **Main hazard: `k` too small ⇒
  batches stay correlated ⇒ CI too short.** Size `k` by checking the **lag-1 correlation of the batch
  means ≈ 0**; prefer fewer, larger batches.

### 3.5 How many replications for a target precision [L p.503–506]
- Absolute precision `β`: smallest `i ≥ n` with `t_{i−1,1−α/2}·√(S²(n)/i) ≤ β` [L Eq 9.2]
  (≈ `i ≥ S²(n)·(z_{1−α/2}/β)²`).
- Relative precision `γ`: use `γ′ = γ/(1+γ)` and require
  `t_{i−1,1−α/2}·√(S²(n)/i)/|X̄(n)| ≤ γ′` [L Eq 9.3].
- **Sequential rule** (most reliable): start with `n₀ ≥ 10`, add one replication at a time,
  re-estimating variance, until the relative half-length `≤ γ′`; recommend `γ ≤ 0.15`.
- Robinson's equivalent direct solve: `n = (100·t_{n−1,α/2}·S / (d·X̄))²` for a `d%` deviation
  target [R ch 9]; rule of thumb ≥ 3–5 replications always.

### 3.6 Comparing alternatives [L ch 10–11; R ch 10]
- **Paired-t CI** for the difference of two designs run on `n` paired replications:
  `Z̄(n) ± t_{n−1,1−α/2}·√(Var̂[Z̄(n)])`, `Zⱼ = X_{1j} − X_{2j}` [L Eq 10.1]. If the interval excludes
  0, the designs genuinely differ (and you read off which is better, by how much). Needs **no**
  independence between the two systems.
- **Common Random Numbers (CRN)** — the headline variance-reduction technique [L ch 11]: drive both
  designs with the **same, synchronised** random numbers. Then
  `Var[Z̄] = [Var(X₁)+Var(X₂)−2·Cov(X₁,X₂)]/n`; the induced `Cov > 0` shrinks the variance of the
  difference, tightening the CI without changing either mean. Requires monotone same-direction
  response and **per-stream synchronisation** (same random number used for the same purpose in both
  systems); it can backfire otherwise. Our seeded RNG makes this a memorable lesson: compare two
  scenarios on the *same* seeds vs *independent* seeds and watch the variance of the difference
  collapse.
- **Welch two-sample-t** for *independent* samples (e.g. model vs real data) [L Eq 10.2] — precludes
  CRN. **>2 systems:** Bonferroni `α/c`, or ranking-&-selection [L ch 10; R ch 10].

### 3.7 Input distributions & random-variate generation [L ch 6–8]
- **Fitting:** hypothesise a family (histogram + role of the variable), estimate parameters by
  **MLE** (exponential `β̂ = X̄`; gamma/Weibull numerical), then a **goodness-of-fit** check —
  **chi-square** with *equiprobable* bins and `n·pⱼ ≥ 5`, or **Kolmogorov–Smirnov** `Dₙ = sup|Fₙ−F̂|`
  (no binning). Caveats: GOF tests are weak for small `n` and reject almost anything for huge `n`;
  treat as detectors of gross mismatch [L p.344].
- **No data** [L p.375]: ask SMEs for a range `[a,b]` and a most-likely `m`, use **triangular(a,b,m)**
  (or beta / uniform). **But flag the uncertainty loudly** — approximating an unknown distribution by
  a triangular can throw an M/G/1 delay estimate off by ~88% [L Ex 6.23]. Shape & variability matter,
  not just the mean.
- **Arrivals:** Poisson process ⇔ exponential interarrivals; for time-varying demand use a
  **non-stationary Poisson** with piecewise-constant `λ(t)` [L p.380].
- **RNG:** one reproducible generator with seed control and **separate streams** per stochastic input
  — the prerequisite for both replications and CRN. (LCG `Zᵢ = (aZ_{i−1}+c) mod m`, full period via
  Hull–Dobell; modern combined generators preferred) [L ch 7].
- **Variate generation** [L ch 8]: inverse transform where closed-form — exponential `−β·ln U`,
  Weibull `β(−ln U)^{1/α}`, uniform `a+(b−a)U`, triangular (piecewise √); **normal** via Box–Muller /
  polar (use a dedicated stream — adjacent LCG values spiral); **lognormal** `X = e^Y, Y~N(μ,σ²)`
  with `μ = ln(m′²/√(m′²+s′²))`, `σ² = ln(1+s′²/m′²)` to hit target mean `m′`/variance `s′²`.

### 3.8 Statistically-honest defaults the app should adopt
1. Never present a single run as "the answer" — default to multiple replications + a t-CI.
2. Time averages by the area method; customer averages by sample means.
3. Distinguish terminating vs steady-state; for steady-state offer Welch warm-up + replication/
   deletion (batch means with a lag-1 check as the single-run alternative).
4. Provide a "replications for target precision" helper.
5. Compare designs with paired-t + synchronised CRN by default; offer Welch's two-sample-t
   (independent) for model-vs-data and warn CRN must then be off.
6. Fit inputs by MLE + GOF; expose triangular/uniform when no data, and **surface input-model
   uncertainty**; warn that as `u → 1` means explode and autocorrelation worsens.
7. Show **half-lengths/precision everywhere**; sensitivity analysis over inputs and distribution
   choices is the practical handle on "criticality toward uncertainty".

---

## 4. Factory dynamics — Hopp & Spearman [HS]

Notation: `ra` arrival rate, `ta=1/ra`, `ca²` arrival SCV; `te` mean effective process time,
`ce²` its SCV; `t0`/`c0²` natural (no-detractor) process time/SCV; `m` parallel machines; `re=m/te`
effective station rate; `u = ra·te/m = ra/re` utilization; `rb` bottleneck rate (highest-utilization
station); `T0` raw process time (Σ te over stations); `W0 = rb·T0` critical WIP; `A` availability;
`cd²` departure SCV. All formulas verified against the book's front-matter cheat-sheet.

### 4.1 Little's Law
`WIP = TH × CT` — holds for a station, a line, or a whole plant, for long-run averages, regardless of
distributions or discipline [HS p.238]. In the engine the three quantities are computed
*independently* (WIP by area method, TH = completed/T, CT = sample mean), so their agreement is a
genuine consistency check, not a tautology. "The F = ma of Factory Physics."

### 4.2 Bottleneck, raw process time, critical WIP [HS p.227–234]
- Station capacity `= m/te`; **bottleneck rate** `rb` = rate of the **highest-utilization** station
  (not necessarily the slowest — with yield loss the bottleneck can sit upstream).
- **Raw process time** `T0 = Σ te` (time for one lone job to cross the empty line); parallel machines
  don't reduce `T0`.
- **Critical WIP** `W0 = rb·T0` — the WIP at which a *zero-variability* line simultaneously hits max
  throughput `rb` and min cycle time `T0`. **Zero inventory is not optimal — `W0` is the ideal.**
- *Penny Fab* teaching examples: One — balanced, `rb=0.5/h`, `T0=8h`, `W0=4`; Two — unbalanced,
  `rb=0.4`, `T0=20h`, `W0=8` [HS p.232–234].

### 4.3 Best / Worst / Practical-Worst-Case performance (the characteristic curve) [HS p.240–248]
At WIP level `w`:
- **Best case:** `CT_best = T0` if `w ≤ W0` else `w/rb`; `TH_best = w/T0` if `w ≤ W0` else `rb`.
- **Worst case:** `CT_worst = w·T0`; `TH_worst = 1/T0`. (Achieved with *variability but no randomness*
  — e.g. moving the whole WIP as one giant batch. Variability ≠ randomness.)
- **Practical Worst Case (PWC)** — the maximum-*randomness* case (balanced, single-machine,
  exponential): `CT_PWC = T0 + (w−1)/rb`; `TH_PWC = w/(W0+w−1)·rb`.
- Every reference curve satisfies `TH·CT = w` identically (a Little's-Law invariant). A real line lies
  between best and worst; **above PWC = a "good/lean" line, below = "bad/fat".** To improve a bad
  line, relax a PWC assumption: **unbalance** the line, add **parallel machines**, or **reduce
  variability** below exponential.

### 4.4 Variability, effective process time, and the VUT equation [HS ch 8]
- **CV** `c = σ/μ`; **SCV** `c² = σ²/μ²`. Classes: **low** `c < 0.75`, **moderate** `0.75 ≤ c < 1.33`,
  **high** `c ≥ 1.33` [HS p.269].
- **Breakdowns (preempt-resume)** inflate both the mean and the variance of process time:
  `A = mf/(mf+mr)` (= MTTF/(MTTF+MTTR)), `te = t0/A`, and the key SCV inflation
  `ce² = c0² + (1 + cr²)·A·(1−A)·(mr/t0)` [HS p.273]. Because the outage terms grow with mean repair
  time `mr`, **rare-long failures hurt far more than frequent-short ones at equal availability** (the
  Briar Patch / Hare-vs-Tortoise demo).
- **Setups (non-preemptive):** `te = t0 + ts/Ns`; `σe² = σ0² + σs²/Ns + ((Ns−1)/Ns²)·ts²` [HS p.275].
  **Rework** is logically a non-preemptive outage. Combine: apply the preemptive (breakdown) formulas
  first, feed the result into the non-preemptive (setup/rework) formulas.
- **VUT / Kingman equation (G/G/1)** — the central queueing approximation:
  `CTq ≈ ((ca²+ce²)/2)·(u/(1−u))·te = V·U·T` [HS Eq 8.25], with `V=(ca²+ce²)/2`, `U=u/(1−u)`, `T=te`.
  The **product** structure is the lesson: high variability *and* high utilization together are
  catastrophic; either one alone is survivable. Exact for M/M/1. Parallel-machine (Sakasegawa) form:
  `CTq(G/G/m) ≈ ((ca²+ce²)/2)·(u^{√(2(m+1))−1}/(m(1−u)))·te` [HS Eq 8.29].
- **Flow factor** `= CT/T0` — dimensionless, how much of cycle time is self-inflicted waiting.

### 4.5 Variability propagation — the linking equation [HS p.279]
Departures of station `i` are the arrivals of station `i+1`, so `ca²(i+1) = cd²(i)`. Single machine:
`cd² = u²·ce² + (1−u²)·ca²` [HS Eq 8.10]. So a **busy station exports its own service variability**
(`u→1 ⇒ cd²→ce²`); a **lightly-loaded one passes arrival variability through** (`u→0 ⇒ cd²→ca²`); a
high-`u`, low-variability station acts as a **filter** that smooths flow for everyone downstream.
Multi-machine form Eq 8.11. Blocking couples stations even harder.

### 4.6 The corrupting influence of variability [HS ch 9]
- **Law (Variability):** more variability always degrades performance [HS p.309].
- **Law (Variability Buffering):** variability is buffered by some combination of **inventory,
  capacity, and time** [HS p.309]. "Pay me now or pay me later" — if you don't pay to reduce
  variability, you pay in lost throughput, idle capacity, inflated cycle time, larger inventory,
  and/or long lead times. The **pay-me-now** simulation [HS p.311–313]: only *reducing variability*
  buys high TH **and** low WIP **and** low CT at once.
- **Law (Utilization):** raising `u` with nothing else changed increases WIP and CT **nonlinearly**
  (the `1−u` denominator) [HS p.317]. **Law (Capacity):** in steady state, release rate must be
  strictly < capacity — you cannot truly run at 100% [HS p.317].
- **Corollary (Variability Placement):** in a push line (releases independent of completions),
  variability **early** in the routing inflates CT more than the same variability late — so fix the
  front of the line first [HS p.318]. (Not applicable under CONWIP/pull.)
- **Batching** [HS p.318–327]: distinguish **process batch** (between setups) from **transfer/move
  batch** (moved together) — they need not be equal (**lot-splitting**). Move-batch waiting
  (wait-to-batch, wait-in-batch) carries **no CV coefficient** — it is variability from *bad control*,
  like the worst case. **Cellular manufacturing** puts a part family's stations in close proximity so
  transfer batches shrink toward 1.
- **Pooling** [HS p.298]: shared queues and parallel machines dampen variability (bank line beats
  grocery lines); generic/late-differentiated inventory slashes safety stock.
- **Law (Assembly Operations):** an assembly (matching/fork-join) station is degraded by more
  components, more component-arrival variability, and worse coordination [HS p.328].

### 4.7 Push, pull, CONWIP [HS ch 10]
- **Definition:** a **pull** system imposes an *a-priori WIP cap*; a **push** system does not
  [HS p.358]. It's the cap — not the act of "pulling" — that delivers the benefits.
- **Push controls throughput and observes WIP; pull controls WIP and observes throughput.** WIP is
  directly observable and robust; throughput must be set against unobservable capacity — so control
  the robust variable (WIP) [HS p.369].
- **CONWIP** is the simplest cap (one line-wide limit; release a new job when one leaves). **Law
  (CONWIP Efficiency):** at equal throughput a push line carries more WIP (hence more CT) than CONWIP
  [HS p.370]. **Law (CONWIP Robustness):** the profit curve is flat across a wide band of WIP
  (~40–160% of optimal), whereas a push line's profit collapses once the release rate exceeds
  optimum — exactly the error human optimism produces [HS p.372]. **Robustness is the strongest
  argument for pull.**
- **CONWIP vs kanban:** kanban needs part-specific cards per station (only fits repetitive, steady
  mix); CONWIP needs one line-wide count + a release list, so it tolerates high variety.

---

## 5. Production layout (the course's distinctive theme) — [FPD] + [HS]

> [FPD] supplies the **physical-layout** content; [HS]/[FPM] supply the **dynamics** that let a
> student *evaluate* a layout. The two halves meet at the central message of [FPD] ch 8: a layout's
> static flow cost is necessary but not sufficient — its **dynamic** performance must be measured by
> **simulation**. That is the explicit justification for this whole app.

### 5.1 The four basic layout types — driven by variety × volume [FPD §1.6, p.17–23]
The single most important section for the "choose and justify a layout" objective.

| Layout | Variety / Volume | Idea | Strengths | Weaknesses | Examples |
|---|---|---|---|---|---|
| **Fixed-position** | very low volume, large product | product stays put; resources come to it | handles huge/heavy items; bespoke | low equipment use; hard scheduling | aircraft, ships, turbines |
| **Product (line)** | low variety, **high volume** | machines in **operation sequence**, one next to the next | low unit cost; simple flow/control; low WIP/CT | rigid; breakdown-sensitive; poor for variety | assembly lines |
| **Process (functional / job shop)** | **high variety, low volume** | machines grouped by **type** into departments | flexible; failure-robust; general-purpose kit | high handling; long/variable flow; high WIP/CT | job shops, tool rooms |
| **Cellular (group technology)** | **medium / medium** | machines grouped per **part family** into cells | cuts handling & setup; small batches; in-cell quality; flexible labour | needs stable families; cell balancing | machined-part cells |

- The **volume–variety logic** (with a cost-volume **breakeven** `Q*=F/(r−v)`) tells you which layout
  is cheapest over a volume range [FPD p.22–23]. This is the *spatial* face of the same product–
  process spectrum [HS] uses for *flow* (job shop → flow line → continuous, §5.4).
- **Hybrid** layouts are normal; **Production Flow Analysis (PFA)** discovers part families to carve
  cells out of a process layout [FPD p.105–110].
- **Service systems** have *no* standard layout types (too diverse); plan them by identifying the key
  **activities** and their interrelationships as a **bubble/relationship diagram** [FPD §1.7].

### 5.2 Systematic Layout Planning (SLP) — the design procedure [FPD ch 4, p.87–93]
Muther's SLP is the standard, structured **procedure** (not an algorithm) for arriving at a layout.
Four elements of any layout: **space planning units (SPUs)**, **affinities** (desired closeness, in
5 classes: organizational / flow / control / environmental / process), **space**, **constraints**.
Two analysis charts the app should teach:
- **From–To chart** — *quantitative* flow: a department×department matrix of material flow
  (equivalent **trips** per period) derived from **route sheets × production volumes**, in a common
  unit. (Same inputs a simulation consumes: routings + volumes.)
- **Activity Relationship (REL) chart** — *qualitative* closeness, coded **A** (absolutely
  necessary), **E** (especially important), **I** (important), **O** (ordinary), **U** (unimportant),
  **X** (undesirable) — captures non-flow reasons too (safety, noise, contamination).

SLP chain (a ready "choose & justify a layout" workflow): **route sheets + volumes → from-to chart
and/or REL chart → relationship diagram → + space → space-relationship diagram → + constraints →
alternative layouts → systematic evaluation → chosen layout.** Evaluate alternatives on flow
effectiveness, handling ease/cost, flexibility, expansion, safety, supervision, appearance
[FPD p.91]. **The evaluation step is where the simulator plugs in.**

### 5.3 Layout optimisation & material handling — conceptual [FPD ch 4–7]
- Layout-optimisation tools (FLAP, **CRAFT**, MAFLAD/QAP, graph-theoretic) almost all minimise
  **total material-handling cost ≈ Σ flow × distance × cost** — put high-interaction departments
  close together [FPD ch 4–6]. Inputs: the from-to flow matrix + a distance matrix. *Construction*
  heuristics build a layout from scratch; *improvement* heuristics (CRAFT) **swap department pairs**
  while it lowers cost (hill-climbing → local optima). The formal statement is the NP-hard
  **Quadratic Assignment Problem**. (Students need the *concept*, not the math.)
- **Material handling** binds layout to cost: the layout fixes distances, MH moves material across
  them, "the best flow is no flow." The 10 MH principles [FPD p.232–234]: Planning, Standardization,
  Work, **Ergonomic**, **Unit Load** (bigger load ⇒ lower cost/unit), Space Utilization (use the
  *cube*), System, Automation, **Environmental** (energy/impact as selection criteria),
  **Life-Cycle Cost**. Equipment trades flow volume/predictability (**conveyors** — cheap, fixed
  path, can couple/block stations) against flexibility (**trucks/AGVs** — variable path, low/variable
  volume). Equipment co-evolves with layout: product↔conveyor, process/cellular↔trucks/AGV.

### 5.4 Flow-configuration taxonomy (the dynamics view) [HS Intro p.9–11; p.228]
The product–process spectrum, from flexible/low-volume to rigid/high-volume — the [HS] counterpart to
§5.1: **job shop** (functional, jumbled flow) → **disconnected flow line** (distinct unpaced
routings, WIP buffers — the FP default) → **connected/paced (assembly) flow line** → **continuous
flow** (fixed routing, WIP physically capped). Products migrate down this diagonal over their life.

### 5.5 Dynamics arguments for a layout decision (what to teach with the sim)
- **Flow lines should generally be UNBALANCED** [HS p.250, 662]: a distinct bottleneck is easier to
  manage and gives a characteristic curve nearer the best case; capacity costs differ by station and
  comes in discrete increments. Corollary: the **cheap/small-increment** process should never be the
  bottleneck — make the **expensive/large-increment** one the bottleneck.
- **Line balancing applies only to PACED ASSEMBLY LINES**, where the conveyor is the bottleneck and
  tasks split finely among operator zones (efficiency + fairness) — *not* to lines of independent
  workstations [HS p.662–664]. (Line-of-balance task-assignment is App. 18A.)
- **Parallel machines / queue sharing** beat single big machines at equal capacity (variability
  pooling) [HS p.291] — a grouping/layout decision.
- **Cellular manufacturing / U-shaped cells** minimise material handling, shrink transfer batches
  toward 1, allow flexible worker counts, and ease CONWIP monitoring [HS p.326; ch 4].
- **Machine order matters** even with identical machines and zero randomness: bottleneck-first vs
  bottleneck-last changes batch completion time (22 h vs 28 h in [FPM p.159]) — a clean layout/
  sequence demo.
- **Decoupling tightly-coupled lines with WIP buffers** raises throughput (e.g. +30% by adding
  buffers between feeder and main lines [FPM p.185]; Eli Lilly interstage storage [FPM p.330]).
- **Line design as constrained optimisation** [HS p.660]: minimise cost subject to TH/CT/WIP targets;
  sweep the constraints to get a **cost-vs-performance curve**.

### 5.6 Evaluating a layout by simulation — the bridge [FPD ch 8]
[FPD] ch 8 is the explicit tie between *layout* and the *simulation* this app builds. Its argument:
a layout's worth depends on the **dynamic flow** through it, not a static cost, so you must measure
**throughput, bottlenecks, queues, machine utilisation, WIP, and congestion** — and flow systems are
dynamic with finitely many finite-size interacting parts. It offers three evaluation models:
analytical **open-system** queueing networks, analytical **closed-system** queueing networks (finite
buffers / closed-loop conveyors), and **discrete-event simulation** — the most general (handles
open/closed, deterministic/stochastic), at the price of complexity, output-analysis difficulty, and
the warning that **steady state is hard to reach** (the warm-up problem from §3). Worked case studies:
a **cellular-layout** DES that both compares cell layouts *and* sizes the operator count, and a
**warehouse** MH simulation. The performance measures [FPD] wants (TH, utilisation, WIP, queues,
congestion, bottlenecks) are exactly those the DES engine already produces.

### 5.7 Connecting layout ↔ flow ↔ decisions (course objective)
A layout choice sets the routing geometry, which sets utilizations, blocking/starving, and variability
propagation (§4.4–4.6), which set TH/CT/WIP and hence cost/efficiency, flexibility (robustness to mix
and to release/WIP error), and quality. **Simulation is the bridge** [FPD ch 8]: it makes the
layout's emergent dynamics measurable, so the student picks a layout type (§5.1) and arrangement
(§5.2–5.3) by the static method, then **compares alternatives dynamically by simulation** and
recommends one with evidence — the static and dynamic faces of layout quality together.

---

## 6. Decision support — efficiency, flexibility, sustainability [FPM]

The managerial lens for the course's "translate results into decision support" objective.

- **Demand–Stock–Production (DSP):** every operation = demand (a flow) + transformation (production
  flows + stocks). The manager designs the **portfolio of buffers and variability** that maximises
  profit, cash flow, and service [FPM p.45–49].
- **The three buffers — the clearest decision vocabulary in the literature** [FPM p.50–54]:
  **inventory** (parts wait), **capacity** (machines/people wait/idle), **time** (the customer waits =
  lead time/backorder). You will use buffers whether you like it or not; suppress one and another
  grows ("something or someone is always waiting"). Buffers are **not waste** when right-sized — the
  real question is *"what utilization / fill rate makes the most money?"*, not "how do I keep everyone
  busy?".
- **The two killer curves for a dashboard:** cycle-time-vs-utilization (VUT — blows up near 100%) and
  the **production-flow graph** (TH & CT vs WIP — starvation / optimal / overload zones). For stocks,
  the **inventory-$ vs fill-rate efficient frontier** (blows up near 100% fill).
- **VUT rule of thumb** [FPM p.73]: pushing utilization 70%→95% raises the U-factor 2.3→19 — a ~714%
  cycle-time increase. *Cheap/old capacity is valuable* because low utilization buys responsiveness
  cheaply.
- **Robustness over optimisation** [FPM p.160; HS p.372]: controlling WIP (pull/CONWIP) is robust;
  controlling throughput/utilization is fragile. Reacting to every fluctuation (vs control limits)
  just feeds noise back and *increases* variability.
- **Improvement sequence** [FPM p.63]: **absolute benchmarking** (compare to the best possible in the
  *current* environment, not to competitors) → change cheap **tactics** to reach it → only then change
  the expensive **environment**.
- **Efficiency / flexibility / sustainability mapping for the course:** *efficiency* = utilization /
  inventory turns / unit cost; *flexibility* = short response time + a capacity buffer + high-mix
  CONWIP; *sustainability* — a modest capacity buffer and shorter cycle time also cut scrap/quality
  loss (defects found faster), and right-sized inventory reduces waste/obsolescence. (The
  sustainability angle is mostly *inferred* — see §7.)
- **Industry scenarios usable as teaching cases** [FPM ch 9]: Michigan Steel bracket line (lot-size
  reduction: CT ~14d→~1d, fill 75%→95%, no floor changes); Moog (insert a decoupling inventory buffer:
  CT 23d→6d, OTD <50%→>95%); Eli Lilly (speeding the bottleneck without a capacity buffer gives almost
  nothing; one batch of interstage storage recovers +20%); a pharma CONWIP conversion (−$10M WIP, CT
  halved). Each is a clean buffer-tradeoff "what-if" for the simulator.

---

## 7. Known gaps & things to confirm / acquire

- **Layout is now covered** by [FPD] (added 2026-06-05): the four layout types incl. fixed-position,
  SLP, from-to & REL charts, material handling, layout evaluation by simulation. *Remaining nuance:*
  [FPD] treats **line balancing** only lightly (and [HS] argues balancing belongs to paced assembly
  lines only); if the course teaches a balancing **algorithm** (e.g. ranked positional weight), that
  specific method may want a short supplementary source.
- **Sustainability** is now *lightly* covered ([FPD] environmental MH principle, environmental
  affinities & site criteria, life-cycle cost, compact-layout footprint; plus the [FPM] scrap/
  inventory-waste angle), but no source treats it deeply. Confirm with the user what "sustainability"
  should mean in the app (energy/utilization, scrap/yield, transport distance, obsolescence) and
  whether a dedicated green-operations source is wanted.
- **Course's own notation/vocabulary** (what students are taught to call things in Danish/English) —
  worth getting so the UI matches the lectures exactly.
- **Distribution-variance validation** in the engine is only indirect; an M/D/1 queue-time oracle
  would pin the samplers directly (carried over from the prior project's backlog).

---

## 8. Formula quick-reference

| Quantity | Formula | Source |
|---|---|---|
| Little's Law | `WIP = TH × CT` | [HS p.238] |
| Utilization | `u = ra·te/m = ra/re` | [HS p.230] |
| Station capacity / eff. rate | `re = m/te` | [HS p.233] |
| Critical WIP | `W0 = rb·T0` | [HS p.232] |
| Best-case CT / TH | `T0` or `w/rb` / `w/T0` or `rb` | [HS p.240] |
| Worst-case CT / TH | `w·T0` / `1/T0` | [HS p.242] |
| PWC CT / TH | `T0+(w−1)/rb` / `w·rb/(W0+w−1)` | [HS p.244] |
| Availability | `A = MTTF/(MTTF+MTTR)` | [HS p.273] |
| Effective mean (breakdowns) | `te = t0/A` | [HS p.273] |
| Effective SCV (breakdowns) | `ce² = c0² + (1+cr²)·A(1−A)·(mr/t0)` | [HS p.273] |
| Effective mean (setups) | `te = t0 + ts/Ns` | [HS p.275] |
| VUT / Kingman (G/G/1) | `CTq ≈ ((ca²+ce²)/2)·(u/(1−u))·te` | [HS Eq 8.25] |
| Linking (departure SCV) | `cd² = u²·ce² + (1−u²)·ca²` | [HS Eq 8.10] |
| Flow factor | `CT / T0` | [HS] |
| M/M/1 number in system | `L = u/(1−u)` | [L p.76] |
| t confidence interval | `X̄ ± t_{n−1,1−α/2}·√(S²/n)` | [L Eq 4.12] |
| Replications for abs. β | smallest `i: t_{i−1,1−α/2}√(S²/i) ≤ β` | [L Eq 9.2] |
| Welch moving average | `Ȳᵢ(w)=Σ_{s=−w}^{w}Ȳ_{i+s}/(2w+1)` | [L p.515] |
| Paired-t difference CI | `Z̄ ± t_{n−1,1−α/2}·√(Var̂[Z̄])` | [L Eq 10.1] |
| CRN variance of difference | `[Var(X₁)+Var(X₂)−2Cov]/n` | [L p.589] |
| Exponential variate | `X = −β·ln U` | [L p.429] |
| Weibull variate | `X = β(−ln U)^{1/α}` | [L p.456] |
| Lognormal params (target m′,s′²) | `μ=ln(m′²/√(m′²+s′²))`, `σ²=ln(1+s′²/m′²)` | [L p.458] |
| Variance of RTD (inventory) | `V(RTD) = ℓ·σd² + d²·σℓ²` | [FPM p.96] |
