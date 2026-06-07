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
