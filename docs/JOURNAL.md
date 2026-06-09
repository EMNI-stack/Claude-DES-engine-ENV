# Work Journal

> Chronological log of work on the DES teaching application: what was done, what
> source informed it, doubts raised, and open todos. Newest entries at the bottom.
> Updated as part of every task. Companions: `docs/PROJECT-CHARTER.md` (scope anchor),
> `docs/DECISIONS.md` (decision log), `docs/PRINCIPLES.md` (theory).

---

## 2026-06-05 — Phase 0: ratify charter, establish documentation system

**Done today**
- Read `docs/PROJECT-CHARTER.md` in full and skimmed `Reference/theory-notes.md` as the
  theoretical anchor.
- Ratified the charter's decisions and seeded `docs/DECISIONS.md` (append-only log) with
  the seven ratified decisions: (a) client-side / no backend; (b) build on the existing
  engine as new files & pages; (c) methodology scaffolding first-class; (d) 2D layout &
  transport kept simple; (e) source roles (Robinson spine & student-facing, Law behind
  the scenes, Factory Physics quantitative, FP for Managers qualitative); (f) retire the
  demo aesthetic for "McKinsey-meets-engineering"; (g) guided rails over open sandbox.
- Created `docs/PRINCIPLES.md`, seeding the core principles drawn from the notes
  (validity is confidence not proof; never present a single run as the answer;
  assumptions vs simplifications; time-average vs sample-average; Little's Law; theory as
  overlay; evaluate layout dynamically) — each with a source tag bridging to
  `Reference/theory-notes.md`.
- Created this journal.
- Added a documentation rule to `CLAUDE.md` (under Rules) making doc upkeep part of every
  task and naming the charter as the scope anchor.

**Sources informing this work:** Charter §§3–12; `Reference/theory-notes.md` §§1, 2, 3, 4,
5 (Robinson primary; Law behind the scenes; Hopp & Spearman quantitative; FPD layout).

**Scope note:** documentation only this phase — no engine code, app pages, or tests were
touched (per Charter §10 Phase 0 and the task brief).

**Open questions carried forward (Charter §11):**
- **Confirm the v1 minimal 2D/transport floor** (Charter §6) is the right scope before
  Phase 3 — it is the main engineering risk. (Distribution/units conventions are being
  fixed in `theory-notes.md` §1 and enforced everywhere.)

**Next:** Phase 1 — app shell & aesthetic foundation (new pages/files, the
McKinsey-meets-engineering design system, navigation, reuse the engine).

---

## 2026-06-07 — Scope refinement: lock phase order

**Done today (stakeholder direction)**
- **Phase order locked.** Methodology scaffolding stays **Phase 2**, the 2D layout &
  transport engine stays **Phase 3**; the earlier suggestion that these two phases could be
  reordered is removed (Charter §10). Logged in `docs/DECISIONS.md`.
- Tightened the competence objective in Charter §2 to "efficiency and flexibility" and
  aligned `Reference/theory-notes.md` and project memory accordingly.

**Scope note:** documentation only — no engine code, app pages, or tests touched.

---

## 2026-06-07 — Phase 1: app shell & design-system foundation

**Done today**
- Implemented the ratified design language (`docs/DESIGN-LANGUAGE.md`) as a shared stylesheet
  `app/styles/design-system.css`: full CSS-variable token set (colour, IBM Plex type families &
  scale, 8px spacing, radii, hairline borders, barely-there shadow, motion), IBM Plex Serif/Sans/
  Mono loaded from Google Fonts, and base components — buttons (primary/ghost), segmented control,
  inputs/selects, panels (mono section-label + serif title), tables, KPI tiles, state badges,
  line icons, and the later-phase placeholder block. Light, hairline-based; no neon/glow/pills/emoji.
- Stood up the application shell in a new flat `app/` folder with shared chrome injected by
  `app/js/nav.js` (header + footer, active-section highlighting). Persistent nav reflects the
  charter sections: **Methodology, Model & Floor, Run & Analyse, Factory Physics**.
- Built the **home/landing** page (`app/index.html`) in the new aesthetic, and four **placeholder**
  section pages (`methodology`, `floor`, `analyse`, `physics`), each present in the nav, tagged with
  its phase, and describing its planned scope.
- Built the **component gallery / kitchen sink** (`app/gallery.html`) showing every token and base
  component in one place for review.
- Built the **engine smoke test** (`app/smoke.html` + `app/js/smoke.js`): imports the existing
  `src/engine.js` unmodified, runs a small two-station line headlessly, and displays throughput,
  WIP, cycle time, per-station utilisation, and a Little's-Law consistency check. Verified in Node
  (seed 42, 2000 time units): throughput 0.611, WIP 4.62, CT 7.40, util 74.6% / 61.3%, WIP ≈ TH×CT.
- Linked the new app to the legacy demo (footer: production line / factory builder, labelled the old
  prototype). The engine, `src/`, and demo pages (`index.html`, `advanced.html`) were **not** touched.

**Live vs placeholder**
- Live: Home, Design system (gallery), Engine check.
- Placeholder (present in nav, built later): Methodology (P2), Model & Floor (P3), Run & Analyse
  (P4), Factory Physics (P5).

**Verification:** `npm test` → 62/62 pass (engine untouched).

**Decisions logged:** design-language ratification; the `app/` folder structure (see
`docs/DECISIONS.md`, 2026-06-07).

**Sources informing this work:** `docs/DESIGN-LANGUAGE.md`; Charter §§3–9.

**Next:** Phase 2 — methodology scaffolding (conceptual-model builder, assumptions log, V&V
framing) on this shell.

---

## 2026-06-07 — Phase 2: methodology scaffolding (Robinson backbone)

**Done today**
- **Project container** (`app/js/project.js`): one schema-tagged JSON object (`des-study/v1`) per
  student holding `meta`, `conceptual` (objectives / factors / responses / content), `assumptions`,
  `vv`, and reserved `model` (Phase 3) / `results` (Phase 4) nulls. Factors & responses carry stable
  ids for later binding. localStorage autosave + JSON file save/load (Blob/FileReader, like the demo)
  + a defensive `migrate()`.
- **Study-process overview** on `methodology.html`: a calm diagram of Robinson's four activities with
  "Conceptual model" marked active and a note that V&V runs throughout (not a stage).
- **Conceptual-model builder** (`app/js/methodology.js`): a stepped, revisitable workspace (left rail
  + content, deep-linked by URL hash) walking Objectives → Experimental factors → Responses → Model
  content, each in plain language with helper text and an optional fast-food worked example. The
  "simplest model that meets the objectives" rule is stated in the intro and the content step.
- **Assumptions & simplifications log**: typed entries (ASSUMPTION = knowledge gap vs SIMPLIFICATION
  = deliberate reduction), each with rationale, data-availability tag (A/B/C), uncertainty note, and a
  sensitivity flag; selecting category C prompts "test by sensitivity analysis later (Phase 4)".
