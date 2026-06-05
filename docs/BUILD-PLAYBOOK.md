# Build Playbook & Retrospective — DES Factory Simulator + Analysis

> A distillation of how the "Claude DES Engine" was built, what worked, what hurt,
> and how to do it faster and better next time. Written as a reusable reference for
> building **client-side, teaching-oriented simulation/visualization apps**.
> Companion to the per-decision `memory/` notes and the running `analysis/NOTES.md`.
> For the deep technical treatment of the DES engine internals, the factory-dynamics theory,
> how the code realizes/validates each principle, and how to design a *simulation-modeling*
> teaching app, see **`docs/DES-ENGINE-AND-FACTORY-DYNAMICS.md`**.

Last updated: 2026-06-05.

---

## 1. What this project is (and the one decision that shaped everything)

A discrete-event simulation (DES) tool for teaching queueing theory and production-line
dynamics. Two simulators (a simple serial line, and an advanced BOM/routing factory) plus
an analysis-and-visualization dashboard. Built for a lecturer to use and show students.

**The decision that made everything else easy: no backend.** The whole thing is a static
site — native browser ES modules, no build step, no server, no database — deployable to
GitHub Pages as-is. Every later choice (vendoring libraries, porting analysis to JS,
packaging options) flows from protecting that property. When in doubt, the question was
always: *can the browser compute this itself?* The answer was almost always yes.

### Final shape
- `index.html` — simple production-line simulator (UI, canvas rendering, controls).
- `advanced.html` — BOM/routing factory builder + multi-part simulator.
- `analysis.html` — **in-browser** analysis dashboard (Plotly.js), the primary analysis path.
- `src/engine.js`, `src/advanced-engine.js`, `src/distributions.js` — the simulation core.
- `src/analysis/*.js` — analysis math ported to native ES modules (stats, ingest,
  output_analysis, metrics, characteristic, compare). ~650 lines.
- `analysis/des_analysis/*.py` — the original Python analysis core (~860 lines), now an
  optional power-user tool (Streamlit dashboard + exporters).
