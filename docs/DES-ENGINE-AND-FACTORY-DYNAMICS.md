# DES Engines & Factory Dynamics — Technical Reference

> The deep-dive companion to `docs/BUILD-PLAYBOOK.md`. Covers (A) how a discrete-event
> simulation engine works and how `src/engine.js` / `src/advanced-engine.js` implement it
> concretely, (B) the factory-dynamics theory and how the code realizes and *validates* it,
> (C) why the implementation is valid and where the approximations live, and (D) how to design
> a future app whose goal is teaching **simulation modeling of factory dynamics**, not just
> showing finished models.
>
> Theory is paraphrased from `Reference/theory-notes.md` (the user's distillation of
> *Factory Physics for Managers* + the classic *Factory Physics*) and standard DES texts.
> Code references are `file:line` against the committed source.
> For a faster skim — a concept↔code map, short annotated walkthroughs, and a step-by-step on how
> kanban/CONWIP stock works in the code — see **`docs/ENGINE-CODE-TOUR.md`**.

---

## Part A — How a discrete-event simulation engine works

### A.1 The core idea: state changes only at events

A DES models a system as a set of **state variables** that change only at discrete instants
(**events**). Between events nothing happens, so the simulation doesn't tick through time in
fixed steps — it **jumps from one event to the next** (*next-event time advance*). This is the
single most important concept and the thing a beginner most often gets wrong (they write a
`for t in 0..T` loop). The engine here is pure next-event.

Five ingredients, all present in `Sim`:

1. **Simulation clock** — `this.now` (`engine.js:6`). Advances *to* the time of the next event,
   never by a fixed increment.
2. **Future Event List (FEL)** — a time-ordered set of scheduled events, `this.fel`, kept as a
   **binary min-heap** keyed on `(time, seq)` (`engine.js:93–111`). `schedule(dt, ev)` inserts
   an event `dt` into the future (`engine.js:112`); `pop()` removes the earliest.
3. **System state** — stations, machines (`busy`/`down`/`blocked`/`remaining`), queues, buffer
   capacities, finished-goods level, counters (`engine.js:41–49`).
4. **Event routines** — one handler per event type, each of which mutates state and **schedules
   further events**. This "events beget events" structure is what keeps the simulation running.
5. **Statistical accumulators** — running integrals/counters that become the output metrics.

### A.2 The event loop

`step()` (`engine.js:232–281`) is the heartbeat:

```
ev = pop earliest event
accumulate(ev.time)      // integrate time-persistent stats over [lastT, ev.time]
now = ev.time            // advance the clock TO the event
dispatch on ev.t         // ARR | DEP | FAIL | REP | DEM
```

Note the order: **accumulate first, then advance the clock.** Stats are integrated over the
interval that just elapsed (during which state was constant), *before* the event changes state.
That ordering is what makes the time-average correct (§A.5).

Event types in the simple engine:
- **ARR** arrival — a part enters; schedule the next arrival; try to admit it (`engine.js:239–247`).
- **DEP** departure — a machine finishes a service; scrap-test, then advance the part downstream
  or block (`engine.js:248–255`).
- **FAIL / REP** — machine breakdown / repair (`engine.js:256–260, 269–279`).
- **DEM** — a customer demand signal arrives against finished goods (`engine.js:261–268`).

Each handler re-schedules its own stream (e.g. ARR schedules the next ARR at `engine.js:240`),
which is the standard way a renewal arrival/demand process is generated.

### A.3 Event scheduling, randomness, and reproducibility

Service, interarrival, time-to-failure, and time-to-repair durations are **random variates**
sampled from configurable distributions (`src/distributions.js`: exp, normal, uniform,
triangular, weibull, lognormal). A service start samples `w` and schedules the matching DEP at
`now + w` (`engine.js:152–157`).

The RNG is **seeded** (`mulberry32(seed)`, `engine.js:5`), so a `(config, seed)` pair is fully
reproducible. This is not a detail — it is what makes (a) tests deterministic, (b) **replications**
possible (re-run with `seed+1, seed+2, …`), and (c) **common random numbers** available as a
variance-reduction technique when comparing scenarios. The harness uses exactly this:
`analysis/run_sim.mjs` runs N replications over `seed+i`.

### A.4 Stale-event invalidation (event cancellation done right)

