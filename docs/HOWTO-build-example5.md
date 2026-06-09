# How to build `#example5` from scratch (mouse + keyboard)

> A click-by-click walkthrough of building the deepest demo — a **3-level BOM where the
> sub-assembly is also sold** — entirely in the floor UI (`app/floor.html`), no deep-links.
> The model: a **Pump** (sold) = 1 **Motor** + 2 **Housing**; the **Motor** (sold *and* a
> component) = 1 **Rotor** + 4 **Magnet**; Housing & Rotor are fabricated, Magnet is bought-in.
> Run under **CONWIP (pull) + limitless supply**.
>
> The authoring path used below is exercised automatically by
> `tests/ui/authoring-selftest.html` (drives these same gestures headlessly).

The layout is two horizontal lines: the **Pump line** (top) and the **Motor line** (bottom),
each ending in its own sink.

```
 Steel ──► Mill ─────────────────► Final assy ──► Pumps out        (top: Pump line)
 Magnet store ─┐
 Bar ──► Lathe ─► Motor assy ──► Motors out (spares)               (bottom: Motor line)
                       ▲
                       └ Magnet store feeds Motor assy
```

---

## 0. Open & clear
1. Open **Model & Floor** (`app/floor.html`).
2. Top toolbar → **Clear** (start from an empty floor with one default product part).

## 1. Place the nodes
Pick a tool in the palette (Source / Resource / Storage / Sink), then **click an empty spot**
on the canvas to drop that node. Place these eight (rough positions — you can drag them later
in **Move**):

| Tool | Node | Where |
|---|---|---|
| Source | Steel (housing) | top-left |
| Resource | Mill | top, right of Steel |
| Resource | Final assy | top-right area |
| Sink | Pumps out | far top-right |
| Source | Bar (rotor) | bottom-left |
| Resource | Lathe | bottom, right of Bar |
| Source | Magnet store | bottom-middle, slightly above Lathe |
| Resource | Motor assy | bottom-middle-right |
| Sink | Motors out (spares) | bottom-right |

> Tip: switch to **Move** to drag nodes into a tidy two-row layout. Placing a node does **not**
> route it — routes are built explicitly in Step 6.

## 2. Set each node's parameters (Inspect tab)
Click a node (in **Move**) to open the **Inspect** panel on the right. Type in:

- **Steel (housing)** — Interarrival time: Exponential, **mean 2.5**.
- **Bar (rotor)** — Interarrival: Exponential, **mean 3**.
- **Magnet store** — Interarrival: Exponential, **mean 0.6**.
- **Mill** — Service time: Lognormal, **mean ≈ 1.4**.
- **Lathe** — Service time: Lognormal, **mean ≈ 1.2**.
- **Motor assy** — Service time: Lognormal, **mean ≈ 1.5**.
- **Final assy** — Service time: Lognormal, **mean ≈ 2**.

(Optionally rename each node in the **Name** field; give Mill/Lathe/assemblies a symbol.)

## 3. Mark the two assembly stations
Still in **Inspect**:
- Click **Final assy** → tick **“Assembly station (consumes a product’s BOM)”**.
- Click **Motor assy** → tick **“Assembly station …”**.

## 4. Define the parts and their BOMs (Parts manager)
Go to the **Model** tab → **BOM & Parts** sub-tab → **Manage parts…** (opens the modal).
You start with one default part — make it the **Pump**, then add the rest:

1. Select the default part → **Part name** “Pump”, **Type = Product**.
2. **+ Add part** ×4 and set each: **Housing** (Made), **Rotor** (Made), **Magnet** (Bought),
   **Motor** (Product).
3. Give **Motor** its BOM: select Motor → under *Bill of materials* click **+ component**
   twice → set the rows to **Rotor ×1** and **Magnet ×4**.
4. Give **Pump** its BOM: select Pump → **+ component** twice → **Motor ×1** and **Housing ×2**.

## 5. Set customer demand (still in the Parts manager)
Both finished products are sold, each with its own order stream:
- **Pump** → tick **“Sold to customers”** → Time between orders ≈ **6**; CONWIP limit ≈ **4**.
- **Motor** → tick **“Sold to customers”** → Time between orders ≈ **12**; CONWIP limit ≈ **6**.
  (This is what makes the sub-assembly independently sold.)

Click **Done** to close the modal.

## 6. Build each part’s route (Route tool)
Routes are per-part, so set the **active part** first (click it in the **Parts** summary list),
then click the palette **Route** tool and **click the nodes in flow order** on the canvas
(click the last one again to undo a misclick). Do this for all five:

| Active part | Click nodes in order |
|---|---|
| Housing | Steel → Mill → **Final assy** |
| Rotor | Bar → Lathe → **Motor assy** |
| Magnet | Magnet store → **Motor assy** |
| Motor | **Motor assy** → Motors out |
| Pump | **Final assy** → Pumps out |

> A component’s route **ends at the assembly station that consumes it** (so it physically
> travels there) — except the **Motor**, which finishes at its own “Motors out” sink and is
> pulled into the Pump from the shared shelf. That pull shows on the floor as the **dotted,
> Motor-coloured arrow** into Final assy.

## 7. Set control & supply
**Model** tab → **Control & Demand** sub-tab:
- **Release control → CONWIP (pull)**.
- **Raw supply → Limitless**.

## 8. Run & read
- Press **Play** (or **Step**) and watch units flow, each coloured by its part.
- Open the **BOM inset** (top-left of the canvas, **⤢** to magnify) to see the 3-level tree and
  every part’s route; the **Motor** is tagged **shared** with its split rule.
- Open the **Flow** tab to read, live and by location, which parts are at each station / leg /
  the on-hand shelf.
- Press **End** to freeze the statistics and read throughput, cycle time, per-part fill rate, etc.

You’ve now reproduced `#example5` by hand.
