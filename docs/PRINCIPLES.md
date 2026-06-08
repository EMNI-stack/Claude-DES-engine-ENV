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