When a machine breaks down mid-service, its already-scheduled DEP must be cancelled. Removing an
arbitrary entry from a heap is awkward, so the engine uses **versioning**: each machine carries a
monotonic `depSeq`; the DEP event records the `seq2` it was scheduled under; on FAIL the engine
bumps `depSeq` (`engine.js:258`), and when the stale DEP is later popped it is recognized and
discarded (`engine.js:249`, `if (ev.seq2 !== m.depSeq) return true;`). Same pattern for FAIL
events via `failSeq`. This "logical cancellation by version stamp" is a standard, efficient DES
technique and the engine applies it correctly in both the simple and advanced cores
(`advanced-engine.js:454, 476`).

### A.5 Time-persistent statistics (the area method)

Metrics like average WIP, utilization, and average queue length are **time-averages** of a
piecewise-constant function: `(1/T)·∫ x(t) dt`. Because state is constant between events, the
integral is a sum of rectangles. `accumulate(t)` (`engine.js:217–228`) does exactly this: for the
elapsed `dt = t − lastT` it adds `value·dt` to each accumulator (`aBusy`, `aDown`, `aBlk`, `aQ`,
`areaWIP`, `aFG`). Final metrics divide by `T`:
- utilization = `aBusy / (m·T)`, average queue = `aQ / T`, average WIP = `areaWIP / T`.

This is the correct estimator for time-persistent quantities and is distinct from a
**sample-average** like mean cycle time, which is `sumCycle / completed` (`engine.js:198`) — an
average over *departures*, not over time. The codebase keeps the two kinds separate, which is
exactly right and is a point students routinely conflate.

### A.6 The advanced engine: jobs, routings, BOMs, synchronization

`AdvancedSim` (`advanced-engine.js`) generalizes the line to a **job-shop / assembly network**:
- **Workcenters** (`resources`) with parallel `slots`, an optional finite FIFO `queue`, preempt-
  resume breakdowns, and downstream blocking (`advanced-engine.js:69–81`).
- **Jobs** flow through a part's **routing** (ordered operations); each operation is a COMPLETE
  event (`advanced-engine.js:176–182`). `enterStep`/`tryLeave` move a job along its routing
  (`advanced-engine.js:164–200`).
- **Assembly synchronization** — the defining feature of a BOM network: an assembly job starts
  only when **all** its BOM components are simultaneously on hand (`canAssemble`,
  `advanced-engine.js:263–266`), consuming them from inventory (`advanced-engine.js:362–365`).
  This is a fork-join / matching constraint and is where most real factory complexity lives.
- **`settle()`** (`advanced-engine.js:204–221`) is a fixpoint: after any state change it pulls
  queued jobs into freed slots and retries blocked transfers until nothing moves, with a guard
  against infinite loops. This is how cascading unblock/admit ripples are resolved within a single
  event instant — a clean way to handle simultaneous state changes.
- **Multi-level pull** (`computePullNeeds`, `advanced-engine.js:301–323`) is an MRP-style BOM
  explosion: external + dependent demand netted against on-hand inventory and in-flight WIP, then
  CONWIP-capped, computed in BOM-topological order (`buildPullOrder`, `:280–293`). Round-robin
  pointers (`rrPtr`, `rrFeed`, `extTurn`) fairly allocate a scarce shared component among the
  products that want it.

Both engines share the same architecture (heap FEL, version-stamped cancellation, area-method
stats, seeded RNG); the advanced one adds the matching/synchronization and inventory layers.

---

## Part B — Factory-dynamics theory and how the code realizes it

Each principle below: the idea, the formula, **where it lives in the code**, and **how it is
validated**. Notation: `ra` arrival rate, `te` mean effective process time, `m` machines, `u`
utilization, `rb` bottleneck rate, `T0` raw process time, `W0` critical WIP, `SCV (c²)` squared
coefficient of variation.

### B.1 Little's Law — `WIP = TH × CT`
A conservation identity that holds for the whole line, a station, or a single queue, regardless
of distributions or discipline. **Code:** the three quantities are computed *independently* — WIP
by the area method (`areaWIP/T`), TH by `completed/T`, CT by `sumCycle/completed` — so their
agreement is a genuine check, not a tautology. **Validation:** `tests/engine.test.js` and
`analysis/.../littles_law` assert `avgWIP ≈ TH·CT` within a few percent (a small bias is expected
from parts still in system and from scrap, which counts toward WIP but not toward completed cycle
times). The JS dashboard surfaces this as the Overview gauge.

### B.2 Bottleneck, raw process time, critical WIP
`station capacity = m/te`; `rb = min capacity over stations`; `T0 = Σ te`; `W0 = rb·T0`. The
bottleneck is the highest-**utilization** station — with scrap it can sit upstream of the slowest
machine, because upstream stations carry load for parts that later fall out. **Code:** utilization
per resource is measured (`aBusy/(m·T)`); `metrics.bottleneck` picks the max. `T0`, `rb`, `W0` are
computed from config means in the CONWIP sweep (`run_sim.mjs:297–330`) and shown in the sweep view.

