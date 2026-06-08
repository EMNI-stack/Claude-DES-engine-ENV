# Session summary — 2026-06-08 · Floor UX pass + an engine bug fix

> A consolidated, re-readable record of everything changed in this working session,
> with file and commit references. Written because this session was done away from
> the usual machine — read this first when picking the work back up. Per-task detail
> lives in `docs/JOURNAL.md`; the *why* of each choice in `docs/DECISIONS.md`
> (both have dated 2026-06-08 entries matching the items below).

**Branch:** `main` · **Scope:** the new app's **Model & Floor** page only (`app/floor.*`),
plus a small, test-covered fix in the floor engine. The legacy demo (`index.html`,
`advanced.html`), `src/engine.js`, and `src/advanced-engine.js` were **not** touched.

**Tests:** `npm test` → **76/76** (was 75; +1 regression test). Run after any engine change.

---

## Commits in this session (oldest → newest)

| Commit | Summary |
|---|---|
| `0cabd53` | Floor visual polish — manual **End**, histogram dist previews, neat Results, visible grid + scale bar |
| `e3d8cac` | Clearer running parts — bigger tokens, live **count tooltip**, **scrap drop** animation |
| `13a9c39` | **Capacity cells** on machines + more dramatic scrap drop |
| `b1dde22` | Remove **"Run to end"**; categorised **symbol/shape picker** for resources & storage |
| `7af0010` | **Translucent legs**, **viewBox-filling grid**, **visible storage box** |
| `8427822` | **Fix:** limitless supply floods the line (sim "stops" ~200 t); cap animation tokens |

## Files touched

- `app/floor.html` — playbar (added **End**, removed **Run to end**), `canvas-stage` wrapper, scale-bar + tooltip elements.
- `app/js/floor.js` — most of the work (controls, rendering, picker, animation, tooltip).
- `app/styles/floor.css` — styles for all the above.
- `src/floor-engine.js` — additive `scrapLog`; **release-gate fix** in `firstCanAccept`.
- `tests/floor-engine.test.js` — +1 regression test (limitless+push bounded WIP).
- `docs/JOURNAL.md`, `docs/DECISIONS.md` — dated entries per change.
- `package-lock.json` — added (was the pre-existing staged file at session start).

---

## What changed, by theme (with references)

### Playback controls
- **Manual "End"** (`0cabd53`) — `endRun()` in `floor.js` + `#btnEnd` in `floor.html`. The sim's
  event list never empties under a stream of arrivals, so "End" freezes the time-average stats at the
  on-screen instant (`sim.accumulate(simCursor)`), shows Results, and Play→Replay.
- **"Run to end" removed** (`b1dde22`) — button, handler, and `runToEnd()` deleted; empty-state result
  text reworded to "Press Play, then End…". (No more one-click fast-forward to a horizon — noted for
  Phase 4 output-analysis.)

### Distribution previews (all 5 editors)
- **Bar histogram + labelled axis + mean marker** (`0cabd53`) — `distGraph()` in `floor.js`; styles
  `.distgraph/.distbar/.distmean/.distaxis-row` in `floor.css`. Fixes the "not dynamic" feel: the
  axis labels (lo · μ · hi) and bars now visibly change with every parameter (a pure rescale was
  previously invisible).

### Results tab
- **Box-safe figures** (`0cabd53`) — `fmtNum()` (adaptive decimals, `k` suffix) + `#tab-results`
  scoping in `floor.css` (smaller KPI value, `table-layout: fixed`, truncating first column). Nothing
  overflows the 340px panel regardless of magnitude.

### Canvas — grid, scale, legs
- **Visible grid** then **viewBox-filling grid** (`0cabd53` → `7af0010`) — now SVG tiling **patterns**
  (`grid-minor`/`grid-major`, 5 m / 10 m) on background rects sized to the live viewBox in
  `updateGrid()` (called from `setViewBox`). Always fills the canvas at any zoom/pan.
- **Scale bar** (`0cabd53`) — `updateScaleBar()`; bottom-left ruler that picks a "nice" metre length
  and relabels on zoom/resize. `#scaleBar` in `floor.html`, `.scalebar` in `floor.css`.
- **Translucent transport legs** (`7af0010`) — `.leg/.leg-conv/.leg-worker` get low opacity so they
  recede behind nodes/tokens/text; a selected leg brightens to primary.

### Nodes — tokens, machines, storage
- **Bigger job tokens** (`e3d8cac`) — radii bumped in `jobPos()`.
- **Capacity cells** (`13a9c39`) — one box per parallel machine on each resource, drawn in `nodeEl()`
  and "checked" (state-coloured busy/blocked/down) live in `renderFrame()`; `.cap-cell*` in `floor.css`.
- **Storage box** (`7af0010`) — storage now renders a filled rounded box (`.store-rect`, subtle fill +
  **dashed** border, distinct from machines) with the chosen shape inside — a proper click/hover target.

### Symbols / shapes
- **Categorised picker** (`b1dde22`) — `SYMBOLS` reworked into `{label, cat, path}`; `SYMBOL_CATS` =
  Manufacturing / Service / Abstract·VSM (square=process, triangle=inventory, circle, diamond, hexagon).
  `symbolPicker()` renders grouped rows; shared by **resources and storage**. Storage carries a symbol
  (defaults to the VSM inventory triangle; backfilled in `ensureModel`). `symG()` reads `.path`.

### Live interaction
- **Hover count tooltip** (`e3d8cac`) — `tipHTML()/showTip()/hideTip()/onHover()`; hovering a node
  during a run shows live counts (resource: here / being processed / waiting / blocked / down;
  source-storage: staged-holding vs cap; sink: shipped). `#floorTip`, `.floor-tip` in `floor.css`.
