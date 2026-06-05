# Engine Code Tour & Quick Reference

> The fast, skimmable companion to `docs/DES-ENGINE-AND-FACTORY-DYNAMICS.md`.
> That doc is the *why* in depth; this one is the **map**: every concept → the reasoning in
> one line → the exact code that does it. Read top-to-bottom for a guided tour, or jump to a
> table row when you need "where does X happen?". All line numbers are against the committed
> `src/engine.js` (simple line, `Sim`) and `src/advanced-engine.js` (factory, `AdvancedSim`).

The three docs:
- **ENGINE-CODE-TOUR.md** (this) — quick map, concept ↔ code, kanban walkthrough.
- **DES-ENGINE-AND-FACTORY-DYNAMICS.md** — full technical reasoning + validity analysis.
- **BUILD-PLAYBOOK.md** — how the project was built, lessons, how to rebuild.

---

## 1. The whole engine in one screen

A discrete-event simulation only changes state at **events**, so it doesn't tick through time —
it **jumps to the next event**. Everything else is bookkeeping around that loop.

```
loop:
  ev   = pop earliest event from the heap         # what happens next, and when
  accumulate(ev.time)                             # integrate time-averages over the gap
  now  = ev.time                                  # advance the clock TO the event
  handle ev by type (ARR/DEP/FAIL/REP/DEM)        # mutate state, schedule more events
```

That is literally `Sim.step()` (`engine.js:232–281`). Three design choices make it correct and
fast, each explained below: a **min-heap** for the event list, **version stamps** to cancel
events cheaply, and the **area method** for time-averages.

**Mental model of the state:** stations → each has parallel `machines` and a `queue`; buffers
have capacities; a finished-goods level `fg`; and a pile of counters. A "part" is a tiny object
`{id, tA}` (`tA` = time it entered, so cycle time = `now − tA`).

---

## 2. DES mechanics — concept → reasoning → code

| Concept | One-line reasoning | Simple engine (`engine.js`) | Factory engine (`advanced-engine.js`) |
|---|---|---|---|
| **Simulation clock** | advances *to* next event, never by fixed step | `this.now` `:6`, set in `step` `:234` | `this.now` `:41`, set `:423` |
| **Future Event List (FEL)** | time-ordered events; earliest pops first | binary min-heap `push`/`pop` `:95–111` | `MinHeap` class `:11–33` |
| **Heap key / tie-break** | order by `time`, then insertion `seq` (deterministic FIFO) | `hLess` `:94` | `less` `:15` |
| **Scheduling an event** | "in `dt` time units, do `ev`" | `schedule(dt, ev)` `:112` | `schedule` `:129` |
| **Event loop** | pop → accumulate → advance → dispatch | `step()` `:232–281` | `step()` `:420–499` |
| **Arrival event** | a part enters; schedule the next arrival | `'ARR'` `:239–247` | `'ARR'` (per source part) `:425–433` |
| **Service start** | sample a service time, schedule its completion | `startService` `:152–157` | `startOp` `:176–182` |
| **Departure / completion** | service done → scrap-test → move downstream or block | `'DEP'` `:248–255` | `'COMPLETE'` `:452–473` |
| **Random durations** | service/arrival/TTF/TTR sampled from distributions | `sample()` from `distributions.js` | same |
| **Seeded RNG** | reproducible runs, replications, common random numbers | `mulberry32(seed)` `:5` | `mulberry32(seed)` `:40` |
| **Stale-event cancellation** | cancel a preempted departure by bumping a version, skip on pop | `depSeq` check `:249`, bump `:258` | `depSeq`/`seq2` check `:454`, bump `:478` |
| **Time-average stats** | ∫ x dt as a sum of rectangles (state is piecewise-constant) | `accumulate(t)` `:217–228` | `accumulate(t)` `:400–417` |
| **Blocking (downstream full)** | finished part can't move → machine sits "blocked" | `advance` else-branch `:204–205` | `tryLeave` returns false `:187–200`, `:470` |
| **Starving / unblocking** | a freed slot pulls queued/blocked work upstream | `freeAndPull`/`notifyUpstream` `:167–187` | `settle()` fixpoint `:204–221` |
| **Breakdowns (preempt-resume)** | save remaining work, cancel pending DEP, resume after repair | `'FAIL'`/`'REP'` `:256–279` | `'FAIL'`/`'REPAIR'` `:474–495` |
| **Scrap** | Bernoulli fallout at completion; part leaves the system | `:252–254` | `:458–467` |
| **Cycle-time sample** | `now − tA` recorded per completion (ring buffer) | `:198–199` | `finishJob` `:223–229` |

---

