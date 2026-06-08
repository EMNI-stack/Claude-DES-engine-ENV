# Phase 3.5 Design Note — The Process Model (parts, BOMs, routings, supply/demand, control)

> **Status: PROPOSAL for review (Milestone 0).** No engine/UI code until the stakeholder confirms
> the **engine strategy** below. Follows the Phase-3 pattern. Builds on the transport-aware,
> batch-capable floor engine (`src/floor-engine.js`) and the new app (`app/js/floor.js`). The legacy
> engines (`engine.js`, `advanced-engine.js`) and the demo stay **frozen** (Charter §4.2); all
> existing tests stay green.

Anchors: **Charter** §2 (objectives), §4 (build-on-engine / new files), §9 (basics over extremities),
§10 (roadmap: this precedes parallel resources). **DESIGN-LANGUAGE** (guided, calm). **theory-notes**
§4 (factory dynamics; §4.6 Law of Assembly Operations — fork-join matching), §5 (layout/flow).

This note **supersedes and absorbs** `docs/PHASE-3B-DESIGN.md` (branching & assembly), which was
designed but never built — 3.5 is the broader, complete process-model phase.

---

## 0. Note: Phase 3.6 transport revision does not exist yet (confirmed with stakeholder)

The prompt's *CURRENT STATE TO RESPECT* referenced a "Phase 3.6 … revised transport (Instant /
Conveyor / AGV / Operator + operator↔machine coupling)". **The stakeholder confirmed (2026-06-08)
that 3.6 has not been built**, so it is ignored here. As of `8f9c293` (HEAD = Phase 3.4 batch work):

- Transport movers are **Instant / Conveyor / Worker** (`src/floor-engine.js` `moverFor`, `board`).
  There is **no AGV mover and no operator↔machine coupling**. `operator` and `assemble` in
  `app/js/floor.js` are **icon entries in the symbol picker only** — they carry no engine behaviour.
- Phase 3.2b branching/assembly is a **design note only** (`9b5413e`), no code.

This phase therefore preserves and integrates with **what actually exists** — the **three movers +
batch + blocking + breakdowns + scrap**. When 3.6 lands later, its transport modes will need to
coexist with the multi-part flow built here (the per-part `route`/leg model is mover-agnostic, so the
addition should be clean).

---

## 1. Audit — what the new engine supports today

`src/floor-engine.js` (the `des-floor/v1` engine) is **single-product**:

