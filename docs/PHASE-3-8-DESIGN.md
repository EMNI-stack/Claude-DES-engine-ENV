# Phase 3.8 — Convergence / merge (audit + design note)

> **Milestone 0.** Audit + design only — no code yet. Charter §6.2 (the inverse split), new §6.3
> (added with this phase), §9 scope; theory-notes §4.5 (variability propagation — a merge superposes
> the feeders' arrival variability) and §4.6 (pooling). Build on the current engine; frozen
> `src/engine.js` / `src/advanced-engine.js` untouched; only `src/floor-engine.js` + the new app change.
> **PAUSE for review after this note.**

## 1. What this is (and is not)

A **flow merge**: several upstream streams of the **same part** combine into **one shared downstream
queue** that a single downstream operation/line consumes. A single part flows straight through the
instant it arrives and the downstream resource is free — **no synchronisation**, no waiting for a
partner. This is explicitly **not** BOM/assembly synchronisation (different parts fork-joining into a
product), which already exists in the process model and must not be conflated. It is the inverse of the
§6.2 parallel-resource split.

## 2. Audit — does a true shared-queue convergence already exist?

**Yes — the shared FIFO downstream queue already exists; only the authoring of same-part multi-stream
is missing.** Concretely, in `src/floor-engine.js`:

- Every resource has one `r.queue` and every storage one `h.items`. `admit(job, step)` pushes **any**
  job — regardless of its part or which upstream leg delivered it — onto the **tail**
  (`r.queue.push` / `h.items.push`, lines 568 / 573). The downstream operation consumes from the
  **front** (`r.queue.shift` / `h.items.shift`, lines 793 / 865 / 873). So a node's queue is a single
  **shared FIFO**, fed by multiple upstream legs and drained by one downstream op **in arrival order**.
- This is already exercised today by (a) two *different* parts sharing a workcenter (both land in the
  same `queue`), and (b) **Phase 3.7** group members re-converging — `prev → {m₀, m₁}` then both
  `mᵢ → next` deposit into `res[next].queue`, a real same-part merge.
- Transport already supports several legs into one node (legs are keyed per `from>to` pair); breakdowns,
  scrap, batch, operator-required all act per-node irrespective of the feeding stream.

**The gap:** a part has exactly **one linear `route`**, so the model cannot *express* "two upstream
lines of the **same** part." Job creation, feed, and the conveyor/leg precompute all assume one routing.

**Build-vs-surface verdict:** mostly **(a) surface + a contained enabling change**. We do **not** build a
new merge-queue primitive — the shared FIFO is reused as-is. We add the ability to **author** multiple
same-part feeder streams, and we **visualise** the convergence. No new event-loop decision point is
needed (contrast 3.7, which needed a ready-time *selection*) — convergence is emergent: jobs simply land
in the shared queue on arrival. That "nothing to decide" property is the clearest proof it is a flow
merge, not a synchronised join.

## 3. The model

A part keeps its primary `route` and gains an optional **`feeders`** list. Each feeder is an ordered
station path from its **own source** to a **join (merge) node** that lies on the primary route:

```js
part.route    = ['srcA', 'millA', 'paint', 'ship']     // primary line
part.feeders  = [ { path: ['srcB', 'millB', 'paint'] } ]  // a second line of the SAME part, joining at 'paint'
```

- The **join/merge node** is the feeder path's last node and must appear on the primary route.
- `buildRunModel` **splices** each feeder into a full routing — `feeder.path ++ route.slice(joinIndex+1)`
  — and emits the part with `routings: [primaryRoute, feeder1Full, …]`. A part with no feeders → a single
  routing → **byte-identical to today** (the regression guard).
- The engine reads `part.routings` (falls back to `[part.routing]` when absent, so existing tests and the
  single-part fast path are unchanged). Internally `this.partRoutings[pid] = [...]`.

**Convergence is emergent:** every routing that passes through the join node deposits into that node's
existing shared FIFO (`res[join].queue` or `hold[join].items`); the downstream op consumes in arrival
order. One part flows through immediately — no partner wait, **no priority/weighting**.

## 4. Feed, supply, control, demand

- **Stream supply:** each feeder's source has its **own interarrival** distribution → the feeders'
  arrival streams **superpose** at the merge. (theory-notes §4.5: the merged stream's variability is the
  superposition of the feeders' — a clean teaching point; §4.6: pooling.)
- **Limitless + push / CONWIP:** jobs are released **round-robin across a part's feeders** (reusing the
  existing `rrFeed`-style pointer, generalised from "per source part" to "per feeder"). CONWIP caps the
  part's **total** in-flight WIP across all feeders (one part = one cap).
- **Demand / `pstats` / `inventory`** stay **per part** — a completion counts the same part regardless of
  which feeder produced it. Conservation: every part from every feeder flows through; none lost/duplicated.

## 5. Transport & coexistence (3.4 / 3.6 / 3.7)

- Each feeder reaches the merge via **its own configured leg** (`feederLastUpstream → join`) with its own
  mode / movers / distance — so **transit time differs by feeder/layout**, exactly like any leg (3.6). The
  conveyor-leg precompute and `firstRes*` / accept guards iterate **all** of a part's routings (group
  tokens still expand to members within each routing).
