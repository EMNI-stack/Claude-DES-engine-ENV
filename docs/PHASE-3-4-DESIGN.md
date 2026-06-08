# Phase 3.4 Design Note — Batch Processing (process batch + setup)

> **Status: PROPOSAL for review (Milestone 0).** No engine/UI code until the stakeholder
> confirms the batch semantics and the deadlock handling. Follows the Phase-3 pattern
> (`docs/PHASE-3-DESIGN.md`, `docs/PHASE-3B-DESIGN.md`).
> Builds on the transport-aware floor engine (`src/floor-engine.js`) and the new app
> (`app/js/floor.js`). The legacy engines (`engine.js`, `advanced-engine.js`) and the demo
> stay untouched (Charter §4.2); all existing tests stay green.

Anchors: **Charter §6.1** (the batch definition + what's NOT in v1); **DESIGN-LANGUAGE §7**
(floor aesthetic); **Reference/theory-notes §4.6** (process vs transfer batch; setups inflate
effective process time; wait-to-batch is variability from *control*, not randomness).

---

## 1. Audit — how the engine processes one job today

A resource (`this.res[id]`) holds `machines[]`, a `queue[]`, a buffer `cap`, and area-stat
counters. The single-job lifecycle lives entirely in three places in `src/floor-engine.js`:

1. **Start of service** — `settle()` step 5, second loop (engine.js:387–391):
   ```
   for each machine m: if (!m.busy && !m.blocked && !m.down && r.queue.length) {
     job = r.queue.shift(); m.busy = true; m.job = job; job.loc = {k:'service'};
     st = sample(r.node.service); m.depSeq++; m.startTime = now; m.depTime = now+st;
     schedule(st, {COMPLETE, node, m, job, seq2: m.depSeq});
   }
   ```
   One job is pulled from the queue, one service time is sampled, one COMPLETE is scheduled.

2. **Completion** — `onComplete` (272–282): guards staleness via `seq2 === m.depSeq` (a
   breakdown bumps `depSeq` to invalidate the in-flight COMPLETE). On success it either
   **scraps** the job (Bernoulli `node.scrap`) freeing the machine, or sets
   `m.busy=false; m.blocked=true` — the finished job is *held on the machine* until it can move.

3. **Hand-off (board) + free** — `settle()` step 5, first loop (386): for each
   `m.blocked && m.job`, try `board(m.job)`; on success `m.blocked=false; m.job=null`.
   `board()` (318–349) puts the job onto the next leg (instant/conveyor/worker), respecting
   downstream capacity; if it can't move yet, the machine stays blocked (back-pressure).

**Occupancy & capacity.** `occ(resId)` = `queue.length` + (1 per busy/blocked machine); a
finite input buffer blocks admission when `occ + incoming >= cap`. `wip` is incremented at
release and decremented only at `exit`/`scrap`, so **queue residency is already inside WIP and
cycle time** (area-method `areaWIP`, `aQ`). Breakdowns preempt-resume by saving
`m.remaining = depTime - now`.

**How a resource is defined/edited today.** `app/js/floor.js`:
- The node object carries `machines`, `service` (a distribution), `buffer {finite,cap}`,
  `scrap`, `brk {on,ttf,ttr}`, `symbol` (floor.js:621, migrated/defaulted at floor.js:83–89).
- `inspectNode()` (469–505) renders the editor: Machines, Service-time dist, Input-buffer
  toggle, Scrap fraction, Breakdowns.
- `buildRunModel()` (648–659) flattens a node to the engine shape:
  `{kind:'resource', machines, service, bufferCap, scrap, brk}`.
- `ensureWorkerAssumption()` (637–645) shows the pattern for auto-logging a modelling note
  into the assumptions log via `newAssumption(...)`.

---

## 2. Proposed semantics (the contract to confirm)

A resource may be flagged **batch**. When on:

| Quantity | Meaning |
|---|---|
| **Batch size `B`** | integer ≥ 2. The machine **waits until `B` jobs are accumulated** in its queue and **needs all `B`** to start (strict *wait-to-batch*, no timeout). |
| **Setup time `ts`** | a **constant** time incurred **once per batch**, *before* processing. (Constant, not a distribution — see Decision D2.) |
| **Process time** | the resource's existing **service distribution now represents the WHOLE-BATCH process time** `T_batch = sample(service)` — *not* per part. All `B` parts are worked together and **finish together**. |

Per batch the machine is busy for `ts + T_batch`; then all `B` parts are released and continue
**individually** downstream (each boards its own next leg, subject to that leg's capacity).

**Effective process time (theory §4.6 link, for PRINCIPLES):** with `t0` the notional per-part
work `= T_batch/B`, the per-part *effective* time is `te = t0 + ts/B` (the [HS] setup-inflation
form `te = t0 + ts/Ns` with `Ns = B`). Wait-to-batch carries **no CV** — it is variability from
*control*, like the worst case — a clean teaching point the assumptions log and the later
Factory Physics overlay can use.

**Non-batch resources are byte-for-byte unchanged** (regression): the new code branches only
when `r.batch` is set; the `m.job` single-job path is left exactly as today.

---

## 3. Proposed engine integration (`src/floor-engine.js` only)

**Model shape.** A resource node gains an optional `batch: { size: B, setup: ts }` (absent/null
⇒ ordinary resource). Stored in `res[id].batch` in the constructor.

**Machine state.** A batch machine holds an **array** `m.batch = [job…]` instead of `m.job`.
Add `m.setupEnd` (timestamp) so the renderer can tell *setup* from *processing* with **no extra
event** (one COMPLETE per batch — see D3).

**(a) Seizing a batch** — `settle()` start-of-service loop branches:
```
if (r.batch) {
  if (!m.busy && !m.blocked && !m.down && r.queue.length >= B) {
    const batch = r.queue.splice(0, B);           // take exactly B
    m.busy = true; m.batch = batch;
    batch.forEach(j => j.loc = {k:'service', node:id});
    const proc = max(0, sample(r.node.service));   // whole-batch time
    m.depSeq++; m.startTime = now;
    m.setupEnd = now + ts;                          // setup phase ends here
    m.depTime  = now + ts + proc;                   // setup once, then process
    schedule(ts + proc, {COMPLETE, node:id, m, seq2:m.depSeq});  // no per-part job
  }
} else { …existing single-job path unchanged… }
```

**(b) Completion** — `onComplete` branches on `m.batch`: for each of the `B` jobs roll scrap
**independently** (`node.scrap` is per-part — D4); scrapped ones leave via `scrap(job)`,
survivors are retained on the machine. Set `m.busy=false`; if any survivor remains
`m.blocked=true`, else free the machine.

**(c) Hand-off** — `settle()` board loop branches: for a blocked batch machine, try to `board`
each remaining job in `m.batch`; remove the ones that boarded; **free the machine only when
`m.batch` is empty**. Partial hand-off is fine (a full downstream buffer holds some back —
existing back-pressure, now per-batch).

**(d) Breakdowns** preempt-resume the **combined** `setup+process` remainder
(`m.remaining = depTime - now`), a documented v1 simplification (D5). The seq-guard already
invalidates the stale COMPLETE.

**(e) Occupancy fix for correctness.** Redefine `occ()` to count **actual jobs present**:
`queue.length + Σ machines (jobsHeld)`, where `jobsHeld` = `m.batch.length` for a batch machine,
else `1 if busy||blocked else 0`. For non-batch this is identical to today (still 1) — regression
holds — but it makes a **finite input buffer** count correctly when a busy batch machine holds
`B` units. (Default buffers are infinite, so this only bites finite-buffer models.)

**Metrics.** Per batch resource expose `batchesStarted` and `waitingForBatch` (queue length at
horizon end) for the UI/diagnostics and the deadlock surface below.

---

## 4. Deadlock / starvation handling (the bit to confirm)

Strict "needs all `B`" means a station fed fewer than `B` parts waits forever. We **surface and
guard**, never silently hang, on three levels:

1. **Hard deadlock detection (engine, general).** If `run()` exits with the event list **drained
   while WIP > 0** (`fel.length === 0 && wip > 0`), the model has jammed — report
   `metrics.deadlock = true`. This catches *any* jam (an unfillable batch behind a finite/limitless
   supply, or a buffer deadlock), not just batches. Cheap and robust.

2. **Run-end batch surface (engine).** Report, per batch resource, `waitingForBatch` (parts
   stranded below `B` at the horizon) and `batchesStarted`. The UI flags "Station X never filled a
   batch of B — N parts stranded" when `batchesStarted === 0 && waitingForBatch > 0`.

3. **Static guards (UI, before running).** Two cases are provably unfillable and worth a hard
   warning in the inspector + a blocked Play:
   - **CONWIP cap `< B`** — at most `conwipCap` jobs can ever be in the line, so `B` can never
     accumulate.
   - **Finite input buffer cap `< B`** — the queue can never reach `B`.
   Both are decidable from the model alone; the UI surfaces them rather than letting the run jam.

Under the default **stream supply** there is no true deadlock — arrivals keep coming, so a batch
fills eventually (just slowly); that latency is correct *control* variability and is left as-is.

---

## 5. UI & floor (Milestone 2 preview — for context, not built yet)

- **Inspector:** a "Batch" toggle on a resource; when on, expose **Batch size B** and **Setup
  time**, and relabel the service editor "Whole-batch process time" with plain-language helper:
  *"The machine waits for a full batch of B, pays one setup, then processes the batch together."*
- **Floor (DESIGN-LANGUAGE §7):** quiet and diagrammatic, **no glow**. Show the machine
  **accumulating toward B (e.g. `N/B`)**, then a **setup** phase, then **processing the batch**
  (thin progress sliver, using `m.setupEnd`/`m.depTime`). Reuse the existing capacity-cell /
  progress idiom.

## 6. Integration (Milestone 3 preview)

- `batch` becomes part of the saved node (persist + migrate default `batch:null`), threaded
  through `buildRunModel()`.
- Auto-log an assumptions-log note via `newAssumption(...)`: *"Station X processes in batches of
  B and requires a full batch to start (strict wait-to-batch); setup is incurred once per batch"*
  — a stated behaviour/simplification.
- Where natural, expose **batch size B** as an experimental factor for later analysis.

---

## 7. Out of scope (Charter §6.1 / prompt)

No transfer/move batching (lot-splitting), no mixed-part batches, no sequence-dependent setups,
no partial-batch timeouts (strict full-batch start), no per-part setup.

---

## 8. Decisions to ratify (summarised in DECISIONS.md)

- **D1 — Batch start rule:** strict full-batch (`queue ≥ B`), no timeout.
- **D2 — Setup is a constant** `ts`, once per batch, before processing. (Not a distribution:
  simpler, and pedagogically setup/wait-to-batch is *control*, not randomness — §4.6. Can become
  a dist later without breaking the model.)
- **D3 — Service dist = whole-batch process time**, sampled once per batch; one COMPLETE event
  per batch; setup tracked by timestamp (`m.setupEnd`), no extra event.
- **D4 — Scrap is per-part within a batch** (each of B rolls `node.scrap` independently); they
  finish together, then are inspected individually.
- **D5 — Breakdowns** preempt-resume the combined `setup+process` remainder (v1 simplification).
- **D6 — Deadlock handling:** engine `deadlock` flag (FEL drained with WIP>0) + per-resource
  batch diagnostics; UI static guards for CONWIP<B and finite-buffer<B. Never silently hang.
- **D7 — `occ()` counts actual jobs present** so finite buffers account for a B-unit in-process
  batch; non-batch behaviour is unchanged (regression).
</content>
</invoke>
