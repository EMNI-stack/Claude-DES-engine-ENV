# Claude DES Engine

A discrete event simulation tool for teaching queueing theory and production line analysis. Built for personal use and showing to students.

## Theoretical grounding
This tool draws on factory-dynamics theory. Reference material is in the local-only `Reference/` folder (gitignored). When building analysis or features, read `Reference/theory-notes.md` for correct definitions, formulas, and conventions, and follow those methods. Paraphrase — never reproduce textbook text verbatim in the app.

## Structure
- `index.html` — production line UI, rendering, controls
- `advanced.html` — factory BOM & routing builder + multi-part simulator
- `src/engine.js` — core Sim class, event loop, blocking, breakdowns, scrap
- `src/advanced-engine.js` — AdvancedSim: BOMs, routings, assembly synchronisation
- `src/distributions.js` — distribution samplers (exp, normal, weibull, etc.)
- `tests/engine.test.js`, `tests/advanced-engine.test.js` — validation tests, run with `npm test`

## Rules
- Always run `npm test` after changing engine.js or distributions.js
- Keep everything deployable to GitHub Pages (no build step, native ES modules)
- The app must work in a browser with no backend or database
- Commit after each working change

## Live site
https://emni-stack.github.io/Claude-DES-engine-ENV/