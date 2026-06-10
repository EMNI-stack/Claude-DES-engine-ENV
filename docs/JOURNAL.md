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

## 2026-06-09 — Phase 3.5 demo: `#example5` — 3-level BOM with a sub-assembly that is also sold (two sinks)

- Added `loadExample5()` + a `#example5` deep link (auto-loads + auto-plays, like the other demos):
  the **deepest model the current engine supports**. A **Pump** (sold) = 1 **Motor** + 2 **Housing**;
  the **Motor** = 1 **Rotor** + 4 **Magnet** — and the **Motor is itself sold independently** as a
  spare (its own demand stream). BOM levels: Pump → Motor → {Rotor, Magnet}; Housing/Rotor are
  fabricated leaves, Magnet is bought-in.
- **Two products → two sinks (redo per stakeholder).** First cut deposited finished Motors at Final assy
  and sold them invisibly from the shared shelf; the stakeholder asked that the sold sub-assembly have
  its own output. Re-laid out as **two parallel lines**: the Pump line ends at **"Pumps out"**, the
  Motor line ends at its own **"Motors out (spares)"** sink. Finished Motors land on the **global
  per-part Motor inventory**, from which the Motor demand stream sells some and Pump assembly pulls the
  rest. (Engine note: component inventory is a *global per-part pool*, not per-location, and a part has
  one route — so there is no physical leg from the Motor line into Final assy; the Pump assembler draws
  Motors from the shared pool. The other three component links — Housing→Final, Rotor→Motor,
  Magnet→Motor — are physical and **transport-gated**.)
- Run under **CONWIP (pull) + limitless supply**, exercising every hard path at once: the
  dependent-demand explosion (`computePullNeeds` netting external + dependent demand through the BOM),
  a **part that is both product and component** (Motor), the **`extTurn` fairness** that shares the
  scarce Motor pool between Pump assembly and the Motor spares demand, **two demand streams + two
  sinks**, and per-product CONWIP — the exact behaviour `floor-process.test.js` "multi-level dependent
  demand" guards, now visible on the floor.
- Tuned deliberately under-loaded so it cycles cleanly. UI/data only — no engine, schema, or behaviour
  change; `buildRunModel` already emits this shape.
- **Verification:** headless `FloorSim` run mirroring `buildRunModel` over 3 seeds @ t=20 000 — **no
  deadlock**; Pump fill ≈100% **and** Motor fill ≈100% (the sub-assembly genuinely sells from its own
  sink/stream); exact BOM ratios (housing = 2 × motor; magnet = 4 × rotor); of ~5000 Motors produced,
  ~1670 sold as spares + ~3340 built into Pumps = produced (perfect split, no double-count).
  `node --check` clean; `npm test` → **93/93** (engine untouched).

## 2026-06-09 — Floor: make the BOM visible + colour the flow (part colours · BOM inset · Flow ledger)

**Trigger:** with assembly components pooled globally (no drawn leg from a sub-assembly into its
parent assembler), the stakeholder couldn't *see* the structure or follow which part goes where —
"I can't see the connections." A design change to make multi-part flow legible.

**Done (UI only — no engine/schema/behaviour change):**
- **Per-part colours, everywhere.** Extended the categorical palette to 10 (`--c1…--c10` in
  `design-system.css`). A stable colour per part (by position in `model.parts`), shared by the parts
  panel, the BOM tree, the routes, the run ledger, and the **job tokens** — a colour means one part
  across the whole UI. (Also fixes the parts-panel dots, which previously referenced undefined
  `--c4…--c6`.)
- **BOM inset on the canvas.** A small structural map pinned top-left (`#bomInset`) showing the
  assembly tree (roots = top-level products; components indented with the consumed `×qty`; sold parts
  marked). A **magnify ⤢** opens a modal (`#bomModal`) with the full tree **and** each part's physical
  **route** (colour-coded) — the stakeholder-chosen "BOM tree + route list". Shown only for multi-part /
  BOM models; hidden for the basics-first single-part default.
- **Coloured units while running.** Job tokens are filled with their part colour (solid = in
  service / moving); waiting/stored units now draw as a part-coloured **ring + ×N**, split per part
  per location (stacked) instead of one grey dot. Legend updated.
- **Flow ledger (new "Flow" tab), by location** (the stakeholder-chosen organisation): a live table of
  every station / transport leg / the on-hand shelf and which parts (with counts, in colour) are there
  right now. Reads the running `sim`; refreshed from `renderFrame`, throttled to ~4×/s.

**Verification:** `node --check` clean; `npm test` → **93/93** (engine untouched). Served the app over
a local HTTP server and drove **headless Chrome** (screenshots reviewed): `#example5` renders the BOM
inset (Pump → Motor ×1 → Rotor ×1 / Magnet ×4, Housing ×2) with colour swatches, coloured tokens flow,
both sinks present, no console errors; the Flow tab populated live and correctly — Mill ● Housing ×2,
Lathe ● Rotor ×1, in-transit legs (Mill→Final, Lathe→Motor), and On-hand shelf ● Magnet ×5, each in its
part colour. On-brand with the design language (hairline, muted palette, no glow).

**Design decision logged:** `docs/DECISIONS.md` (2026-06-09) — incl. the two stakeholder-chosen forks
(magnified inset = BOM tree + route list; ledger = by location).

## 2026-06-09 — Floor: draw the BOM pull-dependency + show the split rule (connect the lines)

**Trigger:** even with colours + the BOM inset, the stakeholder found it unintuitive that in `#example5`
the Motor line and the Pump line **don't visually connect**, and that a sub-assembly's output **splits**
(some sold as spares, some pulled into the parent) with no on-floor indication of that or its rule.

**Confirmed first: the engine is correct, not changed.** Re-verified the split is real and exact —
finished Motors divide between spares demand and Pump assembly with fair (alternating / `extTurn`)
sharing, and the accounting balances. The gap was purely *visual*: a component consumed via the global
per-part inventory pool has no routed leg into its assembler, so the dependency was invisible.

