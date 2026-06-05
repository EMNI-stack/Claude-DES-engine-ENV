# Project Charter — DES Teaching Application
### "Simulering og produktionslayout"

> **Status:** DRAFT v0.2 — incorporates stakeholder review #1. Not final until ratified.
> Mark it up freely — comments, deletions, "no", "expand this" all welcome.
> Once ratified this becomes `docs/PROJECT-CHARTER.md` in the repo and the
> anchor every Claude Code prompt traces back to.

---

## 1. Purpose & vision

Build a **web-based discrete-event simulation (DES) teaching application** that a
whole class can use simultaneously, each student working on their own factory
models. The vehicle is factory-floor simulation — including **2D placement of
resources and transport**, which the existing demo does not have — but the
**pedagogical core is teaching simulation as a method**: what it is, why and when
we use it, and how to do it *properly*.

The application unites two things the course wants joined:
- **Factory-dynamics intuition** (Factory Physics) — *why* a line behaves as it does.
- **Rigorous simulation practice** (Robinson + Law) — *how* to model, run, and
  critically interpret it.

It is not a toy that "plays factory." It is an instrument for learning the
*discipline* of simulation, with factories as the worked domain.

**Guiding principle:** built for *learning the basics well*, not for exploring
advanced extremities. When a choice arises between depth and clarity, clarity for
a learner wins.

---

## 2. Pedagogical goals (the anchor)

Every feature must trace to a course learning objective. Condensed from the
course description:

**Knowledge** — students understand physical layout & layout optimisation;
simulation and its application; the link between layout, flow, and the decision
basis; and the role of assumptions, data, and uncertainty.

**Skills** — students can choose & justify a layout; develop & apply simulation
models; experiment with, validate, and analyse results; and relate critically to
results, uncertainty, and limitations.

**Competence** — students can design & carry out simulation analyses and
translate results into decision support with regard to efficiency, flexibility,
and sustainability.

**Design rule:** if a proposed feature does not serve one of these, it is out of
scope for v1.

---

## 3. Source hierarchy (how each book is used)

