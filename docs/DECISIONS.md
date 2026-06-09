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

## [2026-06-08] — Floor visual polish: line-grid + scale bar, histogram distribution preview, manual "End"
- Decision: Four UI refinements to the floor (`app/floor.html`, `app/js/floor.js`, `app/styles/floor.css`),
  no engine change: (1) add a **manual "End"** control that stops the run at the moment currently on
  screen and shows the time-average statistics there (the sim's FEL never empties under a stream of
  arrivals, so "Run to end" only fast-forwards to the event horizon); (2) render every distribution
  preview as a **bar histogram with a labelled value axis (lo · μ · hi) and a mean marker** instead of a
  filled density curve, so a pure rescale (e.g. changing an exponential's mean) is always visibly
  reflected; (3) make the Results tiles/tables **box-safe** via adaptive number formatting (more decimals
  for small values, a `k` suffix for large ones) plus scoped sizing/`table-layout: fixed` with a
  truncating first column; (4) replace the faint **dotted** floor grid with a faint **line** grid (5 m
  minor / 10 m major) and add a zoom-aware **scale bar** in the canvas corner.
- Rationale: Stakeholder feedback — users could not stop a run except via the all-the-way fast-forward;
  the density preview "did not seem dynamic" (percentile auto-scaling with no axis labels hid scale
  changes); long figures overflowed the narrow side panel; the grid was hard to see and there was no
  sense of scale. A line grid + ruler reads as engineering drafting paper, which fits the
  "precision-engineering documentation" half of the design language better than sparse dots.
- Alternatives considered: keeping the dotted grid but darkening it (rejected — still no sense of scale,
  and dots read as decoration not measurement); SVG-embedded axis text on the histogram (rejected — the
  preview uses `preserveAspectRatio: none`, which would distort text, so labels live in an HTML row
  beneath); per-value fixed decimals in Results (rejected — overflows on large magnitudes).
- Governing principle / source: Stakeholder direction (2026-06-08); DESIGN-LANGUAGE §0 (data-forward,
  legible), §5 (charts as figures), §7 (light canvas, *faint* low-contrast grid — honoured: the line grid
  uses the hairline tokens `--line`/`--line-strong`, no neon/glow). Minor deviation from §7's literal
  "dotted grid" wording, recorded here.

## [2026-06-08] — Running-sim legibility: bigger tokens, live count tooltip, animated scrap drop
- Decision: Three additions to make parts legible while a run plays (`app/floor.*`, plus one additive
  engine hook): (1) enlarge the moving job tokens; (2) a hover tooltip on any node showing **live**
  counts (resource: here / being processed / waiting / blocked / down; source-storage: staged-holding vs
  cap; sink: shipped), refreshed each frame from the running `sim`; (3) a scrapped part turns red
  (`--scrap`) and drops straight down while fading out, rather than disappearing instantly. To support
  (3), `FloorSim` records an additive `scrapLog` of `{node, t}` (no change to counts, yield, or
  conservation); the animation is spawned only during live playback (bulk *Run to end* scraps are not
  animated) and respects `prefers-reduced-motion`.
- Rationale: Stakeholder wanted the flow of parts through the system to be clearer when watching a run —
  to see at a glance where parts are, how many are queued vs in service, and when a part is destroyed by
  processing. The scrap drop-and-fade is exactly the behaviour DESIGN-LANGUAGE §6 already prescribes
  ("scrapped dot fades out on drop").
- Alternatives considered: detecting scraps in the UI by diffing the live-jobs map against completed/
  scrapped counters (rejected — fragile and ambiguous about location); animating every scrap including
  the thousands generated by *Run to end* (rejected — visual spam and pointless work; only live-watched
  scraps are animated, capped per frame); a persistent stats overlay on every node instead of on hover
  (rejected — clutters the calm canvas; hover keeps it on demand).
- Governing principle / source: Stakeholder direction (2026-06-08); DESIGN-LANGUAGE §6 (scrapped dot
  fades on drop; motion clarifies, never decorates), §7 (tokens as small solid dots; quiet diagrammatic
  floor), §8 (raised surface uses the barely-there shadow). Engine change is additive only — Charter §4.2
  (the validated engine stays the foundation).

## [2026-06-08] — Per-machine capacity cells on resource nodes (port of the legacy demo's M1/M2 boxes)
- Decision: Each floor resource shows a centred row of small boxes, one per parallel machine, that are
  empty at rest (so capacity is visible) and filled/state-coloured ("checked") when that server is busy,
  blocked, or down during a run — capped at 8 cells, with a `×N` badge beyond that. This reuses the
  legacy demo's per-machine box idea (`M1 M2 …` boxes that change state), adapted to the new node and
  design tokens.
- Rationale: Stakeholder wanted the machine's capacity and live usage readable on the visual itself, "as
  in the old simulation engine". Discrete cells communicate both capacity (count of boxes) and usage
  (how many are checked) at a glance, complementing the hover tooltip's exact numbers.
- Alternatives considered: a single fill bar for occupancy (rejected — shows usage but not discrete
  capacity, and the demo used boxes); per-machine progress fills inside each box (deferred — the binary
  checked/unchecked the stakeholder described is clearer; the overall progress sliver is kept for the
  in-progress cue).
- Governing principle / source: Stakeholder direction (2026-06-08); legacy demo `index.html` station
  rendering (per-machine boxes); DESIGN-LANGUAGE §7 (state via fill + border colour, no glow) and §1
  (semantic state colours busy/blocked/down). UI-only; engine stays the foundation (Charter §4.2).

## [2026-06-08] — Remove "Run to end"; categorised symbol/shape picker (concrete + VSM) for resources & storage
- Decision: (1) Remove the "Run to end" playback control — runs are driven by Play/Step and stopped with
  the manual **End** added earlier. (2) Replace the flat resource-only glyph picker with a categorised
  symbol library — **Manufacturing**, **Service**, and **Abstract · VSM** (square = process, triangle =
  inventory, circle, diamond, hexagon) — shown as grouped rows and available to **both resources and
  storage**. Storage now carries a symbol too, renders it inside its brackets, and defaults to the VSM
  inventory triangle; resources default to the box.
- Rationale: Stakeholder asked to drop the fast-forward button and wanted a "smart" way to choose box
  designs for resources *and* storage, spanning concrete service/manufacturing icons and abstract VSM
  shapes (squares, triangles). Grouping by category makes a larger set browsable without clutter; sharing
  the picker across node kinds keeps one consistent mechanism.
- Alternatives considered: keeping "Run to end" (rejected per stakeholder; End covers stopping); a flat
  ungrouped list of all 20 symbols (rejected — harder to scan; categories communicate intent); a separate
  storage-only shape control (rejected — duplicates UI; one shared picker is simpler and lets storage use
  any glyph). Note: without "Run to end" there is no one-click fast-forward to a long horizon for
  steady-state statistics — acceptable per stakeholder; revisit if output-analysis (Phase 4) needs it.
- Governing principle / source: Stakeholder direction (2026-06-08); DESIGN-LANGUAGE §7 (diagrammatic
  floor), §4 (line icons); value-stream-mapping conventions (inventory triangle, process box). UI-only;
  engine untouched (Charter §4.2).

## [2026-06-08] — Floor legibility: translucent legs, pattern-tiled viewBox-filling grid, boxed storage
- Decision: (1) Render transport legs translucent and thin so they recede behind nodes/tokens/text (a
  selected leg brightens). (2) Draw the floor grid with SVG tiling patterns on background rects sized to
  the live viewBox (updated on every zoom/pan), instead of a fixed-extent line grid, so it always fills
  the canvas. (3) Render storage as a filled rounded box like a resource but visually distinct — subtle
  `surface-2` fill with a dashed border — giving it a proper click/hover surface (it was previously just
  two faint bracket strokes).
- Rationale: Stakeholder feedback — movement lines blocked the view of objects/text; the grid was
  confined to the 100 % extent and left blank space when zoomed/panned; the storage shape was hard to see
  and hard to click or hover. Patterns anchored to user space keep the grid aligned while filling any
  view. A dashed box reads as "buffer/stock" vs a solid machine, satisfying "like a resource box but not
  identical."
- Alternatives considered: regenerating explicit grid lines across the viewBox on each zoom/pan (rejected
  — more nodes/among more work than a tiled pattern); keeping storage as brackets but enlarging the hit
  area only (rejected — still visually faint; the box also improves legibility); group-opacity on legs
  (rejected — would dim the selected leg too; per-class opacity keeps selection legible).
- Governing principle / source: Stakeholder direction (2026-06-08); DESIGN-LANGUAGE §7 (light canvas,
  faint low-contrast grid; storage as a distinct quiet shape; quiet diagrammatic transport), §0/§8 (quiet,
  legible, no glow). UI-only; engine untouched (Charter §4.2).

## [2026-06-08] — Bound limitless-supply release (anti-flood) + cap animation tokens
- Decision: Under limitless supply with non-CONWIP control and an infinite first buffer, the release gate
  (`firstCanAccept`) admits new jobs only while the first station's occupancy is below `machines + 1`
  (a shallow ready queue). Finite buffers are still respected; CONWIP is exempt (its cap bounds WIP). In
  the UI, `renderFrame` draws at most 150 job tokens irrespective of WIP.
- Rationale: With push (no WIP cap) and an unbounded first buffer, limitless supply released a job on
  nearly every event — WIP grew without bound (observed 5,000,000) and the animation froze, which the
  stakeholder experienced as "the input stops generating after ~200 t". Gating to `machines + 1` keeps the
  pacemaker station fed (no starvation, since one job is always ready) without flooding; capping tokens
  makes the view robust to any high-WIP situation (flood or a genuinely unstable line).
- Alternatives considered: gating on a *free machine* at release time (rejected — settle() ordering frees
  machines after release runs, risking under-feeding or an emptied event list); leaving the engine and
  only capping tokens (rejected — the 5,000,000-job WIP is itself wrong, not just a rendering problem);
  removing the limitless option (rejected — it is a legitimate JIT/limitless-raw teaching case, just
  needs a sane bound). Note: a balanced *downstream* station under limitless can still legitimately grow
  its queue (critical loading) — that is correct physics, not the flood, and is left as-is.
- Governing principle / source: Stakeholder bug report (2026-06-08); the original demo's intent that
  limitless feeds "the moment a machine frees up" (release constrained by capacity); Charter §4.2
  (the engine is the validated foundation — fix with a regression test). Engine change covered by
  `tests/floor-engine.test.js` (76/76).

## [2026-06-08] — Instant transport is capacity-aware (finite buffers create back-pressure)
*(Synced from another machine; folded into the collective log.)*
- Decision: Instant ("uncapacitated delay") transport now **respects the destination's capacity**. A part
  departs its node only if the destination `canAcceptAt()` — current holding **plus reserved-in-transit
  `incoming`** is below capacity — and a slot is **reserved** for the trip so the `settle()` fixpoint can't
  over-fill a finite buffer. A full downstream blocks and WIP **backs up** into the upstream storage/source.
  Infinite buffers behave exactly as before.
- Rationale: Previously instant transport always moved a part into transit and, if the destination was full,
  parked it in a hidden `arrivalBlocked` limbo at the door — so finite buffers and **storage caps created no
  back-pressure** and standalone storage never accumulated (a reported bug; 235 parts sat in limbo while
  storage stayed 0). Capacity-aware transport makes finite buffers and placed storage behave like real
  WIP-limited buffers — the blocking/back-up physics the course teaches.
- Alternatives considered: keep transport uncapacitated and only cap at the resource queue (rejected — leaves
  storage inert and hides blocking); model an explicit output buffer per node (rejected — heavier than needed;
  the reserve-a-slot approach is sufficient and keeps infinite-buffer behaviour identical).
- Governing principle / source: factory-dynamics blocking / variability-buffering (`Reference/theory-notes.md`
  §4.6); Charter §4.2 (validated engine, regression-tested). Covered by `tests/floor-engine.test.js` (77/77).

## [2026-06-08] — Collapse queued/stored units to one marker (×N) + an on-canvas legend
*(Synced from another machine; folded into the collective log.)*
- Decision: On the floor, only units **in service or in transit** draw as individual teal dots (capped at
  150); units that are **queued / pending / held / finished** collapse to a **single grey dot with a `×N`
  count** per location. A small **legend** under the canvas keys the shapes/colours (machine vs storage box,
  capacity-cell states, unit/waiting/scrapped dots, transport line) with a "hover for live counts" hint.
- Rationale: One dot per waiting unit painted the canvas solid for long queues or unstable lines and obscured
  the diagram; the `×N` marker keeps it legible while the true WIP stays on the clock and in the hover
  tooltip. The legend makes the visual language self-explanatory for students.
- Alternatives considered: drawing every unit (rejected — illegible at scale, and the token cap already
  truncated silently); a numeric-only overlay with no dot (rejected — loses the at-a-glance "stuff is piling
  up here" cue).
- Governing principle / source: Stakeholder direction (2026-06-08); DESIGN-LANGUAGE §7 (quiet, diagrammatic,
  legible at a glance).

## [2026-06-08] — Phase 3.4 batch processing: model & semantics (Milestone 0, PROPOSAL — awaiting ratification)
*Full design note: `docs/PHASE-3-4-DESIGN.md`. These choices are proposed and PAUSED for stakeholder
confirmation before any engine code is written.*
- Decision: A floor resource may be flagged **batch** with **batch size B** (integer ≥ 2) and a **setup
  time `ts`**. The resource's existing **service distribution is reinterpreted as the WHOLE-BATCH process
  time** `T_batch` (not per part). The machine **waits until B jobs are accumulated and needs all B to
  start** (strict wait-to-batch, no timeout), pays **setup once per batch** before processing, works all B
  together for `ts + T_batch`, and releases the B parts to continue **individually** downstream. Specific
  sub-decisions:
  - **D2 Setup is a constant** (not a distribution) — simpler and pedagogically faithful: setup/wait-to-batch
    is variability from *control*, not randomness (theory-notes §4.6). Can become a dist later non-breakingly.
  - **D3** One COMPLETE event per batch; `service` sampled once; the setup sub-phase is tracked by a
    timestamp (`m.setupEnd`), needing no extra event, so the floor can show *accumulate → setup → process*.
  - **D4 Scrap is per-part within a batch** (each of B rolls `node.scrap` independently; they finish
    together, then are inspected individually).
  - **D5 Breakdowns** preempt-resume the **combined** setup+process remainder (v1 simplification).
  - **D6 Deadlock/starvation is surfaced, never silently hung:** engine reports `metrics.deadlock` when the
    event list drains with WIP still in system, plus per-resource `batchesStarted`/`waitingForBatch`
    diagnostics; the UI adds **static guards** that block Play for the two provably-unfillable cases —
    **CONWIP cap < B** and **finite input buffer cap < B**. Under stream supply a batch always fills
    eventually (correct control latency, not deadlock).
  - **D7 `occ()` is redefined to count actual jobs present** (a busy batch machine holds B), so finite
    buffers account correctly; non-batch behaviour is byte-for-byte unchanged (regression).
- Rationale: Charter §6.1 defines batch as the Factory Physics **process batch with a setup**; this is the
  minimal faithful model (setups inflate effective process time `te = t0 + ts/Ns`; wait-to-batch is control
  variability — §4.6). Reinterpreting the existing service dist as whole-batch time avoids adding a parallel
  "per-part vs batch" time concept (clarity-for-a-learner, Charter §1). Branching only when `r.batch` is set
  preserves the validated single-job engine exactly.
- Alternatives considered: **setup as a distribution** (rejected for v1 — adds noise to a control quantity
  and more UI; deferred); **per-part process time × B inside the engine** (rejected — the charter fixes
  whole-batch semantics and it muddies the teaching point); **a separate per-part COMPLETE for each of B**
  (rejected — they finish together by definition; one event is correct and cheaper); **partial-batch timeout
  to avoid starvation** (rejected — explicitly out of scope §6.1; deadlock is surfaced/guarded instead);
  **silently letting an unfillable model hang** (rejected — must surface, per §6.1).
- Governing principle / source: Charter §6.1 (batch definition + non-goals); `Reference/theory-notes.md` §4.6
  (process vs transfer batch, setup inflation, wait-to-batch = control variability); Charter §4.2 (build on
  the validated engine; legacy engines untouched; regression-tested). To be covered by a new test file in
  `tests/` with existing suites staying green.

## [2026-06-08] — Phase 3.5 process model: engine strategy (Milestone 0, PROPOSAL — awaiting ratification)
*Full design note: `docs/PHASE-3-5-DESIGN.md` (supersedes/absorbs the never-built `PHASE-3B-DESIGN.md`).
These choices are proposed and PAUSED for stakeholder confirmation before any code.*
- Context/audit: the new floor engine (`src/floor-engine.js`) is **single-product** (`mainPart`); it has
  transport (instant/conveyor/worker) + batch + blocking + breakdowns + scrap but **no multi-part, BOM,
  assembly, per-product demand, or per-product CONWIP**. `src/advanced-engine.js` has all of those but is
  **non-spatial** (no transport, no batch). Note: the prompt's "Phase 3.6 transport revision (AGV/Operator
  coupling)" **does not exist in the repo** — stakeholder confirmed; ignored. Only the three existing movers
  + batch are preserved.
- Decision (E1): **port the proven multi-part / BOM / assembly / supply-demand / control logic from
  `advanced-engine.js` INTO `floor-engine.js`, additively** — one engine drives the floor — reusing the
  validated algorithms (`canAssemble`, consume-on-start, `buildPullOrder`, `computePullNeeds`,
  `pullSatisfy`/`extTurn` fairness, round-robin, per-source/per-product streams) rather than reinventing
  them. `advanced-engine.js` and `engine.js` stay **frozen**; their tests stay green.
- Sub-decisions: **E2** transport gates assembly — a component is on-hand only after its last leg delivers
  it to the assembly node (global per-part inventory pool, round-robin fairness); the farthest/slowest
  component paces the product (§4.6 fork-join cost, made spatial). **E3** per-product CONWIP + per-product
  demand each with its **own interarrival dist** (the historical bug — preserved); dependent-demand
  explosion preserved; in-transit jobs count as that part's WIP. **E4** batch × assembly are orthogonal
  flags but **not combined on one node in v1**. **E5** service/scrap stay on the resource for v1
  (per-operation service deferred). **E6** parts **capped at 10**, surfaced not silently truncated. **E7**
  backwards compatible — today's single-part model = one produced part, no BOM → identical (regression).
- Rationale: transport, batch, and assembly must share one event loop / FEL / WIP accounting — the spatial
  gating of assembly only exists if they live together (Charter §4.2 build-on-engine; the floor is the model
  surface). Reusing the validated advanced-engine algorithms keeps the statistical/scheduling logic sound
  (Charter §3 source hierarchy). Basics-first default (one produced part, serial line, push) protects the
  learner (Charter §9).
- Alternatives considered: **two engines side by side** (rejected — can't share the FEL/transport, and
  spatial assembly gating becomes impossible); **rewrite multi-part logic from scratch in the floor engine**
  (rejected — discards validated behaviour and its tests, Charter §4.2); **per-node component inventories**
  (deferred — global per-part pool is simpler and matches advanced-engine for basics-first); **per-operation
  service times now** (deferred to keep v1 simple). The **3.2b authoring-UX** choice is deferred to
  Milestone 2.
- Governing principle / source: Charter §2/§4/§9/§10; `Reference/theory-notes.md` §4.6 (Law of Assembly
  Operations — fork-join matching), §5 (layout/flow); `src/advanced-engine.js` as the validated reference.
  To be covered by a new `tests/floor-process.test.js` with existing suites staying green.

## [2026-06-09] — Make the BOM visible: part colours, a magnifiable BOM inset, and a by-location flow ledger
- Decision: Add a multi-part **visibility layer** to the floor (UI only; no engine change): (1) a
  **stable per-part colour** drawn everywhere a part appears — parts panel, BOM tree, routes, the run
  ledger, and the **job tokens themselves** (solid dot = active; part-coloured ring + ×N = waiting/
  stored); (2) a **BOM inset** pinned in the canvas corner showing the assembly tree, with a **magnify**
  button opening a modal that shows the full tree **and each part's physical route**, colour-coded; and
  (3) a new **"Flow" tab** holding a live ledger organised **by location** — every station / transport
  leg / the on-hand shelf and which parts (counts, in colour) are there right now. Palette extended to
  10 categorical colours (`--c1…--c10`).
- Rationale: Stakeholder feedback — because assembly components live in a **global per-part inventory
  pool** (and a part has one route), there is no drawn leg from a sub-assembly into its parent
  assembler, so the structure and the "what goes where" were invisible on the floor. The BOM inset makes
  the structure explicit; colouring the units and a by-location ledger make the flow followable while a
  run plays — directly serving the charter's "visualisations are the centre of gravity" and
  clarity-for-a-learner. Two design forks were put to the stakeholder: the **magnified inset shows the
  BOM tree + route list** (over tree-only or a route-map), and the **ledger is organised by location**
  (over by-part or a hybrid).
- Alternatives considered: tree-only inset (rejected — the stakeholder also wanted routes visible); a
  route-map inset (rejected — loses the hierarchy, which is the thing that was invisible); a by-part
  ledger / hybrid (rejected by the stakeholder in favour of reading the floor location-by-location);
  drawing per-part legs on the main floor (rejected — shared legs make per-part colouring of the legs
  ambiguous, so colour lives on the *units*, not the legs).
- Governing principle / source: Stakeholder direction (2026-06-09); Charter §8 (data-forward, legible)
  and §1 (clarity for a learner); DESIGN-LANGUAGE §5 (charts/figures), §7 (quiet, diagrammatic floor,
  state via colour, no glow), §1 (categorical palette). UI-only; engine untouched (Charter §4.2);
  `npm test` 93/93; verified via headless-Chrome screenshots of `#example5`.

## [2026-06-09] — Draw the BOM pull-dependency as a distinct link; show the split rule (engine unchanged)
- Decision: Make the component→assembler dependency that runs through the global per-part inventory
  pool **visible on the floor** as a distinct **dotted, part-coloured, arrowed "pull" link** (with a
  `×qty` label), drawn only where the component does NOT physically route into the assembler. Where the
  component's route already ends at the assembler, the existing solid transport leg suffices and no
  extra link is drawn. Additionally, label any part that is both sold and consumed as **"shared"** and
  spell out its **split rule** (its finished units divide between its own demand and the assemblies that
  pull it — shared fairly / alternating) in the BOM inset footnote and the magnified modal. **No engine
  change** — the split and its fairness are already correct (re-verified); this is purely a visibility
  fix.
- Rationale: Stakeholder feedback — in `#example5` the sub-assembly (Motor) line and the product (Pump)
  line looked disconnected, and the split of a sub-assembly's output between "sold as spares" and "used
  in the parent" was invisible, making the model unintuitive even once understood. Because component
  inventory is a global per-part pool and a part has a single route (the standing modelling choice),
  there is no routed leg from a sub-assembly into its parent assembler; representing that dependency as
  a logical (non-transport) link — visually different from a conveyor/worker/instant leg via its dotting
  and arrowhead — closes the comprehension gap without pretending it is physical transport.
- Alternatives considered: changing the engine to route a component physically into its assembler
  (rejected — a part has one route; it is already sold via its own sink, and the global pool is the
  validated multi-part model; the split is correct as-is); drawing pull-links for *every* BOM edge
  including physical ones (rejected — duplicates the real legs and clutters; only the non-physical,
  otherwise-invisible dependencies are drawn); using the same line style as transport (rejected — it is
  not physical transport; the dotted + arrowhead style marks it as a logical pull from the shelf).
- Governing principle / source: Stakeholder direction (2026-06-09); Charter §8 (legible, data-forward)
  and §1 (clarity for a learner); DESIGN-LANGUAGE §7 (quiet diagrammatic floor; distinct quiet line
  styles; no glow); builds on DECISIONS 2026-06-09 "Make the BOM visible …". UI-only; engine untouched
  (Charter §4.2); `npm test` 93/93; verified via headless-Chrome screenshots of `#example5`.

## [2026-06-09] — Model authoring moves to a guided Setup builder; the floor becomes structure-locked
- Decision: Replace the floor's piecemeal authoring (palette place-tools + canvas Route tool + a parts
  modal) with a guided **Setup drawer** (the "system builder") modelled on the old engine
  (`advanced.html`): four sections — **Stations · Parts & BOM · Routes · Control/source/demand** — with
  a **live mini-preview**, and an **Apply** that **auto-lays-out** the floor (`autoLayout()`: column =
  longest-path depth along route edges, row = a lane per part). After Apply the **floor is physical-only**
  — reposition (drag), tune each station's parameters (Inspect), and set per-leg transport — but it
  **cannot add/remove stations, parts or routes**; that is Setup-only. A lock banner states this; an
  empty model and Clear open the builder first. Right-panel tabs become Inspect · Transport · Flow ·
  Results (the Model tab/subtabs retired). Engine and the validated model schema (`des-floor/v1`) are
  unchanged — this is purely the authoring surface.
