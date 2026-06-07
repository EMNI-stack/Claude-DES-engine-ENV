# Decision Log

> **Append-only** record of project decisions. Newest entries at the bottom; never
> edit or delete a past entry — if a decision is reversed, add a *new* entry that
> supersedes it and say so. Each entry states the decision, why, what else was
> considered, and the governing principle or source.
>
> Anchored by `docs/PROJECT-CHARTER.md` (scope) and `docs/PRINCIPLES.md` (theory).
> Maintained as part of every task, not after it.

Entry format:

```
## [YYYY-MM-DD] — <decision title>
- Decision: ...
- Rationale: ...
- Alternatives considered: ...
- Governing principle / source: ...
```

---

## [2026-06-05] — Client-side, no backend (Option A)
- Decision: The whole application runs in the browser. Students save/load their own
  model files; no accounts, no server, no shared database in v1. Deploys as static
  hosting (GitHub Pages).
- Rationale: "A whole class works at once, individually" is satisfied by each student
  running their own instance and owning their own files. Zero infrastructure, scales to
  any class size, no operational burden on the lecturer.
- Alternatives considered: Option B — a real backend with accounts, central submission,
  and an instructor dashboard. Rejected for v1 as a separate, much larger project;
  revisit only if the course later needs central oversight.
- Governing principle / source: Charter §4.1, §9. Consequence: no instructor dashboard /
  central submission in v1.

## [2026-06-05] — Build on the existing engine, as entirely new files & pages
- Decision: Keep the demo's validated engine (event loop, blocking, breakdowns, scrap,
  push/pull CONWIP, BOM/routing, test suite) as the foundation, but build the new
  application as a **fresh set of files and pages** that reuse and extend it. Not a
  rewrite; not edits to the demo in place.
- Rationale: The engine and its tests are proven assets — discarding them wastes
  validated work, while editing the demo in place would entangle the new app with the
  old aesthetic and scope. New files give a clean slate without losing the foundation.
- Alternatives considered: (a) full rewrite from scratch — wasteful, re-introduces
  validation risk; (b) edit the existing demo pages in place — couples new work to the
  retired look and risks regressions.
- Governing principle / source: Charter §4.2.

## [2026-06-05] — Methodology scaffolding is first-class
- Decision: The Robinson study process (conceptual model → assumptions & simplifications
  → input-data modelling → V&V → output analysis) is built into the UI as the backbone,
  not bolted on. The app makes the *process* visible and unavoidable.
