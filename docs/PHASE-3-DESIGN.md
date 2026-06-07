# Phase 3 Design Note — 2D Floor & Transport

> **Status: PROPOSAL for review.** No engine code is written until this is approved.
> Anchored by Charter §6 (minimal definition + NOT-in-v1 list) and §4 (build on the engine,
> new files); rendering by DESIGN-LANGUAGE §7; theory by `Reference/theory-notes.md` §5.
> Phase 3 fills the reserved `project.model` slot from the Phase 2 container.

## 1. Goal & scope

Let the student **place resources and storage on a 2D floor, connect them into a routing, and have
placement affect performance** — because travel time derives from distance, and transport is a
limited resource that can queue, delay, and block. This teaches *layout → flow*, evaluated
**dynamically by simulation** (theory-notes §5.6); it is **not** a facilities-planning or
AGV-routing tool.

**In v1:** products flow through a **routing graph** of placed nodes that can **branch** (different
products/parts take different routes) and **converge at assembly** (a product starts only when all
its BOM components are on hand — reusing the validated `advanced-engine` synchronisation idea).
Straight-line distance between consecutive nodes sets transport time; two mover types (conveyor,
worker pool); transport time counts as time-in-system.

**Sequencing (Option B — decided 2026-06-07).** The data model is **graph- and assembly-capable from
the start**, but implementation is incremental so nothing is rewritten: **Milestone 1** linear path
(placement + instant transport) → **Milestone 2** transport resources (conveyor, worker pool) →
**Milestone 2b** branching + assembly (multi-part routings + BOM matching, reusing advanced-engine's
fork-join logic) → **Milestone 3** integration into the study project.

**Explicitly NOT in v1** (Charter §6): pathfinding / obstacle avoidance, AGV fleets with dispatch,
collisions, multi-floor, automatic layout optimisation, empty-travel modelling for workers.
(Branching & assembly are **in** v1 — they are modelling-domain capabilities, not the transport
exclusions §6 lists.)

## 2. Units convention (fixed contract — enforced everywhere)

One labelled time unit per study, per theory-notes §1. For this app:

| Quantity | Unit | Notes |
|---|---|---|
| **Time** | **minutes** | the model's single time unit; service-time distributions are in minutes |
| **Distance** | **metres (m)** | floor coordinates `x, y` stored in metres |
| **Speed** | **metres / minute (m/min)** | mover property |
| **Travel time** | `distance ÷ speed` (minutes) | same time unit as service — so it adds cleanly to cycle time |

Display only: the canvas renders metres → pixels at a fixed `scale` (default **10 px/m**); the
scale never affects the simulation, only the picture. Distances are **Euclidean** straight-line
between node centres (no aisles, no pathfinding — Charter §6). *(Manhattan/rectilinear distance is a
plausible alternative for factory aisles — flagged in §10 as a review choice.)*

## 3. Floor data model — `project.model` (`des-floor/v1`)

Attaches to the Phase 2 project at `model` (reserved null until now). Nodes carry stable ids so the
conceptual model's experimental factors can bind to them (e.g. a factor "worker count").

The network is **placed nodes + parts**. Nodes are *where* work and waiting happen (placed in metres);
**parts** are *what flows*, each with its own routing — which is what gives branching (different parts,
different routes) and assembly (several component parts converge at one node per a BOM). This mirrors
the validated `advanced-engine` (parts, routings, BOM, fork-join) but adds placement + transport.

