# Phase 3.7 — Parallel resources (design note)

> **Milestone 0.** Design only — no code yet. Charter §6.2 / §9; theory-notes §4.6 (pooling),
> §5.5 (parallel machines beat one big machine). Build on the process model (3.5) routing and the
> revised transport (3.6). Frozen `src/engine.js` / `src/advanced-engine.js` untouched; only
> `src/floor-engine.js` and the new app change. **PAUSE for review after this note.**

## 1. What we are adding

An operation in a part's routing can target a **resource group** — a named set of distinct,
individually-placed machines — instead of a single resource. Any member can serve the operation;
the group's **selection rule** picks which one for each part. This is Factory-Physics *pooling*:
a shared queue across parallel machines damps variability and reduces queueing versus forcing all
flow through one machine (theory-notes §4.6 p.298, §5.5 p.291).

## 2. The model (data shape)

A new top-level list on the `des-floor/v1` model:

```js
model.groups = [
  { id: 'grp_x', name: 'Mills', rule: 'shortest' /* | 'even' */, members: ['res_a', 'res_b', ...] }
]
```

- **Members** are ordinary placed resources already in `model.nodes` (so each has its own location,
  service dist, buffer, breakdowns, **and may itself be a batch resource or an operator-required
  machine** — no new node type). A member belongs to exactly one group and does **not** otherwise
  appear as a standalone step in any part's route.
- A **routing operation references a group id** where it would otherwise hold a node id. In the UI
  model that is `part.route = [..., 'grp_x', ...]`; `buildRunModel` passes the group id straight
  through into the engine `routing` and emits `model.groups`.
- The engine resolves a group id to a concrete member **per job, at decision time** (see §4).

## 3. Where the decision happens — and why there

**At the moment the part becomes ready for the group operation**, i.e. inside `board(job)` — the
single choke point where a job leaves its current node and is dispatched toward the next routing
entry. When `board()` computes `toId = routing[step+1]` and finds a group id, it resolves the member
**then**, before choosing the transport leg.

This is the correct point because:
- It is exactly *ready-time*: the upstream operation has finished (or the part is being flushed from
  a source/hold), so for **shortest-queue** the member queues are read at their true, live state.
- `board()` already drives every transition (machine-finish, hold-flush, conveyor/AGV dispatch), so
  one hook covers source→group, resource→group, and group→group with no special cases.
- Resolving here lets the chosen member's location set the transport leg immediately (§5).

Each job gets a **private copy of its routing** (`routing: part.route.slice()`); when a group is
resolved the chosen member id is written into that job's own array at that step. Per-job copies make
resolution isolated and keep "no jockeying" trivially true — once written, the job's path is fixed.

## 4. The two selection rules (precise)

Let the group's members be `m₀ … m_{N-1}` in listed order.

- **Even probabilistic split** — pick a member **uniformly at random**, probability `1/N` each,
  ignoring all state. Over many parts each member receives ≈ an equal share (Monte-Carlo even split;
  exact equality is not forced — that would be round-robin, which we are *not* doing).

- **Shortest queue** — pick the member with the **smallest committed load at decision time**, where

  > **load(member) = its input-queue length + parts in process at it + parts already routed to it
  > and still in transit (`incoming`).**

  Counting in-transit-but-assigned parts is necessary *because there is no jockeying*: under a
  transport delay, ignoring them would send a whole burst to the same momentarily-empty member. This
  is the member's own state only. **Tie-break:** lowest member index (deterministic, stable).

**Both rules use the members' own state only.** They explicitly **ignore transport distance** and
**ignore operator availability** (an operator-required member with no free operator can still be
chosen — it simply waits for one, exactly as a normal operator-required machine does). This matches
"considers only the members' queue / availability, not transport distance" (§6.2) and keeps
transport-aware routing out of scope.

## 5. Integration with the revised transport (3.6)

Resolution produces a concrete member node id, so the move uses the leg **(previous node → chosen
member)** with *that link's* configured mode and movers (Instant / Conveyor / AGV / Operator) via the
existing `moverFor` / `_tt`. Because members sit at different locations, **transport time differs by
which member is chosen** — placement matters, closing the layout↔flow loop. After the operation the
next leg is **(chosen member → next node)**, again a real per-member link. No transport code changes;
the group simply selects *which* of several already-supported legs is taken.

## 6. Things that must expand a group token to its members (no behaviour change, just enumeration)

- **Conveyor-leg precompute** (constructor) and **leg enumeration**: for a routing pair `(x, y)`,
  enumerate all concrete legs `a→b` for `a ∈ members(x)|[x]`, `b ∈ members(y)|[y]`, so every possible
  member leg is set up.
- **Release / "first resource can accept"** checks: treat a group as *acceptable if any member can
  accept*.
- **Supply-leg detection / assembly-node detection** (process model): operate on concrete member
  nodes; a group is never the assembly root.

## 7. Scope guards (keep it the simplest form — §6.2 / §9)

- A group is a **processing operation only** — never the **assembly root** (a product's `route[0]`),
  never a source or sink. The assembler stays a single resource (avoids "which member assembles a
  fork-join, and where do components get delivered"). Members *may* be batch / operator-required.
- **No jockeying** (enforced by per-job path fixing), **no transport-aware routing**, **no custom
  split weights**, **no cross-group balancing** — all explicitly out (§6.2 "Not in v1").
- A member is in exactly one group and is reached only via that group.

## 8. Tests planned (Milestone 1, existing stay green)

1. **Even split** — over many parts, members receive ≈ equal shares (within a tolerance band).
2. **Shortest queue** — parts go to the least-loaded member; load stays balanced across members.
3. **Mixed members** — a group with a batch member and/or an operator-required member routes
   correctly; conservation (entered = completed + scrapped + WIP) holds.
4. **Transport coexistence** — each member is reached via its own leg; transport time differs by
   member location; Little's Law (WIP = TH × CT, incl. transport) holds across the group.
5. **Pooling lesson** — a group of N members has materially less queueing than forcing all flow
   through one member at equal total capacity (theory-notes §5.5).

## 9. Two things to confirm before coding (the PAUSE)

1. **Decision point = `board()` at ready-time** (so shortest-queue reads live member queues), with a
   per-job routing copy and no jockeying. ✔ proposed.
2. **Members can themselves be batch and/or operator-required machines** — handled for free because
   resolution substitutes a concrete member node and the job then flows through normal per-node
   machinery. ✔ proposed.

Also worth an explicit nod: **shortest-queue "load" includes in-transit-assigned parts** (§4) — flag
if you want the stricter "input-queue only" definition instead.