- **Scrap drop animation** (`e3d8cac`, lengthened `13a9c39`) — a scrapped part turns red and
  drops/fades (a pop then a long fall, ~1200 ms). `spawnScrapAnim()` reads the engine's `scrapLog`
  (additive: `scrap()` in `floor-engine.js`); `.tok-scrap` + `@keyframes scrap-drop` in `floor.css`.

### Engine fix + animation robustness (`8427822`)
- **Limitless-supply flood (the "stops after ~200 t" report).** Root cause: with **Raw supply =
  Limitless** + push + an infinite first buffer, `firstCanAccept()` released a job on nearly every
  event → WIP exploded (observed `entered` = 5,000,000) → the animation choked, looking like a stop.
  **Fix:** `firstCanAccept()` now keeps only a shallow ready queue (`machines + 1`) under non-CONWIP
  control with an infinite first buffer (finite buffers respected; CONWIP exempt, its cap bounds WIP).
  Regression test in `tests/floor-engine.test.js`.
- **Token cap.** `renderFrame()` draws at most **150** tokens so any high-WIP situation (flood or a
  genuinely unstable line) can't freeze the view; the clock still reports true WIP.

---

## Gotchas / behavioural notes for next time
- **Limitless supply** intentionally runs the first station at 100% utilisation; a balanced/slow
  **downstream** station will then build a growing queue — correct physics, not the flood bug. Pair
  limitless with **CONWIP** to hold a target WIP.
- The **example line** (`#example`) has `scrap = 0` and `machines = 1`, so the scrap drop and the
  multi-cell capacity row only show once you set a scrap fraction / more machines on a resource.
- Verification this session was done by driving headless Chrome over the DevTools Protocol (no
  Puppeteer installed) and a local static server (`python -m http.server` from the repo root, needed
  because the pages use native ES-module imports).

---

## Continued — 2026-06-08 (later): on-canvas legend + collapsed queue marker

> From here on, new changes are logged in THIS document (per stakeholder request),
> in addition to the commit history.

### Legend under the canvas (`app/floor.html` + `app/styles/floor.css`)
- A small, intuitive key sits below the floor (`.floor-legend`): **Machine** (solid box) ·
  **Storage** (dashed box) · capacity-cell states **Busy / Blocked / Down / Free** ·
  **Unit** (teal dot) · **Waiting / stored (×N)** (grey dot) · **Scrapped** (red dot) ·
  **Transport** (faint line) · and a "hover a station for live counts" hint. Pure markup + tokens,
  no JS.

### Queued / stored units → one grey dot + "×N" (`app/js/floor.js`)
- Previously every waiting/stored unit was its own grey dot, so a long queue or a full storage
  painted the canvas with dots. Now `renderFrame()` aggregates them: units **in service / transit**
  still draw as individual teal dots (`jobPos`, capped at 150), while **queued / pending / held /
  finished** units collapse to a **single grey dot + a `×N` count** per location (new `queueLoc()`;
  `queueEls` state; `.qmark` / `.qcount` styles). Count shows only when N > 1.
- Side effect (good): a flooded/unstable line no longer floods the view with dots — it reads as
  e.g. "• ×18". The true WIP is still on the clock and via hover.
- **Verified** (headless): a built-up queue of 20 rendered as 2 active dots + one grey "×18" marker;
  legend = 11 items; no console errors. `npm test` → 76/76 (UI-only change).

### Fix: storage never accumulated; instant transport now capacity-aware (`src/floor-engine.js`)
- **Bug:** standalone storage nodes never held stock, regardless of model/capacities. Root cause:
  instant transport was *uncapacitated* — `board()` always moved a part into transit and, if the
  destination buffer was full, dumped it into a hidden `arrivalBlocked` limbo at the destination's
  door. So finite buffers and storage caps created no back-pressure (confirmed: with a finite
  downstream buffer, 235 parts piled in `arrivalBlocked`, storage stayed 0).
- **Fix:** instant transport is now **capacity-aware**. A part only departs its node if the
  destination `canAcceptAt()` (current holding + reserved-in-transit `incoming` < cap); a slot is
  **reserved** for the trip so the `settle()` fixpoint can't over-fill a finite buffer. A full
  downstream now blocks and WIP **backs up into the upstream storage** (and the source). Behaviour
  is unchanged for infinite buffers (the common case), so all prior tests still pass.
- **To SEE storage fill:** the storage's *downstream* must be capacity-constrained — give the next
  resource a **finite input buffer** (Inspect → Input buffer → Finite, small cap). With an infinite
  downstream buffer, WIP correctly piles in that resource's own queue, not the storage.
- **Verified:** `source→storage(cap 5)→r1(finite buf 3, slow)→sink` → storage fills to 5,
  `arrivalBlocked` = 0, conservation holds. New regression test; `npm test` → **77/77**.

### Bottleneck + buffer demo (`#example2`)
- New `loadExample2()` in `floor.js` + a `#example2` deep link (auto-loads and auto-plays).
  Line: **Raw in → Cut (fast) → WIP buffer (storage, cap 8) → Press (slow bottleneck, finite input
  buffer cap 2) → Ship.** Because Press can't keep up and its buffer is finite, stock piles in the
  WIP buffer (fills to cap 8, shown as the grey `×8` marker), Cut blocks, and the line backs up — a
  ready-made illustration of the storage/finite-buffer behaviour and the machines-vs-capacity point.
  Arrival rate kept a mild ~2× overload so it fills quickly but stays tidy. Verified headless:
  WIP buffer reaches ×8, Cut shows blocked, no errors.
- Link: `…/app/floor.html#example2` (local: http://127.0.0.1:8000/app/floor.html#example2).

## Live site
After this session is pushed: https://emni-stack.github.io/Claude-DES-engine-ENV/app/floor.html
