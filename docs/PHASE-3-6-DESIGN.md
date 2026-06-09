# Phase 3.6 Design Note — Transport revision (four modes · operator machines · home locations)

> **Status: PROPOSAL for review (Milestone 0).** No engine/UI code until the stakeholder confirms the
> **dispatch rule**, the **home-location / re-dispatch** behaviour, and the **operator↔machine coupling**.
> Builds on the transport-aware floor engine (`src/floor-engine.js`) and the new app (`app/js/floor.js`).
> Legacy `engine.js` / `advanced-engine.js` and the demo stay **frozen** (Charter §4.2); all existing
> tests stay green. New/edited files in the new app + the floor engine only.

Anchors: **Charter §6** (the four modes, operator coupling, flexible-unit standard/home location +
return-when-idle, travel-to-pickup, minimal dispatch) and **§9** (out of scope). **DESIGN-LANGUAGE §7**
(quiet, diagrammatic floor). **theory-notes §5.3** (material handling — conveyors trade
volume/predictability, flexible movers trade flexibility; transport is non-value-adding). Light touch.

---

## 1. Audit — what exists today (Phase 3)

`src/floor-engine.js` has **three** movers, configured per leg via `transport.legs[key].mover` with a
floor default `transport.default`:

| Mover | State | Timing | Capacity / blocking | Positions? |
|---|---|---|---|---|
| **instant** | — (reserve a slot at dest) | 0 (capacity-aware reserve) | respects dest buffer; back-pressure | n/a |
| **conveyor** | `conv[key] = {cap, speed, items[]}` | `legLen / speed`, **straight only** | finite `cap`; holds item when dest full → upstream blocks | n/a |
| **worker** | `workers = {count, speed, busy, pending[], blocked[]}` — **one shared pool** | **loaded one-way trip only** (`legLen/speed`); **no travel-to-pickup** | one load per worker; too few → `pending` queue | **none** (no home, no per-unit position) |

- `board(job)` routes by `moverFor(from,to)`; `settle()` is the fixpoint: step 3 retries workers blocked
  at deposit, step 4 assigns free workers to `pending` moves (`MOVE_END`), step 5 starts services / boards
  finished jobs. `_tt = legLen/speed`; `legLen` = typed override or Euclidean node-centre distance.
- **Machine start** (`settle` step 5): a free machine pulls from its queue, samples `service`, schedules
  `COMPLETE`. **No operator coupling.**
- **Supply-leg deliveries** (`dispatchDelivery`, the shared sub-assembly): time via `_tt(...moverFor)` but
  **bypasses** the worker pool / conveyor capacity — schedules `DELIVER` directly.
- Stats: `workers.utilisation`, `avgQueue`; per-conveyor utilisation; `inTransit` area for Little's Law.

**Conclusion:** the worker pool is the seed of the OPERATOR type but lacks per-unit positions,
travel-to-pickup, a home/return behaviour, machine coupling, AGV-vs-operator separation, and per-unit
assignment. The conveyor lacks bends. These are what 3.6 adds.

---

## 2. Proposed revised model

### 2.1 The four leg modes (per `transport.legs[key].mover`, floor default `transport.default`)
- **Instant** — zero transport time (unchanged; capacity-aware reserve so finite buffers still block).
- **Conveyor (straight or bent)** — a fixed path A → *waypoints* → B; **path length = Σ Euclidean
  segments** (or a typed length override) ÷ speed; finite capacity + downstream blocking (unchanged
  mechanics, generalised to a polyline). Stored: `legs[key].waypoints = [{x,y}…]`.
- **AGV** — a **flexible, transport-only** placed unit. Carries one load; travels to pickup, then
  delivers; dispatched by the minimal rule.
- **Operator** — a **flexible** placed unit that can **transport, operate a machine, or both**. One load
  at a time; one activity at a time (move **or** machine-op, never both).