- Rationale: Stakeholder feedback — the BOM & Parts authoring was "still unintuitive and way too hard",
  and the old engine's "set up the system, then see the auto-generated visual" flow was "waaaay better".
  Separating *defining the system* (guided, form-based, with a preview) from *laying it out physically*
  (drag/tune on the floor) matches how the old engine worked and the course's model-then-experiment
  intent (Charter §5), and removes the confusing canvas-placement/route-tool steps. Locking structure on
  the floor prevents accidental structural edits and makes the floor a clean layout/tuning surface.
- Alternatives considered: keeping canvas placement + improving the parts modal (rejected — the
  stakeholder explicitly preferred the old-engine setup flow, and canvas placement conflated structure
  with layout); making the floor fully read-only after setup (rejected — the stakeholder wants to
  reposition and tune parameters and transport on the floor); a separate page for setup (rejected — a
  drawer keeps it in context with the live preview, like the old engine).
- Governing principle / source: Stakeholder direction (2026-06-09); old engine `advanced.html` (setup
  drawer + auto-generated floor); Charter §5 (guided model definition), §8 (legible, data-forward), §1
  (clarity for a learner); DESIGN-LANGUAGE (calm, guided). UI-only; engine untouched (Charter §4.2).
  `npm test` 93/93; the mouse/keyboard authoring path is regression-covered by
  `tests/ui/authoring-selftest.html` (headless 21/21).