- Rationale: The pedagogical core is teaching simulation *as a method* ("how to simulate
  properly"), not playing factory. The methodology is arguably the real product.
- Alternatives considered: Treating methodology as optional help text / an afterthought
  around a free modelling tool — rejected as it would let students skip the very
  discipline the course exists to teach.
- Governing principle / source: Charter §3, §5; `Reference/theory-notes.md` §2 (Robinson
  study process), §2.3 (conceptual modelling), §2.5 (V&V).

## [2026-06-05] — 2D layout & transport kept deliberately simple
- Decision: v1 has a 2D drag-place canvas for resources and storage; transport via two
  mover types (conveyor = fixed throughput-limited path; people/worker = constrained
  point-to-point resource with a count and speed). **Travel time derives from 2D
  distance × speed**, so placement affects performance, and transport is a resource that
  can starve, queue, and delay. Explicitly excluded: pathfinding/obstacle routing, AGV
  fleets/dispatch, collisions, multi-floor, optimisation/auto-layout.
- Rationale: Closes the layout↔flow loop the course is about ("placement sets distances;
  distances set transport delays; movers are limited") without becoming a
  facilities-planning tool. 2D/transport is the main engineering risk, so keep the floor
  minimal.
- Alternatives considered: A full facilities-planning/material-handling tool with
  pathfinding and AGV logic — out of scope, high risk, and beyond "learn the basics well."
- Governing principle / source: Charter §6, §9; `Reference/theory-notes.md` §5
  (layout types, from-to logic, evaluate layout dynamically by simulation — FPD ch 8).

## [2026-06-05] — Source roles (who informs what; what students see)
- Decision: **Robinson** = primary spine and the *only* simulation-method source surfaced
  to students (including output analysis: warm-up, replications, confidence, V&V,
  experimentation); v1 adds no simulation features beyond this book. **Law** = behind-the-
  scenes support for us/Claude Code only, never surfaced as a competing framework.
  **Factory Physics (original)** = the hard quantitative framework whose formulas
  (Little's Law, VUT, utilization, variability) results are tested against. **Factory
  Physics for Managers** = qualitative intuition, definitions, and explanatory language.
- Rationale: Robinson is the course book; a single front-of-house framework keeps the
  pedagogy coherent and avoids confusing students with competing notations. Law still
  makes the statistics sound underneath.
- Alternatives considered: Surfacing Law's output-analysis machinery directly to students
  — rejected as it would compete with Robinson's vocabulary and exceed the course book.
- Governing principle / source: Charter §3; `Reference/theory-notes.md` source key + §3.

## [2026-06-05] — Aesthetic: retire the demo look; "McKinsey-meets-engineering"
- Decision: Retire the bright/playful/"cyber" demo aesthetic (neon accents, glowing
  grids). Target a restrained, confident, professional look: muted neutral/ink palette
  with sparing purposeful accent colour, editorial typography, generous structure, and
  precise quiet visualisations.
- Rationale: The app is a serious instrument for learning a discipline; the visual
  language should read as top-tier consulting + precision-engineering documentation, not
  a game. Legibility over ornament.
- Alternatives considered: Keeping/refreshing the existing playful aesthetic — rejected as
  the wrong register for the product's purpose.
- Governing principle / source: Charter §8.

## [2026-06-05] — Guided rails over open sandbox
- Decision: The methodology scaffolding leads students through the proper process rather
  than leaving it optional. Teach the basics well rather than expose advanced extremities.
- Rationale: The priority is learning the basics correctly; an open sandbox lets learners
  skip the discipline the course is meant to instil. When depth and clarity conflict,
  clarity for a learner wins.
- Alternatives considered: An open, unconstrained sandbox with optional guidance —
  rejected (resolved in stakeholder review #1).
- Governing principle / source: Charter §1 (guiding principle), §11 (review #1 resolution),
  §9 (no advanced extremities).

## [2026-06-07] — Phase order locked: methodology Phase 2, layout/transport Phase 3
- Decision: The roadmap ordering is **fixed** — methodology scaffolding is Phase 2 and the
  2D layout & transport engine is Phase 3. Any earlier suggestion that these two phases
  could be reordered is removed (Charter §10).
- Rationale: Stakeholder direction. The methodology backbone is the pedagogical core and
  should be in place before the higher-risk 2D/transport capability builds on it.
- Alternatives considered: Swapping to do layout/transport first for early visual momentum —
  rejected by the stakeholder.
- Governing principle / source: Stakeholder direction (2026-06-07); Charter §10.

## [2026-06-07] — Ratify the design language ("editorial engineering")
- Decision: Adopt `docs/DESIGN-LANGUAGE.md` as the ratified visual system and implement it in a
  shared stylesheet. Specifics locked: an **IBM Plex** type system (Serif headings, Sans UI/body,
  Mono for every numeric/label), a **light, paper-like, hairline-based** look with generous white
  space, a **deep-petrol primary (#0F5F57)** plus a **muted-ochre signal accent (#B8852A)**, muted
  functional state colours, 4px control / 8px card radii (no pills), barely-there shadows, and a
  single restrained page-load reveal. Explicitly retired: neon, glow/halos, dark cyber grids,
  pulsing animation, emoji in chrome, system-font default look.
- Rationale: Charter §8 calls for "McKinsey-meets-engineering" — calm, precise, authoritative,
  data-forward. IBM Plex carries engineering pedigree, is free on Google Fonts, and is distinctive
  without being trendy; one disciplined primary + one signal accent keeps colour doing real work.
- Alternatives considered: Keeping/refreshing the demo's bright "cyber" aesthetic (rejected,
  Charter §8); a neutral system-font UI (rejected — the spec explicitly wants editorial serif +
  mono numerics as a signature).
- Governing principle / source: `docs/DESIGN-LANGUAGE.md` (v0.1); Charter §8; DECISIONS
  2026-06-05 "Aesthetic: retire the demo look".

## [2026-06-07] — New application folder structure (`app/`)
- Decision: All new application code lives in a flat **`app/`** folder, separate from the legacy
  demo: `app/index.html` (home) + one page per workflow section (`methodology`, `floor`, `analyse`,
  `physics`), plus `app/gallery.html` (design-system reference) and `app/smoke.html` (engine check);
  shared assets in `app/styles/design-system.css` and `app/js/` (`nav.js` chrome, `smoke.js`). The
  app **imports** the existing engine via relative path (`../../src/engine.js`) and never modifies
  it or the demo pages.
- Rationale: A flat `app/` keeps relative paths simple and correct on GitHub Pages (no build step,
  native ES modules), cleanly separates new work from the legacy prototype, and satisfies Charter
  §4.2 ("build on the existing engine; new files & pages — not a rewrite, not edits in place").
- Alternatives considered: Editing the demo pages in place (rejected, Charter §4.2); a nested
  `app/pages/` tree (rejected for now — adds path depth with no benefit at this size); a JS build
  step/bundler (rejected — violates the no-build / GitHub-Pages constraint).
- Governing principle / source: Charter §4 (architecture), §9 (non-goals); DECISIONS 2026-06-05
  "Build on the existing engine, as entirely new files & pages".

## [2026-06-07] — Project-container data structure (`des-study/v1`)
- Decision: One JSON object per student holds the whole study, schema-tagged `des-study/v1`:
  `meta` (title/author/created/modified); `conceptual` { `objectives` {question, success, notes},
  `factors[]`, `responses[]`, `content` {included, excluded, detail, simplest} }; `assumptions[]`;
  `vv` { checklist[], notes }; and two reserved nulls — `model` (Phase 3 floor/line) and `results`
  (Phase 4). **Experimental factors and responses carry stable ids** (`f_*`, `r_*`) so the Phase 3
  model can bind to them later. A defensive `migrate()` fills any missing shape so older/partial
  saves keep loading as the schema grows. Persistence is localStorage autosave + JSON file
  save/load (Blob download / FileReader), matching the legacy demo — no backend.
- Rationale: A single versioned object that later phases attach to (rather than separate files)
  keeps one student's study coherent, save/load trivial, and forward-compatible. Stable ids are the
  hinge that lets Phase 3 reference Phase 2's factors/responses without a rewrite.
- Alternatives considered: Separate per-section storage keys (rejected — fragments the study, harder
  to export/submit as one artifact); array indices instead of ids for factors/responses (rejected —
  reordering/removal would break Phase 3 bindings).
- Governing principle / source: Charter §5 (methodology scaffolding); `Reference/theory-notes.md`
  §2.3 (conceptual-model elements).

## [2026-06-07] — Stepped, revisitable wizard on one workspace page
- Decision: The conceptual-model builder is a single workspace page (`methodology.html`) with a
  left step rail (Objectives → Experimental factors → Responses → Model content → Assumptions &
  simplifications → Verification & validation) rather than one page per step or a free-form form.
  Steps are revisitable in any order (deep-linked via URL hash), the rail shows per-step completion,
  and a study-process diagram marks where the student is. Guided rails, plain language, Robinson's
  terms; an optional fast-food worked example is disclosed per step.
- Rationale: Charter resolved "guided rails over open sandbox" (DECISIONS 2026-06-05). A stepped
  spine teaches the order of Robinson's conceptual-model elements while staying revisitable; one page
  keeps all of the shared project state in one place (no cross-page sync) and matches the calm,
  diagrammatic aesthetic.
- Alternatives considered: A strict linear wizard that locks later steps (rejected — students must
  revisit; modelling is iterative); a single long scroll form with no spine (rejected — loses the
  "where am I in the process" teaching); multipage (rejected — needless state-sync complexity).
- Governing principle / source: Charter §5; DECISIONS 2026-06-05 "Guided rails over open sandbox";
  `Reference/theory-notes.md` §2.2–2.3.

## [2026-06-07] — Export format: print-friendly HTML + Markdown
- Decision: The study front matter exports two ways from `export.html`: an on-brand, print-friendly
  HTML document (a `@media print` stylesheet hides the chrome → "Print / save as PDF" for hand-in),
  and a downloadable **Markdown** file (`*.conceptual-model.md`). Both are generated client-side from
  the saved project.
- Rationale: The deliverable asks for "Markdown or print-friendly HTML"; providing both covers
  submission as a PDF (print) and as editable text (Markdown) with no backend and no new dependency.
- Alternatives considered: PDF generation via a bundled library (rejected — violates no-build /
  adds weight; the browser's own print-to-PDF is sufficient); HTML only (rejected — Markdown is more
  portable for submission/versioning).
- Governing principle / source: Charter §5 (exportable assumptions record), §4.1 (client-side).

## [2026-06-07] — Internal build-roadmap "phases" stay out of the student-facing UI
- Decision: The application UI must not surface our internal build-roadmap phase numbers (Phase 1–5).
  Unbuilt sections are marked by **availability** ("available" / "soon" / "coming soon"), not phase
  number. Roadmap phase references live only in `docs/` (charter, journal, decisions) and in code
  comments. Removed the leaked references from the top nav, the home workflow cards, the placeholder
  pages, the methodology study-process diagram, the C-data helper text, the V&V checklist pill, and
  the gallery sample tags.
- Rationale: Stakeholder feedback — a student has no idea what "Phase 3" means; it is purely our
  development sequence. Worse, in the study-process diagram it sat next to Robinson's "Activity
  01–04", so the activities appeared to start at phase 2/3. Two unrelated numbering systems in one
  view is confusing; the dev roadmap is an implementation detail.
- Alternatives considered: Keep the phase tags as a build-progress indicator (rejected — that
  belongs in `docs/`, not the app); renumber the diagram's activities to match phases (rejected —
  conflates pedagogy with our roadmap).
- Governing principle / source: Stakeholder direction (2026-06-07); Charter §8 (calm, legible),
  §1 (clarity for a learner wins).

## [2026-06-07] — Phase 3 transport/floor data model (PROPOSED — pending review)
- Decision: A 2D floor attaches to the project at `model` as `des-floor/v1`: placed `nodes`
  (`kind:"resource"` with machines/service/bufferCap, or `kind:"storage"` with cap), a `source`, a
  `sink`, an ordered `routing` of node ids, and a `transport` block (default mover + per-edge
  overrides keyed `"from>to"` + a shared `workers` pool). Nodes carry stable ids so conceptual
  experimental factors can bind to them. A single linear routing in v1 (no branching/BOM); storage
  is an explicit placeable buffer in addition to each resource's input buffer.
- Rationale: Mirrors the validated engine's station+buffer mechanics while making *placement* a
  first-class, bindable part of the study; the simplest structure that makes layout affect flow.
- Alternatives considered: branching/multi-product routing (rejected for v1 — Charter §6 simplicity);
  storage only as resource input-buffers with no placeable WIP nodes (rejected — students must place
  storage per Charter §6).
- Governing principle / source: Charter §6, §4; `Reference/theory-notes.md` §5; design note
  `docs/PHASE-3-DESIGN.md`. **Pending stakeholder review before implementation.**

## [2026-06-07] — Phase 3 units convention (PROPOSED — pending review)
- Decision: One labelled time unit — **minutes** — for the whole study; floor distance in **metres**;
  mover **speed in m/min**; **travel time = distance ÷ speed** (minutes), so it adds cleanly to
  service/cycle time. Canvas `scale` (px/m, default 10) is display-only and never affects the sim.
  Distances are **Euclidean** straight-line between node centres (no pathfinding).
- Rationale: theory-notes §1 requires fixing one time unit and enforcing it everywhere; metres +
  m/min + minutes keeps travel time dimensionally consistent with service time.
- Alternatives considered: hours (rejected — minutes reads better for a teaching line); Manhattan
  distance (flagged as a review option — more aisle-like, equally simple).
- Governing principle / source: `Reference/theory-notes.md` §1, §5; design note. **Pending review.**

## [2026-06-07] — Worker empty-return ignored (PROPOSED v1 SIMPLIFICATION — pending review)
- Decision: The worker pool models **one-way loaded trips only**; a worker is free at the drop-off
  the instant it delivers, with no empty repositioning travel. When the floor uses workers, this is
  **auto-added to the study's assumptions log**, typed SIMPLIFICATION, with rationale and a
  sensitivity-test flag.
- Rationale: Charter §6 explicitly excludes empty-travel modelling; ignoring it keeps the worker
  model trivial. It is conservative-ish in direction (real empty travel would only raise worker
  utilisation), and logging it teaches the assumptions/simplifications discipline (Phase 2).
- Alternatives considered: modelling return-to-base or nearest-pickup travel (rejected — Charter §6
  NOT-list; adds dispatch logic we explicitly avoid).
- Governing principle / source: Charter §6; Phase 2 assumptions-log principle; design note. **Pending review.**

## [2026-06-07] — Branching & assembly are in-scope v1 floor capabilities (RATIFIED)
- Decision: The 2D floor supports **both branching** (different products/parts take different routes)
  **and assembly** (components converge at an `assembly:true` node and a product starts only when its
  BOM is on hand). The floor data model is a **routing graph with parts** (each part has its own
  routing; assembly reuses the validated advanced-engine fork-join idea) — **graph-/assembly-capable
  from day one**. Built **incrementally (Option B)**: Milestone 1 linear path → M2 transport
  resources → **M2b branching + assembly** → M3 integration, so no rewrite. **Supersedes** the
  "single linear routing in v1 (no BOM/branching)" clause of the 2026-06-07 *proposed* data-model
  entry above; the rest of that entry (node kinds, storage model, stable ids) stands and is now
  ratified.
- Rationale: Stakeholder confirmed branching + assembly are essential to the course (factory layout
  inherently includes assembly/BOMs), and the capability is already proven in `advanced-engine`.
  Designing the model for it now avoids a later rewrite; building linear-first keeps Charter §6's
  "as simple as possible" governing the *build order*.
- Alternatives considered: linear-only v1 then a separate version for assembly (rejected by
  stakeholder); full branching+assembly engine in the first milestone (rejected — needless upfront
  risk; incremental is safer).
- Governing principle / source: Stakeholder direction (2026-06-07); Charter §6 (updated); design
  note `docs/PHASE-3-DESIGN.md` §1, §3. Units & worker-empty-return decisions above stand; the
  remaining design-note choices (Euclidean distance, `instant` default mover, dual storage model)
  proceed as proposed defaults unless the stakeholder objects.