## 3. Annotated walkthroughs (the non-obvious bits)

### 3.1 Scheduling and the heap
An event is just an object with a `time`. `schedule` stamps it and pushes it onto the heap:
```js
schedule(dt, ev) { ev.time = this.now + dt; ev.seq = this.seq++; this.push(ev); }   // engine.js:112
```
`seq` is a monotonic counter so two events at the same `time` keep insertion order (`hLess`,
`:94`) — this makes runs deterministic. The heap gives O(log n) insert/extract-min, which is why
the FEL is a heap and not a sorted array.

### 3.2 The event loop, and why "accumulate before advance"
```js
const ev = this.pop(); this.accumulate(ev.time); this.now = ev.time; this.events++;   // engine.js:234
```
State was constant over `[lastT, ev.time]`. We integrate the time-averages over *that* interval
**before** the event mutates anything (§3.4). Then the clock jumps to the event and we dispatch.

### 3.3 Stale-event cancellation (version stamps)
When a machine breaks mid-service, its scheduled DEP must not fire. Deleting from a heap is
awkward, so instead each machine has a `depSeq`; the DEP carries the `seq2` it was born with. On
breakdown we bump `depSeq` (invalidating the in-flight DEP); when that DEP later pops we detect
the mismatch and drop it:
```js
} else if (ev.t === 'DEP') {
  if (ev.seq2 !== m.depSeq) return true;   // stale (a breakdown cancelled it) → ignore   engine.js:249
```
This "logical cancellation by version stamp" is a standard DES technique and keeps the loop O(log n).

### 3.4 Time-average statistics — the area method
Average WIP, utilization, average queue are time-averages: `(1/T)∫x(t)dt`. Because `x` is constant
between events, the integral is a running sum of `value × dt`:
```js
accumulate(t) {
  const dt = t - this.lastT; if (dt > 0) {
    for (const st of this.stations) { /* count busy/down/blocked machines */
      st.aBusy += b*dt; st.aDown += d*dt; st.aBlk += bl*dt; st.aQ += st.queue.length*dt; }
    this.areaWIP += this.WIP()*dt; this.aFG += this.fg*dt;
  }
  this.lastT = t;
}                                                                              // engine.js:217–228
```
Final metrics divide by `T`: utilization = `aBusy/(m·T)`, avg WIP = `areaWIP/T`. This is **different**
from cycle time, which is a *sample*-average over departures (`sumCycle/completed`, `:198`). Keeping
time-averages and sample-averages distinct is the thing beginners most often get wrong.

### 3.5 Blocking and unblocking
On a completion, the part tries to move to the next station; if that station is full it can't, so
the machine is marked `blocked` and holds the part (block-after-service):
```js
if (this.tryAccept(k+1, part)) { this.freeAndPull(k, mi); }
else { this.stations[k].machines[mi].blocked = true; }                          // engine.js:204–205
```
When a downstream slot frees, `notifyUpstream` (`:178–187`) hands the held part forward and frees
the blocked machine — variability and congestion thus propagate *backward* up the line. In the
factory engine the same effect is resolved by `settle()` (`:204–221`), a fixpoint that repeatedly
fills free slots from queues and retries blocked transfers until nothing more can move.

### 3.6 Breakdowns are preempt-resume (not restart)
```js
} else if (ev.t === 'FAIL') {
  if (m.busy) { m.depSeq++; m.remaining = Math.max(0, m.depTime - this.now); m.busy = false; m.down = true; }
  ...
} else if (ev.t === 'REP') {                                                    // engine.js:256–279
  m.down = false; ...
  else { m.busy = true; m.depTime = this.now + m.remaining; this.schedule(m.remaining, {t:'DEP',...}); }
```
The half-done work (`m.remaining`) is preserved and resumed after repair — which is what makes a
rare-long outage inject a long gap (and thus inflate downstream variability) exactly as theory
predicts. Note `m.depSeq++` cancels the original DEP (§3.3).

---

## 4. Factory dynamics — concept → formula → code → test

Notation: `te` mean process time, `m` machines, `u` utilization, `rb` bottleneck rate,
`T0` raw process time, `W0=rb·T0` critical WIP, `c²` squared coefficient of variation (SCV).