- A feeder's upstream may include a **3.7 group**, a **batch** resource, an **operator-required** machine,
  **breakdowns**, **scrap** — all unchanged (each routing flows through normal per-node machinery). The
  **merge node itself** may be a batch or operator-required resource (or a storage buffer — `hold.items`
  is equally a shared FIFO).

## 6. Where in the event loop the merge happens

**Nowhere new.** No selection/decision is introduced. A feeder job is created at its source, flows down
its routing, and on arrival at the join node is `admit`-ed onto the shared FIFO; `board()`/`settle()`
already drain it in arrival order when the downstream resource is free. This is the inverse of 3.7: the
split needed a *ready-time member choice*; the merge needs **no choice at all**.

## 7. Scope guards (simplest defensible form — §6.3 / §9)

- **Same part only.** Different-part merges are out (those are either shared-workcenter routing or, for
  combining into a product, BOM assembly).
- **Shared FIFO only** — arrival order; **no priority, no weighting, no synchronisation.**
- A feeder **joins at exactly one node** on the primary route; the merge is that single shared queue.
- A feeder is a *production* path for the part; it does not change assembly/BOM semantics.
- **Not in v1:** weighted/prioritised merges, synchronised joins (that is assembly), different-part
  merges, anything beyond a shared FIFO queue.

## 8. Tests planned (Milestone 1; existing stay green)

1. Two feeders of the **same part** converge into one shared queue consumed downstream; **conservation**
   holds (every part from both feeders flows through, none lost/duplicated).
2. The downstream resource sees the **combined** stream — throughput ≈ sum of feeder rates up to its
   capacity; **both feeders get served** (neither starves).
3. Coexistence — feeders reach the merge via their transport legs (time differs by layout); a feeder that
   is a **3.7 group** or a **batch** resource still merges correctly.
4. **Little's Law** holds across the merge.
5. A flow merge does **not** require synchronisation — a single part flows through with no wait for a
   "partner" (contrast a BOM assembly, which does wait).

## 9. To confirm before coding (the PAUSE)

1. **Build-vs-surface:** reuse the existing shared FIFO (no new queue primitive); 3.8 = enable authoring
   multiple same-part feeder streams + visualise. ✔ proposed.
2. **Feeder model = tail-splice** (a part's primary `route` + `feeders` that join at a node on it; spliced
   into `part.routings` at build) — vs. the alternative of authoring each feeder as a full independent
   route (downstream tail duplicated). I propose **tail-splice** (no duplication, reads as "lines
   joining"); flag if you prefer full-independent-routes.
3. **Round-robin feeder release** under limitless/CONWIP; **per-feeder interarrival** under stream supply.
4. The **merge node** may be a resource **or** a storage buffer (both are shared FIFOs).