| Capability | Today (`floor-engine.js`) | Reference (`advanced-engine.js`) |
|---|---|---|
| Multiple parts | ✗ drives only `mainPart = parts[0]` (l.112) | ✓ `cfg.parts[]`, per-part stats |
| BOM / assembly synchronisation | ✗ none | ✓ `canAssemble`, consume-on-start, topological order |
| Per-part routing | ~ jobs carry `job.routing`, but only `mainPart` is ever released | ✓ `p.routing[]` of operations w/ service + scrap |
| Supply modes | ✓ stream / limitless, but **one** source | ✓ per-source `p.arrival`, stream/limitless |
| Demand | ✗ **one** stream (`model.demand`) | ✓ **per-product** `demand[{partId,dist,qty,conwip}]`, each its **own** interarrival |
| Control | ✓ push / CONWIP but a **single line-wide cap** (`lineWip`) | ✓ **per-product** CONWIP + dependent-demand explosion (`computePullNeeds`) |
| Dependent demand (a part that is product *and* component) | ✗ | ✓ gross-demand cascade + fairness (`extTurn`, round-robin) |
| Transport (distance, conveyor, worker) | ✓ (the floor engine's whole point) | ✗ non-spatial |
| Batch processing (Phase 3.4) | ✓ | ✗ |
| Blocking / finite buffers / breakdowns / scrap | ✓ | ✓ |

**Conclusion:** the floor engine lacks the entire multi-part / BOM / per-product-control core; the
advanced engine has it but is non-spatial and batch-unaware. They cannot be merely composed.

---

## 2. Engine strategy — the decision to confirm

**Port the proven multi-part / BOM / assembly / supply-demand / control logic from
`src/advanced-engine.js` INTO `src/floor-engine.js`, additively** — reusing the validated algorithms,
not reinventing them — while **preserving** transport (instant/conveyor/worker), batch, blocking,
breakdowns, scrap. **One engine** drives the floor; `advanced-engine.js` and `engine.js` stay frozen
and their tests stay green.

*Why one engine, not two:* transport, batch, and assembly must share a single event loop, FEL, and
WIP accounting — the spatial gating of assembly (a component is only "on hand" after it has
*travelled* to the assembler) is the core teaching point and only exists if both live together.

Algorithms lifted (conceptually, adapted to the floor's job/transit model):
`canAssemble`, consume-on-start, `buildPullOrder` (topological, parents-first), `computePullNeeds`
(demand explosion netted against on-hand + WIP, CONWIP-capped), `pullSatisfy` + `extTurn` fairness,
round-robin `rrPtr`/`rrFeed`, per-source arrival streams, per-product demand streams.

### Key reconciliations (the crux)

1. **Component "on hand" is gated by transport.** In `advanced-engine`, a finished component lands in
   `inventory[pid]` instantly. On the floor, a component job **travels its route to the assembly
   node**; only when its **last leg delivers it** does it enter a per-part on-hand store. Assembly
   reads that store via `canAssemble`. → *Transport gates assembly for free* (slowest/farthest
   component paces the product) — the §4.6 fork-join cost made spatial. Proposed model: a component's
   `route` **ends at the assembly node**; arrival there deposits into `inventory[partId]` (global per
   part, as in `advanced-engine` — simplest, basics-first; one shared pool even if two assemblers use
   the part, with round-robin fairness already handling contention).

2. **Release control becomes per-product.** Replace the single `lineWip`/`conwipCap` with
   `advanced-engine`'s per-product scheme: push = stream/feed each source + assemble when BOM on hand
   and first op free; pull (CONWIP) = per-product `conwip`, per-product demand streams, dependent
   demand exploded through the BOM. A job **in transit counts as that part's WIP** (already in
   `this.wip`/`inTransit`; add per-part `pstats[pid].wip`).

3. **Per-product demand keeps its own distribution** (`demand[i].dist`) — the explicit historical bug.
   Carried over verbatim from `advanced-engine` (`normalizeFactory` clones the default per entry).

4. **Multi-level dependent demand** (a part that is both a finished product and a component) is
   produced to meet the dependent need, not starved — preserved by lifting `computePullNeeds` +
   `dependentPending`/`extTurn`. Guarded by a dedicated test.

5. **Batch × assembly are orthogonal flags, but not combined on one node in v1.** A batch resource on
   a *component's* route batches that component's jobs exactly as Phase 3.4 does. An *assembly* node
   processes product-units one at a time. **Combining batch + assembly on the same node is out of
   scope for 3.5** (it would mean "seize B products' worth of BOM at once") — documented simplification,
   keeps it basics-first; revisit only if needed.

6. **Parts capped at 10** (consistent with the demo decision) — enforced in the UI and guarded in the
   engine. Surfaced, not silently truncated.

7. **Backwards compatibility.** Today's single-part model (`parts:[{id:'p',routing:routeOrder}]`) maps
   to exactly one produced part with no BOM → identical behaviour. Regression test holds.

---

## 3. Model schema (extends `des-floor/v1`, additive)

```jsonc
parts: [
  { id, name, kind:"purchased"|"fabricated"|"product",
    route:[nodeId…],            // ordered operations at placed workcenters (legs from placement)
    arrival:<dist>|null,        // source interarrival (purchased/fabricated)
    bom:[{partId, qty}]|[],     // for "product": components consumed at its assembly node
    demand:<dist>|null, qty, conwip }   // per-product external demand (own dist) + CONWIP limit
],
resources: [ { …existing: service, capacity(machines), queueCap, scrap, brk, batch,
               assembly:true|false } ]   // assembly node consumes a product's BOM
control: "push" | "pull(conwip)",  supply: "stream" | "limitless",  demand: "instant" | "stream"
```
- Per-operation **service distribution + scrap probability** move onto the routing step (matching
  `advanced-engine`'s `routing[i].service`/`scrapProbability`), OR stay on the resource for the
  basics-first single-route case — **proposed:** keep service/scrap on the **resource** (as today) for
  v1 simplicity; a part's routing just lists which resources it visits in order. (Per-operation
  service is a later refinement; flag if you want it now.)

---

## 4. Basics-first default (Milestone 2 preview)

Open state = **one produced part, short serial line, push, instant transport, demand instant** — a
beginner sees queueing/variability cleanly. Adding **products / components / BOMs** and **pull
control** are clearly-labelled **opt-in** steps with short Robinson/FP helper text — never the default
complexity. The **authoring-UX decision still pending from 3.2b** (per-part ordered routes + Parts
panel + BOM editor *(recommended)* vs free arrow-drawing) is a **Milestone 2** question — I'll confirm
it before building the UI, not now.

## 5. Integration (Milestone 3 preview)

Process model saved/loaded with the Phase-2 project. Bind to the conceptual model where natural —
declare as **experimental factors**: a resource capacity, a demand rate, a CONWIP limit, batch size,
mover/operator count, or the layout; **responses**: throughput / WIP / cycle time / fill rate — so the
later analysis phase measures exactly what the student declared.

---

## 6. Tests (new file `tests/floor-process.test.js`; existing stay green)

Reproduce the key `advanced-engine` behaviours **with batch + transport present**:
1. Job/component **conservation** (created = completed + scrapped + WIP + on-hand + in-transit).
2. **Assembly never starts without all BOM components** (no negative inventory).
3. **Shared-component fairness** — no single product monopolises a scarce shared component.
4. **Per-product demand uses its own distribution** (two products, different interarrivals → different
   demand counts in the expected ratio).
5. **Per-product CONWIP bounds hold** (each product's in-flight ≤ its cap).
6. **Little's Law holds including transport** (overall and per-part).
7. **Multi-level dependent demand** — a part that is both product and component is produced to meet the
   dependent demand, not starved (the real bug — guarded).
8. **Regression** — a single-part, no-BOM model behaves identically to today.

---

## 7. Out of scope (this phase)

No output analysis (replications/CIs/warm-up); no Factory Physics overlays; no parallel resources
(3.7, depends on this routing); batch+assembly on one node; per-operation service times (unless you
ask); nothing beyond what `advanced-engine.js` already does.

---

## 8. Decisions to ratify (summarised in DECISIONS.md)

- **E1 — One engine:** port `advanced-engine`'s multi-part/BOM/control logic into `floor-engine.js`
  additively; legacy engines frozen.
- **E2 — Transport gates assembly:** a component is on-hand only after its last leg delivers it to the
  assembly node; global per-part `inventory` pool (reuse `advanced-engine`), round-robin fairness.
- **E3 — Per-product control & demand:** per-product CONWIP + per-product demand each with its **own**
  interarrival dist; dependent-demand explosion preserved; in-transit counts as WIP.
- **E4 — Batch × assembly orthogonal, not combined on one node (v1).**
- **E5 — Service/scrap stay on the resource** for v1 (per-operation service deferred).
- **E6 — Parts capped at 10**, surfaced not silently truncated.
- **E7 — Backwards compatible:** today's single-part model is one produced part, no BOM → identical.
- **OPEN (Milestone 2, not now) — the 3.2b authoring-UX** choice: per-part ordered routes + Parts
  panel + BOM editor *(recommended)* vs free arrow-drawing. Confirmed before the UI is built.
</content>