| Concept | Formula | Where computed | Validated by |
|---|---|---|---|
| **Little's Law** | `WIP = TH × CT` | `areaWIP/T`, `completed/T`, `sumCycle/completed` (independent) | engine test + `metrics.littlesLaw` |
| **Utilization** | `u = aBusy/(m·T)` | `accumulate` `:217–228` → analysis `utilizationSummary` | M/M/c Erlang-C test (±2%) |
| **Bottleneck** | max-utilization station | `metrics.bottleneck` | tandem-line test |
| **rb / T0 / W0** | `rb=min(m/te)`, `T0=Σte`, `W0=rb·T0` | sweep harness `run_sim.mjs:297–330` | characteristic test (`TH·CT=w`) |
| **Cycle-time blow-up** | `CTq ∝ u/(1−u)` | analysis VUT view `congestionByResource` | emergent from sim; overlay only |
| **SCV** | `c² = σ²/μ²` | `distributions.distScv`; `metrics.scv` | analytic per-distribution test |
| **VUT queue time** | `CTq ≈ ((ca²+ce²)/2)·(u/(1−u))·te` | overlay vs measured `Wq=Lq/λ` | M/M/c corner; *overlay, not assumed* |
| **Effective time** | `te=t0/A`, `A=MTBF/(MTBF+MTTR)` | preempt-resume FAIL/REP | availability test (±3%) |
| **Yield / scrap** | `y = 1−p`, upstream load `1/y` | scrap branch `:252`, `:458` | yield test (±2%) |
| **Characteristic curves** | best/PWC/worst bounds | `characteristic.js` | `TH·CT=w` invariant + between-bounds property |
| **Push vs pull** | control WIP, measure TH | kanban authorization (next section) | WIP-cap + conservation tests |
| **Variability propagation** | `cd² ≈ u²ce² + (1−u²)ca²` | `metrics.variabilityPropagation` (overlay) | M/M/1→Poisson, M/D/1→regular invariants |

**Why VUT/propagation are "overlays, not assumed":** the engine produces ground truth by
simulating actual queues; the formulas are drawn on top for comparison. So an approximate formula
can never corrupt the simulation — it just sits near (or instructively off) the measured points.

---

## 5. How kanban / CONWIP stock actually works (step by step)

This is the part most worth understanding concretely. Two implementations: a **base-stock kanban**
in the simple line, and a **multi-level CONWIP with dependent-demand explosion** in the factory.

### 5.1 The idea
A **push** line releases work on a schedule and lets WIP float. A **pull** line caps WIP and lets
throughput float: a station may produce a unit only when it has *authorization* — a free "kanban
card" — which is created when a downstream unit is consumed. **CONWIP** is the simplest pull: one
WIP cap for the whole line. The payoff is robustness: cycle time is hypersensitive to release-rate
error near high utilization, but only gently sensitive to a WIP-cap error.

### 5.2 Base-stock kanban in the simple line (`Sim`)
Each buffer `k` has a **target** (base-stock level = number of kanban cards), defaulting to the
buffer cap or 8 (`engine.js:27–28`). The authorization rule is one function:

```js
authorized(k) {                                                                 // engine.js:130–134
  if (this.control !== 'pull') return true;                 // push is always authorized
  const down = (k+1 >= this.stations.length) ? this.fg : this.stations[k+1].queue.length;
  return this.inProcess(k) + down < this.targets[k+1];      // produce only below the downstream target
}
```
In words: **station k may start a job only while (its own in-process work) + (the on-hand stock in
the buffer just downstream) is still below that buffer's target.** Hit the target and station k
stops — its output is "full", no card is free.

What replenishes a card is a downstream **consumption**. Two triggers:

1. **A customer demand** (`'DEM'`) draws a unit from finished goods, which frees the last station
   and cascades authorization upstream:
   ```js
   if (this.fg > 0) { this.fg--; this.fulfilled++;
     this.pullFromLast();                       // a freed FG slot un-blocks the last station
     this.cascade(this.stations.length);        // …and authorizes work back up the line
   }                                                                             // engine.js:264–267
   ```
