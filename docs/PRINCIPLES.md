# Principles & Committed Assumptions

> The theoretical principles and modelling assumptions this project commits to, each
> with a source citation. This file is the **bridge** between the deep reference
> (`Reference/theory-notes.md`, local-only) and the application: when a principle is
> applied or established in a task, record it here (one or two lines + source tag).
>
> Source tags: **[R]** Robinson (primary, student-facing) · **[L]** Law (behind the
> scenes) · **[HS]** Factory Physics, Hopp & Spearman (quantitative framework) ·
> **[FPM]** Factory Physics for Managers (qualitative) · **[FPD]** Garcia-Diaz & Smith,
> Facilities Planning and Design (layout). Section refs (e.g. `theory-notes §2.5`) point
> into `Reference/theory-notes.md`.

---

## Simulation as a method

- **A model is never "valid in general."** Validity is binary and purpose-specific;
  you cannot *prove* a model valid — V&V tries to prove it wrong, and surviving builds
  *confidence*. Make this a first-class message in the UI. — [R] (theory-notes §2.5)

- **Verification ≠ validation.** Verification = building the model *right* (code matches
  the conceptual model); validation = building the *right* model (represents reality well
  enough for the purpose). — [R] (theory-notes §2.5)

- **Assumptions vs simplifications are distinct and both must be logged.** An *assumption*
  fills a gap in knowledge about the real system; a *simplification* is a deliberate
  reduction for tractability. The app keeps a living, exportable log of each. — [R]
  (theory-notes §1, §2.3)

- **Build the simplest model that meets the objectives.** Accuracy has diminishing
  returns; a smaller model is faster to build, run, validate, and understand. — [R]
  (theory-notes §2.3)

- **Simulation is decision support, not optimisation.** It predicts performance for a
  given set of inputs; the student varies inputs and re-runs. — [R] (theory-notes §2.1)

- **The simulation study process is a non-linear cycle**, not a waterfall: conceptual model
  → computer model → experimentation → implementation, revisitable, with V&V running
  *throughout* rather than as a stage. — [R] (theory-notes §2.2)

- **A conceptual model has defined elements**, captured in order: objectives, experimental
  factors (inputs to vary), responses (outputs + how they show the objective is met), and
  model content (scope × level of detail). — [R] (theory-notes §2.3)

- **Data availability is graded A / B / C** (available / collectable / not available); a
  category-C input must be estimated, documented, and **flagged for sensitivity analysis**
  later. (Light input-data framing only — no distribution fitting in the methodology stage.)
  — [R] (theory-notes §2.4)

> Phase 2 encodes the above in the methodology workspace: the study-process diagram, the
> stepped conceptual-model builder, the typed assumptions/simplifications log (with the A/B/C
> tag and category-C sensitivity prompt), and the V&V framing + manual checklist.

## Output analysis & statistical honesty

- **Never present a single run as "the answer."** A single run is a sample of size one;
  default to multiple replications and report confidence (a t-confidence interval /
  half-width). Framed in Robinson's terms to students; Law makes the statistics sound
  underneath. — [R] front-of-house; [L] behind the scenes (theory-notes §3.2, §3.8)

- **Distinguish terminating vs steady-state studies**, and for steady-state handle the
  **warm-up** (initialisation bias) before estimating. — [R]; [L] (theory-notes §3.4)

- **Surface uncertainty everywhere** — report precision/half-widths, and warn that as
  utilisation → 1 the means explode and autocorrelation worsens. Sensitivity analysis is
  the practical handle on "relate critically to results, uncertainty, and limitations." —
  [R]; [L] (theory-notes §2.5, §3.8)

- **Independent replications are the unit of confidence.** Because a single run's output
  is strongly autocorrelated, we group output into approximately-IID units by re-running
  with distinct, reproducible seeds and applying the t-interval to the per-rep means — not
  to one run's internal samples. *Applied in Phase 4.1.* — [L] (theory-notes §3.2–3.3)

- **Precision improves with √N, so it gets slower to buy.** Quadrupling the replications
  roughly halves the half-width. The app reports each response's relative half-width and a
  "replications for a target precision" estimate, so the student sees the cost of certainty
  rather than guessing a rep count. *Applied in Phase 4.1.* — [L] (theory-notes §3.3, §3.5)

## Metrics & conventions

- **Time-average vs sample-average metrics are computed differently.** Time-persistent
  quantities (WIP, queue length, utilisation) use the **area method** `(1/T)∫x(t)dt`;
  per-entity quantities (delay, cycle time) use an ordinary **sample mean** over entities.
  Conflating them is the most common student error. — [L] (theory-notes §1, §3.1)

- **Fix units and definitions once and enforce them everywhere** (utilisation, cycle time
  vs lead time, throughput, WIP, SCV). — [R]/[HS] convention (theory-notes §1).

## Factory dynamics (the quantitative framework to test against)

