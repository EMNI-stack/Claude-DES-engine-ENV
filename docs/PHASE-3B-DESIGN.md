# Phase 3 · Milestone 2b Design Note — Branching & Assembly

> **Status: PROPOSAL for review.** No engine/UI code until approved (the Phase-3 pattern).
> Builds on `docs/PHASE-3-DESIGN.md` (the `des-floor/v1` model was shaped for this from day one) and
> lifts the **assembly synchronisation** logic conceptually from the validated `src/advanced-engine.js`
> (`canAssemble` / consume / BOM in topological order) into `src/floor-engine.js`. The legacy engines
> and demo stay untouched (Charter §4.2).

## 1. Goal & scope

Let a student model **more than one product** on the floor, where:
- **Branching** — different products/parts follow **different routes** (and may share stations).
- **Assembly** — an **assembly node consumes a bill of materials (BOM)**: it starts a product unit only
  when *all* its component parts are on hand, consuming them (fork-join matching). Components' **transport
  time gates assembly**, so layout still matters — the farthest/slowest component path sets the pace.

**In 2b:** multiple parts, per-part routes, one BOM level deep is enough to teach it but the model allows
nested BOMs (a component can itself be assembled). **Out of 2b:** auto-layout, scheduling/dispatch
policies, and anything already excluded in Charter §6 (pathfinding, AGV fleets, …). Push/pull, scrap,
breakdowns, conveyors/workers all carry over unchanged per part.

## 2. Data model (extends `des-floor/v1`, no breaking change)

The model already has `parts[]`; today the engine only drives `parts[0]` (`mainPart`). 2b generalises:

```jsonc
parts: [
  { id:"p_body",   name:"Body",   kind:"fabricated", route:["src","Cut","Press","Assy"] },   // a component
  { id:"p_bolt",   name:"Bolt",   kind:"purchased",  route:["boltSrc","Assy"] },             // bought-in
  { id:"p_widget", name:"Widget", kind:"product",
    bom:[ {part:"p_body", qty:1}, {part:"p_bolt", qty:4} ],   // consumed at its assembly node
    route:["Assy","QC","Ship"], demand:<dist|null> }          // product begins at the assembly node
]
```
- **Per-part `route`** (rename of the single `routeOrder`; the existing field migrates to the first
  part's route). Legs are the **union of consecutive pairs across all parts' routes** — a shared
  physical edge is one leg/mover, exactly as now.
- **Assembly node** = a `resource` flagged `assembly:true`. A `product` part lists a `bom`; the node
  holds arrived components and starts the product when the BOM is satisfied and a machine is free.
- A part's `kind`: `fabricated` (made on the line, enters at a source), `purchased` (appears at a
  source with no upstream ops), or `product` (assembled). Backwards compatible: a lone linear part with
  no `bom` behaves exactly like today.

## 3. Authoring UX — **the one decision to confirm**

Recommended (consistent with the current UI and the data model):
- A **Parts panel** (new sub-section of the Model tab): add/remove parts, name them, set kind, set
  per-product **demand**. Selecting a part makes it the "active part".
- **Route by selection:** with a part active, its route is the ordered node list (the existing Route
  list UI, now **per active part**); reorder/add/remove as today. Different parts → different routes =
  branching. Each part is drawn with a faint colour tint on its legs so overlapping routes are legible.
- **Assembly:** mark a resource `assembly` in its inspector; the **product** part gets a small **BOM
  editor** (rows of *component part × qty*). The node shows an assembly glyph; components' routes must
  end at it.

**Alternative considered (NOT recommended for 2b):** free **arrow-drawing** graph editing (draw edges
between nodes, infer part flow from connectivity). More powerful, but a big departure from the current
ordered-route model, much more UI, and harder to keep legible — deferred.

→ **Confirm:** per-part ordered routes + a Parts panel + a BOM editor (recommended), or do you want the
arrow-drawing graph approach instead?

## 4. Engine plan (`src/floor-engine.js`, additive)

- **Multi-part release/flow.** Generalise `mainPart`-based release to **all parts**: each part streams
  arrivals (fabricated/purchased) per its own supply/demand; jobs carry `part` + that part's `route`
  (already the shape of `job.routing`). Branching needs no special logic — distinct parts, distinct routes.
- **Assembly (lifted from `advanced-engine`).** At an `assembly:true` node, arriving **component** jobs
  are held in a per-node, per-part **on-hand** store (they "exit" their own route there). A **product**
  job is *created and started* when `canAssemble` (all `bom` components on hand in qty) **and** a machine
  is free; starting it **consumes** the components (they leave the system as consumed) and the product
  proceeds along its route. Components in topological order so nested BOMs resolve (parents before
  components), as in `advanced-engine.buildPullOrder`.
- **Transport gates assembly** for free: a component only becomes "on hand" after its last leg delivers
  it, so a far/slow component delays the product — the teaching point.
- **Control/CONWIP** stays per **product** (the product's `demand`/`conwip` paces releases; components
  are pulled by assembly need). Conveyors, workers, scrap, breakdowns, finite buffers all unchanged.
- **Stats:** per-part throughput/WIP, plus assembly **wait-to-match** (time components sit on hand
  waiting for their siblings) and assembly starvation — the fork-join cost.

## 5. Tests (`tests/floor-engine.test.js`, additive; keep 77 green)

1. **Assembly waits for all components** — product output ≤ min(component supply rates); none start
   until the BOM is on hand.
2. **Transport gates assembly** — moving one component's feeder farther/slower delays the product by
   that leg's added travel (the slowest component paces it).
3. **BOM quantities respected** — `qty:4` consumes 4 per product; consumption balances
   (components_consumed = qty × products_made).
4. **Branching** — two products on partly-shared stations each complete; shared station utilisation =
   sum of both loads.
5. **Conservation & Little's Law** still hold with multiple parts + assembly.

## 6. Build order (each a small, tested commit)

1. **Engine:** multi-part flow + assembly synchronisation + stats + tests (headless; no UI yet).
2. **UI:** Parts panel + per-part route + assembly/BOM editor + per-part leg tinting; an assembly demo
   deep-link (`#example3`, e.g. body + 4 bolts → widget).
3. **Docs:** JOURNAL/DECISIONS/PRINCIPLES entries (assembly = fork-join matching; transport gates it).

## 7. One open question for you

§3 authoring approach — **per-part ordered routes + Parts panel + BOM editor (recommended)** vs
arrow-drawing graph editing. Everything else above I'll take as the default unless you say otherwise.