- **V&V framing**: verification-vs-validation explainer, the forms of validation, the first-class
  message "a model is never valid in general — V&V builds confidence", and a manual progress
  checklist (now-items vs Phase 3–4 items, honestly marked).
- **Export** (`export.html` + `app/js/export.js`): a clean print-friendly HTML document (print → PDF)
  plus a Markdown download of the whole front matter.
- Added `app/styles/methodology.css` (layout only, built on Phase 1 tokens — no component restyling).

**Scope:** strictly Charter §5. No model execution, no 2D floor, no warm-up/replications/CI, no
Factory Physics overlays — nav placeholders stay placeholders. Nothing exceeded the charter. Engine,
`src/`, and the legacy demo were not touched.

**Verification:** `npm test` → 62/62 pass (engine untouched). New JS passes `node --check`. Rendered
both pages in headless Chrome: no console errors; the step rail builds all six steps and the export
document renders. Screenshots reviewed — on-brand with Phase 1.

**Decisions logged (2026-06-07):** project-container data structure; stepped revisitable wizard;
export format (print HTML + Markdown). **Principles added:** study-process cycle; conceptual-model
elements; data A/B/C → sensitivity (all cited to Robinson).

**Sources:** `Reference/theory-notes.md` §2.2–2.5; Charter §2, §5; `docs/DESIGN-LANGUAGE.md`.

**Next:** Phase 3 — the 2D floor & transport engine (binds the model to the factors/responses ids
defined here).

---

## 2026-06-07 — Fix: strip internal build-phase numbering from the app UI

**Trigger:** stakeholder noticed the methodology study-process diagram referenced "Phase 3 / Phase 4"
next to Robinson's "Activity 01–04", making the activities look like they started at phase 2/3 — and
correctly identified that our internal build roadmap had leaked into the student-facing application.

**Done**
- Study-process diagram: activity sub-labels now "available now" / "coming soon" (no phase numbers).
- Top nav (`nav.js`): unbuilt sections tagged "soon" instead of "P3/P4/P5"; Methodology untagged.
- Home cards: "available" on Methodology, "soon" on the other three; reworded the summary line.
- Placeholder pages (floor/analyse/physics): "Coming soon" instead of "Coming in Phase N".
- Helper text + V&V checklist pill + gallery sample tags: phase numbers removed.
- Kept phase references only in `docs/` and in `project.js` code comments (internal dev process).
- Logged the standing policy in `docs/DECISIONS.md` (2026-06-07).

**Verification:** headless re-render of home + methodology — nav shows "available"/"soon", diagram
reads Activity 01–04, no console errors. `npm test` unaffected (no engine change).

---

## 2026-06-07 — Phase 3, Milestone 0: design note (2D floor & transport)

Wrote `docs/PHASE-3-DESIGN.md` proposing the 2D-floor data model (`des-floor/v1` on `project.model`),
the routing→leg distance mapping, the three movers (instant / conveyor / worker pool), event-loop
integration in a **new** `src/floor-engine.js` (reusing patterns + `distributions.js`, not touching
the validated engines), the stats/Little's-Law treatment, the file plan, and the test plan. Fixed the
**units convention** (minutes · metres · m/min · travel = distance/speed; Euclidean; display-only
scale). Summarised the three key choices into `docs/DECISIONS.md` (data model, units, worker
empty-return simplification), each marked **PROPOSED — pending review**. Listed open review choices
(distance metric, default mover, single-linear-routing, storage-vs-input-buffer).

**No engine code written.** Per the task's review gate, paused here to show the design note before
implementing. `npm test` untouched (62/62, no code change).

**Next (after approval):** Milestone 1 — 2D placement with distance-based (instant) transport delay.

---

## 2026-06-07 — Phase 3 design revised: branching + assembly in scope (Option B)

Stakeholder reviewed the design note and decided **both branching and assembly are in v1**, taking
**Option B** (model is graph-/assembly-capable from day one; implement linear-first, then layer in
branching/assembly — no rewrite). Updated `docs/PHASE-3-DESIGN.md` (§1 scope + sequencing, §3 data
model now parts-with-routings + BOM + assembly nodes, §4 leg/assembly mapping, §6 MATCH step, §9
assembly test, §10 resolved), `docs/PROJECT-CHARTER.md` §6 (branching/assembly in scope; NOT-list
clarified as transport-only), and `docs/DECISIONS.md` (ratified entry superseding the earlier
"single linear routing" clause). Remaining low-stakes design choices (Euclidean distance, `instant`
default mover, dual storage model) stand as proposed defaults. `npm test` untouched — still no code.

**Next:** Milestone 1 — implement the linear path on the graph-capable model (placement + instant
transport delay), with tests.

---

## 2026-06-07 — Phase 3.1: 2D placement with distance-based transport delay

**Done**
- **`src/floor-engine.js`** — new transport-aware next-event engine (heap FEL, area-method stats,
  seeded RNG via `distributions.js`); does NOT touch the existing engines. Implements the linear path
  on the graph-capable model: jobs arrive at a source, flow through a routing of placed nodes, and
  each leg adds `Euclidean distance ÷ speed` as **instant (uncapacitated)** transport. A job in
  transit is counted in WIP and its transit time is part of cycle time. `legDistance()` isolates the
  metric (one-line swap to Manhattan if ever wanted). Exposes `metrics()` (throughput, WIP, cycle
  time, transit/job, per-resource utilisation).
- **`tests/floor-engine.test.js`** (6 tests) + wired into `npm test`: leg distance is Euclidean;
  a known leg adds exactly distance/speed; **placement matters** (farther node → more transport &
  cycle time); conservation with transit counted; **Little's Law holds with transport**; transport
  time is part of cycle time.
- **`app/floor.html` + `app/js/floor.js` + `app/styles/floor.css`** — replaces the placeholder with
  an SVG floor builder (DESIGN-LANGUAGE §7): faint dotted grid, rounded resource rects, bracketed
  storage, circular source/sink, thin legs labelled distance·time. Place nodes by tool+click, drag to
  move, edit a route order, set speed & arrival mean, Run to read throughput/cycle time/transport
  share/utilisation. Persists into the shared study project at `project.model` (des-floor/v1). An
  `#example` link auto-loads a sample line.

**Verification:** `npm test` → **68/68** (62 existing + 6 new), existing suites green. Headless
render of `floor.html#example`: 5 nodes + 4 legs, no console errors; screenshot reviewed — on-brand.

**Scope:** linear path + instant transport only, as planned. No mover limits/blocking (M2), no
branching/assembly (M2b) yet. Engine/demo untouched.

**Next:** Milestone 2 — conveyor and worker-pool transport as constrained resources (queue/delay/block).

---

## 2026-06-07 — Phase 3.2: conveyor and worker-pool transport resources

**Done**
- Reworked the floor engine's movement core around an **occupancy/capacity model + a `settle()`
  fixpoint** (the advanced-engine pattern) so transport can block and back up. The instant +
  unbounded path is unchanged, so the Milestone 1 tests still pass.