### 2.2 Flexible units (AGV / Operator) — `model.transport.movers[]`
Replaces the single `workers` pool with **placed units**:
```jsonc
movers: [ { id, kind:"agv"|"operator", name, speed,        // m/min
            home:{x,y},                                     // standard location (default: lined up at floor centre; draggable)
            serves:{ links:"all"|[key…], machines:"all"|[nodeId…] } } ]   // AGV: machines ignored
```
- **Home / standard location.** New units auto-line-up in the **centre** of the floor; the student can
  drag a unit to fix a custom standard location.
- **Engine unit state:** `{ pos:{x,y}, state:"idle"|"toPickup"|"carrying"|"returning"|"operating",
  move:{from,to,t0,t1}, seq }`. `pos` is interpolated from `move` at any event time, so a unit can be
  **re-dispatched mid-travel from its current position**. A `seq` stamp invalidates a superseded arrival
  event (the breakdown-guard idiom).
- **Idle → return home.** When a unit finishes a delivery (or a machine-op) and **no eligible request is
  pending**, it travels back toward its `home` (`state:"returning"`). On arrival → `idle` at `home`.
- **Re-dispatch en route.** If an eligible request appears while a unit is `returning` (or otherwise
  travelling-idle), it is re-dispatched **from its current interpolated position** — so wherever it is sets
  the next travel-to-pickup time. (This **supersedes** the Phase-3 "ignore empty repositioning"
  simplification: idle units now return home, and that travel is modelled.)

### 2.3 Travel-to-pickup + carry (a transport request)
A **transport request** = a job ready to leave node A for node B over a leg whose mover is AGV/Operator.
When unit U takes the request:
1. **travel-to-pickup:** `tPick = dist(U.pos, A) / U.speed` — U moves empty to A; the **job waits at A**
   (in WIP) meanwhile.
2. **carry:** `tCarry = legLen(A,B) / U.speed` — the job is **in transit** (counts in `inTransit`,
   `job.transit += tCarry`).
U is seized for `tPick + tCarry`; on deposit it becomes free (then takes the next eligible request or
returns home). One load at a time; no path-queuing/collisions (units pass through each other — Charter §9).

### 2.4 The single fixed minimal dispatch rule (PROPOSED — confirm)
> **Serve the longest-waiting request first; among free eligible units, the nearest takes it.**
- Requests are timestamped when raised and held in a global pending list. When a unit frees (or a request
  appears), pick the **oldest** request that has ≥1 free eligible unit; assign the **nearest** such unit
  (smallest `dist(U.pos, pickup)`); ties → lowest unit id. No optimisation, no look-ahead, no batching.
- "Eligible" = `serves.links` includes the leg (and, for machine-ops, `serves.machines` includes the node).

### 2.5 Operator ↔ machine coupling (PROPOSED — confirm)
- Each resource gains **`operatorRequired: boolean`** (default false → automatic, runs with no operator).
- An operator-required machine can **start an operation only after seizing a free operator** assigned to
  it (`serves.machines`). The operator is **`operating`** for the **operation's duration** (the whole
  service time; for a batch op, the whole batch), released at `COMPLETE`.
- An operator is in exactly one state — a **move** (`toPickup`/`carrying`) **or** a **machine-op**
  (`operating`) — never both. AGVs never operate machines.
- **Operating incurs no travel** in v1: the operator is treated as present at the machine for the op
  (only *transport* moves incur travel-to-pickup). *Simplest defensible; flagged to confirm.*
- **Moves vs ops compete under the same rule:** a machine that is ready-to-start-but-waiting-for-an-operator
  raises an "op request" timestamped when it became ready; the dispatch rule (§2.4) serves the
  longest-waiting request across **both** moves and ops, nearest tie-break. *Flagged to confirm — the
  alternative is to always prioritise machine-ops over moves.*

### 2.6 Units & geometry
Minutes · metres · m/min, `travel = distance / speed` (Charter convention, unchanged). All distances
Euclidean between positions (node centres, unit `pos`, `home`); conveyor path = Σ Euclidean segments
through waypoints. Display scale stays presentation-only.

