# Design Language — DES Teaching Application
### "Editorial engineering" — McKinsey meets the machine shop

> **Status:** DRAFT v0.1 for review. The palette and typography are the most
> opinion-driven choices — change them freely. Once ratified this becomes
> `docs/DESIGN-LANGUAGE.md` and Phase 1 builds the app shell to these tokens.

---

## 0. Direction in one line

Calm, precise, authoritative. The feel of a top-tier consulting document crossed
with precision-engineering documentation — **data-forward, quiet, legible**.

**This is explicitly NOT:** the old demo's neon-on-black, glowing grids, pulsing
machines, pill-shaped cyber toggles. No glow. No neon. No dark "cyber" grid.
No purple-gradient-on-white. No Inter/Arial/system-font default look.

**It IS:** a light, paper-like base; hairline structure; generous white space;
an editorial serif for headings; monospace for every number; one disciplined
accent doing real work.

---

## 1. Colour tokens (proposal)

Light, warm-neutral base with a single serious primary and one muted signal
accent. Everything as CSS variables.

```css
:root{
  /* base & surface */
  --paper:      #F6F5F1;   /* app background — warm off-white */
  --surface:    #FFFFFF;   /* cards / panels */
  --surface-2:  #FBFAF7;   /* nested / subtle fill */

  /* ink (text) */
  --ink:        #1B1D1A;   /* primary text, near-black */
  --ink-2:      #585C57;   /* secondary text */
  --faint:      #8B8F89;   /* captions, hints */

  /* structure */
  --line:       #E5E3DC;   /* hairline borders */
  --line-strong:#CFCCC3;   /* emphasised dividers */

  /* primary — deep petrol (serious, engineering) */
  --primary:    #0F5F57;
  --primary-600:#0B4A44;   /* hover/pressed */
  --on-primary: #FFFFFF;

  /* signal accent — muted ochre, used sparingly */
  --accent:     #B8852A;

  /* semantic simulation states (muted, functional — never neon) */
  --busy:       #2E7D6B;   /* processing */
  --idle:       #B7B4AC;   /* idle / starved */
  --blocked:    #C2762E;   /* blocked */
  --down:       #B5462F;   /* broken down */
  --scrap:      #8E2F22;   /* scrapped */

  /* chart palette — desaturated, print-friendly, categorical */
  --c1:#0F5F57; --c2:#B8852A; --c3:#3E5C76;
  --c4:#A8553F; --c5:#6B8F71; --c6:#6E4C6B;
}
```

A refined **dark mode** can come later, but the primary, ratified look is light.

---

## 2. Typography (proposal)

A cohesive **IBM Plex** system — engineering pedigree, professional, free on
Google Fonts, distinctive without being trendy or cyber.

- **Display / headings:** *IBM Plex Serif* — editorial gravitas.
- **UI / body:** *IBM Plex Sans* — clean, humanist, neutral.
- **Data / metrics / code:** *IBM Plex Mono* — every number, KPI, table figure,
  and code-like label is mono. This is a signature of the whole app.

**Scale (px):** display 36 · h1 28 · h2 20 · section-label 12 (uppercase,
tracked, mono, --faint) · body 15 · small 13 · data 13–14 mono.
**Weights:** headings 500–600; body 400; emphasis 500. Avoid heavy/black weights.

> Section headers use a tracked, uppercase **mono** label (e.g. `CONCEPTUAL MODEL`)
> above a serif title — the editorial-engineering signature.

---

## 3. Spacing, shape, depth

- **Grid:** 8px base (4px for fine adjustments). Generous, consistent rhythm.
- **Radii:** 4px controls, 8px cards. No pills (no fully-rounded toggles/buttons).
- **Borders:** 1px hairline (`--line`) is the primary structural device — not
  shadows, not glow.
- **Shadows:** barely there. `0 1px 2px rgba(0,0,0,.04), 0 6px 16px rgba(0,0,0,.05)`
  for raised surfaces only (drawers, popovers). Flat by default.
- **Layout:** max content width ~1280px; clear column structure; white space is
  a feature, not waste.

---

## 4. Components

- **Buttons:** primary = solid `--primary` on white text, small radius; secondary
  = ghost with hairline border, ink text; hover darkens/!subtle fill. No glow.
- **Segmented controls (Push/Pull etc.):** flat; selected segment = filled
  `--surface-2` with `--primary` text + 1px primary underline. Not neon-filled.
- **Inputs/selects:** white, hairline border, 4px radius; focus = 1px `--primary`
  border + faint primary ring (no heavy glow). Numbers in mono.
- **Panels:** white surface, hairline border, 8px radius; header row = tracked
  uppercase mono label, optional serif sub-title; quiet.
- **Tables:** very subtle zebra (`--surface-2` alt rows); numerics right-aligned
  in mono; header = small tracked uppercase faint. Data density is fine here.
- **KPI tiles:** small uppercase mono label + large mono value; hairline border;
  flat. Optional tiny trend/΋reference line beneath.
- **Iconography:** minimal line icons (e.g. Lucide); 1.5px stroke. **No emoji in
  the chrome** — replace the demo's ⚙▶⏩ etc. with line icons.

---

## 5. Data visualisation

The charts are the product's face — treat them like figures in a serious report.
- Thin lines (1.5px), clear axes with faint gridlines, ample labelling.
- Categorical series from the chart palette (§1); never rainbow, never neon.
- **Confidence intervals** render as quiet shaded bands; **theory overlays**
  (Factory Physics references) as dashed reference lines clearly labelled.
- Mono tick labels and legends. Everything should look good printed in grayscale.

---

## 6. Motion

Restraint. Motion clarifies, never decorates.
- Transitions 120–200ms, ease-out. Hovers/focus subtle.
- **One** tasteful page-load reveal (short staggered fade/slide of major panels).
- Simulation tokens move smoothly (~300–400ms ease) between positions; **state
  changes read through colour and a thin progress bar, NOT glow or pulsing.**
- No infinite animations in the chrome (the demo's pulsing machine glow is gone).

---

## 7. The simulation floor (specific)

This is where the old aesthetic was loudest, so be deliberate:
- Light canvas; optional *faint* dotted grid (low-contrast, not neon lines).
- Machines/workcenters: clean rounded rectangles, hairline borders; **state via
  fill + border colour** from the semantic set (§1), plus a thin progress sliver
  for "busy" — no glow halo.
- Storage/buffers: distinct quiet shape (e.g. bracketed slot), fill bar muted.
- Tokens (jobs): small solid dots in muted part colours; queued dots slightly
  smaller/lighter; scrapped dot fades out on drop.
- Transport (Phase 3): conveyors as thin tracked lines; people-movers as small
  labelled markers travelling the path. Quiet, legible, diagrammatic.

---

## 8. Do / Don't (quick reference)

**Do:** hairlines · white space · mono numerics · editorial serif headings ·
one petrol primary + one ochre signal · muted functional state colours · quiet
precise motion · grayscale-legible charts.

**Don't:** neon · glow/halos · dark cyber grids · pulsing animation · pill toggles ·
emoji in chrome · purple gradients · Inter/Arial/system-font default look ·
rainbow chart palettes.
