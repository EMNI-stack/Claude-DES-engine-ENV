# Recommendations Before Building the Next App (from scratch)

> Pre-build advice for the planned **simulation-modeling teaching app** (the next project, whose
> goal is teaching students to *build and trust* DES models of factory dynamics — see
> `docs/DES-ENGINE-AND-FACTORY-DYNAMICS.md` Part D). Captured for the user to decide on later.
> The cheap-now / expensive-later decisions to lock in before writing line one.

## Do these three first (highest leverage, one-time)

1. **Supply the missing textbook chapters before building the math.** Biggest single quality
   lever, and it's a setup task, not coding. Specifically the classic **Hopp & Spearman,
   *Factory Physics*** variability/factory-dynamics chapters and **Law, *Simulation Modeling and
   Analysis*** output-analysis chapters. The current `Reference/` holds the *managerial* book, so
   the VUT / linking / practical-worst-case formulas were written from general knowledge + the
   distilled `theory-notes.md`. With the authoritative text, every formula can be stated and
   **cited** precisely, and defaults (warm-up, replication counts) justified rather than judged.

2. **Write the learning objectives down first** — 5–10 "by the end a student can *do* X"
   statements, plus the specific **misconceptions to bust** (the WIP-vs-CT curve, utilization
   blow-up near u→1, "zero inventory is optimal" vs critical WIP, batching/bullwhip variance
   inflation). The scaffolded ladder, the auto-checks, and the guess-first interactions all map
   onto this list. Without it, the pedagogy is designed in the dark.

3. **Restate the architecture constraint in CLAUDE.md on commit 1**: static, client-side,
   buildless, deterministic-seeded, no backend. The biggest mistake last time was building a
   server-bound layer (Streamlit) before asking whether a server was warranted. Put the rule in
   writing so it isn't re-litigated.

## The one real architecture bet for this app

The defining new requirement is an **inspectable engine** — students must *see* the future-event
list (FEL), step through events, and watch the statistical estimators build up. That argues for a
different core than the current one: the existing engines use hardcoded per-event-type handlers
(great for a fixed model, weaker for teaching). Consider a **small generic event-scheduling core**
where events are *data* the UI can render, step, and explain, with the *model* (arrival / service
/ routing logic) layered on top. Keep the headless engine cleanly separated from rendering (the
current `step()`-vs-view split is right) so the **same** core can run fast for replications **and**
crawl for a step-through demo. Decide this before rung 1 — retrofitting introspection is painful.

## Don't start from zero — lift what's already parity-tested

Reusable, validated assets in this repo:
- `src/distributions.js` (samplers + analytic SCV).
- The **parity-tested analysis core** `src/analysis/*.js` (stats/ingest/output-analysis/metrics/
  characteristic/compare).
- The dark theme / CSS and the vendored Plotly setup (`vendor/plotly.min.js`).
- The headless-screenshot test harness and the JSON-**schema-as-contract** pattern.
Decide explicitly what to copy vs. rewrite rather than rebuilding by reflex.

## Small, cheap features with outsized teaching value

- **URL-encoded scenarios** — encode the model spec in the URL so a student can be sent a link to
  an exact setup ("open *this* line and predict the WIP"). Trivial; great for lectures/assignments.
- **A visible seed control** — reproducibility is itself a lesson and powers the common-random-
  numbers (CRN) variance-reduction demo (compare two scenarios on the same seeds vs independent
  seeds and watch the variance of the *difference* collapse).
- **Build the first rung as a full vertical slice** before expanding: a single M/M/1 queue with a
  *visible, steppable FEL* and a live Little's-Law check, end-to-end (UI + engine + test +
  screenshot). Prove the inspectable-engine bet on the simplest model first.

## Process

- Start the `NOTES.md` decision log and **pin dependency versions** from commit 1.
- Write the verification-&-validation checks *as each rung is built* (Little's Law, Erlang-C, the
  best/worst envelope) — they are simultaneously the tests and the teaching content.

## Offered next step (not yet started)

Kick-off option, when ready: scaffold the new repo with the CLAUDE.md constraint + NOTES log,
draft the **model-spec data contract**, and build the **rung-1 vertical slice** (M/M/1 with a
visible step-through FEL) as a proof of the inspectable-engine bet. The most useful thing to drop
into the new repo's `Reference/` first is the Factory Physics / Law chapters named above.