**Done (UI only — no engine/schema/behaviour change):**
- **BOM pull-dependency links on the floor.** For every BOM edge where the component does **not**
  physically route into the assembler (it finishes elsewhere and is pulled from the shared shelf), draw
  a **dotted, part-coloured arrow with a `×qty` label** from the component's last real node to the
  assembler. In `#example5` this is exactly the missing **Motor assy → Final assy** link — the two lines
  now connect. Where a component *does* route into the assembler (Housing→Final, Rotor/Magnet→Motor) the
  existing solid leg already shows it, so no duplicate link is drawn. Arrowheads (which transport legs
  never have) keep the two languages distinct; new legend entry added.
- **Split rule made explicit.** A part that is both sold and a component is tagged **"shared"** in the
  BOM tree; the inset carries a footnote ("dotted ▸ = pulled into assembly from the shared shelf; shared
  parts split between their own demand and assembly — fair share"); and the magnified modal's routes
  panel spells out the rule per shared part ("↳ split: sold as spares ⇄ pulled into Pump — shared fairly
  (alternating)").

**Verification:** `node --check` clean; `npm test` → **93/93** (engine untouched). Headless-Chrome
screenshots of `#example5` reviewed: the dotted Motor-coloured arrow runs Motor assy → Final assy with a
`×1` label and arrowhead; the inset shows "Motor ×1 · sold · shared" + the footnote; the magnified modal
shows the per-part split rule. On-brand (dotted, muted, no glow).

**Decision logged:** `docs/DECISIONS.md` (2026-06-09).

## 2026-06-09 — UI authoring self-test (mouse+keyboard) + a from-scratch build guide

**Goal (stakeholder):** prove the varied scenarios — push/pull, parameter values, batch,
bottleneck/blocking, multi-part assembly, transport — are **actually buildable with mouse and
keyboard**, not just via the `#exampleN` loaders; and write down how to build the current example
(`#example5`) from scratch.

**Done:**
- **`tests/ui/authoring-selftest.html`** — a browser/headless self-test that drives the *real*
  floor UI through simulated **pointer + keyboard** events (palette tool + click-to-place via
  `PointerEvent` with SVG-CTM-mapped coordinates; typing into inputs via `input` events; the Route
  tool; toggles/segmented controls; the Parts-manager modal incl. BOM rows; per-leg mover change),
  then asserts against the **persisted model** (`localStorage des-study/v1`) and the live clock /
  results. Six scenarios: (S1) push line + params + routing; (S2) push dynamics — arrival rate
  drives WIP; (S3) finite-buffer bottleneck → blocking; (S4) batch (B + setup); (S5) multi-part
  3-component assembly authored via the Parts manager + assembly toggle + per-part routes under
  pull/limitless; (S6) control/supply toggles + a worker leg mover. It reports `PASS/FAIL` per
  assertion and a `RESULT pass=N fail=M` summary (also the document title), so it reads cleanly in a
  browser or via headless `--dump-dom`. Not part of `npm test` (that suite is Node-only); run it by
  serving the repo and opening the page (or headless Chrome). Lives under `tests/ui/`.
- **Verification:** served the repo and ran the harness in **headless Chrome** → **31/31 PASS** across
  all six scenarios (e.g. S2 WIP 83 heavy > 0 light; S4 batch out 114; S5 product out 300). Confirms
  every scenario is authorable by mouse + keyboard and runs.
- **`docs/HOWTO-build-example5.md`** — a click-by-click guide to building the 3-level
  sold-sub-assembly example from scratch (place 8 nodes → set params → mark the two assembly stations
  → define 5 parts + BOMs in the Parts manager → set per-product demand → build 5 routes with the
  Route tool → CONWIP + limitless → run/read the BOM inset & Flow tab).

No engine/app change — verification + docs only; `npm test` still **93/93**.

## 2026-06-09 — Floor redesign (Milestone 1a): smaller BOM inset + leg direction arrows

First slice of the approved "Model Setup builder + structure-locked floor" redesign (plan:
`.claude/plans/staged-finding-haven.md`). Two low-risk visual fixes shipped first:
- **BOM inset ~50% smaller** — scoped compact overrides in `floor.css` (`max-width 120px`, halved
  fonts/padding/swatch); the magnified modal is unchanged.
- **Direction arrowhead on every transport leg** — `render()` now draws a small arrowhead at each
  leg's downstream node edge (reusing the dep-arrow polygon maths), so flow direction reads at a
  glance. Off-active-route legs get a fainter arrow.

UI-only; `node --check` clean; verified via headless screenshot of `#example5`. `npm test` 93/93.
**Next (Milestone 1b):** the Setup drawer (stations / parts & BOM / routes / control) with live
mini-preview + auto-layout, and locking structure-editing on the floor.

## 2026-06-09 — Floor redesign (Milestone 1b): Setup builder + auto-layout + structure-locked floor

Adopted the old engine's (`advanced.html`) workflow: define the *system* in a guided **Setup drawer**,
auto-generate the floor, then use the floor only for **physical** work. UI-only — engine untouched.
- **Setup drawer** (`app/floor.html` `#setupDrawer`, opened by **⚙ Set up model**): a right-side
  builder with a **live mini-preview** and four sections — **1·Stations** (add source/workcenter/
  storage/sink; each workcenter's full parameter editor), **2·Parts & BOM** (the former Parts-manager
  grid, relocated here), **3·Routes** (per-part ordered station picker — replaces the canvas Route
  tool), **4·Control/source/demand**. **Apply & lay out** runs `autoLayout()` and shows the floor.
- **`autoLayout()` / `computeLayout()`** — layered auto-layout: column = longest-path depth along
  route edges; row = a lane per part. Writes the same `nodes[].x/y` the SVG already renders; the live
  mini-preview (`renderSetupMini`) draws from the same computation, part-coloured.
- **Floor is now physical-only:** the palette place-tools and Route tool are gone; `onPointerDown` only
  selects/drags/pans. A **lock banner** explains it; **Inspect** still tunes a station's parameters and
  a leg's transport; structure (stations/parts/routes/BOM/demand/control) is **Setup-only**. Right-panel
  tabs are now **Inspect · Transport · Flow · Results** (the old Model tab/subtabs are retired). An
  empty model and **Clear** open the builder first.
- **Reuse:** extracted `stationEditor(n, host, rerender)` shared by the floor Inspect panel and the
  Setup station cards; `renderPartsModal` and `renderControl` are hosted in the drawer unchanged;
  `symbolPicker`/`factorButton` now take a `rerender` callback so they refresh the right context.
- **Verification:** `npm test` **93/93** (engine untouched); `node --check` clean. Rewrote
  `tests/ui/authoring-selftest.html` for the new flow and ran it in **headless Chrome → 21/21 PASS**
  across four scenarios (push line; pull/CONWIP + demand; batch; 3-part assembly) — each built entirely
  through the drawer and run after Apply. Screenshots reviewed: empty model auto-opens the builder; the
  drawer shows the four sections + live preview; Apply lays out the floor; `#example5` floor shows the
  lock banner, the new tabs, the smaller inset and leg arrows, and runs.
- **Decision logged:** `docs/DECISIONS.md` (2026-06-09). **Next (Milestone 2):** physical transit on
  the shared sub-assembly link (engine).

## 2026-06-09 — Floor redesign (Milestone 1c): Setup as a large centred popup

Stakeholder: the Setup screen should be a wide centred pop-up, almost full-screen, with room for
everything. Changed `.setup-aside` from a 560px right drawer to a centred popup
(`min(1180px, 95vw) × min(900px, 92vh)`, rounded, shadowed), and made `.setup-body` a **two-column
grid** (the live preview spans full width on top; Stations + Routes on the left, Parts & BOM + Control
on the right; single column under 900px). CSS-only. Verified via headless screenshot (example5 setup):
full-width preview with coloured routes, Stations and Parts & BOM side by side, readable.

## 2026-06-09 — Floor redesign (Milestone 2): physical transit on the shared sub-assembly link (engine)

Made the shared sub-assembly link a real, normally-styled, part-coloured transport leg with parts
travelling it — the stakeholder's chosen "route units physically (engine change)".
- **Engine (`src/floor-engine.js`):** in process mode, a **supply leg** is derived for any BOM component
  whose route does **not** end at its assembler (the shared case): `lastRealNode(component) → assembler`.
  When `tryAssembleMulti` authorises such a product it consumes the components from the pool and
  **dispatches a delivery** for each shared component along its supply leg (`dispatchDelivery` → a real
  in-transit, part-coloured token); the product is created (`createAndAdmit`) only when **all its
  deliveries arrive** (`onDeliver`) — so assembly is transport-gated like every other line. Deliveries
  move already-finished units, so they are NOT re-counted in entered/completed/wip (conservation
  preserved); they do count as in-transit while moving. A `pstats[pid].pending` count bounds concurrent
  deliveries and is included in `computePullNeeds` so pull doesn't over-authorise during the gap. New
  `DELIVER` event in `step()`.
- **UI (`app/js/floor.js`, `app/floor.html`):** the dotted red overlay is retired — the supply leg now
  renders as a **normal transport leg with a direction arrow**, selectable/editable like any leg;
  delivery tokens animate along it in the part colour via the existing transit rendering. Updated the
  BOM-inset note and the legend.
- **Why existing tests survive:** supply legs only arise when a component's route ends somewhere other
  than its assembler. The two existing tests with that shape (`shared-component fairness`,
  `multi-level dependent demand`) have those nodes **co-located → zero-transit** deliveries, preserving
  behaviour; the widget/Little's-Law tests route components into the assembler (no supply leg).
- **Verification:** `npm test` → **94/94** (93 unchanged + 1 new: a sold sub-assembly delivered over a
  real non-zero supply leg into its parent — asserts the leg is created, the product is built from
  deliveries, the sub-assembly is also sold, conservation holds, `avgInTransit > 0`). Authoring
  self-test still **21/21**. Headless screenshot of `#example5`: the Motor→Final-assy link is a normal
  arrowed leg (no dotted overlay).
- **Decision logged:** `docs/DECISIONS.md` (2026-06-09) — supersedes the dotted-overlay decision.
  Rewrote `docs/HOWTO-build-example5.md` for the Setup-builder flow. This completes the approved
  redesign plan (`.claude/plans/staged-finding-haven.md`).

## 2026-06-09 — Floor redesign (Milestone 1d): tidy the Setup layout (rail + accordion + faithful preview)

Stakeholder: the Setup screen looked ridiculous — huge empty sections, and the preview "looked nothing
like the current model". Reworked the layout:
- **Left rail + single-column content.** `.setup-body` is now a `340px` sticky **rail** (live preview)
  + a single-column **main** (the four sections stacked). This removes the 2-column grid's
  unequal-height empty gaps.
- **Stations are a compact accordion.** Each station is a one-line row — kind badge · name · a mono
  summary (e.g. `1× · Lognormal μ=1.40 · assembly`) · ✕ — and **clicking it expands its full editor**
  (one open at a time); adding a station opens it. No more eight giant expanded cards with histograms.
- **Faithful preview.** `renderSetupMini` now draws from the nodes' **current positions** (so it matches
  the floor) when any are placed, with **uniform scale** (no stretching), the real legs **and supply
  legs**, and each part's route in its colour — instead of a stretched recomputed auto-layout.
- Verified headless: `#example5` setup shows the preview matching the floor + 8 compact station rows;
  a fresh build expands the workcenter editor inline. Authoring self-test updated (expand a row before
  editing) → **21/21**. `npm test` 94/94 (UI-only). CSS + `floor.js`/`floor.html` only.

## 2026-06-09 — Floor redesign (Milestone 1e): student-friendly Setup (step order, headlines, rail nav)

Stakeholder: organise the Setup more clearly for a DES newcomer — sensible step order, clear bold
headlines + short subtitles, better use of space; keep it neat, don't over-explain.
- **Pedagogical step order:** reordered to **1 Products & parts → 2 Stations → 3 Routing → 4 Run
  settings** (what you make → the machines → how parts flow → how it runs), instead of stations-first.
- **Clear headlines.** Each section has a **petrol number badge + a bold serif headline + a one-line
  subtitle** (e.g. “Routing — The order of stations each part travels through.”). Verbose intro
  paragraphs removed.
- **Rail step navigator.** The previously-empty rail space below the preview now holds a compact,
  clickable **step list** (badge · bold title · tiny caption) that smooth-scrolls to a section and
  highlights it — uses the space and aids navigation in the tall form.
- Renamed a few labels for plain language (“Your parts”, “Details”, “Run settings”). Verified headless
  (`#example5` setup): rail nav + bold numbered steps render on-brand; **self-test 21/21**; `npm test`
  **94/94**. `floor.html` + `floor.css` + one `init` wiring only.

## 2026-06-09 — Floor redesign (Milestone 1f): kill the Setup dead space (hug-content dialog + sidebar panel)

Stakeholder: the unused space still hurt professionalism. Fixes:
- **Dialog hugs its content.** `.setup-aside` dropped the fixed `height: min(900px,92vh)` for
  `height:auto; max-height:92vh` (width trimmed to 1060px), so a small model gives a small dialog and a
  big one grows then scrolls — no forced empty height.
- **The rail is now a real sidebar panel.** `.setup-body` is a stretch grid; the rail has a
  `surface-2` background + right border and fills the full dialog height, with its content
  (`.setup-rail-inner`) pinned sticky. Empty space inside a defined panel reads as intentional, not as a
  void.
- **Live “At a glance” summary** at the foot of the rail (`renderSetupSummary`): Products · Parts total ·
  Stations · Routes set (n/total) · Sold to demand — fills the sidebar and helps a student track
  progress; updates on every edit.
- Verified headless: fresh model → compact dialog with a full sidebar; `#example5` → tall dialog,
  sidebar fills and the summary reads 5 parts / 9 stations / 5⁄5 routes / 2 sold. **Self-test 21/21**;
  `npm test` **94/94**. UI-only.

## 2026-06-09 — Floor redesign (Milestone 1g): bolder, clearer mini preview

Stakeholder: the preview was too literal/thin to read at a glance — make it bolder and a bit playful.
Reworked `renderSetupMini` (still faithful to the model's positions): smaller viewBox (everything renders
larger), **type-distinct nodes** — filled petrol **source** dots, ink **sink** dots, rounded
**workcenter** boxes, **accent ⊕** assembly boxes, dashed **storage** — and **thick part-coloured routes
with direction arrowheads**, with readable labels. Verified headless (`#example5`): clear at a glance.
Self-test 21/21; `npm test` 94/94. `floor.js` only.

## 2026-06-09 — Phase 3.6 · Milestone 0: transport-revision audit + design note (PAUSED for review)

- Audited the current Phase-3 transport in `src/floor-engine.js`: three movers — **instant**
  (capacity-aware, 0 time), **conveyor** (`conv[key]={cap,speed,items}`, straight only, blocking), and a
  single shared **worker pool** (`workers={count,speed}`, loaded-trip-only, no positions/home/travel-to-
  pickup) — driven by `board()` + the `settle()` fixpoint; machine starts have no operator coupling;
  shared-component **supply-leg deliveries** bypass the pool. That's the seed; it lacks per-unit
  positions, travel-to-pickup, home/return, machine coupling, and AGV-vs-operator separation.
- Wrote `docs/PHASE-3-6-DESIGN.md` proposing: the **four leg modes** (Instant · Conveyor straight/bent ·
  AGV · Operator), **placed flexible units** with a **standard/home location** (centre-default, draggable)
  that **return home when idle** and are **re-dispatched mid-return from their current position**, a
  **single fixed dispatch rule** (longest-waiting request → nearest free eligible unit → ties by id), and
  the **operator↔machine coupling** (`operatorRequired` machines seize a free assigned operator for the
  op duration; an operator does a move XOR an op). Worker pool → Operator; AGV is the new transport-only
  mover. Migration + units fixed; supply-leg deliveries become real requests on flexible legs.
- Logged a PROPOSED `docs/DECISIONS.md` entry (T1–T6) — **supersedes** the 2026-06-07 "worker empty-return
  ignored" simplification (idle units now return home). **No engine/UI/test code yet — PAUSED** to confirm
  the dispatch rule, the home/re-dispatch behaviour, and the operator coupling (incl. the two flagged
  forks: op-travel and moves-vs-ops priority) before Milestone 1. `npm test` unchanged (94/94).

## 2026-06-09 — Phase 3.6 · Milestone 1: four-mode transport + operator machines + home locations (engine)

Stakeholder confirmed the forks (dispatch = longest-waiting → nearest unit; **operator travels to the
machine** then operates; moves & ops share one queue; supply-leg deliveries route through the dispatch).
Implemented in `src/floor-engine.js` only (legacy engines frozen):
- **Instant is now zero-time** (charter §6 baseline) — placement no longer affects an instant link;
  still capacity-aware. Distance/placement drives time via the *timed* movers now.
- **Conveyor** gains **bent paths** — `legLen` sums the polyline through `legs[key].waypoints` (capacity +
  downstream blocking unchanged).
- **Flexible movers** replace the worker pool: `transport.movers[] = {id, kind:'agv'|'operator', speed,
  home, serves:{links,machines}}`. Placed units track a position; a move = **travel-to-pickup (empty) +
  carry (loaded)**; an **idle unit returns home**; a unit **en route home is re-dispatched from its
  current interpolated position** (a `useq` stamp invalidates superseded arrivals — the FEL's own `seq`
  is set by `schedule()`, so the unit stamp had to be separate).
- **Single fixed dispatch** (`dispatchOnce`): longest-waiting request → nearest free eligible unit → ties
  by id, across **both** moves and operator-ops (one combined queue).
- **Operator↔machine coupling:** an `operatorRequired` resource raises an op-request instead of starting;
  a dispatched operator **travels to the machine** (`OP_ARRIVE`) then operates for the service duration,
  released at `COMPLETE`; an operator does a **move XOR an op**; AGVs never operate.
- **Supply-leg deliveries** become real transport requests on AGV/operator legs. **Migration:** legacy
  `transport.workers` → operators (`serves:"all"`, centre home); `mover:"worker"` → `operator` — the app
  keeps running. New events `PICKUP/DROP/OP_ARRIVE/HOME_ARRIVE`; `MOVE_END` removed. Metrics expose
  `movers {count, agv, operators, utilisation, avgQueue, units[]}`.
- **Verification:** `npm test` → **103/103** — new `tests/floor-transport.test.js` (9): instant=0,
  conveyor-bent path length, AGV fleet bottleneck (travel-to-pickup counted), home return + mid-return
  re-dispatch, operator-required needs/relieved-by an operator (automatic unaffected), operator
  contention, never-move-and-operate invariant, conservation + Little's Law, legacy-pool migration.
  Updated 4 existing tests that relied on the old instant-distance meaning to use a timed mover (a
  deliberate consequence of instant→zero). App smoke-tested headless (`#example5` runs, no console
  errors). UI (placing units / waypoints / operatorRequired checkbox) is **Milestone 2**.

## 2026-06-09 — Phase 3.6 · Milestone 2: transport modes, operator & home-location UI and floor

UI/floor only (`app/floor.html`, `app/js/floor.js`, `app/styles/floor.css`); engine unchanged.
- **Model schema:** `model.movers[]` (AGV/Operator units: id, kind, name, speed, `home{x,y}`, `serves
  {links, machines}`) replaces the worker pool; resources gain `operatorRequired`; conveyor legs gain
  `waypoints[]`. `ensureModel` migrates a *used* legacy worker pool → operators and `mover:'worker'` →
  `'operator'` (a default-only pool no longer spawns phantom units). `buildRunModel` emits
  `transport.movers` + per-resource `operatorRequired`; legs (with waypoints) pass through.
- **Per-leg mode picker** (`inspectLeg`): **Instant / Conveyor / AGV / Operator**. Instant notes
  zero-time; Conveyor gets capacity + speed + a **bend editor** (add/remove bends; drag handles on the
  floor); AGV/Operator show how many units serve the leg. The floor Transport tab's default-mode picker
  is the same four modes (worker pool fields removed).
- **`operatorRequired` checkbox** per resource (`stationEditor`).
- **Movers in Setup** (new “Movers (AGV & operators)” block in the Stations step): add/remove AGV &
  Operator units, set name/speed (+ as an experimental factor), and assignment (“serves the whole floor”
  or pick links/machines). A unit's **home** is dragged on the floor; clicking a unit opens its editor
  in Inspect.
- **Floor rendering** (DESIGN-LANGUAGE §7, quiet/no glow): conveyors draw as a tracked polyline through
  their bends; flexible legs are dashed with a direction arrow; **mover markers** (ochre OP / ink AGV)
  sit at their home and **travel pickup→drop→home live** (interpolated each frame); an operator-required
  machine waiting for a free operator shows a dashed ochre **`opwait`** state. Draggable bend handles +
  draggable mover homes added to the pointer handlers.
- **Results/auto-log:** the Transport summary now reports **Movers (AGV · op) utilisation + request
  queue**; selecting a flexible mover/leg logs the updated repositioning simplification
  (`a_mover_repos`, supersedes `a_worker_return`).
- **Verification:** `npm test` **103/103** (engine untouched); authoring self-test **21/21**; headless —
  built a line with an operator-required machine + an Operator unit under Operator transport, ran it
  (out 34): the OP marker carries the load in, then operates the machine; Setup shows the Movers section;
  no console errors. **Next: Milestone 3** (study-project integration + experimental factors).

## 2026-06-09 — Phase 3.6 · Milestone 3: integrate revised transport into the study project

- **Persistence:** movers, `operatorRequired`, and conveyor `waypoints` ride on `project.model`, saved
  with the Phase-2 study; `ensureModel` migrates older saves (used worker pool → operators;
  `mover:'worker'` → `'operator'`; defaults for the new fields). Clear and every example loader now reset
  `model.movers = []` so units never linger across models.
- **Experimental factors:** the Movers section offers **AGV fleet size** (`movers:agv:count`) and
  **Operator count** (`movers:operator:count`) as conceptual-model factors, alongside the per-unit
  **mover speed** factor — so the analysis phase can vary the fleet and study the transport/operator
  contention. (Homes are a layout choice, varied by dragging on the floor.)
- **Auto-logged simplification:** using a flexible mover or an operator-required machine logs
  `a_mover_repos` (travel-to-pickup + deliver-one + return-home; anticipatory repositioning,
  path-finding and collisions excluded), superseding the old `a_worker_return` note.
- **PRINCIPLES.md:** transport is non-value-adding ("best flow is no flow"); conveyors vs flexible movers
  trade predictability for flexibility; single fixed dispatch (longest-waiting → nearest); operators are
  one constrained resource shared between moving and machining — all cited to theory-notes §5.3 / Charter §6.
- **DECISIONS.md:** the Phase-3.6 entry is **ratified** (with the confirmed op-travels-to-machine change).
- **Verification:** `npm test` **103/103**; authoring self-test **21/21**; `node --check` clean. This
  completes Phase 3.6 (four-mode transport + operator-operated machines + home locations).

## 2026-06-09 — Phase 3.6 showcase demo (`#example6`) + charter/design-note sync

- Added `loadExample6()` + a `#example6` deep link: a full Phase-3.6 showcase on one floor — a **Pump**
  (sold) = 1 Motor + 2 Housing and a **Motor** sub-assembly (sold AND a component) = 1 Rotor + 4 Magnet,
  with **all transport modes**: a **bent Conveyor** (Mill → Final assy), **two AGVs** carrying Rotors,
  Magnets and the shared-Motor supply leg into Final assy, and an **Operator** running the
  **operator-required Lathe** — plus scrap, pull/CONWIP and per-product demand. Tuned stable.
  Verified headless (Step ×700 → End): **238 pumps out, no deadlock**, product output 0.166/min,
  cycle 2.12 min, in-transport 0.45 min, station utilisation 33–50%, movers 46.8% util / 0.71 req
  queued, conveyor 7.5% full. Screenshot reviewed — AGVs, OP at the Lathe, bent conveyor, both
  assemblies render on-brand.
- **Docs sync:** `docs/PROJECT-CHARTER.md` §6/§9 updated to the ratified spec (flexible units have a
  standard/home location and return when idle; *anticipatory* repositioning replaces "empty
  repositioning" in the NOT-list), and `docs/PHASE-3-6-DESIGN.md` reflects the confirmed
  operator-travels-to-the-machine decision. `npm test` 103/103.

## 2026-06-10 — Manual stress-test pass + the "works" demo (`#example7`)

- **Stress harness** `tests/ui/stress.html` (24/24): six scenarios built **through the real Setup/floor
  UI** by simulated mouse+keyboard (blocking+breakdowns+scrap, batch+scrap, pull-assembly+conveyor, an
  AGV bottleneck, an operator-required machine under contention, and a kitchen-sink combining them).
  Captures `window.error`; all green — no authoring or engine bugs surfaced.
- **`#example7` — "the works":** the most intricate single-floor demo so far. Pump (sold) = 1 Motor +
  2 Housing; Motor (sold spare AND a component) = 1 Rotor + 4 Magnet. Housings: Steel → Mill (6% scrap)
  → WIP buffer → Final assy over a **bent conveyor**; Rotors: Bar → **operator-run Lathe** → Motor assy;
  Magnets: store → **batch furnace** → Motor assy; the shared Motor is delivered Motor assy → Final assy.
  3 AGVs + 1 operator, pull/CONWIP, per-product demand.
- **Stall found and fixed (no engine change):** the first cut set the furnace batch to **3** while a
  Motor consumes **4** Magnets. The pull pipeline bounds Magnets in-flight at `need+1 = 5`, but clearing
  the assembler (4) *and* forming the next batch (3) needs 7 in flight — so the line froze (only 10 jobs
  ever entered in 6000 min; 0% utilisation everywhere). Diagnosed with a headless Node mirror of the
  run-model reading `entered`/`pstats`/`inventory`. **Fix:** set the furnace batch to **4** so each batch
  feeds exactly one Motor. Re-verified through the real UI: **300 pumps out**, 0.152/min, cycle 2.02 min,
  yield 98.7% (matches the 6% scrap), stations 27–46% utilised, no deadlock.
- **Principle (added to PRINCIPLES.md):** under a pull/CONWIP component, a batch station's batch size
  must divide the downstream assembly appetite, or the `need+1` pipeline bound starves it. `npm test`
  **103/103**.

## 2026-06-10 — Bent-conveyor token follows the belt path (animation fix)

- A unit travelling a **bent conveyor** was animated straight from source to destination — it ignored
  the waypoints, so the token visibly cut across the bend even though the engine already *timed* the
  move by the full polyline length (test "Conveyor with bends times by the full (polyline) path length").
  Fixed `jobPos` to interpolate the transit token along the belt polyline by **arc length** (new
  `polyAt(points, p)` helper); only conveyor legs with waypoints take the polyline path — AGV/operator/
  instant legs are point-to-point and unchanged. Render-only change. Verified the example7 bend
  (Mill→WIP via (33,3)): at p=0.5 the token sits on the waypoint, not the straight-line midpoint.

## 2026-06-10 — Phase 3.7 Milestone 0: parallel-resources design note (PAUSE for review)

- Wrote `docs/PHASE-3-7-DESIGN.md`: resource groups (`model.groups`), a routing op targeting a group,
  the selection decision made in `board()` at ready-time (so shortest-queue reads live member queues),
  per-job routing copies (⇒ no jockeying), the two rules defined precisely (even `1/N`; shortest-queue
  load = queue + in-process + in-transit-assigned, tie-break lowest index), transport integration (the
  chosen member's location sets the leg via the existing 3.6 movers), and scope guards (processing-op
  only, members may be batch/operator-required, group-token expansion for leg/accept enumeration).
- Confirmed against the engine: the pull/assembly logic keys on `inventory[partId]` and the assembly
  root (`route[0]`), not on intermediate operation queues — so a mid-route group token leaves
  `computePullNeeds` / `canAssemble` / `buildPullOrder` untouched as long as a group is never the
  assembly root. Summarised the decision in `docs/DECISIONS.md` (pending review).
- **No engine/UI code yet — paused for stakeholder confirmation of (1) decision point = board()/ready-time
  and (2) members being batch/operator-required.** `npm test` unchanged (103/103).

## 2026-06-10 — Phase 3.7 Milestone 1: resource-group routing engine

- `src/floor-engine.js` only (frozen engines untouched). Added `this.groups` parsed from `model.groups`
  (`{id, name, rule:'even'|'shortest', members:[resId…]}`; members must be placed resources). A routing
  op holds a group id; `board(job)` resolves it to one member **at ready-time** and writes the member
  into the job's **own routing copy** (jobs now `routing: p.routing.slice()`), so the path is fixed —
  **no jockeying**. Helpers: `isGroup` / `membersOf` / `memberLoad` (= queue + in-process + in-transit
  `incoming`) / `resolveGroupMember` (even = uniform 1/N; shortest = least committed load, tie-break
  lowest index; both use members' own state only — ignore transport distance and operator availability).
- Group tokens expand to members where routing nodes are enumerated: conveyor-leg precompute, and the
  `firstResAccepts` / `firstCanAccept` flood guards (a group accepts if **any** member has room). The
  chosen member's location sets the transport leg, so a member is reached via its own 3.6 leg and
  transit time differs by member — no transport-engine change. Members may themselves be batch and/or
  operator-required (handled for free — resolution substitutes a concrete node and the job flows through
  normal per-node machinery).
- New `tests/floor-groups.test.js` (5, added to `npm test`): even split ≈ equal shares; shortest-queue
  sends more to the less-loaded member and keeps queues bounded; mixed batch + operator-required members
  route correctly with conservation; transport coexistence (own legs, Little's Law incl. transport);
  pooling lesson (a group of N queues far less than forcing all flow through one member). **108/108.**

## 2026-06-10 — Phase 3.7 Milestone 2: resource-group UI & floor

- **Model:** `model.groups = [{id, name, rule, members:[resId…]}]`; `ensureModel` defaults/normalises it;
  `buildRunModel` emits `groups` and routes pass group ids straight through. A route entry may be a group.
- **Setup builder:** a new "Parallel groups" subsection in the Stations step (`renderSetupGroups` /
  `groupEditor` / `addGroup` / `removeGroup`) — name, **selection rule** (segmented Shortest queue / Even
  split), and member checkboxes (a machine can be in only one group). The Routing step now offers groups
  in its picker and shows a group step as a distinct "⋔ name" chip. Deleting a machine removes it from any
  group (and an emptied group is removed + de-routed).
- **Floor (DESIGN-LANGUAGE §7):** group tokens expand to member legs in `allLegKeys` and `computeLayout`,
  so the flow **fans out** prev→each member and each member→next using the existing renderer/auto-layout;
  a quiet dashed **group hull** + "⋔ name · rule" tag ties the members together (`groupHullEl`,
  non-interactive). The mini-preview routes a part's polyline through a synthetic group centroid.
- Verified headless: a single-part model with a `Mills {Mill A, Mill B}` shortest-queue group renders one
  hull + four fan-out legs, runs end-to-end (1000 out, both members utilised), and the authoring self-test
  (21/21) and stress harness (24/24) stay green. `npm test` 108/108.

## 2026-06-10 — Phase 3.7 Milestone 3: integrate parallel resources into the study project

- Groups are part of `model`, so they persist with the project (localStorage autosave + JSON save/load)
  and round-trip through `ensureModel`; membership and the selection rule are editable in the Setup
  builder's group editor. Added a **member-count** experimental factor (`group:<id>:membercount`)
  alongside the **rule** factor (`group:<id>:rule`) — both declare into the conceptual model exactly like
  `movers:agv:count`, ready for the Phase-4 experiment runner.
- Headless-verified: opening a group's editor and clicking its two "+ as experimental factor" buttons
  records both bindings (`rule`, `membercount`) into `project.conceptual.factors`. Phase 3.7 complete —
  `npm test` 108/108; authoring 21/21; stress 24/24.

## 2026-06-10 — Phase 3.8 Milestone 0: convergence/merge audit + design note (PAUSE for review)

- Audited the engine: a node's `queue`/`items` is already a **single shared FIFO** fed by any upstream
  leg (`push` tail) and drained by the one downstream op in arrival order (`shift` front) — so a true
  same-part convergence mechanism already exists (seen in 3.7 reconvergence and shared workcenters). The
  missing piece is **authoring** a same-part multi-stream, since a part has one linear route.
- Wrote `docs/PHASE-3-8-DESIGN.md`: a part gains optional **`feeders`** (each a path from its own source
  to a merge node on the primary route); `buildRunModel` splices them into `part.routings`; convergence is
  emergent via the existing shared FIFO; no synchronisation, no priority/weighting; feeders reach the
  merge via their own transport legs; per-feeder interarrival (stream) / round-robin release (CONWIP);
  per-part demand and WIP cap. Added Charter **§6.3** ("Convergence / merge") + a §10 roadmap entry, and
  summarised the decision in `docs/DECISIONS.md`.
- **No engine/UI code yet — paused for stakeholder confirmation of (1) the build-vs-surface verdict
  (reuse the shared FIFO), (2) the tail-splice feeder model, and that this stays a FLOW merge, never an
  assembly join.** `npm test` unchanged (108/108).

## 2026-06-10 — Phase 3.8 Milestone 1: same-part flow convergence (engine)

- `src/floor-engine.js` only (frozen engines untouched). A part may carry several **feeder routings**
  (`part.routings = [[…],[…]]`, falling back to `[part.routing]` → byte-identical default). Built
  `this.partRoutings[pid]` and a flat `this.feeders` list (one per source part × routing, each with its
  own arrival). `multiPart` now also triggers on a part with >1 routing. `createAndAdmit(p, ridx)`
  creates a job on a chosen routing. **Stream** supply schedules an arrival per feeder (so the streams
  superpose at the merge); **limitless** `feedMulti` round-robins across feeders; `firstResAccepts` was
  refactored to `firstResAcceptsRouting` and a per-routing `firstRoutingFeedable` gate added. The
  conveyor-leg precompute iterates all of a part's routings.
- **Convergence is emergent, not synchronised:** every routing through the merge node deposits into that
  node's existing shared FIFO (`res.queue` / `hold.items`); the downstream op drains it in arrival order;
  no decision point added to the event loop, no partner wait. Demand/`pstats`/`inventory` stay per part
  (one part = one WIP cap).
- New `tests/floor-merge.test.js` (5, added to `npm test`): two feeders converge with conservation; the
  merge sees the combined rate and neither feeder starves; coexistence with transport legs (time differs
  by layout) + a batch feeder; Little's Law across the merge; and a flow merge needs no synchronisation
  (feeder A flows even when feeder B is silent — contrast a BOM join). **113/113.**

## 2026-06-10 — Phase 3.8 Milestone 2: convergence UI & floor

- **Model/authoring:** a part gains `feeders = [{path:[…]}]` (defaulted in `ensureModel`). The Routing
  step renders, under each part's primary route, a "Feeder line" editor — add a feeder, build its path
  with the same station/group picker, and it shows where it merges (`↳ merges at <node>`, warning until it
  ends on the primary route). `isProcessModel` triggers on feeders; `buildRunModel` splices each feeder
  with the primary tail into `routings` and emits per-feeder `arrivals` (from each routing's source).
- **Floor (DESIGN-LANGUAGE §7):** `allLegKeys`, `computeLayout`, and the mini-preview iterate a part's
  primary route **plus** its feeder paths, so the upstream streams **fan in** to the merge node — the
  clear visual inverse of 3.7's fan-out. A quiet "⋎ merge" tag marks each convergence node
  (`mergeMarkEl`, non-interactive). Deleting a node/group strips it from feeder paths too.
- Verified headless: a Widget with primary `Raw A→Mill A→Paint→Ship` + feeder `Raw B→Mill B→Paint`
  renders two streams converging into Paint (one merge marker, five legs), runs end-to-end (666 out), and
  Paint's utilisation (67%) ≈ the sum of the two mills (33% + 34%) — the combined stream. Authoring
  self-test 21/21, stress 24/24, `npm test` 113/113.

## 2026-06-10 — Phase 3.8 Milestone 3: integrate convergence into the study project

- Feeders are part of `model`, so they persist with the project and round-trip through `ensureModel`;
  the merge structure is editable in the Routing step's feeder editor. Added a **converging-streams**
  experimental factor (`merge:<partId>:streams`, baseline = primary + feeders) declared from the feeder
  UI — letting a student study how superposing more feeders loads the downstream line.
- Headless-verified the factor records into `project.conceptual.factors` (`merge:X:streams=2`). Phase 3.8
  complete — `npm test` 113/113; authoring 21/21; stress 24/24.

## 2026-06-10 — Grand demo (#example8): every feature on one floor, grounded in layout theory

- Added `loadExample8()` + a `#example8` deep link — the showcase the engine has been building toward.
  Two heavy-duty **automatic casting lines**, each a **parallel-machine group** (3.7, shortest-queue) with
  **breakdowns + scrap** and **AGV** feed, **converge** (3.8) into a shared **batch heat-treat furnace**
  (3.4), which delivers the **Casing** to a **cellular assembly** station (3.5 BOM: 1 Casing + 2 bought
  **Bearings**) run by **two operators** who both carry bearings and operate the cell (3.6 operator↔machine
  coupling). **Gearboxes** are sold under **pull/CONWIP**; **stream** supply lets the batch accumulate.
- Maps to the layout theory (theory-notes §5.3–5.5): disconnected heavy flow lines, parallel-machine
  pooling, cellular-assembly ↔ AGV/operator co-evolution, and an unbalanced line where the expensive
  heavy casting (with breakdowns + scrap) is the deliberate bottleneck.
- Verified headless through the real build path (Step ×6000 → End): **~1060 Gearboxes out, no deadlock**,
  product output ~0.28/min, cycle ~3.8 min, yield ~98%, two group hulls + one merge marker render, casters
  show breakdown downtime, the cell runs ~57% on two operators. `npm test` 113/113; authoring 21/21;
  stress 24/24.

## 2026-06-10 — #example8 refinements + merge/batch label-overlap fix

- **Bug fix (general):** on a node that is BOTH a merge and a batch resource (e.g. Heat-treat), the
  "⋎ merge" tag and the "batch N/B" badge were both drawn at y:-40 and overlapped. `mergeMarkEl` now sits
  at y:-52 when the node is a batch resource, so the two tags stack cleanly.
- **#example8 — purchased-part feed is now automatic:** the Bearings → cell leg is left at the default
  INSTANT mover (no operator carries it), matching "purchased parts feed automatically".
- **#example8 — the cell is now a real U-shaped CELL (theory-notes §5.5):** the single assembly node was
  replaced by **three operator-run workstations** — Press-fit (assembles 1 Casing + 2 Bearings) → Fasten
  → Test & pack — arranged in a U; the **two workers stay inside the cell** (homes inside; they serve only
  the cell's stations and the within-cell hand-off legs) and move parts station-to-station "circularly".
- Verified headless: ~890 Gearboxes out, no deadlock, two group hulls + one (non-overlapping) merge tag,
  three cell stations each operator-run, casters showing breakdown downtime. `npm test` 113/113;
  authoring 21/21; stress 24/24.

## 2026-06-10 — Pre-Phase-4 UI stress sweep (groups + convergence + edge cases)

- New headless harness `tests/ui/stress2.html` builds group (3.7) and convergence (3.8) models — and
  edge cases — entirely through the Setup UI (28 checks). Found and fixed one real bug; logged two
  behaviours for a product decision.
- **Bug fixed:** the resource-group **Selection rule** picker passed `segmented` the wrong arg shape
  (`[['shortest','Shortest queue'],…]` arrays instead of `[{value,label},…]` objects), so the two buttons
  rendered as "undefined" and **even-split could not be selected via the UI** (stuck on shortest queue).
  Corrected to the object form; even-split now selectable (G2 passes).
- **Open finding (crash):** an emptied group (all members removed) that is still referenced by a route
  becomes a phantom node id → `legDistance` reads `.x` on `undefined` → repeated TypeError, model
  unrunnable. Needs a guard/decision (see DECISIONS once resolved).
- **Open finding (silent):** a feeder that never joins the primary route still runs, but its parts
  "complete" at a non-sink node; the UI warns but does not block. Decision pending.
- Verified non-issues: group line via UI, even-split, convergence-via-UI (merge marker drawn), a group
  inside a feeder + batch merge, deleting a group member (cleanup), and a group+feeder model surviving a
  page reload all work. `npm test` 113/113; authoring 21/21; stress 24/24.