- **Little's Law: `WIP = TH × CT`** holds at station/line/plant level for long-run
  averages; computing the three independently makes their agreement a real consistency
  check. — [HS] (theory-notes §4.1)

- **The engine simulates ground truth; closed-form formulas (VUT/Kingman, best/worst/
  practical-worst-case, linking) are overlays for comparison, never assumed by the
  engine.** The teaching payoff is seeing where simulation and theory agree and where the
  formulas stop applying (blocking, non-exponential service, breakdowns). — [HS] (theory-
  notes §4.3–4.5; Charter §7)

## Layout (the modelling domain)

- **A layout must be evaluated *dynamically* — static flow×distance cost is necessary but
  not sufficient.** Throughput, queues, WIP, utilisation, and congestion need simulation;
  this is the explicit justification for the app. — [FPD] ch 8 (theory-notes §5.6)

- **Placement sets distances; distances set transport delays; movers are limited
  resources.** Transport is non-value-adding time ("the best flow is no flow"), so layout
  affects flow. — [FPD]/[HS] (theory-notes §5; Charter §6)

> Phase 3 realises these: the floor engine (`src/floor-engine.js`) computes transport time
> from Euclidean distance ÷ speed, counts a job in transit as in-system (so layout shows up in
> cycle time and WIP), and lets students compare layouts by re-running the simulation.

- **Finite buffers and limited transport create back-pressure: a full downstream blocks the
  upstream and WIP backs up.** This is the blocking/variability-buffering dynamic — a buffer cap or
  a busy mover is felt up the line, not silently absorbed. (In the floor engine, even instant
  transport is capacity-aware so placed storage and finite buffers fill and block as they should.)
  — [HS] blocking / variability buffering (theory-notes §4.6); realised 2026-06-08.

## Batch processing (a resource behaviour)

- **Process batch vs transfer batch are distinct.** A *process batch* is the quantity run
  between setups; a *transfer (move) batch* is the quantity moved together — they need not be
  equal (lot-splitting). Phase 3.4 models the **process batch with a setup** only; transfer
  batching / lot-splitting is explicitly out of v1 scope. — [HS] ch 9 (theory-notes §4.6; Charter §6.1)

- **Setups inflate effective process time: `te = t0 + ts/Ns`.** A setup `ts` paid once per batch
  of `Ns` parts adds `ts/Ns` to the per-part effective time `te` (here `t0 = whole-batch process
  time ÷ B`, `Ns = B`). Bigger batches dilute the setup but enlarge wait-to-batch — the trade-off
  the batch-size experimental factor lets a student explore. — [HS] ch 9 (theory-notes §4.6)

- **Wait-to-batch is variability from *control*, not randomness.** The time a part waits for its
  batch to fill carries no CV coefficient — it behaves like the worst case and comes from the
  batching *policy*, not stochastic service. This is why the engine models setup as a constant and
  the strict full-batch-start rule as a deliberate (sensitivity-flagged) simplification. — [HS]
  ch 9 (theory-notes §4.6; Charter §6.1)

> Phase 3.4 realises these: a resource flagged `batch={size B, setup}` accumulates parts, starts
> only on a full batch of B, pays the setup once, processes the whole batch together (the service
> distribution is the whole-batch time), and releases all B individually downstream. The strict
> full-batch rule can jam a starved line, so the engine surfaces a deadlock (drained event list with
> WIP > 0) and the UI guards the provably-unfillable cases (CONWIP < B, finite buffer < B) rather
> than letting a model hang silently. Realised 2026-06-08.

## The process model (parts, BOMs, dependent demand)

- **Assembly is fork-join synchronisation.** An assembly operation starts a product only when **all**
  its bill-of-materials components are simultaneously on hand, consuming them; it is degraded by more
  components, more component-arrival variability, and worse coordination (Law of Assembly Operations).
  On the floor this is *spatial*: a component is on hand only once it has **travelled** to the assembly
  station, so the slowest/farthest component paces the product. — [HS] ch 9 (theory-notes §4.6)

- **Demand propagates through the BOM (dependent demand).** A product's demand explodes into demand for
  its components, level by level, netted against on-hand inventory and in-flight WIP and capped by each
  part's pull (CONWIP) limit. A part that is both a finished product and a component of another product
  must be produced to meet the dependent demand, not starved — and a scarce shared component is shared
  fairly between the products that consume it (round-robin / turn-taking), never monopolised. — [HS]
  ch 9–10 (theory-notes §4.6–4.7)

- **Each demand stream is independent.** Every demand product is driven by its **own** interarrival
  distribution; mixing products on shared workcenters is branching, and a station's load is the sum of
  the parts that visit it. — [HS] (theory-notes §4)

> Phase 3.5 realises these by porting the validated multi-part / BOM / assembly / supply-demand-control
> logic from `src/advanced-engine.js` into the transport-aware `src/floor-engine.js` (one engine), so the
> spatial floor now carries true multi-part flow with assembly synchronisation, per-product demand, and
> per-product CONWIP. Realised 2026-06-08.