### 2.7 Migration (PROPOSED)
- `transport.workers = {count, speed}` → **`count` Operator units**, each `serves:"all"`, `speed` = pool
  speed, `home` auto-lined-up at floor centre. Legs with `mover:"worker"` → `mover:"operator"`.
- `operatorRequired` defaults **false** on every resource (so a migrated model's operators just do moves,
  as before — **plus** they now travel-to-pickup and return home, so timing differs *sensibly*, not
  identically; this is the intended behaviour change, not a regression to hide).
- **Supply-leg deliveries** become real transport requests when their leg is AGV/Operator (go through
  §2.3/§2.4); instant/conveyor deliveries stay as today. *(Closes the current bypass.)*

---

## 3. Coexistence
Batch, blocking, breakdowns, scrap, finite buffers, capacity, the process model (multi-part/BOM/assembly,
supply-leg deliveries), and CONWIP all continue to work — the revision only changes *how a move is timed
and who performs it*, and *whether a machine needs an operator to start*. The `settle()` fixpoint gains:
(a) build the pending-request list; (b) assign free units by §2.4; (c) gate operator-required machine
starts on a seized operator; (d) progress returning/idle units.

## 4. Tests (new/updated; existing stay green)
Instant adds 0 · conveyor-with-bends times by full path length · AGV/operator travel-to-pickup counted ·
too-small fleet → bottleneck (mover utilisation, request queueing) · idle unit returns home · a unit en
route home is re-dispatched from its current position · operator-required machine stalls when all
operators are moving and is relieved by adding an operator · an automatic machine is unaffected · an
operator never moves and operates at once · conservation + Little's Law (transport + operator wait counted
in-system) · regression: an old-equivalent (operator-only, no operator-required) model behaves sensibly.

## 5. Out of scope (Charter §9)
Path-finding, collisions, optimising dispatch, anticipatory repositioning beyond returning home,
multi-load movers, jockeying, multi-floor.

## 6. Decisions to ratify (summarised in DECISIONS.md)
- **T1 — Four leg modes:** instant · conveyor (straight/bent, capacity+blocking) · AGV (transport-only) ·
  operator (transport + machine-op). Worker pool → Operator; AGV is the new transport-only mover.
- **T2 — Flexible units are placed, with a home:** default lined-up at floor centre, draggable; per-unit
  position, travel-to-pickup, **return-home when idle**, **re-dispatch mid-return** from current position.
  Supersedes the Phase-3 "ignore empty repositioning" simplification.
- **T3 — Dispatch rule:** longest-waiting request first; nearest free eligible unit takes it; ties by id.
- **T4 — Operator coupling:** `operatorRequired` machines seize a free assigned operator for the op
  duration; operator does a move XOR an op; operating incurs no travel (v1); moves & ops compete under T3.
- **T5 — Units/geometry** unchanged (min · m · m/min; Euclidean; conveyor path = Σ segments).
- **T6 — Migration:** workers→operators (serves:all, centre home), operatorRequired=false; supply-leg
  deliveries become real requests on AGV/operator legs.

## 7. Questions to confirm before coding
1. **Dispatch rule (T3):** longest-waiting-request → nearest-free-unit (ties by id)? Or nearest-first?
2. **Operator op-travel (T4):** confirm operating a machine incurs **no** travel (operator just seized for
   the op duration), vs. the operator must first travel to the machine.
3. **Moves vs ops priority (T4):** one combined longest-waiting queue (proposed), vs. always prioritise
   machine-ops so machines never starve while a move is pending.
4. **Assignment default:** new AGV/Operator units `serves:"all"` by default (student narrows later)?
5. **Supply-leg deliveries (T6):** OK to route them through the flexible-mover dispatch when the supply
   leg is AGV/Operator (so a shared component can wait for a mover)?