## [2026-06-09] — Shared component is physically delivered into its assembler (supersedes the dotted overlay)
- Decision: A shared component (one consumed by an assembler whose route does NOT end there — e.g. a
  sub-assembly that ships spares from its own sink and is also built into a parent product) is now
  **physically delivered** along a real **supply leg** (`lastRealNode(component) → assembler`) when an
  assembly pulls it from the shared pool. The leg is a **normal transport leg** (mover/length editable,
  direction arrow), delivery tokens animate along it in the part colour, and **assembly waits for the
  delivery to arrive** (transport-gated) — so the link "functions exactly like other lines". This
  **supersedes** the 2026-06-09 decision that drew the dependency as a dotted, non-transport overlay.
- Rationale: Stakeholder chose "route units physically (engine change)" over a UI-only animation: the
  shared link should behave like any other line, with parts travelling it and a direction arrow. The
  global per-part inventory pool, fairness (`extTurn`) and dependent-demand explosion are preserved; the
  only change is that a pulled shared unit now spends real transit time on its way into the assembler
  (engine `dispatchDelivery`/`onDeliver`, a `DELIVER` event, and a `pstats.pending` bound folded into
  `computePullNeeds`). Deliveries move already-finished units, so completions/conservation are unchanged.
- Alternatives considered: UI-only animation with no engine change (rejected by the stakeholder — not
  "real"); per-assembler component inventories replacing the global pool (rejected — a large rework of
  the validated multi-part logic and its tests; the supply-leg approach keeps the pool/fairness intact
  and only adds a delivery stage for the non-physical case). Known v1 limitation: under **push** with a
  *distant* shared component, deliveries-in-flight aren't seen by the assembler's accept check beyond a
  shallow `pending` bound; pull/CONWIP bounds it cleanly (the realistic case).
- Governing principle / source: Stakeholder direction (2026-06-09); Charter §4.2 (build on the validated
  engine, regression-tested), §6/§7 (transport is a real resource; the best flow is no flow); theory-notes
  §4.6 (fork-join, now spatial for the shared link too). Covered by `tests/floor-process.test.js`
  (new test; `npm test` 94/94).
