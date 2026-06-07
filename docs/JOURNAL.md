# Work Journal

> Chronological log of work on the DES teaching application: what was done, what
> source informed it, doubts raised, and open todos. Newest entries at the bottom.
> Updated as part of every task. Companions: `docs/PROJECT-CHARTER.md` (scope anchor),
> `docs/DECISIONS.md` (decision log), `docs/PRINCIPLES.md` (theory).

---

## 2026-06-05 — Phase 0: ratify charter, establish documentation system

**Done today**
- Read `docs/PROJECT-CHARTER.md` in full and skimmed `Reference/theory-notes.md` as the
  theoretical anchor.
- Ratified the charter's decisions and seeded `docs/DECISIONS.md` (append-only log) with
  the seven ratified decisions: (a) client-side / no backend; (b) build on the existing
  engine as new files & pages; (c) methodology scaffolding first-class; (d) 2D layout &
  transport kept simple; (e) source roles (Robinson spine & student-facing, Law behind
  the scenes, Factory Physics quantitative, FP for Managers qualitative); (f) retire the
  demo aesthetic for "McKinsey-meets-engineering"; (g) guided rails over open sandbox.
- Created `docs/PRINCIPLES.md`, seeding the core principles drawn from the notes
  (validity is confidence not proof; never present a single run as the answer;
  assumptions vs simplifications; time-average vs sample-average; Little's Law; theory as
  overlay; evaluate layout dynamically) — each with a source tag bridging to
  `Reference/theory-notes.md`.
- Created this journal.
- Added a documentation rule to `CLAUDE.md` (under Rules) making doc upkeep part of every
  task and naming the charter as the scope anchor.

**Sources informing this work:** Charter §§3–12; `Reference/theory-notes.md` §§1, 2, 3, 4,
5 (Robinson primary; Law behind the scenes; Hopp & Spearman quantitative; FPD layout).

**Scope note:** documentation only this phase — no engine code, app pages, or tests were
touched (per Charter §10 Phase 0 and the task brief).

**Open questions carried forward (Charter §11):**
- **Confirm the v1 minimal 2D/transport floor** (Charter §6) is the right scope before
  Phase 3 — it is the main engineering risk. (Distribution/units conventions are being
  fixed in `theory-notes.md` §1 and enforced everywhere.)

**Next:** Phase 1 — app shell & aesthetic foundation (new pages/files, the
McKinsey-meets-engineering design system, navigation, reuse the engine).

---

## 2026-06-07 — Scope refinement: lock phase order

**Done today (stakeholder direction)**
- **Phase order locked.** Methodology scaffolding stays **Phase 2**, the 2D layout &
  transport engine stays **Phase 3**; the earlier suggestion that these two phases could be
  reordered is removed (Charter §10). Logged in `docs/DECISIONS.md`.
- Tightened the competence objective in Charter §2 to "efficiency and flexibility" and
  aligned `Reference/theory-notes.md` and project memory accordingly.

**Scope note:** documentation only — no engine code, app pages, or tests touched.

---

## 2026-06-07 — Phase 1: app shell & design-system foundation

**Done today**
- Implemented the ratified design language (`docs/DESIGN-LANGUAGE.md`) as a shared stylesheet
  `app/styles/design-system.css`: full CSS-variable token set (colour, IBM Plex type families &
  scale, 8px spacing, radii, hairline borders, barely-there shadow, motion), IBM Plex Serif/Sans/
  Mono loaded from Google Fonts, and base components — buttons (primary/ghost), segmented control,
  inputs/selects, panels (mono section-label + serif title), tables, KPI tiles, state badges,
  line icons, and the later-phase placeholder block. Light, hairline-based; no neon/glow/pills/emoji.
- Stood up the application shell in a new flat `app/` folder with shared chrome injected by
  `app/js/nav.js` (header + footer, active-section highlighting). Persistent nav reflects the
  charter sections: **Methodology, Model & Floor, Run & Analyse, Factory Physics**.
- Built the **home/landing** page (`app/index.html`) in the new aesthetic, and four **placeholder**
  section pages (`methodology`, `floor`, `analyse`, `physics`), each present in the nav, tagged with
  its phase, and describing its planned scope.