```jsonc
model: {
  schema: "des-floor/v1",
  units: { time: "min", distance: "m", speed: "m/min" },
  scale: 10,                                  // px per metre — display only
  nodes: [
    { kind:"source",   id:"src_raw", name:"Raw in", x, y },          // material entry point
    { kind:"resource", id:"res_a", name:"Press", x, y,
      machines: 1,                            // parallel servers
      service: <dist>,                        // src/distributions.js descriptor
      bufferCap: 5,                            // input-buffer capacity (Infinity = unbounded)
      assembly: false,                        // true ⇒ consumes a BOM (fork-join match) before service
      factorRef: "f_…" | null },              // optional bind to a conceptual experimental factor
    { kind:"storage",  id:"sto_1", name:"WIP", x, y, cap: 10 },      // placed buffer, no processing
    { kind:"sink",     id:"snk",  name:"Ship", x, y }                // finished products leave here
  ],
  parts: [
    // a fabricated COMPONENT: starts at a source, ends at the assembly node it feeds
    { id:"p_body", name:"Body", kind:"fabricated",
      routing:["src_raw","res_a","sto_1","res_asm"] },
    // an end PRODUCT: begins at its assembly node, consumes its BOM, exits at the sink
    { id:"p_widget", name:"Widget", kind:"product",
      bom:[ { part:"p_body", qty:1 } ],       // matched & consumed at the assembly node
      routing:["res_asm","snk"],
      demand:<dist|null> }                     // arrival/pull cadence for the product (null = saturate)
  ],
  transport: {
    default: "instant",                        // "instant" | "conveyor" | "worker"
    legs: { "res_a>sto_1": { mover:"conveyor", speed: 30, cap: 4 },
            "sto_1>res_asm": { mover:"worker" } },  // per-edge overrides (key = "from>to")
    workers: { count: 2, speed: 60 }           // shared worker pool (one speed)
  }
}
```

- **Leg:** the edge between two consecutive entries in *any* part's `routing`. Mover = per-edge
  override if present, else `transport.default`; distance = Euclidean(from, to); a zero-distance leg
  is instantaneous. The same physical edge shared by several parts shares one leg/mover.
- **Branching** = several parts with different routings (product mix / divergent routes).
  **Assembly/convergence** = an `assembly:true` resource whose product part lists a `bom`; it starts
  a unit only when all component parts have *arrived and are on hand* (matching), reusing
  advanced-engine's `canAssemble`/consume — components' transport time therefore gates assembly.
- Conveyor params (`speed`, `cap`) live **per leg** (a conveyor is a physical link); workers are a
  **single shared pool** (`count`, `speed`).
- **Milestone 1 implements the linear case** (one fabricated part, no BOM) on this exact model — a
  degenerate graph — so the structure is future-proof while the first cut stays simple.

## 4. Routing → transport legs

For each consecutive pair `(A, B)` in **each part's** `routing`: `dist = √((xB−xA)² + (yB−yA)²)`,
`travelTime = dist / speed`. Source→first and last→sink edges are legs too (entry and exit walks
count). Moving a node on the canvas changes its `dist` and therefore the leg's `travelTime` — the
sensitivity the milestone-1 test pins down. At an **assembly** node, each component part arrives via
its own final leg; the node holds arrived components until the BOM is complete, then services and
emits the product onto the product part's outgoing leg — so the *slowest/farthest* component path
gates the assembly (a clean layout-matters lesson).

## 5. Movers

**`instant` (Milestone 1 — uncapacitated delay).** Pure time delay = `travelTime`; no capacity, no
blocking. Used to verify placement changes cycle time before adding constraints.

**`conveyor` (Milestone 2).** A fixed link with transit time = `length/speed` and integer capacity
`cap` (max items simultaneously in transit). A finished job *boards* if the conveyor has a free
slot; if not, the upstream resource is **blocked** (holds its finished part — reusing the engine's
block-after-service idea). A job rides for `travelTime`, then attempts to deposit into the
downstream node's buffer; if that buffer is **full**, the job waits at the conveyor exit (still
occupying a slot), which backs items up behind it and can block the upstream resource — the standard
"downstream-full backs up" behaviour from the existing engine.

**`worker` (Milestone 2).** A shared pool of `count` movers at one `speed`. A pending move **seizes**
a free worker; if none is free the move waits in a transport queue (→ worker utilisation and a
visible transport queue, so a too-small pool becomes a bottleneck). A seized worker carries the job
for the one-way `travelTime` and deposits it (if the destination buffer is full, the worker waits,
blocked, until space frees, then releases). 
**v1 SIMPLIFICATION — empty return ignored:** a worker becomes free at the drop-off the instant it
delivers; the unloaded trip back to the next pickup is not modelled. This is auto-added to the
study's assumptions log, typed **SIMPLIFICATION**, with the rationale "transport demand is modelled
as one-way loaded trips; empty repositioning is out of v1 scope (Charter §6) and would only worsen
worker utilisation — flag for sensitivity analysis later."