## Material handling & transport (Phase 3.6)

- **Transport is non-value-adding time — "the best flow is no flow."** Movement adds cycle time and WIP
  without adding value; placement and the choice of mover therefore matter to performance. The floor
  prices every move (distance ÷ speed) so layout shows up in the results. — [HS]/[FPD] (theory-notes §5.3)

- **Conveyors vs flexible movers trade predictability for flexibility.** A **conveyor** is a fixed path
  with high, predictable volume but no flexibility and finite capacity that **blocks** when downstream is
  full; **AGVs/operators** are flexible (serve many links, carry one load, travel to pick up) but a
  scarce fleet becomes a bottleneck. **Instant** transport is the zero-time baseline (placement
  irrelevant). — [FPD]/[HS] (theory-notes §5.3); realised in `src/floor-engine.js` (Phase 3.6).

- **Flexible movers travel to pick up and return home when idle; dispatch is a single fixed rule.**
  A unit travels (empty) to the pickup, carries one load to the drop, then returns toward a standard
  (home) location — re-dispatchable en route. When several requests compete, a fixed minimal rule
  decides (longest-waiting request → nearest free eligible unit); there is **no optimising dispatcher**
  (Charter §6/§9). Anticipatory repositioning beyond returning home, path-finding and collisions are out
  of scope. — Charter §6/§9 (theory-notes §5.3)

- **Operators are one constrained resource shared between moving and machining.** An operator-required
  machine cannot run without a free operator, who **travels to the machine** and is then occupied for the
  operation; an operator does a move **or** a machine-op, never both — so transport demand and machining
  demand contend for the same people. This is the operator↔machine coupling. — Charter §6

> Phase 3.6 realises these in `src/floor-engine.js`: four leg modes (Instant zero-time · Conveyor
> straight/bent with capacity+blocking · AGV · Operator), placed flexible units with a home location +
> travel-to-pickup + return-when-idle, the longest-waiting→nearest dispatch rule, and the operator↔machine
> coupling (operator travels to the machine, then operates). Realised 2026-06-09.

- **A batch upstream of a pull-driven assembler must divide the assembly's appetite.** Under
  pull/CONWIP, the dependent-demand explosion bounds a component's in-flight quantity at roughly its
  per-parent requirement `+1` (the `need+1` pipeline bound). If a batch station sits on that component,
  the batch threshold competes with the assembler's appetite for the same scarce in-flight units: to
  *both* clear the assembler (consume `q` units) *and* re-form the next batch (`B` units) you need
  `q + B` in flight, but the bound only allows `q + 1`. So whenever `B > 1` and `B` does not divide `q`,
  the line can freeze with non-zero WIP and zero throughput. Make `B` divide `q` (ideally `B = q`, one
  batch per parent) — or relax the control to push/stream for that leg. Surfaced building `#example7`
  (furnace B=3, Motor consumes 4 Magnets → permanent stall; B=4 fixed it). — theory-notes §3/§5

- **Pooling: parallel machines on a shared queue beat forcing flow through one.** When an operation is
  served by a *group* of machines drawing from a shared queue, the group damps variability and slashes
  queueing, WIP and cycle time versus routing all the flow to a single machine — the "bank line beats
  grocery lines" effect, and the reason parallel machines are preferred to one big machine at equal
  capacity (variability pooling; robustness to a single machine's downtime). The selection rule shapes
  *how* the pool is shared: an **even probabilistic split** (1/N) ignores state, while **shortest-queue**
  is state-dependent routing that sends each part to the least-loaded member and naturally balances load
  (and favours faster members, since they stay less loaded). Both decide on members' own state only —
  not transport distance — in v1. Realised in Phase 3.7 (`tests/floor-groups.test.js` quantifies the
  pooling win). — theory-notes §4.6 (pooling, HS p.298), §5.5 (parallel machines, HS p.291); Charter §6.2

- **A flow merge superposes the feeders' arrival variability (and is a form of pooling).** When several
  upstream streams of the *same* part combine into one shared FIFO queue feeding a single downstream
  operation, the downstream sees the **superposition** of the feeders' arrival processes — its offered
  rate is the sum of the feeder rates (up to capacity) and its arrival variability is the combined
  variability of the feeders (theory-notes §4.5). Sharing one queue across the streams is pooling (§4.6).
  Crucially a flow merge requires **no synchronisation**: any single part flows straight through the
  instant it arrives and the downstream resource is free — the exact opposite of a BOM/assembly join,
  which *waits* for all components (fork-join). Same part, no wait, no priority/weighting — that "nothing
  to decide" property is what distinguishes a merge from an assembly. Realised in Phase 3.8 as the inverse
  of the §6.2 split (`tests/floor-merge.test.js`). — theory-notes §4.5 (variability propagation /
  superposition), §4.6 (pooling); Charter §6.3