- `analysis/run_sim.mjs` — Node harness: runs the real engines over N seeded replications
  and emits the JSON schema (multi-replication data the browser can't easily produce).
- `vendor/plotly.min.js` — vendored Plotly (4.4 MB, MIT) so charts work offline, no CDN.
- `tests/*.test.js` (node:test) + `analysis/tests/*.py` (pytest) — ~62 JS + ~50 Python tests.

### The linchpin: one data contract
A single JSON schema, `des-analysis/v1` (plus `des-analysis/sweep-v1`), is produced by
**three** independent sources — the Node harness, the `index.html` export, and the
`advanced.html` export — and consumed by **two** dashboards (Python and JS). Defining and
documenting that schema once (in `analysis/NOTES.md`) is what let every piece stay
interchangeable. **A shared, documented data contract is the highest-leverage artifact in a
multi-component build. Write it first, version it, never let producers/consumers drift.**

---

## 2. How it was actually built (chronology)

Two arcs. The engines/simulators came first (commits `1e68b87`…`0567071`). Then the
analysis companion, which is the part this playbook focuses on:

1. **Data bridge** (`db4bf10`, `b4d5a09`): Node harness + JSON schema + sample datasets;
   "Download data (JSON)" buttons in both pages emitting the *same* schema.
2. **Python analysis core** (`138600a`): tidy-dataframe ingest + Factory-Physics metrics +
   output-analysis (Welch, MSER-5, batch means, t-CIs) + pytest.
3. **Streamlit + Plotly dashboard** (`c3e9d7b`, `46c1451`, `81e0043`): dark-themed views.
4. **Iteration** (`4307574`…`db4deae`): characteristic curves, flow-factor/VUT congestion,
   variability propagation, scenario comparison, BOM-aware material-flow Sankey.
5. **The pivot** (`6a353c9`…`748acc2`): the Streamlit dashboard needed a local server
   (`localhost:8501`) — a user hit "connection refused" because nothing was running. That
   pain exposed that the analysis was *client-computable*. So the entire analysis layer was
   re-implemented in JS, charts moved to vendored Plotly, and the simulators now hand the
   live run straight to `analysis.html`. No server, ships with the static site.

The pivot is the single most important lesson of the project (see §5).

---

## 3. Patterns that worked (reuse these)

- **Schema-as-contract, written once.** See §1. Document it in a NOTES file; have every
  producer and consumer point at that doc.
- **Cross-language parity testing.** When the Python analysis was ported to JS, the JS tests
  don't just check invariants — they assert the JS output *equals the Python output* on the
  committed sample files (throughput, WIP, CT, bottleneck, flow factor, Little's-Law error,
  CI half-width, Welch cutoff, congestion row, propagation chain, Sankey arcs). Reference
  values were dumped from Python once and baked into the JS tests. This makes drift between
  the two implementations a test failure. **If you reimplement logic, pin it to the original
  with fixture-based equality tests.**
- **Verify UI by headless screenshot.** A browser dashboard's smoke test ("does it throw?")
  is not enough — you want to *see* it. Headless Chrome renders to PNG and the agent can read
  the image back:
  ```
  chrome --headless=new --disable-gpu --hide-scrollbars --window-size=1300,2400 \
         --virtual-time-budget=9000 --screenshot=out.png "http://127.0.0.1:PORT/analysis.html"
  ```
  Serve the site first (`python -m http.server`), use `--virtual-time-budget` so async
  fetch + chart render complete before the capture. Deep-link tabs (`#tab`, `?sample=`) so
  each view can be screenshotted non-interactively. This caught nothing-broke *and* confirmed
  the visuals were actually good.
- **Running decision log + backlog (`NOTES.md`).** Every session retraced state from this
  file plus `git log`. It held the schema, the formulas with sources, decisions, and a
  prioritized backlog. Cheap to maintain, invaluable for resuming. **Keep one.**
- **Incremental commits, one working change each, clear messages.** Made the pivot and every
  iteration safe and legible. `npm test` green before each commit touching the engine.
- **Vendoring for buildless static.** Plotly committed into `vendor/` (not a CDN, not npm).
  One cached asset, works offline, no build step, survives the GitHub Pages constraint.
- **Headless data handoff via `sessionStorage`.** "Analyze this run" stashes the run JSON in
  `sessionStorage` and opens the dashboard, which reads it on boot. No upload/download dance,
  no server, same-origin only. Falls back to file upload + bundled samples.

---

## 4. Pitfalls hit (and how to avoid them)

- **ES modules + `fetch` don't work over `file://`.** A static site that uses
  `<script type="module">` and `fetch()` cannot be run by double-clicking the HTML — browsers
  block module imports and fetches from `file://` origins. It *must* be served over http (or
  packaged). This is the central gotcha for any "download and open" packaging (see §7).
- **Never embed literal control characters in source via the edit tools.** A separator typed
  as a raw unit-separator char got silently stripped to an empty string and, worse, left a
  NUL byte in the file — which then made the file "binary" and broke all subsequent
  string-match edits. Fix: construct such characters in code (`String.fromCharCode(31)`),
  never paste them. If string-match edits start failing mysteriously, grep for `\0` / "binary
  file matches".
- **Reimplementing `scipy.stats.t.ppf` in JS.** No stdlib Student-t quantile in JS. Solved
  with the regularized incomplete beta (`betai`, via a Lanczos `gammaln` + Numerical-Recipes
  continued fraction) → t-CDF → invert by bisection. Validated against scipy values
  (`t.ppf(0.975, df)` for df = 1,2,5,10,30,1000). Bisection is bulletproof and fast enough
  for one-shot CI computation; don't bother with Newton.
- **Welch warm-up parity is subtle.** The across-replication average must keep only grid
  points present in *every* replication, the moving average shrinks at the edges, and the
  "converged" flag (cutoff < 0.6·n) must match. Tiny differences shift the cutoff. Fixture
  equality tests caught this.
- **A half-finished refactor left a dashboard calling an undefined function** (`resolve_dataset`)
  — every view 500'd, but unit tests stayed green because they didn't exercise the page. The
  headless render test is what would have caught it immediately; add UI smoke + screenshot
  early, not late.

---

## 5. The biggest lesson: question the architecture before polishing it

We built a perfectly good Streamlit dashboard and *then* discovered it was the wrong shape —
it required the user to run a Python server, which is exactly the friction a lecturer
showing students doesn't want. The fix wasn't more polish; it was recognizing that **all the
analysis was client-computable**, so the server should never have existed.

Next time, before building the analysis/visualization layer, ask explicitly:
- Does any of this *need* a server? (State that can't live in the client? Secrets? Heavy
  compute? Cross-user data?) If not → build it client-side from the start.
- What's the artifact the end user actually touches, and what's the friction to get there?
  Optimize that path first.

Had this been asked on day one, the Python core would have been written as the *optional*
batch tool it now is, and the JS dashboard built directly — saving the whole Streamlit detour.
(The Python wasn't wasted: it became the parity oracle for the JS port. But that's a
consolation, not a plan.)

---

## 6. How to rebuild a project like this from scratch (recipe)

Target: a buildless, static, client-side simulation + analysis teaching app.

1. **Ground the domain first.** Read the authoritative source material; distill formulas +
   conventions into a `Reference/theory-notes.md` (paraphrased, with citations). Decide units
   and definitions up front (what is "utilization", "cycle time", SCV, etc.).
2. **Engine core as pure ES modules** (`src/`), no DOM. Deterministic, seeded RNG. Unit-test
   against analytic truth (M/M/c Erlang-C, Little's Law, conservation, yield) — these are
   strong oracles for a simulator.
3. **Define the data contract** (`schema vN`) before any analysis: config summary, scalar
   metrics, per-resource/part tables, time series on a *uniform grid aligned across
   replications* (so Welch can average pointwise), cycle-time samples, per-replication data
   for CIs. Document it once.
4. **Analysis as pure functions** over the schema (ingest → tidy rows → metrics). Keep it
   framework-free so it's testable and portable. Write the math once, in the language the
   dashboard will use. (If a second language is needed as an oracle, port with parity tests.)
5. **Dashboard in the browser** with a vendored chart lib (Plotly). Reuse the app's theme.
   Data sources: live-run handoff (sessionStorage), file upload, bundled samples.
6. **Verify visually** with headless screenshots per view from day one.
7. **Package** only at the end, and only if a downloadable is wanted (see §7) — keep the
   deployed site buildless.

Output-analysis methods to include (all client-computable): Welch's warm-up via moving
average; steady-state t-confidence-intervals across i.i.d. replications; batch means for a
single long run; MSER-5 as a secondary truncation estimate; Little's-Law consistency check;
utilization/bottleneck; SCV; flow factor (CT ÷ T0); VUT/Kingman congestion (Wq = Lq/λ vs the
M/M/1 reference u/(1−u)·t_e); variability propagation via the linking equation; and the
CONWIP characteristic curve (best / practical-worst / worst-case bounds).

---

## 7. Packaging into a downloadable app (the obvious next step)

Because there is no backend, this is a *wrapping* job, not a rewrite. The only real obstacle
is the `file://` limitation (§4). Options, smallest effort first:

- **Single self-contained `.html`** (~½ day): inline JS/CSS/Plotly/samples into one
  classic-script file (no ES-module imports, no fetch) → double-click works offline on any
  OS, zero install. Best for handing to students. Needs a one-off bundling step *for the
  artifact only*; the deployed site stays buildless.
- **PWA** (~½ day): add manifest + service worker → "Install" from the hosted site, offline,
  desktop icon. Still web-hosted.
- **Tauri** (1–2 days): OS-native webview, ~10 MB installer, needs Rust toolchain.
- **Electron** (~1 day): bundles Chromium, ~150 MB, most predictable.

Recommendation for a teaching tool: the **single-file HTML**. Don't reintroduce a server.

---

## 8. What would produce better results next time

Concrete asks, roughly in priority order. (Several are cheap for the user to provide and
would materially raise quality.)

### Source material (biggest quality lever for the domain math)
- **The classic Hopp & Spearman, *Factory Physics* (3rd ed.)** — specifically the chapters on
  basic factory dynamics, variability basics, and "the corrupting influence of variability."
  The local `Reference/` has *Factory Physics for Managers* (Pound/Bell/Spearman) chapters
  1–4, 6, 8 — the strategic/managerial book — which does **not** contain the rigorous
  derivations of the VUT equation, the linking/propagation equations, or the
  practical-worst-case characteristic curve that the analysis actually implements. I derived
  those from general knowledge + the distilled `theory-notes.md`; they should be checked
  against the authoritative text. **Provide the queueing/variability chapters and I can
  verify every formula and cite it precisely instead of paraphrasing from memory.**
- **Law, *Simulation Modeling and Analysis* (full text), and Robinson, *Simulation: The
  Practice of Model Development and Use*.** Only OCR snippets ("Simulation Modeling 1/2.txt")
  were available. The full chapters on output analysis (warm-up, replication design, number
  of replications, variance reduction) would let me tighten the Welch/batch-means/CI choices
  and defaults with proper justification.
- **Banks, Carson, Nelson & Nicol, *Discrete-Event System Simulation*** — for any future work
  on event-list internals, validation, and verification methodology.
- A short written statement of **the course's own conventions/notation** (what the students
  are taught to call things) so the UI vocabulary matches the lectures exactly.

### Access & tooling
- **A headless browser available by default** (Chrome was present this time — that was lucky
  and high-value). Guarantee Playwright/Puppeteer or a known Chrome path so visual
  verification is always possible. Better still: a way to *interact* (click tabs, run the
  sim) headlessly, not just screenshot — would let me test the full live-run→analyze flow
  end-to-end, which I could only verify via a hand-built handoff page this time.
- **Pinned dependency versions / a lockfile** for the Python venv (we used pandas 3, numpy 2,
  scipy 1.17, plotly 6, streamlit 1.58). Pin them so results are reproducible and a future
  session doesn't silently get different behavior.
- **A scratch/spec folder** committed with target screenshots or design references for the
  aesthetic, so "make it beautiful" has a concrete target rather than my judgment alone.

### Process & budget
- **State the architecture constraint and the end-user friction budget on day one** (see §5).
  The single most expensive mistake was building a server-bound dashboard before asking
  whether a server was warranted.
- **More tokens / longer autonomous budget pays off here** specifically for: (a) adversarial
  self-review of the math against sources, (b) more parity/edge-case tests, (c) more
  iteration on chart legibility, (d) packaging + cross-platform verification. The marginal
  token on *verification* (tests + screenshots) had the highest payoff; the marginal token on
  prose had the least.
- **A definition of "done good enough to show students"** (acceptance criteria per view:
  what should a student learn at a glance?) would let me self-grade instead of guessing.

### Things I would do differently
- Build the in-browser dashboard first; treat any Python as an optional oracle/batch tool.
- Add UI smoke + screenshot tests in the first dashboard commit, not after a regression.
- Establish the separator/encoding hygiene rule (§4) before writing any string-keyed code.
- Verify domain formulas against the primary source *as they're written*, not retroactively.

---

## 9. Inventory (for quick reorientation)

- Pages: `index.html` (868 L), `advanced.html` (1206 L), `analysis.html` (628 L).
- Engine: `src/engine.js`, `src/advanced-engine.js`, `src/distributions.js`.
- JS analysis: `src/analysis/{stats,ingest,output_analysis,metrics,characteristic,compare}.js` (~650 L).
- Python analysis: `analysis/des_analysis/*.py` (~860 L) + Streamlit `analysis/dashboard.py`.
- Harness: `analysis/run_sim.mjs`. Samples: `analysis/sample_data/*.json`.
- Tests: `tests/*.test.js` (engines + analysis port, ~62 cases), `analysis/tests/*.py` (~50 cases).
- Tooling: Node 24 / npm 11; Python 3.13 venv (pandas/numpy/scipy/plotly/streamlit/openpyxl/pytest).
- Deploy: GitHub Pages, static, no build. Live: https://emni-stack.github.io/Claude-DES-engine-ENV/
- Decision log + schema + backlog: `analysis/NOTES.md`. Companion docs: `analysis/README.md`.
