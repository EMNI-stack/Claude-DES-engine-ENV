# How to build `#example5` from scratch (the Setup builder)

> A step-by-step walkthrough of building the deepest demo — a **3-level BOM where the sub-assembly is
> also sold** — using the **Set up model** builder (`app/floor.html`).
> The model: a **Pump** (sold) = 1 **Motor** + 2 **Housing**; the **Motor** (sold *and* a component) =
> 1 **Rotor** + 4 **Magnet**; Housing & Rotor are fabricated, Magnet is bought-in. Run under
> **CONWIP (pull) + limitless supply**.
>
> The authoring path used below is exercised by `tests/ui/authoring-selftest.html` (drives the same
> Setup-drawer gestures headlessly).

Two product lines: the **Pump line** and the **Motor line**, each ending in its own sink. You define
everything in the **Set up model** popup; **Apply & lay out** auto-arranges it on the floor.

```
 Steel ─► Mill ───────────────► Final assy ─► Pumps out          (Pump line)
 Bar ─► Lathe ─► Motor assy ─► Motors out (spares)               (Motor line)
 Magnet store ─► Motor assy                                      (bought-in)
 (when a Pump needs a Motor, a Motor is delivered Motor assy ─► Final assy)
```

---

## 0. Open the builder
Open **Model & Floor** (`app/floor.html`) and click **⚙ Set up model** (an empty model opens it
automatically). The builder is a large popup with a **live preview** on top and four sections.

## 1 · Stations
In **1 · Stations**, use **+ Source / + Workcenter / + Storage / + Sink** to add the eight stations,
and set each one's parameters in its card:

| Add | Name it | Parameters |
|---|---|---|
| Source | Steel (housing) | Interarrival Exponential, mean 2.5 |
| Workcenter | Mill | Service Lognormal, mean ≈ 1.4 |
| Workcenter | Final assy | Service Lognormal, mean ≈ 2 · tick **Assembly station** |
| Sink | Pumps out | — |
| Source | Bar (rotor) | Interarrival Exponential, mean 3 |
| Workcenter | Lathe | Service Lognormal, mean ≈ 1.2 |
| Source | Magnet store | Interarrival Exponential, mean 0.6 |
| Workcenter | Motor assy | Service Lognormal, mean ≈ 1.5 · tick **Assembly station** |
| Sink | Motors out (spares) | — |

(The live preview updates as you go. Exact positions don't matter — Apply auto-lays-out the floor and
you can drag to fine-tune afterward.)

## 2 · Parts & BOM
In **2 · Parts & BOM**, add the parts (**+ Add part**), select each in the list and set it in the
editor:
- **Pump** — Type **Product**; sold (see §3 demand); BOM = **Motor ×1 + Housing ×2**.
- **Motor** — Type **Product**; sold; BOM = **Rotor ×1 + Magnet ×4**.
- **Housing** — Type **Made**.
- **Rotor** — Type **Made**.
- **Magnet** — Type **Bought**.

For Pump and Motor, tick **“Sold to customers”** and set the order stream + CONWIP limit:
- **Pump** — time between orders ≈ **6**, CONWIP ≈ **4**.
- **Motor** — time between orders ≈ **12**, CONWIP ≈ **6** (this is what makes the sub-assembly
  independently sold).

## 3 · Routes
In **3 · Routes**, each part has a row with a **“+ add station to route…”** dropdown — pick stations in
flow order:

| Part | Route |
|---|---|
| Housing | Steel → Mill → **Final assy** |
| Rotor | Bar → Lathe → **Motor assy** |
| Magnet | Magnet store → **Motor assy** |
| Motor | **Motor assy** → Motors out |
| Pump | **Final assy** → Pumps out |

> A component’s route normally **ends at the assembler that consumes it** (so it travels there) —
> Housing→Final, Rotor/Magnet→Motor. The **Motor** is special: it finishes at its own “Motors out” sink
> (so it can be sold as a spare) **and** is built into Pumps. When a Pump needs a Motor, one is pulled
> from the shared shelf and **delivered along a supply leg Motor assy → Final assy** — a normal
> transport leg you’ll see on the floor, with Motor-coloured tokens travelling it.

## 4 · Control, source & demand
In **4 · Control, source & demand**: set **CONWIP (pull)** and **Limitless** supply.

## 5 · Apply & run
Click **✓ Apply & lay out** — the floor is auto-generated. Then on the floor:
- **Play / Step** to watch units flow, each coloured by its part; **End** to read the statistics.
- Open the **BOM inset** (top-left, **⤢** to magnify) for the 3-level tree and every part’s route; the
  Motor is tagged **shared** with its split rule.
- Open the **Flow** tab to read, live and by location, which parts are at each station / leg / shelf.
- On the floor you can **drag to reposition, tune any station’s parameters (Inspect), and set per-leg
  transport** — to change structure (stations, parts, routes), reopen **⚙ Set up model**.

You’ve now reproduced `#example5`.