## 6. Event-loop integration (new engine — `src/floor-engine.js`)

A **new, separate** next-event engine (Charter §4: do not touch `engine.js`/`advanced-engine.js`).
It reuses the proven patterns rather than the code: a binary **min-heap FEL**, **area-method**
time-persistent stats, **version-stamped** cancellation, and **seeded RNG via `src/distributions.js`**
(the one module we import and share). Some event-loop duplication is accepted as the price of not
destabilising the validated engines.

Event types: `ARRIVE` (source emits a job; schedule next arrival), `START`/`COMPLETE` (service at a
resource, as today), and transport events `BOARD` / `TRANSIT_END` / `DELIVER` for conveyors and
`SEIZE` / `MOVE_END` / `RELEASE` for workers. Transport resources expose the same three behaviours
the engine already models for stations — **queue** (waiting for a free worker / conveyor slot),
**delay** (the travel time), and **block** (downstream buffer full) — so transport is "just another
constrained resource on the path", which is the teaching point. At an **assembly** node (Milestone 2b)
a `MATCH` step holds arrived components until the BOM is satisfied before `START` — the fork-join
synchronisation lifted conceptually from `advanced-engine`.

## 7. Stats, cycle time, WIP, Little's Law

A job **in transit is in the system**: it counts toward WIP (area method) and its transit time is
part of its cycle time (`exit − entry`). New transport stats: conveyor utilisation
(`busy-slot-time / (cap·T)`), worker utilisation (`busy-worker-time / (count·T)`), mean time a job
spends in transport, and transport queue length (area method). Because transit time is included in
both WIP and CT, **Little's Law (`WIP = TH·CT`) must still hold with transport on** — this is a
test.

## 8. File plan (all new; nothing existing modified)

- `src/floor-engine.js` — the transport-aware DES core (headless, pure, imports `distributions.js`).
- `tests/floor-engine.test.js` — the Phase 3 tests (§9); existing suites stay green.
- `app/floor.html` — replaces the placeholder: the floor builder + canvas.
- `app/js/floor.js` — UI controller (drag-place, routing, mover config; reads/writes `project.model`).
- `app/styles/floor.css` — canvas/builder layout (tokens only, per DESIGN-LANGUAGE §7).

## 9. Test plan (`tests/floor-engine.test.js`)

1. **Distance correctness** — a leg of known distance/speed adds exactly `dist/speed` to cycle time.
2. **Placement matters** — moving a node farther measurably increases transport time / cycle time.
3. **Conservation with transport** — `entered = completed + scrapped + inSystem(incl. in transit)`.
4. **Worker pool as bottleneck** — too few workers → transport queueing + high worker utilisation;
   adding workers relieves it.
5. **Conveyor capacity/blocking** — a full downstream buffer blocks the conveyor and backs up upstream.
6. **Little's Law with transport** — `WIP ≈ TH·CT` within tolerance, transport included.
7. **(Milestone 2b) Assembly synchronisation** — a product starts only when all BOM components are on
   hand; moving one component's feeder farther delays assembly by that leg's added travel time (the
   farthest/slowest component gates the product).

## 10. Review choices — status

3. **Routing shape — RESOLVED (2026-06-07):** **both branching and assembly are in v1**, via the
   parts-with-routings graph above; built incrementally (Option B: linear → transport → branching/
   assembly → integrate). This was the stakeholder's explicit call.
1. **Distance metric:** proceeding with **Euclidean** (simplest "distance"); switch to Manhattan/
   rectilinear later if you prefer aisle realism — isolated in one `dist()` function so it's a
   one-line change.
2. **Default mover:** proceeding with **`instant`** as the new-floor default (so a fresh floor runs),
   conveyor/worker opt-in per leg or as the project default.
4. **Storage vs resource input-buffer:** proceeding with the **dual model** (placeable storage nodes
   *and* a per-resource `bufferCap`) — mirrors the validated engine while letting students place WIP.

(1, 2, 4 are low-stakes, reversible defaults — flag now if you'd like any changed; otherwise they
stand.)
