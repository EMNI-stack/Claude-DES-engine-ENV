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