2. **A unit moving forward** frees its buffer slot; `cascade(k)` walks **upstream** from `k`,
   starting any station that is now authorized and has a queued part, and stops as soon as a buffer
   is left untouched (so authorization can't ripple past where stock was actually consumed):
   ```js
   cascade(k) {                                                                  // engine.js:139–150
     for (let j = k-1; j >= 0; j--) {
       let started = false;
       while (st.queue.length && this.authorized(j)) { startService(j, …); started = true; }
       if (j === 0) this.feedSource();          // limitless raw material is pulled in directly
       if (!started) break;                     // nothing moved here → upstream unchanged
     }
   }
   ```
The raw-material end mirrors the customer end: in pull mode the arrival stream is a *supplier* that
only delivers while raw stock is below its target (`engine.js:244`), and `feedSource` (`:83–91`)
pulls material in the instant station 0 is both idle and authorized.

**Worked trace (pull, targets all = 2):** line idle, buffers at target. A demand arrives →
`fg--` → last station now `down < target` → `authorized` true → it pulls a queued part and runs →
its completion later frees a buffer → `cascade` authorizes the station before it → … the
authorization walks upstream one consumption at a time until it reaches raw material, which
`feedSource` replenishes. Total WIP can never exceed `Σ targets` — exactly the property the test
`pull mode: total inventory never exceeds sum of kanban targets` asserts.

### 5.3 Multi-level CONWIP in the factory (`AdvancedSim`)
A factory has BOMs, so "pull" must explode demand down through components. Three pieces:

1. **CONWIP limit per part** — a demand product is capped by its own `conwip`; a pure intermediate
   has no own cap (it's bounded by the dependent demand it receives, already capped at its parents):
   ```js
   pullLimit(pid) { const d = …; return d ? max(1, d.conwip) : Infinity; }       // advanced-engine.js:272–275
   ```
2. **Dependent-demand explosion** — `computePullNeeds` (`:301–323`) is an MRP-style pass in BOM
   topological order (`buildPullOrder`, `:280–293`, parents before components). For each part it
   takes gross demand (external backlog + what parents need), **nets** it against on-hand inventory
   and in-flight WIP, caps by the CONWIP headroom, and cascades the capped figure down to its
   components:
   ```js
   const netReq  = Math.max(0, gross[pid] - inv - wip);          // owed beyond shelf + pipeline
   const headroom = lim===Infinity ? netReq : Math.max(0, lim - wip);
   plan[pid] = Math.min(netReq, headroom);                       // never authorize past CONWIP
   for (const b of p.bom) gross[b.partId] += plan[pid] * b.qty;  // explode to components
   ```
   The result, `pullPlan[pid]`, is "units of `pid` it's OK to start *right now*".
3. **Release gated by the plan** — `tryAssembleAll` (`:337–372`) starts an assembly only if its BOM
   is on hand (`canAssemble`), its first workcenter can take it (`canAccept`), **and** the plan
   authorizes it; each release decrements the authorization:
   ```js
   if (this.controlMode === 'pull' && !(this.pullPlan[p.id] > 0)) continue;   // not authorized → skip
   …createJob(p); if (pull) this.pullPlan[p.id]--;                            // advanced-engine.js:355,366–367
   ```
Finished demand units satisfy the oldest backlog in `pullSatisfy` (`:243–260`), which also shares a
scarce shared intermediate fairly between external customers and the parent assemblies that want it
(the `extTurn` alternation, `:249–254`). Round-robin pointers `rrPtr`/`rrFeed` keep one product
from monopolizing a shared component or a shared first workcenter.

---

## 6. Factory-engine extras (beyond the simple line)

| Feature | Reasoning | Code |
|---|---|---|
| **Routings** | a part visits an ordered list of workcenters | `enterStep`/`nextDest` `:148–174` |
| **Assembly synchronization** | start only when *all* BOM components are on hand | `canAssemble` `:263–266`, consume `:362–365` |
| **`settle()` fixpoint** | resolve cascading admit/unblock within one instant | `:204–221` (guarded loop) |
| **Per-job flow time** | queue+service+blocked time at a workcenter | `sumFlow` in `tryLeave` `:195` |
| **Round-robin fairness** | stop product 1 hogging a scarce shared part | `rrPtr` `:368`, `rrFeed` `:393`, `extTurn` `:249–254` |
| **Limitless vs stream supply** | purchased parts ∞, or arrival streams per source | constructor `:110–123`, `feedSources` `:376–397` |

---

## 7. Design reasoning in one place ("why this, not that")

- **Heap FEL, not a sorted array** — O(log n) insert/extract-min; the FEL is hit on every event.
- **Version stamps, not heap deletion** — cancelling a preempted departure by bumping a counter and
  skipping it on pop is O(1) and avoids arbitrary heap removal (§3.3).
- **Area method for time-averages** — the mathematically correct estimator for time-persistent
  quantities, and trivial because state is piecewise-constant (§3.4). Sample-averages (cycle time)
  are kept separate on purpose.
- **Seeded RNG** — reproducible tests, replications (`seed+i`), and common-random-numbers variance
  reduction when comparing scenarios.
- **Engine simulates; formulas overlay** — the VUT/propagation equations are never assumed by the
  engine, only drawn on top of simulated truth, so the tool can't "cheat" toward the theory (§4).
- **Pull authorization is one predicate** (`authorized`) plus an upstream `cascade` — small, local,
  and testable; CONWIP falls out as the whole-line special case.

For the full derivations, validity argument (oracles vs approximations), and the design of a future
*modeling-teaching* app, see `docs/DES-ENGINE-AND-FACTORY-DYNAMICS.md`.