- Built the **component gallery / kitchen sink** (`app/gallery.html`) showing every token and base
  component in one place for review.
- Built the **engine smoke test** (`app/smoke.html` + `app/js/smoke.js`): imports the existing
  `src/engine.js` unmodified, runs a small two-station line headlessly, and displays throughput,
  WIP, cycle time, per-station utilisation, and a Little's-Law consistency check. Verified in Node
  (seed 42, 2000 time units): throughput 0.611, WIP 4.62, CT 7.40, util 74.6% / 61.3%, WIP ≈ TH×CT.
- Linked the new app to the legacy demo (footer: production line / factory builder, labelled the old
  prototype). The engine, `src/`, and demo pages (`index.html`, `advanced.html`) were **not** touched.

**Live vs placeholder**
- Live: Home, Design system (gallery), Engine check.
- Placeholder (present in nav, built later): Methodology (P2), Model & Floor (P3), Run & Analyse
  (P4), Factory Physics (P5).

**Verification:** `npm test` → 62/62 pass (engine untouched).

**Decisions logged:** design-language ratification; the `app/` folder structure (see
`docs/DECISIONS.md`, 2026-06-07).

**Sources informing this work:** `docs/DESIGN-LANGUAGE.md`; Charter §§3–9.

**Next:** Phase 2 — methodology scaffolding (conceptual-model builder, assumptions log, V&V
framing) on this shell.

---

## 2026-06-07 — Phase 2: methodology scaffolding (Robinson backbone)

**Done today**
- **Project container** (`app/js/project.js`): one schema-tagged JSON object (`des-study/v1`) per
  student holding `meta`, `conceptual` (objectives / factors / responses / content), `assumptions`,
  `vv`, and reserved `model` (Phase 3) / `results` (Phase 4) nulls. Factors & responses carry stable
  ids for later binding. localStorage autosave + JSON file save/load (Blob/FileReader, like the demo)
  + a defensive `migrate()`.
- **Study-process overview** on `methodology.html`: a calm diagram of Robinson's four activities with
  "Conceptual model" marked active and a note that V&V runs throughout (not a stage).
- **Conceptual-model builder** (`app/js/methodology.js`): a stepped, revisitable workspace (left rail
  + content, deep-linked by URL hash) walking Objectives → Experimental factors → Responses → Model
  content, each in plain language with helper text and an optional fast-food worked example. The
  "simplest model that meets the objectives" rule is stated in the intro and the content step.
- **Assumptions & simplifications log**: typed entries (ASSUMPTION = knowledge gap vs SIMPLIFICATION
  = deliberate reduction), each with rationale, data-availability tag (A/B/C), uncertainty note, and a
  sensitivity flag; selecting category C prompts "test by sensitivity analysis later (Phase 4)".
- **V&V framing**: verification-vs-validation explainer, the forms of validation, the first-class
  message "a model is never valid in general — V&V builds confidence", and a manual progress
  checklist (now-items vs Phase 3–4 items, honestly marked).
- **Export** (`export.html` + `app/js/export.js`): a clean print-friendly HTML document (print → PDF)
  plus a Markdown download of the whole front matter.
- Added `app/styles/methodology.css` (layout only, built on Phase 1 tokens — no component restyling).

**Scope:** strictly Charter §5. No model execution, no 2D floor, no warm-up/replications/CI, no
Factory Physics overlays — nav placeholders stay placeholders. Nothing exceeded the charter. Engine,
`src/`, and the legacy demo were not touched.

**Verification:** `npm test` → 62/62 pass (engine untouched). New JS passes `node --check`. Rendered
both pages in headless Chrome: no console errors; the step rail builds all six steps and the export
document renders. Screenshots reviewed — on-brand with Phase 1.

**Decisions logged (2026-06-07):** project-container data structure; stepped revisitable wizard;
export format (print HTML + Markdown). **Principles added:** study-process cycle; conceptual-model
elements; data A/B/C → sensitivity (all cited to Robinson).

**Sources:** `Reference/theory-notes.md` §2.2–2.5; Charter §2, §5; `docs/DESIGN-LANGUAGE.md`.

**Next:** Phase 3 — the 2D floor & transport engine (binds the model to the factors/responses ids
defined here).