| Source | Role | Used for |
|---|---|---|
| **Robinson — *Simulation: The Practice of Model Development and Use*** | **Primary spine** | The app's *scope, workflow, and vocabulary* — including **output analysis** (warm-up, replications, confidence, V&V, experimentation). This is the course book and the source students see. v1 adds **no simulation features beyond this book.** |
| **Law — *Simulation Modeling and Analysis*** | **Behind-the-scenes support** | Used by *us* (and Claude Code), not surfaced to students as a competing framework: to build the statistical logic soundly, inform implementation decisions, and serve as deeper reference/general knowledge. Robinson stays the front-of-house source even for the statistics. |
| **Factory Physics (original)** | **Hard quantitative framework** | The exact formulas (Little's Law, VUT, utilization, variability) the engine reproduces and that simulation results are **tested against**. |
| **Factory Physics for Managers** | **Qualitative intuition** | Definitions, the buffer/efficiency/flexibility framing, and **visual/explanatory** language for interpreting results. |

**The boundary that keeps scope honest:** the *simulation method* is bounded by
Robinson; the *modelling domain* includes simple layout & transport because the
course is explicitly "Simulering **og produktionslayout**" — layout is core
content, not scope creep.

---

## 4. Architecture & approach decisions (ratified with stakeholder)

1. **Client-side, no backend (Option A).** Everything runs in the browser.
   Students save/load their own model files. No accounts, no server, no shared
   database. "Everyone works at once, individually" is satisfied by each student
   running their own instance and owning their own files. Deploys as static
   hosting (GitHub Pages), scales to any class size, zero infrastructure.
   - *Consequence:* no instructor dashboard / no central submission in v1.
     Revisit only if the course needs central oversight (would require Option B,
     a real backend — a separate, much larger project).

2. **Build on the existing engine; new files & pages.** The demo's event loop,
   blocking, breakdowns, scrap, push/pull (CONWIP), BOM/routing, and its
   validated test suite are assets and stay the foundation. The new application
   is a **fresh set of files and pages** that reuse and extend that engine —
   not a rewrite, not edits to the demo in place.

3. **Methodology scaffolding is first-class.** Because the core goal is
   understanding *how to simulate properly*, the Robinson study process is built
   into the UI as the backbone — conceptual model, explicit assumptions &
   simplifications, input-data modelling, V&V, and output analysis — not bolted
   on as an afterthought.

4. **2D layout & transport kept deliberately simple** (see §6).

---

## 5. Methodology scaffolding (arguably the real product)

The app should make the *process* visible and unavoidable, following Robinson's
study process and Law's statistical rigour:

- **Conceptual model first.** A structured, non-software step where the student
  states objectives, experimental factors (inputs), responses (outputs), model
  content (scope × level of detail), and **assumptions vs simplifications**
  (Robinson's distinction: assumptions fill knowledge gaps; simplifications
  reduce for tractability).
- **Assumptions & simplifications log.** A living, exportable record attached to
  every model — directly serving the "document assumptions, data, uncertainty"
  objective.
- **Input-data modelling.** Data availability categories (A/B/C), distribution
  choice, and *surfacing input-model uncertainty* (e.g. "no data → triangular,
  and here's why that's risky").
- **Verification & validation.** Framed as Robinson frames it: you can never
  prove a model valid; V&V builds *confidence*. Make "the model is never valid
  in general" a first-class message.
- **Output analysis (the rigour layer).** Never present a single run as "the
  answer." Warm-up handling, multiple replications, confidence intervals /
  half-widths, terminating vs steady-state — taught and framed in **Robinson's**
  terms (the course book). Law informs the underlying implementation behind the
  scenes but is not surfaced as a separate framework to students.

This is where the analysis/visualisation work already prototyped feeds in.

---

## 6. The new capability — 2D layout & transport (kept simple)

The genuinely new, higher-risk capability. **v1 minimal definition:**

- A **2D canvas** where students **drag and place** resources (machines /
  workcenters) and **storage positions** (buffers).
- **Transport between placed elements** via two simple mover types:
  - **Conveyor** — fixed path between two points; throughput/speed-limited.
  - **People/worker** — moves loads point-to-point; a constrained resource with
    a count and a speed.
- **Travel time derives from 2D distance** between placed elements (× a speed),
  so placement *matters* to performance — closing the loop between layout and
  flow that the course is about.
- Transport is modelled as a **resource that can starve, queue, and delay** —
  i.e. movement is non-value-adding time, the "best flow is no flow" idea.

**Explicitly NOT in v1:** routing/path-finding around obstacles, AGV fleets with
dispatching logic, collision, multi-floor, optimisation/auto-layout. Keep it to
"placement sets distances; distances set transport delays; movers are limited."

This connects to the layout theory (from-to logic, material handling, evaluate
layout *dynamically by simulation*) without becoming a facilities-planning tool.

---

## 7. Factory Physics overlay (intuition meets output)

After a model runs, the app should let students **compare simulation results to
Factory Physics theory**:
- Overlay theoretical references (best/worst/practical-worst-case curves, VUT
  prediction, Little's Law consistency) on simulated output.
- Qualitative interpretation in the Managers' vocabulary (buffers, the
  efficiency/flexibility/sustainability lens).
- The teaching payoff: see *where simulation and closed-form theory agree, and
  where the simulation is needed because the formulas stop applying* (blocking,
  non-exponential service, breakdowns) — which is the whole reason DES exists.

---

## 8. Aesthetic & UX direction

**"McKinsey meets engineering"** — modern, smooth, restrained, seriously
professional. The current demo aesthetic is the *wrong* direction: too bright,
too playful, too "cyber" (neon accents, glowing grids). **Retire that look.**

- **Restrained and confident**, not flashy. Think top-tier consulting deck and
  precision-engineering documentation — calm, authoritative, data-forward.
- **Muted, sophisticated palette** — neutral/ink base, sparing and purposeful
  accent colour used to carry meaning, never decoration. No neon, no glow, no
  cyber grid.
- **Editorial typography and generous structure** — clear hierarchy, white space,
  legibility over ornament.
- Visualisations are the centre of gravity: the floor, the flow, the charts, and
  the theory overlays should be precise, quiet, and *legible at a glance*.
- The methodology steps should feel like a guided professional workflow, not a
  form to fill in.

---

## 9. Non-goals for v1 (to protect scope)

- No backend, accounts, or central data.
- No simulation features beyond Robinson (no optimisation engines, no advanced
  variance-reduction beyond CRN/replications, no metamodelling).
- No advanced transport (pathfinding, AGV dispatch, collisions).
- No multi-user *collaboration* on a single model (each model is one student's).
- **No advanced extremities.** The app teaches the basics *well*; it does not
  chase edge-case fidelity, exotic scenarios, or "complete" generality. Every
  feature is justified by whether it helps a learner grasp a fundamental.

---

## 10. Phased roadmap (each phase → its own Claude Code prompt set)

- **Phase 0 — Charter & documentation system.** Ratify this charter; stand up the
  living project-documentation files (§12).
- **Phase 1 — App shell & aesthetic foundation.** New pages/files; the
  McKinsey-meets-engineering design system; navigation; reuse the engine.
- **Phase 2 — Methodology scaffolding.** Conceptual-model builder, assumptions
  log, V&V framing — the Robinson backbone.
- **Phase 3 — 2D layout & transport engine.** Drag-place canvas + conveyor/people
  movers + distance-based transport, with validation tests.
- **Phase 4 — Output analysis & rigour.** Warm-up, replications, confidence
  intervals; integrate the analysis/visualisation work.
- **Phase 5 — Factory Physics overlays.** Theory-vs-results comparison; the
  intuition layer.

(Ordering is a proposal — Phase 2 vs 3 could swap depending on where you want
early momentum.)

---

## 11. Open questions / risks

- **2D/transport is the main engineering risk** — confirm the v1 minimal
  definition in §6 is the right floor.
- **Distribution/units conventions** must be fixed once and enforced everywhere
  (the theory-notes already start this).
- **Sustainability** is the thinnest-covered objective in the source material —
  decide what it concretely means in the app (energy/utilisation? scrap/yield?
  transport distance? obsolescence?).

> **Resolved in review #1:** the methodology scaffolding favours **guided rails
> over open sandbox** — the priority is learning the basics correctly, so the app
> leads students through the proper process rather than leaving it optional.

---

## 12. Documentation & process commitment

Everything we do is documented *in the repo*, maintained by Claude Code as part
of the work (not after it):
- `docs/PROJECT-CHARTER.md` — this document (the vision/scope/decisions anchor).
- `docs/DECISIONS.md` — append-only decision log: each entry = date, decision,
  rationale, alternatives considered, governing principle/source.
- `docs/PRINCIPLES.md` — the theoretical principles & assumptions we commit to,
  with book citations (bridges to `Reference/theory-notes.md`).
- `docs/JOURNAL.md` — chronological work log: what was built, doubts raised,
  open todos, what source informed what.

Claude Code updates these as a required step of every task.
