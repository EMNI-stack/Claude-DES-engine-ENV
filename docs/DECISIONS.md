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