- **Conveyor legs**: finite `cap` (max items in transit) and a speed; transit = length ÷ speed.
  When the downstream buffer is full the conveyor exit holds the item, the belt fills, and the
  **upstream resource blocks** (block-after-service) — items back up. A floor-wide conveyor default
  (cap/speed) applies to every conveyor leg.
- **Worker pool**: a shared `count` of movers at one speed; a move **seizes** a worker for the
  one-way trip, and when none is free the move waits in a **pending transport queue** (so too few
  workers saturate and queue). If the destination is full on arrival the worker waits (blocked)
  until space frees. **v1 simplification — empty return ignored** — and selecting workers in the UI
  **auto-logs it to the study's assumptions log** (typed SIMPLIFICATION, data C, sensitivity-flagged),
  integrating with the Phase 2 methodology.
- New transport stats in `metrics()`: per-resource `blockedFraction`, per-conveyor utilisation, and
  worker `{utilisation, avgQueue}`.
- UI: a **Transport · Movers** panel (Instant / Conveyor / Worker with their params), mover-aware leg
  rendering (conveyor = tracked dashed line; worker = dashed accent line with a small "W" marker),
  and a transport summary in the run results (worker util/queue, busiest conveyor, most-blocked
  resource).
- 2 new tests (worker-pool bottleneck; conveyor capacity/blocking). Engine additions stayed in
  `src/floor-engine.js`; existing engines/demo untouched.

**Verification:** `npm test` → **70/70** (62 existing + 8 floor). Headless render of the floor: no
console errors, Transport panel + three movers present; screenshot reviewed — on-brand.

**Next:** Milestone 2b — branching + assembly (multi-part routings + BOM matching), then Milestone 3
integration into the study project.

---

## 2026-06-07 — Phase 3 (model richness), stage A: per-element parameters + table

Stakeholder asked for the old engine's parameter depth on the floor: full statistical distributions
per station, per-leg transport configuration (click each element), and a table overview; and agreed
push/pull/demand belong in the Model (not Run & Analyse). Plan: (A) UI richness for what the floor
engine already supports, (B) port scrap + breakdowns, (C) port push/pull + supply/demand. This stage = A.

**Done (UI only; engine unchanged):**
- **Click any node** → inspector with a reusable **distribution editor** (all 7 distributions from
  `DISTS`, with parameter fields + live mean/SCV), machines, and a finite/infinite **input buffer**
  with capacity. Source nodes get an **interarrival distribution**; storage gets capacity.
- **Click any transport leg** → leg inspector to set its **mover (instant/conveyor/worker) and
  params independently** (per-leg overrides stored in `model.legs`), with "reset to default".
- **Transport defaults** panel (default mover, default speed, worker pool, conveyor default) for legs
  not individually set.
- **Table view** toggle: an overview of every resource (service dist, machines, buffer) and every
  leg (mover, params); rows click to select+edit.
- Migration: old `serviceMean` floor models upgrade to a full `service` distribution automatically.

**Verification:** `npm test` → 70/70 (engine untouched). Headless render of the floor: distribution
editor + inspector render, no console errors; screenshot reviewed — on-brand.

**Next (this work):** stage B — port scrap + breakdowns into `floor-engine.js` with UI + tests.

---

## 2026-06-07 — Phase 3 (model richness), stage B: scrap + breakdowns

Ported the two remaining per-station detractors from the original engine into `floor-engine.js`:
- **Scrap**: Bernoulli fallout at service completion (`scrap` fraction); a scrapped job leaves the
  system (counted, not completed). New `yield` and `scrapped` metrics; conservation is now
  `entered = completed + scrapped + inSystem`.
- **Breakdowns (preempt-resume)**: per-machine time-to-failure / time-to-repair distributions; a
  failure preempts the in-progress service (remaining work saved, completion cancelled via a
  version stamp), the machine goes down, and on repair the remainder resumes. New per-resource
  `downFraction`. Service won't start on a down machine.
- UI: resource inspector gains a **scrap fraction** and a **breakdowns** toggle with TTF/TTR
  distribution editors; run results show a **Yield** tile and **Down/Blocked** columns; the table
  overview flags scrap % and breakdowns.
- 2 new tests: scrap yield ≈ 1−p (+ conservation with scrap); breakdowns at A=0.8 cut throughput to
  ≈0.8 with ≈20% downtime.

**Verification:** `npm test` → **72/72**. Headless render: scrap + breakdown fields present, no
console errors.

**Next (this work):** stage C — port push/pull + supply/demand control into `floor-engine.js`.

---

## 2026-06-07 — Phase 3 (model richness), stage C: control & demand

Ported line-level control into `floor-engine.js` (placed in the Model, per the agreed decision —
Run & Analyse stays for experimentation):
- **Release control: push | CONWIP(cap)** — CONWIP caps the WIP *in the line* (jobs from release to
  the sink) and releases a new job as one leaves; push releases as supplied. Tracks `maxLineWip`.
- **Supply: stream | limitless** — stream uses the Source node's interarrival distribution;
  limitless feeds just-in-time (gated so it can't pile up at the source; pair with CONWIP or a finite
  first buffer).
- **Demand: instant | stream** — instant consumes at the sink; stream accumulates finished-goods
  inventory consumed by demand arrivals, with **fill rate** and **stockouts**; FG counts as in-system
  so conservation (`entered = completed + scrapped + inSystem`) still holds.
- UI: a **Control & demand** panel (push/CONWIP + cap, stream/limitless supply, instant/demand-stream
  with its own distribution editor); run results gain a control summary (control, max line WIP,
  supply, and — under demand stream — fill rate, stockouts, avg FG).
