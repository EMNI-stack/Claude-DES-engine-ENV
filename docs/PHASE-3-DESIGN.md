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

**In v1:** a single product flowing through one **ordered routing** of placed nodes; straight-line
distance between consecutive nodes sets transport time; two mover types (conveyor, worker pool);
transport time counts as time-in-system.

**Explicitly NOT in v1** (Charter §6): pathfinding / obstacle avoidance, AGV fleets with dispatch,
collisions, multi-floor, automatic layout optimisation, empty-travel modelling for workers.

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

```jsonc
model: {
  schema: "des-floor/v1",
  units: { time: "min", distance: "m", speed: "m/min" },
  scale: 10,                                  // px per metre — display only
  source: { id:"src", x, y, interarrival: <dist> },   // where jobs enter (arrival stream)
  nodes: [
    // a RESOURCE (workcenter): processes jobs
    { kind:"resource", id:"res_a", name:"Press", x, y,
      machines: 1,                            // parallel servers
      service: <dist>,                        // src/distributions.js descriptor
      bufferCap: 5,                            // input-buffer capacity (Infinity = unbounded)
      factorRef: "f_…" | null },              // optional bind to a conceptual experimental factor
    // a STORAGE position: a placed buffer, no processing
    { kind:"storage", id:"sto_1", name:"WIP", x, y, cap: 10 }
  ],
  routing: ["src", "res_a", "sto_1", "res_b", "sink"],   // ordered node ids
  sink: { id:"sink", x, y },                   // finished jobs leave here
  transport: {
    default: "instant",                        // "instant" | "conveyor" | "worker"
    legs: { "res_a>sto_1": { mover:"conveyor", speed: 30, cap: 4 },
            "sto_1>res_b": { mover:"worker" } },   // per-edge overrides (key = "from>to")
    workers: { count: 2, speed: 60 }           // shared worker pool (one speed)
  }
}
```

- A **leg** is the edge between two consecutive `routing` entries. Its mover is the per-edge override
  if present, else `transport.default`. Distance = Euclidean(from, to); a zero-distance leg is
  instantaneous regardless of mover.
- Conveyor params (`speed`, `cap`) live **per leg** (a conveyor is a physical link). Workers are a
  **single shared pool** with one `count` and one `speed`.
- v1 keeps a single linear routing (no BOM/branching) — the simplest thing that makes placement
  matter. (Branching/assembly is explicitly out; revisit later if ever.)

## 4. Routing → transport legs

For each consecutive pair `(A, B)` in `routing`: `dist = √((xB−xA)² + (yB−yA)²)`,
`travelTime = dist / speed`. The `src→firstNode` and `lastNode→sink` edges are legs too (so the
walk from the entry point and to the exit count). Moving a node on the canvas changes its `dist` and
therefore the leg's `travelTime` — this is the sensitivity the milestone-1 test pins down.

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
constrained resource on the path", which is the teaching point.

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

## 10. Open choices for your review

1. **Distance metric:** Euclidean (proposed) vs Manhattan/rectilinear (more "aisle-like"). Euclidean
   is the simplest "distance"; happy to switch to Manhattan if you prefer factory realism.
2. **Default mover:** proposed `instant` initially (so a fresh floor runs), with conveyor/worker
   opt-in per leg or as the project default. Alternative: default to `worker` so movement is a
   resource from the start.
3. **v1 routing shape:** single linear routing (proposed, simplest). Branching/assembly stays out.
4. **Storage vs resource input-buffer:** storage nodes are explicit placeable buffers in the routing;
   resources also have an `bufferCap`. Confirm that dual model is acceptable (it mirrors the existing
   engine's per-station buffers while letting students *place* WIP positions).