### B.3 Utilization and cycle-time blow-up
`u = ra·te/m`; queue time scales like `u/(1−u)` (single machine) and diverges as `u → 1`; `u ≥ 1`
is unstable. **Code/validation:** the M/M/c tests assert measured utilization and throughput match
Erlang-C theory within 2%. The dashboard's **VUT view** plots each station at
`(u, Wq/te)` against the reference curve `u/(1−u)`, making the blow-up visible
(`metrics.congestionByResource`).

### B.4 Variability — SCV and the VUT equation
`c = σ/μ`, `SCV = c²` (exponential = 1, constant = 0). Kingman's approximation for mean queue
time is a **product**, `CTq ≈ V·U·te = ((ca²+ce²)/2)·(u/(1−u))·te`. The product structure is the
lesson: high variability **and** high utilization together are catastrophic, and they trade off.
The dimensionless ratio `CT/T0` (**flow factor**) measures how much of cycle time is self-inflicted
waiting. **Code:** `distributions.distScv` gives each distribution's analytic SCV; the engine
generates the *actual* queue time, and the analysis compares the measured `Wq = Lq/λ` (Little's
Law at the buffer) to the M/M/1 reference, reporting an "implied V". The flow factor and its
value-added/waiting split are in `metrics.flowFactor`. **Key validity point:** the engine does not
assume the VUT formula — it produces ground truth by simulation, and the formula is an *overlay*
for comparison. That separation is what makes the tool honest (see §C).

### B.5 Effective process time — breakdowns, setups, scrap
Downtime inflates both the mean and the **variance** of process time: availability
`A = MTBF/(MTBF+MTTR)`, `te = t0/A`, and crucially `ce²` rises with `(1+cr²)·A(1−A)·mr/t0` — so
rare-long repairs hurt far more than frequent-short ones at equal `A`. **Code:** breakdowns are
**preempt-resume** — on FAIL the remaining work is saved (`m.remaining = depTime − now`) and the
pending DEP cancelled; on REP the remainder is rescheduled (`engine.js:256–279`). This propagates
variability the way theory predicts (a long outage injects a long gap), unlike a naive rate
de-rating. **Validation:** the availability test asserts `A ≈ TTF/(TTF+TTR)` within 3%; the scrap
test asserts yield `≈ 1−p` within 2%. Scrap also inflates upstream load (every station upstream of
fallout processes `1/y`), which per-resource `processed` counts expose.

### B.6 Best / worst / practical-worst-case characteristic curves
Performance bounds at WIP level `w`: best `TH=min(w/T0, rb), CT=max(T0, w/rb)`; worst
`TH=1/T0, CT=w·T0`; PWC `TH=w/(W0+w−1)·rb, CT=T0+(w−1)/rb`. A real line lies between best and
worst; above PWC is a "good" (low-variability) line. A flow needs `w=W0>0` to reach full
throughput — **zero inventory is not optimal, critical WIP is**. **Code:** `characteristic.js`
computes all three curves; the harness sweeps a single-product CONWIP line across WIP caps
(`run_sim.mjs:297–330`) and the dashboard overlays measured points on the envelope.
**Validation:** every reference curve satisfies `TH·CT = w` identically (a Little's-Law invariant
tested in `analysis-characteristic.test.js`), and any simulated point must fall between best and
worst — a property test needing no closed form.

### B.7 Push vs pull (CONWIP / kanban)
A pull system **controls WIP and measures throughput**; push sets a release rate and lets WIP
float. Pull wins on **robustness**: CT is hypersensitive to release-rate error near high `u`
(diverges), but responds gently to WIP-cap error (20% extra WIP ⇒ ~20% more CT). **Code:** the
simple engine implements kanban base-stock authorization (`authorized`, `cascade`,
`engine.js:130–150`) and CONWIP via the demand stream; the advanced engine implements multi-level
CONWIP with dependent-demand explosion (§A.6). **Validation:** `tests/...` assert total inventory
never exceeds the sum of kanban targets, demand conservation (`demanded = fulfilled + stockouts`),
and Little's Law holding in pull mode.