- 3 new tests: CONWIP caps WIP (push doesn't); demand conservation + fill rate; CONWIP+limitless
  holds the line full at the cap.

**Verification:** `npm test` → **75/75** (62 existing + 13 floor). Headless render: Control & demand
panel + full resource inspector present, no console errors; screenshot reviewed.

This completes the requested parameter-richness work (A distributions/buffers/per-leg + table,
B scrap/breakdowns, C control/demand). The floor now matches the old engine's modelling depth, with
per-element click-to-edit and a table overview. **Still pending (paused):** branching + assembly
(Milestone 2b) and the broader Phase 3 integration polish (binding floor params to conceptual
experimental factors).

---

## 2026-06-07 — Phase 3: compact UI + live playback

Stakeholder feedback: (1) the parameter panels made the page far too long; (2) running the sim just
produced a result — you couldn't *watch* it run or see elapsed time, unlike the old demo. Addressed
both (kept the new aesthetic; copied only the old demo's run *mechanism*):

- **Compact layout.** The right column is now a **tabbed panel — Inspect / Model / Results** — so only
  one section shows at a time instead of every panel stacked. Selecting a node/leg switches to Inspect;
  Model holds route + transport defaults + control & demand; Results holds the run summary. The page is
  now roughly canvas-height.
- **Live playback.** A real-time `requestAnimationFrame` loop advances a `simCursor` at a **speed**
  multiplier and steps the engine to that time (the proven old-demo pattern), rendering each frame:
  **jobs as tokens** that move along transport legs (interpolated by distance/time) and sit in
  queues/service, **station fill/border colour** for busy/blocked/down, a **progress sliver** on busy
  machines, and a **clock strip** (sim time, WIP, output, events). Controls: **Play/Pause, Step, Run to
  end, Reset, speed slider**. A `#play` deep-link opens a floor already running.
- Engine support (`floor-engine.js`): a live `jobs` map with a per-job `loc` tag
  (queue/service/transit{from,to,t0,t1}/pending/hold/fg), an `events` counter, and machine
  `startTime` for the progress sliver. No change to simulation logic — purely additive state for
  animation; all 75 tests stay green.

**Verification:** `npm test` → 75/75. Headless: controls + tabs render, no console errors; a
deterministic mid-run snapshot showed tokens in the busy Press/Inspect stations with the clock at
66.8 min / 4 WIP / 21 out / 160 events. Screenshots reviewed — compact and on-brand.

---

## 2026-06-08 — Phase 3: floor charm & UX polish

Stakeholder asks (all done in one pass): more charm, pickable resource symbols, thicker/more visible
lines & bigger parts, zoom, drop the leg length labels, allow typing a transport length, and a live
distribution mini-graph.

- **Resource symbols.** A curated set of 9 line glyphs (box, press, cut, weld, furnace, inspect,
  assemble, cpu, gear), pickable per resource in the inspector and drawn inside the node. (Glyphs are
  parsed in the SVG namespace via `DOMParser` — `innerHTML` on an inline-SVG `<g>` doesn't.)
- **Bigger, clearer graphics.** Larger resource/storage/endpoint nodes, thicker borders, thicker and
  darker transport legs; tokens enlarged. Resource shows a machine-count badge.
- **Zoom & pan.** viewBox-based zoom (− / % / + / Fit controls, mouse-wheel anchored at the cursor)
  and drag-to-pan on empty canvas in Move mode; `Fit` frames the content.
- **Removed leg length labels** from the canvas (they cluttered); length now lives in the leg inspector.
- **Typed transport length.** Each leg can take a hard-typed length (m) that overrides the placement
  distance (engine `legLen()` uses the override; clearing it reverts to Euclidean distance).
- **Live distribution mini-graph.** The distribution editor draws a sampled density preview that
  redraws on every parameter/type change (service, breakdown TTF/TTR, interarrival, interdemand).

**Verification:** `npm test` → 75/75 (engine change was the additive `legLen` override). Headless
renders show symbols inside nodes, the density graph, zoom controls, no leg labels, and no console
errors; screenshots reviewed.

---

## 2026-06-08 — Phase 3: floor visuals — manual End, histogram previews, neat Results, visible grid + scale bar

Stakeholder asked for four visual improvements to the floor (design rules from the charter /
DESIGN-LANGUAGE preserved throughout). All UI-only — no engine, `src/`, or test change.

- **Manual "End".** New playback control between *Step* and *Run to end*. Because the floor sim never
  empties its FEL under a stream of arrivals, the only way to "stop" was *Run to end* (a fast-forward to
  the event horizon). *End* now freezes the run at the moment on screen — it extends the area-method
  statistics to the watched instant (`sim.accumulate(simCursor)`), marks the run finished, shows the
  results, and the Play button becomes *Replay*. `metrics()` is valid at any instant, so the figures are
  consistent.
- **Histogram distribution previews.** Rewrote the shared `distGraph` from a filled density curve to a
  **bar histogram with a labelled value axis (lo · μ · hi) and a dashed ochre mean marker**. The old
  preview auto-scaled to percentiles with no labels, so changing e.g. an exponential's mean (a pure
  rescale) looked identical — "not dynamic". Now every parameter change visibly moves the bars, the μ
  marker, and the axis numbers. One change covers all five editors (service, breakdown TTF/TTR,
  interarrival, interdemand). Axis labels live in an HTML row beneath the SVG (the SVG uses
  `preserveAspectRatio: none`, which would distort embedded text).
- **Box-safe Results.** Added an adaptive figure formatter (`fmtNum` — more decimals for small values, a
  `k` suffix above 10 000) and scoped the Results tab (`#tab-results`): smaller KPI value with the unit
  allowed to wrap, a responsive 2-up tile grid, and `table-layout: fixed` with a 42%-width first column
  that truncates long names while numeric columns stay on one line. Nothing overflows the 340px panel
  regardless of magnitude.
- **Visible grid + scale bar.** Replaced the sparse 0.8px dotted grid with a faint **line** grid (5 m
  minor in `--line`, 10 m major in `--line-strong`) — more legible, still quiet (engineering-paper feel).
  Added a zoom-aware **scale bar** in the canvas corner: it picks a "nice" world length (1/2/5/10/… m)
  whose on-screen size stays ≤30% of the canvas and labels it, recomputed on every zoom/pan and on window
  resize. Wrapped the svg in a `.canvas-stage` so the zoom controls and scale bar anchor to the canvas box.

**Verification:** `npm test` → **75/75** (engine untouched). Drove the page headless via Chrome DevTools
Protocol: confirmed *End* stops mid-run (froze at 7.9 min, tab switched to Results, Play→Replay), the
histogram axis labels update with parameters (`1.01 · μ 2.00 · 3.75` for the example's lognormal), the
Results header reads "Resource" in full with no overflow, and the grid + "20 m" scale bar render on-brand.
Screenshots reviewed.

**Decision logged:** `docs/DECISIONS.md` (2026-06-08) — incl. the minor, recorded deviation from
DESIGN-LANGUAGE §7's literal "dotted grid" (now a faint *line* grid using the same hairline tokens).

---

## 2026-06-08 — Phase 3: clearer running parts — bigger tokens, live count tooltip, scrap drop animation

Stakeholder asked to make parts moving through the system clearer while a run plays. Three changes
(design rules preserved); one small additive engine hook, the rest UI.

- **Larger tokens.** Bumped the job-token radii in `jobPos` (service 5→8, transit 4→6.5, queued/held
  6) and widened their stacking offsets, so parts read clearly at a glance. Tokens are now
  `pointer-events: none` so they never block hovering the node beneath.
- **Live count tooltip.** Hovering any node *while a built run exists* shows a quiet raised-surface
  tooltip (`#floorTip`) with live counts, refreshed every animation frame: for a resource — **here**
  (queue + in-service + blocked), **being processed** (busy / machines), **waiting** (queue), plus
  blocked/down when non-zero; for source/storage — staged/holding vs capacity; for the sink — shipped.
  A second `pointermove` listener (`onHover`) reads the live `sim` state; it bails during drag/pan and
  while the model is dirty (`needsBuild`).
- **Scrap drop animation.** A scrapped part now turns red and **falls straight down, fading out**
  (DESIGN-LANGUAGE §6 "scrapped dot fades out on drop"), instead of vanishing. The engine
  (`floor-engine.js`) gained an additive `scrapLog` of `{node, t}` recorded in `scrap()` from the job's
  service location — **no count/logic change**. The animation layer spawns a `.tok-scrap` circle
  (`--scrap` red, CSS `scrap-drop` keyframe, self-removes on `animationend`) for each new scrap as the
  cursor passes it, **only during live playback** (bulk scraps from *Run to end* are skipped, capped at
  12/frame), and honours `prefers-reduced-motion`.

**Verification:** `npm test` → **75/75** (engine change additive; existing scrap/conservation tests
green). Drove the page headless via CDP with the example's Press set to scrap 0.6 at 45× speed:
confirmed up to 10 `.tok-scrap` drop tokens spawning live, and the Press hover tooltip reading
"here 4 · being processed 1/1 · waiting 3" and updating. Screenshots reviewed — red parts drop below the
machine and fade; tooltip is on-brand (serif name, mono figures, hairline + barely-there shadow).

**Decision logged:** `docs/DECISIONS.md` (2026-06-08).

---

## 2026-06-08 — Phase 3: capacity cells on machines + more dramatic scrap drop

Two follow-up tweaks to the running-floor visuals (UI-only; engine untouched; 75/75 tests green).

- **Capacity cells on the machine.** Echoing the legacy demo's per-machine `M1 M2 …` boxes, each resource
  node now shows a neat centred row of small boxes — **one per parallel machine** (capacity), drawn empty
  even at rest so capacity is legible, and **"checked" (filled, state-coloured: busy/blocked/down)** when
  that server is in use during a run. Restructured the resource node interior (smaller top glyph, name
  moved up, cells row, thin overall progress sliver kept at the bottom); the old `×N` count badge now only
  appears when machines exceed the 8 cells shown. Cells update each frame in `renderFrame` from
  `sim.res[id].machines[i]` state.
- **More dramatic scrap drop.** Lengthened the scrap animation (700 ms → 1200 ms) and made it read as a
  destruction: a brief **pop** (scale 1.5) then a longer **fall** (70 px) while **shrinking to nothing and
  fading out**. Uses `transform-box: fill-box` so the scale pivots on the token's own centre;
  `prefers-reduced-motion` shortened to 250 ms.

**Verification:** `npm test` → **75/75**. Drove the page headless via CDP with Press set to 3 machines +
scrap 0.4 at 30×: confirmed Press renders 3 cells (state snapshot `cap-cell · cap-cell busy · cap-cell`),
Inspect renders 1, and the scrap drop spawns a falling cascade. Zoomed screenshot reviewed — cells are
clean rounded boxes (checked = filled, empty = hairline), and the scrap part pops then drops and fades.

**Decision logged:** `docs/DECISIONS.md` (2026-06-08).

---

## 2026-06-08 — Phase 3: remove "Run to end"; categorised symbol/shape picker for resources & storage

Two stakeholder tweaks (UI-only; 75/75 tests green).

- **Removed "Run to end".** The fast-forward-to-horizon control is gone from the playbar (and its
  handler/function removed); the run is now driven by Play / Step and stopped with **End**. Empty-state
  result messages updated ("Press Play, then End …").
- **Categorised symbol/shape picker.** Reworked the symbol library into `{ label, cat, path }` entries
  grouped into **Manufacturing** (press, cut, weld, furnace, assemble, CNC, machining, box), **Service**
  (operator, workstation, service desk, cart, checklist, inspect/QA, shipping), and **Abstract · VSM**
  (square = process, triangle = inventory, circle = operation, diamond = decision, hexagon). The picker
  now renders grouped rows with category labels and is shared by **both resources and storage** (storage
  previously had no symbol). Storage renders its chosen shape inside its brackets and **defaults to the
  VSM inventory triangle**; resources keep the box default. Migration backfills the storage symbol.

**Verification:** `npm test` → **75/75**. Drove the page headless via CDP: playbar reads
"Play | Step | End | Reset"; the picker shows the three category groups with 20 symbols total; clicking
through **all 20** confirmed each glyph parses and renders on the node (no `parsererror`, non-empty
glyph); the WIP storage renders the inventory triangle. Screenshots reviewed — grouped picker and storage
shape are on-brand.

**Decision logged:** `docs/DECISIONS.md` (2026-06-08).

---

## 2026-06-08 — Phase 3: translucent transport legs, viewBox-filling grid, visible storage box

Three floor-visual refinements (UI-only; 75/75 tests green).

- **Transport legs recede.** The movement lines are now translucent (instant opacity .3, conveyor .4,
  worker .45) and thinner, so they sit quietly behind nodes, tokens, and text instead of competing with
  them (they were already behind in z-order; this is the visual weight). A selected leg brightens to the
  petrol primary at .85 for editing.
- **Grid fills the whole canvas.** Replaced the fixed 820×480 line grid (which left empty space when
  zoomed/panned) with SVG tiling **patterns** (5 m minor / 10 m major) painted onto two background rects
  whose geometry is updated to the live viewBox in `updateGrid()` (called from `setViewBox`). Because the
  patterns are anchored to user space, the grid stays aligned while always filling whatever is visible —
  verified the rect grows from 860×503 at 100 % to 2050×1200 when zoomed out.
- **Storage looks like a (distinct) machine box.** Storage was just two bracket strokes — faint and a
  poor click/hover target. It now renders a filled rounded rect like a resource but **distinct: subtle
  `surface-2` fill + a dashed border** (solid petrol when selected), with the chosen shape, name, and
  `cap N` inside. Full surface = easy to see, click, and hover (the live-count tooltip already handles
  storage).

**Verification:** `npm test` → **75/75**. Drove the page headless via CDP: confirmed the grid background
rect tracks the viewBox at 100 % and zoomed-out (fills the canvas, scale bar auto-set to 50 m), and
reviewed screenshots — legs are faint and in the background, the WIP storage reads as a dashed box with
the inventory triangle, distinct from the solid machine boxes.

**Decision logged:** `docs/DECISIONS.md` (2026-06-08).

---

## 2026-06-08 — Fix: "simulation stops generating after ~200 t" (limitless-supply flood + token-render cap)

**Trigger:** stakeholder reported the floor sim suddenly stops generating units from the input after
~200 time units.

**Diagnosis (empirical).** Traced the engine headlessly: with the **stream** example, arrivals never
stop — `entered` climbs steadily (62 at t=200 → 703 at t=2000) and an `ARRIVE` is always queued; the live
UI ran smoothly past t=200 with no stall or console error. The fault appeared only with **Raw supply =
Limitless**: with `push` control and an **infinite first buffer**, `firstCanAccept` allowed a release on
essentially every event (the "one staged at source" gate is emptied immediately by instant boarding into
the unbounded buffer), so WIP exploded — `entered` hit the 5,000,000 guard with WIP ≈ 4,999,330. In the
browser that means the animation tries to draw tens of thousands of tokens and chokes, which reads as
"it stopped." (limitless + worker transport flooded similarly.)

**Fixes (engine + UI).**
- **`src/floor-engine.js` — bound limitless release.** `firstCanAccept` now, under non-CONWIP control
  with an infinite first buffer, only releases while the first station's occupancy is below
  `machines + 1` — a shallow ready queue that keeps it fed without flooding. Finite buffers are respected
  as before; CONWIP is exempt (its cap already bounds WIP). After the fix all limitless variants are
  bounded (limitless+push: entered 1498 / WIP 4 over t=3000, was 5 000 000 / ~5 000 000).
- **`app/js/floor.js` — cap rendered tokens.** `renderFrame` draws at most 150 job tokens regardless of
  WIP, so a runaway or merely unstable line can never freeze the animation; the clock's WIP still shows
  the true count.

**Verification:** `npm test` → **76/76** (new regression test: limitless+push on an infinite buffer keeps
`maxLineWip ≤ 8` while still producing; existing CONWIP/limitless tests unchanged). Re-ran the multi-config
diagnostic — every supply/control/transport combination now stays bounded. UI smoke test (2.5 s of play):
output advancing, no console errors.

**Decision logged:** `docs/DECISIONS.md` (2026-06-08).

---

## 2026-06-08 — Phase 3: on-canvas legend + collapse queued/stored units to one marker

*(Done on another machine; synced and folded into the collective docs here. Originally also captured in
`docs/SESSION-2026-06-08-floor-ux.md`, which JOURNAL/DECISIONS now mirror as the canonical record.)*

- **Legend under the canvas** (`app/floor.html` + `floor.css`, `.floor-legend`): a small key — Machine
  (solid box) · Storage (dashed box) · capacity-cell states Busy/Blocked/Down/Free · Unit (teal dot) ·
  Waiting/stored (grey dot ×N) · Scrapped (red dot) · Transport (faint line) · "hover for live counts".
  Pure markup, no JS.
- **Collapsed queue/stored marker** (`app/js/floor.js`): units in service/transit still draw as individual
  teal dots (capped at 150); units that are queued / pending / held / finished now collapse to a **single
  grey dot + a `×N` count** per location (`queueLoc()`, `queueEls`, `.qmark`/`.qcount`). A long queue or a
  flooded line reads as e.g. "• ×18" instead of painting the canvas with dots; true WIP stays on the clock
  and via hover.
- **Verification:** headless — a 20-unit queue rendered as 2 active dots + one grey "×18"; legend 11 items;
  no console errors. `npm test` → 76/76 (UI-only).

## 2026-06-08 — Fix: storage never accumulated — instant transport is now capacity-aware

*(Other-machine work, synced + folded in. Decision in `docs/DECISIONS.md` 2026-06-08.)*

- **Bug:** standalone storage nodes never held stock, whatever the caps. Root cause: instant transport
  was *uncapacitated* — `board()` always moved a part into transit and, if the destination buffer was
  full, dropped it into a hidden `arrivalBlocked` limbo at the destination's door, so finite buffers/
  storage caps created no back-pressure (confirmed: with a finite downstream buffer, 235 parts piled in
  `arrivalBlocked` while storage stayed 0).
- **Fix (`src/floor-engine.js`):** instant transport is now **capacity-aware** — a part departs only if the
  destination `canAcceptAt()` (current holding + reserved-in-transit `incoming` < cap); a slot is **reserved**
  for the trip so the `settle()` fixpoint can't over-fill a finite buffer. A full downstream now blocks and
  WIP backs up into the upstream storage (and the source). Infinite buffers (the common case) behave exactly
  as before, so all prior tests pass.
- **To see storage fill:** the storage's *downstream* must be capacity-constrained (give the next resource a
  finite input buffer); with an infinite downstream, WIP correctly piles in that resource's own queue.
- **Verification:** `source→storage(cap 5)→r1(finite buf 3, slow)→sink` → storage fills to 5,
  `arrivalBlocked` = 0, conservation holds. New regression test; `npm test` → **77/77**.

## 2026-06-08 — Phase 3: bottleneck + buffer demo (`#example2`)

*(Other-machine work, synced + folded in.)*

- `loadExample2()` + a `#example2` deep link (auto-loads and auto-plays): **Raw in → Cut (fast) → WIP buffer
  (storage, cap 8) → Press (slow bottleneck, finite input buffer cap 2) → Ship.** Press can't keep up and its
  buffer is finite, so stock piles in the WIP buffer (fills to cap 8 → grey "×8" marker), Cut blocks, and the
  line backs up — a ready-made illustration of the capacity-aware storage/finite-buffer behaviour and the
  machines-vs-capacity point. Verified headless: WIP buffer reaches ×8, Cut shows blocked, no errors.

## 2026-06-08 — Phase 3.4 · Milestone 0: batch-processing design note (PAUSED for review)

- Audited the single-job lifecycle in `src/floor-engine.js` (seize in `settle()` step 5 → `onComplete`
  hold → `board()` hand-off; `occ`/buffer/`wip`/breakdown mechanics) and how a resource is defined/edited in
  the new app (`app/js/floor.js`: node `service`/`buffer`/`scrap`/`brk`, `inspectNode`, `buildRunModel`,
  `ensureWorkerAssumption`).
- Proposed the **process-batch + setup** model: `batch:{size B, setup ts}` on a resource; service dist
  reinterpreted as **whole-batch** time; strict full-batch start; setup once per batch; B finish together
  and continue individually. Engine branches only when `r.batch` is set (single-job path untouched →
  regression). Machine holds `m.batch[]`; one COMPLETE per batch; setup tracked by `m.setupEnd` timestamp.
- **Deadlock handling:** engine `metrics.deadlock` (FEL drained with WIP>0) + per-resource
  `batchesStarted`/`waitingForBatch`; UI static guards for **CONWIP<B** and **finite-buffer<B**. Never
  silently hangs.
- Wrote `docs/PHASE-3-4-DESIGN.md` and a DECISIONS.md entry (D1–D7). Theory link for PRINCIPLES (deferred to
  the build): setups inflate effective process time `te = t0 + ts/Ns`; wait-to-batch is *control*
  variability (theory-notes §4.6). **No engine/UI/test code yet — PAUSED for stakeholder confirmation of the
  semantics and deadlock handling before Milestone 1.**

## 2026-06-08 — Phase 3.4.1: batch processing in the engine

- Stakeholder ratified the Milestone-0 design (setup = constant; build as proposed). Implemented batch mode
  in `src/floor-engine.js` only — legacy engines and the single-job path untouched.
- A resource with `batch:{size B, setup ts}` accumulates jobs; `settle()` seizes B at once when
  `queue ≥ B`, pays `ts` then a whole-batch process time `sample(service)` (one COMPLETE per batch via
  `m.batch[]` + `m.setupEnd`), then `onComplete` rolls scrap per-part and the board loop releases each
  survivor individually (machine freed only when all have left). `occ()` now counts actual jobs present so
  finite buffers account for a B-unit in-process batch (non-batch unchanged → regression).
- Deadlock surfaced, never hung: `run()` sets `metrics.deadlock` when the FEL drains with WIP>0; `metrics`
  reports per-resource `batch:{size,setup,batchesStarted,waitingForBatch}`.
- New `tests/floor-batch.test.js` (7 tests): full-batch start + capacity-limited throughput, setup-once,
  finish-together, conservation, Little's Law (wait-to-batch counted), no-batch regression, starvation
  deadlock surface. Added to the `npm test` list. **`npm test` → 84/84.**

## 2026-06-08 — Phase 3.4.2: batch processing UI and floor visualisation

- Inspector (`app/js/floor.js` `inspectNode`): a "Process parts in batches" toggle on a resource; when on,
  exposes **Batch size B** (min 2) and **Setup time (once per batch)**, relabels the service editor
  **"Whole-batch process time"** with plain-language helper text, and shows a static-guard **warning** when
  a batch can provably never form (finite input buffer < B, or CONWIP cap < B).
- Floor (DESIGN-LANGUAGE §7, quiet/diagrammatic, no glow): a batch resource carries a small mono badge above
  the box that reads **N/B while accumulating → "setup" → "processing N"**; the progress sliver tracks the
  processing phase only (flat during setup). Hover tooltip and the table-view summary also show batch state.
- Plumbing: `batch:{on,size,setup}` added to resource node defaults (creation + migration, defensive in the
  inspector for example nodes) and threaded through `buildRunModel()` to the engine. New CSS `.batch-badge`
  and `.floor-warn`. No build step (Charter §4). `npm test` → **84/84** (engine unchanged this milestone).

## 2026-06-08 — Phase 3.4.3: integrate batch into the study project

- Persistence: `batch:{on,size,setup}` rides on the resource node, so it is saved/loaded with the
  project (model is stored wholesale; `project.js` migrate passes `p.model` through; floor.js fills
  defaults).
- Assumptions log: toggling batch on (or changing B) auto-logs/refreshes a simplification
  `a_batch_start` — "batch stations require a FULL batch to start (strict wait-to-batch, no timeout);
  setup once per batch; process time is whole-batch" — with the control-variability rationale
  (theory-notes §4.6), data category C, sensitivity-flagged (Robinson: document simplifications).
- Experimental factor: an inspector button adds **batch size** as a conceptual-model experimental
  factor (`newFactor`, bound by `resource:<id>:batch.size`, de-duped) for later analysis phases.
- Static-deadlock guard now **blocks Play/Step**: `buildSim()` refuses with an explanation when a
  batch can provably never form (finite buffer < B, or CONWIP < B); the results panel surfaces a
  runtime **deadlock** (drained FEL with WIP>0) and per-station batch counts (batches done / waiting).
- PRINCIPLES.md: added the batch theory (process vs transfer batch; `te = t0 + ts/Ns`; wait-to-batch
  is control variability — theory-notes §4.6). `npm test` → **84/84**.

## 2026-06-08 — Phase 3.4: batch demo example + deep link (#example3)

- Added `loadExample3()` and a `#example3` deep link (auto-loads + auto-plays, like `#example2`): Raw in →
  Prep (fast, single) → **Heat-treat furnace (batch B=4, setup 3, whole-batch process)** → Ship. Tuned
  stable on purpose (arrival ~0.40/min < furnace capacity 4/(3+5)=0.5/min) so it cycles cleanly:
  accumulate to 4 (N/4 badge) → setup → process all 4 → release → repeat. Selects the furnace on the
  Inspect tab and resets control to push/stream so a leftover CONWIP<B can't block the demo; it also
  auto-logs the batch simplification (shows the methodology integration live).
- Verified headless through `FloorSim` (mirroring `buildRunModel`): 501 batches → 2004 completed (multiple
  of 4), throughput 0.40/min, furnace util 80.5%, deadlock false. Live at
  `app/floor.html#example3`. `npm test` → 84/84.

## 2026-06-08 — Phase 3.5 · Milestone 0: process-model audit + engine-strategy design note (PAUSED for review)

- Audited the new floor engine vs the validated `advanced-engine.js`: floor engine is **single-product**
  (`mainPart`) with transport+batch+blocking+breakdowns+scrap but **no multi-part/BOM/assembly/per-product
  demand/per-product CONWIP**; `advanced-engine` has all of those but is non-spatial. Confirmed with the
  stakeholder that the prompt's **Phase 3.6 transport revision (AGV/operator coupling) does not exist** —
  ignored; only the three movers (instant/conveyor/worker) + batch are preserved.
- Proposed strategy (E1–E7): **port** advanced-engine's multi-part/BOM/assembly/supply-demand/control logic
  **into** `floor-engine.js` additively (one engine), reusing the validated algorithms; transport **gates**
  assembly (component on-hand only after its last leg arrives); per-product demand keeps its **own** dist;
  dependent-demand explosion preserved; batch×assembly orthogonal but not combined on one node (v1); parts
  capped at 10; backwards compatible with today's single-part model.
- Wrote `docs/PHASE-3-5-DESIGN.md` (supersedes the never-built `PHASE-3B-DESIGN.md`) + a DECISIONS.md entry.
  Theory link for PRINCIPLES (deferred to the build): §4.6 Law of Assembly Operations (fork-join); dependent
  demand propagates through the BOM. **No engine/UI/test code yet — PAUSED for confirmation of the engine
  strategy before Milestone 1.** `npm test` unchanged (84/84).

## 2026-06-08 — Phase 3.5.1: process-model engine capability (parts, BOM, routing, supply/demand, control)

- Ported the validated multi-part / BOM / assembly / supply-demand-control logic from
  `src/advanced-engine.js` INTO `src/floor-engine.js` as an additive **process mode** (one engine).
  Mode auto-detects: >1 part, any BOM, or a `demand[]` array → process path; a lone produced part with
  no BOM stays on the **byte-identical single-part path** (the 84-test regression guard).
- Lifted (adapted to the floor's job/transit flow): `canAssemble`, consume-on-start, round-robin feed
  (`rrFeed`/`rrPtr`), per-source arrival streams, per-product demand streams (each its **own** dist),
  per-product CONWIP with the dependent-demand explosion (`buildPullOrder`/`computePullNeeds`), and
  `pullSatisfy`/`extTurn` fairness. **Transport gates assembly**: a component is on-hand only after its
  last leg DELIVERS it to the assembly node (`admit` deposits a component to `inventory[pid]` instead of
  queueing; the node's own product is processed normally). Batch, blocking, breakdowns, scrap, conveyors,
  workers all coexist unchanged.
- Flood guard for limitless supply: a component deposits straight to inventory (never occupies a queue),
  so feed is bounded by its **pipeline** (on-hand + in-flight ≤ a shallow buffer), not resource
  occupancy — this fixed an initial runaway. Parts cap (10) surfaced via `metrics.partsCapExceeded`.
- New `tests/floor-process.test.js` (9 tests): assembly-needs-all-components/no-negative-inventory, BOM
  qty respected, conservation with assembly, per-product demand uses its own dist, per-product CONWIP
  bounds, shared-component fairness, Little's Law incl. transport, **multi-level dependent demand**
  (product-and-component not starved), and a single-part-with-demand[] regression. Added to `npm test`.
  **`npm test` → 93/93** (84 prior unchanged + 9 new).

## 2026-06-08 — Phase 3.5.2: guided model-builder UI

- Authoring UX confirmed (per-part ordered routes + Parts panel + BOM editor). Refactored `app/js/floor.js`
  from a single `routeOrder` to **per-part routes**: `model.parts[]` each with `{name, kind, route, bom,
  demand}` + an `activePart`; legacy single-route models migrate to one product part (basics-first default
  unchanged). The active part's route uses the existing route-list UI; the floor draws the **union** of all
  parts' legs (off-active-route legs dimmed).
- New **Parts panel** (Model tab): add/select/remove parts (capped at 10), set name + kind
  (Product/Made/Bought), a **BOM editor** (component × qty rows → turns a part into an assembly), and
  **per-product demand** (own interarrival, order qty, and CONWIP limit under pull). A resource inspector
  gains an **Assembly station** toggle and a **Delete node** button; the route ✕ now removes a node from
  *this* part's route (node stays placed; add it back via "+" chips).
- `buildRunModel` emits the legacy single-part shape for the basics-first case (1 part, no BOM, push, no
  demand → byte-identical pre-3.5 behaviour) and the multi-part process shape otherwise (per-part routing +
  arrival from the source node + BOM; `demand[]` per product). Control panel: push/CONWIP + supply, with
  demand moved per-product. Results panel gains a per-part table (TH / cycle / on-hand / fill).
- New assembly demo `#example4` (Widget = 1 Body + 4 Bolts; fork-join at Assemble). Headless check of the
  emitted run-model: 1960 widgets, bolts consumed = 4× widgets, conservation holds, no deadlock. Engine
  unchanged → `npm test` **93/93**. CSS for the parts panel / BOM rows / route chips / dimmed legs.

## 2026-06-08 — Phase 3.5.3: integrate process model into the study project

- Persistence: the process model (`model.parts[]` with kind/route/bom/demand, assembly flags, activePart)
  rides on `project.model`, saved/loaded with the Phase-2 study; `ensureModel` migrates older saves.
- Conceptual-model binding (Robinson: declare what you'll vary and measure). Reusable "+ as experimental
  factor" buttons (de-duped by a stable `bindingHint`) now sit on: resource **capacity** (machines), batch
  size, per-product **demand rate**, and per-product **CONWIP** limit. A Results-panel button **declares the
  standard responses** (throughput, avg WIP, cycle time, fill rate) so the analysis phase measures exactly
  what the student declared. Adding a BOM auto-logs the fork-join **assembly-synchronisation** assumption.
- PRINCIPLES.md: assembly = fork-join (Law of Assembly Operations, §4.6); dependent demand propagates
  through the BOM with fair sharing of scarce components (§4.6–4.7); each demand stream is independent (§4).
- `npm test` → **93/93** (engine unchanged this milestone).

## 2026-06-08 — Floor UX: explicit click-to-route + Parts manager modal

- **Bug:** placing any node auto-appended it to the active part's route, so dropping multiple sources
  (for different purchased components) chained them into one route with spurious legs — "they just link
  together." **Fix:** placement no longer routes anything.
- **Routing is now explicit (stakeholder pick): click nodes on the canvas in order.** A new **Route**
  palette tool — while active, clicking placed nodes appends them to the *active part's* route (click the
  last again to undo); nodes show their route-order number; legs draw as you click. Plus an
  **Auto-route ↦** shortcut (all placed nodes, left→right) for the simple single-line case, and the
  existing +chips. Each part's route is independent, so separate sources never auto-connect.
- **Parts manager modal (stakeholder pick):** the cramped inline Parts editor moved into a roomy
  pop-up (parts list + per-part editor: name, type, BOM rows, demand, route summary). The side panel is
  now a compact parts summary with **+ Add part** and **Manage parts…**. Name fields update in place
  (no focus-stealing rebuild). Engine untouched → `npm test` 93/93.

## 2026-06-09 — Fix: missing `newResponse` import broke "Declare these as study responses"

- **Bug (found during a code read-through):** `app/js/floor.js` `addStandardResponses()` calls
  `newResponse(w)` (line 948), but the module's `project.js` import only pulled in
  `load, save, uid, newAssumption, newFactor` — `newResponse` was never imported (it *is* exported
  from `app/js/project.js`). So clicking **"Declare these as study responses"** in the floor Results
  panel threw a `ReferenceError` and the Phase-3.5.3 study-integration step (declaring throughput /
  WIP / cycle time / fill rate as conceptual-model responses) silently did nothing.
- **Fix:** added `newResponse` to the import in `app/js/floor.js`. One line; no engine, behaviour, or
  schema change.
- **Verification:** `node --check` on `floor.js` + `project.js` clean; `npm test` → **93/93**
  (engine untouched — this is UI-only and not covered by the Node test suite, which is why it slipped
  through). Confirmed `newResponse` has no local definition in `floor.js` and is genuinely exported by
  `project.js`, so it was a real missing import, not a sync artefact.

## 2026-06-09 — Phase 3.5 demo: `#example5` — 3-level BOM with a sub-assembly that is also sold

- Added `loadExample5()` + a `#example5` deep link (auto-loads + auto-plays, like the other demos):
  the **deepest model the current engine supports**. A **Pump** (sold) = 1 **Motor** + 2 **Housing**;
  the **Motor** = 1 **Rotor** + 4 **Magnet** — and the **Motor is itself sold independently** as a
  spare (its own demand stream). BOM levels: Pump → Motor → {Rotor, Magnet}; Housing/Rotor are
  fabricated leaves, Magnet is bought-in. Two assembly stations (Motor assy, Final assy), spread out
  so **transport gates assembly** (a component is on-hand only after it travels to its assembler).
- Run under **CONWIP (pull) + limitless supply**, so it exercises every hard path at once: the
  dependent-demand explosion (`computePullNeeds` netting external + dependent demand through the BOM),
  a **part that is both product and component** (Motor), and the **`extTurn` fairness** that shares the
  scarce Motor shelf between Pump assembly and the Motor spares demand — i.e. the exact behaviour the
  `floor-process.test.js` "multi-level dependent demand" test guards, now visible on the floor.
- Tuned deliberately under-loaded so it cycles cleanly (no starvation/flood). UI/data only — no engine,
  schema, or behaviour change; `buildRunModel` already emits this shape.
- **Verification:** headless `FloorSim` run mirroring `buildRunModel` over 3 seeds @ t=20 000 — **no
  deadlock**; Pump fill ≈100%, **Motor fill 100%** (the sub-assembly is genuinely sold); exact BOM
  ratios (housing = 2 × motor; magnet = 4 × rotor); every Motor produced is either consumed by a Pump
  or sold (perfect accounting); headline product throughput ≈ 0.17 pumps/min (matches the ~1/6 min
  demand). `node --check` clean; `npm test` → **93/93** (engine untouched).