### B.8 Variability propagation down a line
A station's departures are the next station's arrivals, so variability flows downstream:
`cd² ≈ u²·ce² + (1−u²)·ca²` (the linking equation; `cd²` becomes the next `ca²`). A busy station
exports its *service* variability; a lightly loaded one passes arrival variability through; a
high-`u`, **low-variability** station acts as a filter that smooths flow for everyone downstream.
Blocking couples stations even harder. **Code:** this is what the engine *actually simulates* —
blocking (`advance`/`tryLeave`), starving, and the FEL make propagation emergent. The analysis
computes the predicted `cd²` chain (`metrics.variabilityPropagation`) using measured utilizations
and config service SCVs, seeding the entry from the external arrival SCV (`config.arrivalScv`) or
the saturated source. **Validation:** `analysis-propagation`/`test_propagation` check the known
invariants — M/M/1 departures stay Poisson (`cd²=1`), a saturated constant server emits regularly
(`cd²→0`), departures feed the next arrivals, and a low-variability line dampens bursts.

---

## Part C — Why it's valid, and where the approximations live

**What "valid" rests on (all tested):**
- **Event integrity** — no lost or duplicated events; stale events correctly discarded
  (version stamps, §A.4). The conservation tests (`entered = completed + scrapped + WIP + rejected`)
  are the strongest end-to-end check that nothing leaks.
- **Correct estimators** — time-persistent quantities via the area method (§A.5); sample averages
  kept separate. Little's-Law agreement across three independently-computed quantities is a
  cross-check that the estimators are mutually consistent.
- **Analytic oracles** — M/M/c utilization & throughput vs Erlang-C (±2%); breakdown availability
  vs `TTF/(TTF+TTR)` (±3%); scrap yield vs `1−p` (±2%). These pin the engine to closed-form truth
  in the corners where closed form exists.
- **Reproducibility** — seeded RNG makes every result re-derivable and every test deterministic.
- **Cross-implementation parity** — the JS analysis port is asserted equal to the Python reference
  on fixtures, so the two dashboards can't silently diverge.

**Where the approximations are — and why they don't undermine validity:**
- The **VUT** and **linking** equations are *approximations*; the engine never uses them. They
  appear only as **overlays/benchmarks** in the analysis, compared against simulated ground truth.
  So an imperfect formula can't corrupt the simulation — at worst the overlay sits a little off the
  points, which is itself instructive.
- **Welch warm-up** detection is a heuristic (moving-average flattening within a tolerance), with a
  `converged=false` flag when no plateau is reached (near-saturation/non-stationary). It is
  honest about its own failure.
- **Single-replication CIs** are degenerate; the tool switches to **batch means** for one long run
  and to **t-intervals across i.i.d. replications** for the harness data.
- The **characteristic-curve bounds** are exact; only the *placement* of simulated points relative
  to them is subject to sampling error, shown with confidence-interval bars.

**Known limitations to be honest about:** distribution samplers' *variance* is only indirectly
validated (an M/D/1 queue-time test would pin it directly — still a backlog item); the warm-up
estimator can over/under-truncate on unusual curves; interdeparture CV is *predicted*, not yet
*measured*, in the engine (would need DEP timestamping). None of these affect the core dynamics;
they bound how far the quantitative claims should be pushed.

---

## Part D — Designing a future app to teach *simulation modeling* of factory dynamics

The current tool teaches factory **dynamics**: students operate finished models and observe
emergent behavior. An app whose goal is teaching **simulation modeling itself** has a different
north star — the student should end up able to *build and trust* a model. That changes what must
be visible and what must be authored.

### D.1 Make the engine's machinery the subject, not the plumbing
The hardest concepts for beginners are exactly the ones the current engine hides:
- **Show the FEL live.** Render the event calendar as a list (next event, its time, its type),
  let the student **single-step** event by event, and highlight each state change. Watching the
  clock *jump* to the next event — not tick — is how next-event time advance finally clicks.
- **Make events first-class and inspectable.** An event log (the engine already keeps `logbuf`)
  shown as a timeline, with the ability to click an event and see what it scheduled. Teach
  "events beget events".
- **Expose the estimator construction.** Animate the area method: as the clock advances, show the
  rectangle being added to `∫WIP dt`. Contrast a time-average (WIP, utilization) with a
  sample-average (cycle time) side by side, since conflating them is the most common student error.
- **Surface stale-event cancellation** when a breakdown preempts a job — show the pending
  departure being struck out. It demystifies a real implementation technique.

### D.2 A scaffolded modeling ladder (one new modeling concept per rung)
1. **Single M/M/1 queue** — arrivals, one server, a queue. Introduce the FEL, ARR/DEP events,
   utilization, and Little's Law. Validate against Erlang-C.
2. **Tandem line** — departures feed the next station; introduce routing and WIP.
3. **Finite buffers / blocking** — introduce the block-after-service rule and starving.
4. **Breakdowns** — preempt-resume; introduce effective process time and *variability inflation*
   (the rare-long vs frequent-short demo at equal availability).
5. **Scrap / yield** — probabilistic fallout; introduce load inflation `1/y` and bottleneck shift.
6. **Assembly / BOM** — synchronization (all components on hand); introduce matching constraints.
7. **Push vs pull / CONWIP** — introduce WIP control and the robustness argument.
Each rung is a small, self-contained model the student assembles; the previous rung's validated
behavior carries forward.

### D.3 Let students *author* model logic — safely
Pure observation doesn't teach modeling. Options, increasing in power:
- **Parameter authoring** (already supported): distributions, capacities, buffers, routings.
- **Guided event logic**: a constrained editor where the student writes the body of an event
  handler ("on DEP: if downstream full → block, else advance") against a fixed engine API, with
  the FEL and state visible. A small, sandboxed DSL or a block-based editor avoids free-form code
  hazards while teaching the event-scheduling worldview.
- **Build-the-estimator exercises**: ask the student to implement the WIP integral or the warm-up
  cutoff, then check it against the reference implementation (parity testing as pedagogy).

### D.4 Teach verification & validation as a first-class topic
V&V is the professional skill most often skipped in courses. The app should make it routine:
- **Built-in oracles per rung** — a one-click "check against theory" (Little's Law consistency,
  Erlang-C, availability, the best/worst envelope) with pass/fail and the residual. Students learn
  that a model you haven't validated is just an opinion.
- **A "break the model" mode** — deliberately mis-handle blocking or forget to cancel a preempted
  event, and show the conservation check failing. Learning to *detect* a broken model is the point.

### D.5 Teach experiment design (output analysis) explicitly
The analysis layer already has the machinery; a teaching app should foreground the *decisions*:
- **Warm-up determination** — Welch's method interactively (the slider already exists); let the
  student choose the cutoff and see the effect on the steady-state estimate.
- **How many replications?** — show CI half-width shrinking as replications are added; let the
  student pick a precision target and discover the count.
- **Common random numbers** — the seeded RNG already enables CRN. Make it a lesson: compare two
  scenarios on the *same* seeds vs independent seeds and watch the variance of the *difference*
  collapse. This is a memorable, hands-on variance-reduction demo few courses manage to give.
- **Terminating vs steady-state** studies — frame which questions need which.

### D.6 Misconception-busters (high pedagogical ROI)
Build explicit "guess first, then reveal" interactions for the results people get wrong:
the **WIP-vs-CT curve** (most can't draw it), **utilization blow-up** near `u=1`, **"zero
inventory is optimal"** (vs critical WIP), and **batching/bullwhip** variance inflation. Each is a
30-second interaction that overturns an intuition — the most efficient teaching the tool can do.

### D.7 Architecture recommendations (carry forward what worked)
- **Stay client-side, buildless, static** (see the playbook). Zero install for students.
- **Deterministic seeded RNG** is non-negotiable here: it powers reproducible grading, CRN
  lessons, and parity-tested checks.
- **A documented model-spec data contract** (like `des-analysis/v1`) students can save, share, and
  hand in — and that an auto-grader can consume.
- **Event-log export** for inspection and for "explain what happened at t=…" exercises.
- **The same parity-tested analysis core** so the numbers students see are the numbers theory
  predicts, verifiably.
- **Headless-screenshot tests per view** from day one (a regression in a teaching tool shown to a
  class is especially costly).

### D.8 What would make the *modeling-teaching* version markedly better
- The classic **Hopp & Spearman *Factory Physics*** variability/dynamics chapters, to state and
  cite every formula precisely (the current `Reference/` has the managerial book, not these).
- **Law, *Simulation Modeling and Analysis*** (full) and **Robinson** for the output-analysis and
  V&V pedagogy; **Banks/Carson** for event-list and worldview framing.
- A short **list of the specific misconceptions and learning objectives** the course targets, so
  the misconception-busters (D.6) and the ladder (D.2) map onto the syllabus.
- Optionally, a **small event-scheduling DSL spec** so D.3's guided authoring has a precise,
  teachable surface rather than ad-hoc hooks.

---

### One-line summary
The engines are honest next-event simulators (heap FEL, version-stamped event cancellation,
area-method time-averages, seeded reproducibility) whose emergent output is validated against
closed-form oracles; the analysis layer overlays factory-physics theory without ever assuming it.
To teach *modeling* rather than *dynamics*, expose the machinery (FEL, events, estimators), let
students author logic up a scaffolded ladder, and make verification/validation and experiment
design first-class.
