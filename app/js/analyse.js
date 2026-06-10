/* Run & Analyse — Phase 4 (replications + confidence + warm-up + visualisation).
   Loads the study model, runs N independent replications (distinct seeds) through
   the SAME engine the floor uses (via the shared run-model transform), and reports
   every declared response as a mean with a 95% confidence interval / half-width —
   never a bare point.

   Terminating vs steady-state (Robinson): a terminating study is analysed over its
   whole length; a steady-state study deletes a warm-up period first, chosen on the
   Welch across-replication WIP(t) plot. Because each run is recorded as accumulator
   snapshots on a time grid, moving the warm-up cut-off recomputes every response
   INSTANTLY — no re-running. Statistics follow theory-notes §3 (Law ch 9). */

import { load, save } from './project.js';
import { buildRunModel } from './run-model.js';
import { replicate, responsesAtCutoff, wipTimeseries } from '../../src/analysis/replicate.js';
import { confidenceInterval, repsForPrecision, welchWarmup, pairedDifference } from '../../src/analysis/output_analysis.js';
import { welchPlot, repDotPlot, utilBars } from './charts.js';
import { applyFactor, isComparableFactor } from './scenario.js';

const $ = (id) => document.getElementById(id);
const ALPHA = 0.05;

const project = load();
const model = project.model;

/* ---- response binding: declared response name → a measured engine metric ---- */
const BINDINGS = [
  { key: 'throughput', label: 'Throughput', better: 'higher', unit: (u) => `per ${u}`,
    syn: ['throughput', 'output rate', 'production rate', 'rate of output', 'good output'] },
  { key: 'avgWIP', label: 'Average WIP', better: 'lower', unit: () => 'jobs',
    syn: ['average wip', 'avg wip', 'wip', 'work in process', 'work-in-process', 'inventory', 'jobs in system', 'number in system'] },
  { key: 'cycleTime', label: 'Cycle time', better: 'lower', unit: (u) => u,
    syn: ['cycle time', 'flow time', 'time in system', 'lead time', 'throughput time', 'sojourn time', 'waiting time', 'wait time'] },
  { key: 'fillRate', label: 'Fill rate', better: 'higher', unit: () => 'fraction',
    syn: ['fill rate', 'service level', 'fulfilment', 'fulfillment', 'order fill'] },
  { key: 'inTransport', label: 'In-transport time', better: 'lower', unit: (u) => u,
    syn: ['transport time', 'in-transport', 'travel time', 'handling time', 'move time'] },
];
function bindName(name) {
  const n = String(name || '').toLowerCase().trim();
  if (!n) return null;
  return BINDINGS.find((b) => b.syn.some((s) => n === s || n.includes(s))) || null;
}

/* ---- number formatting ---- */
function fmt(x) {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a === 0) return '0';
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  if (a >= 1) return x.toFixed(2);
  return x.toFixed(3);
}
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—');
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---- usable-model guard ---- */
function usable(m) {
  return m && Array.isArray(m.parts) && m.parts.some((p) => (p.route || []).length >= 2)
    && Array.isArray(m.nodes) && m.nodes.length >= 2;
}
function modelSummary(m) {
  const by = { source: 0, resource: 0, storage: 0, sink: 0 };
  for (const n of m.nodes) if (by[n.kind] != null) by[n.kind]++;
  const bits = [];
  if (by.source) bits.push(`${by.source} source${by.source > 1 ? 's' : ''}`);
  if (by.resource) bits.push(`${by.resource} resource${by.resource > 1 ? 's' : ''}`);
  if (by.storage) bits.push(`${by.storage} storage`);
  if (by.sink) bits.push(`${by.sink} sink${by.sink > 1 ? 's' : ''}`);
  const parts = m.parts.length;
  return `${parts} part${parts > 1 ? 's' : ''} · ${m.nodes.length} nodes (${bits.join(', ')})`;
}
const timeUnit = () => (model.units && model.units.time) || 'min';

/* ---- view state ---- */
let lastResult = null;   // the replication result (snapshots)
let welch = null;        // welchWarmup() output for the run
let cutoffIndex = 0;     // snapshot index where the analysis window starts
let studyType = 'steady';
let lastOpts = { reps: 10, horizon: 480, target: 0.15 };
let lastCards = [];        // measured response set from the most recent render (for compare + V&V)
let lastBottleneck = null;
let lastCompare = null;    // last scenario-comparison result, to keep it visible across re-renders

/* ---- study bar ---- */
function renderStudyBar() {
  const bar = $('studyBar');
  const title = (project.meta && project.meta.title) || 'Untitled study';
  if (!usable(model)) {
    bar.innerHTML = `
      <div class="notice">
        <p class="section-label">No model to run</p>
        <h2>Build a model first</h2>
        <p class="small measure">This study has no runnable floor model yet. Go to
        <a href="floor.html">Model &amp; Floor</a>, place at least a source, a resource and a sink on a
        part's route, then come back here to run and analyse it.</p>
      </div>`;
    $('controls').hidden = true;
    $('results').hidden = true;
    return false;
  }
  bar.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:baseline;">
      <div>
        <p class="section-label">Study</p>
        <h2 class="panel__title" style="font-size:var(--fs-h2);">${esc(title)}</h2>
        <p class="small faint" style="margin:4px 0 0;">${esc(modelSummary(model))}</p>
      </div>
      <a class="btn btn-ghost" href="floor.html">Edit model</a>
    </div>`;
  return true;
}

/* ---- the run ---- */
function run() {
  const reps = Math.max(2, Math.min(200, parseInt($('reps').value, 10) || 10));
  const horizon = Math.max(1, parseFloat($('horizon').value) || 480);
  const target = parseFloat($('precision').value) || 0.15;
  lastOpts = { reps, horizon, target };
  const btn = $('runBtn');
  btn.textContent = 'Running…';
  $('controls').classList.add('running');

  setTimeout(() => {
    try {
      const runModel = buildRunModel(model);
      lastResult = replicate(runModel, { reps, horizon, gridPoints: 200, baseSeed: 1 });
      welch = welchWarmup(wipTimeseries(lastResult), 'wip');
      applyCutoffDefault();
      renderResults();
    } catch (e) {
      $('results').hidden = false;
      $('results').innerHTML = `<div class="notice"><p class="section-label">Could not run</p>
        <p class="small">${esc(e.message || String(e))}</p></div>`;
    }
    btn.textContent = 'Run replications';
    $('controls').classList.remove('running');
  }, 30);
}

// snapshot index where the analysis window starts: 0 for terminating; for steady-state,
// the grid point at/after the Welch suggested warm-up cut-off time. Guard the degenerate
// case where the WIP curve never settles (a too-short / too-saturated run): Welch then
// pushes the cut-off near the end, which would delete almost the whole run. Cap it and,
// when the curve did not converge, fall back to a light default — the student adjusts.
function applyCutoffDefault() {
  if (!lastResult) { cutoffIndex = 0; return; }
  const last = lastResult.grid.length - 1;
  const G = lastResult.gridPoints;
  if (studyType === 'terminating' || !welch) { cutoffIndex = 0; return; }
  let idx = lastResult.grid.findIndex((g) => g >= (welch.cutoff_time || 0) - 1e-9);
  if (idx < 0) idx = 0;
  const cap = Math.floor(G * 0.5);
  if (!welch.converged) idx = Math.floor(G * 0.1);   // can't trust auto-detection — light 10%
  else if (idx > cap) idx = cap;                       // never delete more than half
  cutoffIndex = Math.max(0, Math.min(idx, last - 1));
}

function ci(rows, key) { return confidenceInterval(rows.map((r) => r[key]), ALPHA); }

/* ---- render everything for the current run + cut-off ---- */
function renderResults() {
  if (!lastResult) return;
  $('results').hidden = false;
  $('results').innerHTML = `
    <p class="section-label">Results</p>
    <div id="warmupSection"></div>
    <div id="responseSection"></div>
    <div id="compareSection"></div>
    <div id="vvSection"></div>`;
  renderWarmup();
  renderResponses();      // fills responseSection + vvSection (cut-off-dependent)
  renderCompareUI();      // scenario comparison controls (re-run on demand)
}

/* ---- warm-up section (Welch plot + cut-off slider), steady-state only ---- */
function renderWarmup() {
  const host = $('warmupSection');
  const unit = timeUnit();
  if (studyType === 'terminating') {
    host.innerHTML = `<div class="chart-card" style="margin:var(--s-4) 0;">
      <h3>Terminating study</h3>
      <p class="cap">This run has a natural end and its starting state is part of the model, so the whole
      run is analysed — <strong>no warm-up is deleted</strong>. Switch to <em>steady-state</em> if the
      system has no natural end and you want to remove the start-up (initialisation) bias.</p></div>`;
    return;
  }
  const last = lastResult.grid.length - 1;
  const cutoffTime = lastResult.grid[cutoffIndex];
  const remaining = lastResult.grid[last] - cutoffTime;
  const plot = welchPlot(welch, { cutoffTime, unit, plateau: welch.plateau });
  const unsettled = !welch.converged
    ? `<p class="cap" style="color:var(--blocked);"><strong>The WIP curve hasn't clearly settled.</strong>
       The run may be too short, or the line too close to saturation, to reach steady state — so the
       suggested cut-off is only a light default. Increase the run length for a trustworthy steady-state
       estimate, or treat this as a terminating study.</p>`
    : '';
  host.innerHTML = `
    <div class="chart-card" style="margin:var(--s-4) 0;">
      <h3>Warm-up &amp; initialisation bias</h3>
      <p class="cap">The line is the average WIP across all replications as the run proceeds (Welch's
      method). It climbs from an empty start, then settles — the climb is <strong>initialisation
      bias</strong>. Delete the warm-up so steady-state statistics aren't dragged down by the empty start.
      Drag the cut-off; every result below updates instantly (no re-running).</p>
      ${unsettled}
      <div id="welchSvgHost">${plot}</div>
      <div class="warmup-row">
        <label for="cutoff">Warm-up cut-off</label>
        <input type="range" id="cutoff" min="0" max="${last - 1}" step="1" value="${cutoffIndex}">
        <span class="warmup-readout" id="warmupReadout"></span>
      </div>
    </div>`;
  updateWarmupReadout(cutoffTime, remaining, unit);
  $('cutoff').addEventListener('input', onCutoff);
}

function updateWarmupReadout(cutoffTime, remaining, unit) {
  const frac = lastResult.grid[lastResult.grid.length - 1] ? cutoffTime / lastResult.grid[lastResult.grid.length - 1] : 0;
  const ro = $('warmupReadout');
  if (ro) ro.textContent = `delete first ${fmt(cutoffTime)} ${unit} (${pct(frac)}) · ${fmt(remaining)} ${unit} analysed`;
}

function onCutoff(e) {
  cutoffIndex = parseInt(e.target.value, 10) || 0;
  const last = lastResult.grid.length - 1;
  const cutoffTime = lastResult.grid[cutoffIndex];
  const remaining = lastResult.grid[last] - cutoffTime;
  // re-shade the plot (cheap) without rebuilding the slider, then recompute results
  const host = $('welchSvgHost');
  if (host) host.innerHTML = welchPlot(welch, { cutoffTime, unit: timeUnit(), plateau: welch.plateau });
  updateWarmupReadout(cutoffTime, remaining, timeUnit());
  renderResponses();
}

/* ---- responses (cards + dot plots + precision + utilisation), at current cut-off ---- */
function renderResponses() {
  const { rows, bottleneck, resNames, moverNames, cutoffTime } = responsesAtCutoff(lastResult, cutoffIndex);
  const unit = timeUnit();
  const { reps, horizon, target } = lastOpts;
  const deadlocked = lastResult.reps.some((r) => r.deadlocked);

  // which responses: declared (matched) — else the standard set as a fallback
  const declared = (project.conceptual && project.conceptual.responses) || [];
  const measured = [];
  const notMeasured = [];
  if (declared.length) {
    for (const r of declared) {
      const b = bindName(r.name);
      if (b) measured.push({ label: r.name || b.label, b, unit: r.unit || b.unit(unit) });
      else notMeasured.push(r.name || '(unnamed response)');
    }
  }
  let fallbackNote = '';
  if (!measured.length) {
    for (const b of BINDINGS) measured.push({ label: b.label, b, unit: b.unit(unit) });
    fallbackNote = declared.length
      ? 'None of your declared responses matched a standard measure, so the standard set is shown.'
      : 'No responses were declared in the conceptual model, so the standard set is shown. Declare responses on the Methodology page to bind them here.';
  }

  const cards = measured.map((m) => {
    const vals = rows.map((r) => r[m.b.key]);
    const c = ci(rows, m.b.key);
    const rel = (c.mean && Number.isFinite(c.halfwidth)) ? c.halfwidth / Math.abs(c.mean) : NaN;
    const prec = repsForPrecision(vals, { alpha: ALPHA, target, kind: 'relative' });
    return { ...m, vals, c, rel, prec };
  }).filter((m) => Number.isFinite(m.c.mean));

  const worst = cards.filter((m) => Number.isFinite(m.rel))
    .reduce((w, m) => (!w || (m.prec.more || 0) > (w.prec.more || 0) || (!w.prec.more && m.rel > w.rel) ? m : w), null);

  const h = [];
  const windowNote = studyType === 'steady' && cutoffIndex > 0
    ? ` after deleting the first <span class="num">${fmt(cutoffTime)}</span> ${esc(unit)} (warm-up)`
    : '';
  h.push(`<p class="small measure">Means over <span class="num">${reps}</span> independent
    replications (seeds <span class="num">1…${reps}</span>), each run for
    <span class="num">${fmt(horizon)}</span> ${esc(unit)}${windowNote}. Each figure is a 95% confidence
    interval — the half-width is how far the true mean could plausibly sit from this estimate.</p>`);

  if (deadlocked) {
    h.push(`<div class="notice" style="margin:var(--s-4) 0;"><p class="section-label" style="color:var(--down)">Warning</p>
      <p class="small">At least one replication <strong>deadlocked</strong> (the model jammed). Results may be
      unrepresentative; check the model on the floor.</p></div>`);
  }

  if (worst) {
    if (worst.prec.achieved && cards.every((m) => m.prec.achieved)) {
      h.push(`<div class="precision-call ok" style="margin:var(--s-4) 0;">All responses already meet
        &plusmn;${(target * 100).toFixed(0)}% at ${reps} replications — tight enough to compare designs with
        confidence.</div>`);
    } else {
      h.push(`<div class="precision-call" style="margin:var(--s-4) 0;">To reach
        <strong>&plusmn;${(target * 100).toFixed(0)}%</strong> on the least-precise response
        (<strong>${esc(worst.label)}</strong>, now &plusmn;${pct(worst.rel)}), you'd need about
        <strong class="num">${worst.prec.needed_n}</strong> replications —
        <span class="num">${worst.prec.more}</span> more. Precision improves with &radic;N.</div>`);
    }
  }

  // response cards
  h.push(`<div class="resp-grid" style="margin-top:var(--s-4);">`);
  for (const m of cards) {
    const tight = Number.isFinite(m.rel) && m.rel <= target;
    const relStr = Number.isFinite(m.rel) ? `±${pct(m.rel)}` : '—';
    h.push(`
      <div class="resp">
        <div class="resp__label">${esc(m.label)}</div>
        <div class="resp__mean">${fmt(m.c.mean)} <span class="pm">±</span><span class="hw">${fmt(m.c.halfwidth)}</span>
          <span class="resp__unit">${esc(m.unit)}</span></div>
        <div class="resp__ci">95% CI [${fmt(m.c.low)}, ${fmt(m.c.high)}]</div>
        <div class="resp__rel">relative half-width
          <b class="${tight ? 'tag-precise' : 'tag-loose'}">${relStr}</b></div>
        <div class="resp__reps">n = ${m.c.n} reps${m.prec.achieved ? ' · meets target' : ` · ~${m.prec.needed_n} for target`}</div>
      </div>`);
  }
  h.push(`</div>`);
  if (fallbackNote) h.push(`<p class="small faint" style="margin-top:var(--s-3);">${esc(fallbackNote)}</p>`);
  if (notMeasured.length) {
    h.push(`<p class="not-measured" style="margin-top:var(--s-4);">Declared responses not auto-measured
      (no standard mapping): ${notMeasured.map((n) => `<em>${esc(n)}</em>`).join(', ')}.</p>`);
  }

  // replication spread — "every run gives a different answer; the band is the CI"
  h.push(`<div class="chart-card" style="margin-top:var(--s-6);">
    <h3>The spread across replications</h3>
    <p class="cap">Each dot is one replication; the shaded band is the 95% confidence interval and the line
    is the mean. A single run lands at one dot — which is why we never report just one.</p>`);
  for (const m of cards.slice(0, 3)) {
    h.push(`<div class="dist-row"><div class="dist-label">${esc(m.label)}</div>
      ${repDotPlot(m.vals, m.c, { unit: m.unit })}</div>`);
  }
  h.push(`</div>`);

  // utilisation (resources + transport/operator movers) + bottleneck
  const utilRows = [];
  for (const id of Object.keys(resNames)) { const c = ci(rows, 'util:' + id); if (Number.isFinite(c.mean)) utilRows.push({ name: resNames[id], mean: c.mean, halfwidth: c.halfwidth }); }
  for (const id of Object.keys(moverNames || {})) { const c = ci(rows, 'mover:' + id); if (Number.isFinite(c.mean)) utilRows.push({ name: moverNames[id] + ' (mover)', mean: c.mean, halfwidth: c.halfwidth }); }
  utilRows.sort((a, b) => b.mean - a.mean);
  if (utilRows.length) {
    h.push(`<div class="chart-card" style="margin-top:var(--s-4);">
      <h3>Utilisation &amp; bottleneck</h3>`);
    if (bottleneck) h.push(`<p class="cap">Busiest resource: <strong>${esc(bottleneck.name)}</strong> at
      <span class="num">${pct(bottleneck.util)}</span> mean utilisation — the likely bottleneck. Whiskers
      are 95% half-widths.</p>`);
    h.push(utilBars(utilRows, { bottleneckName: bottleneck ? bottleneck.name : null }));
    h.push(`</div>`);
  }

  h.push(`<p class="small faint" style="margin-top:var(--s-5);">A confidence interval bounds uncertainty
    from random variation across runs — it is <strong>not</strong> proof the model is right. That comes
    from verification &amp; validation.</p>`);

  $('responseSection').innerHTML = h.join('');
  lastCards = cards; lastBottleneck = bottleneck;
  persist(cards, bottleneck, cutoffTime);
  renderVV(cards);
}

/* ---- persist a compact results summary for the study export (Phase 4.5) ---- */
function persist(cards, bottleneck, cutoffTime) {
  try {
    project.results = {
      schema: 'des-results/v1',
      kind: 'replications',
      ran: new Date().toISOString(),
      studyType, timeUnit: timeUnit(),
      reps: lastOpts.reps, horizon: lastOpts.horizon, alpha: ALPHA, precisionTarget: lastOpts.target,
      warmupCutoff: studyType === 'steady' ? cutoffTime : 0,
      seeds: lastResult.reps.map((r) => r.seed),
      responses: cards.map((m) => ({
        label: m.label, unit: m.unit, key: m.b.key,
        mean: m.c.mean, halfwidth: m.c.halfwidth, ci_low: m.c.low, ci_high: m.c.high,
        n: m.c.n, rel_halfwidth: m.rel,
        meetsTarget: !!m.prec.achieved, repsForTarget: m.prec.needed_n,
      })),
      bottleneck: bottleneck ? { name: bottleneck.name, utilisation: bottleneck.util } : null,
      comparison: lastCompare ? lastCompare.data : null,
    };
    save(project);
  } catch (e) { /* non-fatal */ }
}

/* ---- scenario comparison (paired-t on common random numbers) ---- */
function comparableFactors() {
  return ((project.conceptual && project.conceptual.factors) || []).filter((f) => isComparableFactor(f.bindingHint));
}
function betterText(better) { return better === 'higher' ? 'higher is better' : better === 'lower' ? 'lower is better' : ''; }

function levelInputs(f) {
  if (/:rule$/.test(f.bindingHint)) {
    return `<label>Levels (A vs B)</label><div class="row">
      <select class="select" id="cmpA"><option value="shortest">shortest queue</option><option value="even">even split</option></select>
      <span class="faint">vs</span>
      <select class="select" id="cmpB"><option value="even">even split</option><option value="shortest">shortest queue</option></select></div>`;
  }
  const base = parseFloat(f.baseline) || 1;
  const isCount = /count$|machines$|membercount$|streams$/.test(f.bindingHint);
  const b2 = isCount ? base + 1 : +(base * 1.5).toFixed(2);
  return `<label>Levels (A vs B) — baseline ${esc(f.baseline)} ${esc(f.unit || '')}</label><div class="row">
    <input class="input num" type="number" id="cmpA" value="${base}" step="any" style="max-width:90px;">
    <span class="faint">vs</span>
    <input class="input num" type="number" id="cmpB" value="${b2}" step="any" style="max-width:90px;"></div>`;
}

function renderCompareUI() {
  const host = $('compareSection'); if (!host) return;
  const factors = comparableFactors();
  let inner = `<div class="chart-card" style="margin-top:var(--s-6);">
    <h3>Compare two scenarios</h3>
    <p class="cap">Change one declared factor to two levels and test whether the response really differs.
    Both scenarios run on the <strong>same random seeds</strong> — common random numbers, so shared luck
    cancels and the <em>paired</em> comparison sees the design change, not the noise.</p>`;
  if (!factors.length) {
    inner += `<p class="not-measured">No comparable experimental factor is declared yet. On the
      Model &amp; Floor page mark a factor — machine count, AGV/operator count, batch size, demand rate,
      or a group's selection rule — as a study factor, then compare its levels here.</p></div>`;
    host.innerHTML = inner; return;
  }
  const fopts = factors.map((f, i) => `<option value="${i}">${esc(f.name || f.bindingHint)}</option>`).join('');
  const ropts = lastCards.map((c) => `<option value="${c.b.key}">${esc(c.label)}</option>`).join('');
  inner += `<div class="run-controls" style="margin-top:var(--s-3); align-items:flex-end;">
    <div class="field"><label for="cmpFactor">Factor</label><select class="select" id="cmpFactor">${fopts}</select></div>
    <div class="field" id="cmpLevels"></div>
    <div class="field"><label for="cmpResp">Response</label><select class="select" id="cmpResp">${ropts}</select></div>
    <button class="btn btn-primary" id="cmpRun">Compare</button>
  </div>
  <div id="cmpResult" style="margin-top:var(--s-4);">${lastCompare ? lastCompare.html : ''}</div></div>`;
  host.innerHTML = inner;
  const renderLevels = () => { $('cmpLevels').innerHTML = levelInputs(factors[parseInt($('cmpFactor').value, 10) || 0]); };
  renderLevels();
  $('cmpFactor').addEventListener('change', renderLevels);
  $('cmpRun').addEventListener('click', () => doCompare(factors));
}

function runCompare(f, A, B, respKey) {
  const opts = { reps: lastOpts.reps, horizon: lastOpts.horizon, gridPoints: 200 };
  const rowsAt = (m, seed) => responsesAtCutoff(replicate(buildRunModel(m), { ...opts, baseSeed: seed }), cutoffIndex).rows;
  const rA = rowsAt(applyFactor(model, f.bindingHint, A), 1);
  const rB = rowsAt(applyFactor(model, f.bindingHint, B), 1);                 // CRN — same seeds
  const ciA = confidenceInterval(rA.map((r) => r[respKey]), ALPHA);
  const ciB = confidenceInterval(rB.map((r) => r[respKey]), ALPHA);
  const diff = pairedDifference(rA.map((r, i) => r[respKey] - rB[i][respKey]), ALPHA);
  const rBi = rowsAt(applyFactor(model, f.bindingHint, B), 1 + opts.reps + 500); // independent seeds
  const diffIndep = pairedDifference(rA.map((r, i) => r[respKey] - rBi[i][respKey]), ALPHA);
  return { ciA, ciB, diff, diffIndep };
}

function doCompare(factors) {
  const f = factors[parseInt($('cmpFactor').value, 10) || 0];
  const respKey = $('cmpResp').value;
  const card = lastCards.find((c) => c.b.key === respKey) || {};
  const respLabel = card.label || respKey;
  const better = card.b ? card.b.better : '';
  const A = $('cmpA').value, B = $('cmpB').value;
  const btn = $('cmpRun'); btn.textContent = 'Comparing…'; btn.disabled = true;
  setTimeout(() => {
    try {
      const r = runCompare(f, A, B, respKey);
      const html = compareHtml(f, A, B, respLabel, card.unit || '', better, r);
      lastCompare = {
        html,
        data: { factor: f.name || f.bindingHint, bindingKey: f.bindingHint, levelA: String(A), levelB: String(B),
          response: respLabel, unit: card.unit || '',
          meanA: r.ciA.mean, meanB: r.ciB.mean,
          difference: r.diff.mean, ci_low: r.diff.low, ci_high: r.diff.high, differs: r.diff.differs,
          halfwidth_crn: r.diff.halfwidth, halfwidth_independent: r.diffIndep.halfwidth },
      };
      $('cmpResult').innerHTML = html;
      persist(lastCards, lastBottleneck, lastResult.grid[cutoffIndex]);
    } catch (e) {
      $('cmpResult').innerHTML = `<p class="small" style="color:var(--down)">Comparison failed: ${esc(e.message || String(e))}</p>`;
    }
    btn.textContent = 'Compare'; btn.disabled = false;
  }, 20);
}

function compareHtml(f, A, B, respLabel, unit, better, r) {
  const lvl = (v) => /:rule$/.test(f.bindingHint) ? (String(v).includes('even') ? 'even split' : 'shortest queue') : v;
  const d = r.diff;
  let verdict;
  if (d.differs) {
    const dir = d.mean > 0 ? 'higher' : 'lower';
    const goodBad = better ? (((d.mean > 0) === (better === 'higher')) ? 'A is the better design here' : 'B is the better design here') : '';
    verdict = `<div class="precision-call ok"><strong>A real difference.</strong> Scenario A's ${esc(respLabel)} is
      <strong>${dir}</strong> by ${fmt(Math.abs(d.mean))} ${esc(unit)} (95% CI on the difference
      [${fmt(d.low)}, ${fmt(d.high)}] — excludes 0). ${goodBad ? esc(goodBad) + ' (' + betterText(better) + ').' : ''}</div>`;
  } else {
    verdict = `<div class="precision-call"><strong>No significant difference.</strong> The 95% CI on the
      difference [${fmt(d.low)}, ${fmt(d.high)}] includes 0, so at ${lastOpts.reps} replications these designs
      are indistinguishable on ${esc(respLabel)}. Try more replications or a larger change in the factor.</div>`;
  }
  const crn = (Number.isFinite(r.diff.halfwidth) && Number.isFinite(r.diffIndep.halfwidth))
    ? `<p class="small faint" style="margin-top:var(--s-3);">Common random numbers at work: the difference is
       pinned to <span class="num">±${fmt(r.diff.halfwidth)}</span> using the <strong>same</strong> seeds, versus
       <span class="num">±${fmt(r.diffIndep.halfwidth)}</span> with independent seeds — pairing cancels shared
       variation and sharpens the comparison without more runs.</p>`
    : '';
  return `<table class="table" style="margin-bottom:var(--s-3);"><thead><tr><th>Scenario</th>
      <th class="num">${esc(respLabel)} (mean ± 95% half-width)</th></tr></thead><tbody>
      <tr><td>A · ${esc(f.name || f.bindingKey || f.bindingHint)} = <strong>${esc(String(lvl(A)))}</strong></td>
        <td class="num">${fmt(r.ciA.mean)} ± ${fmt(r.ciA.halfwidth)} ${esc(unit)}</td></tr>
      <tr><td>B · = <strong>${esc(String(lvl(B)))}</strong></td>
        <td class="num">${fmt(r.ciB.mean)} ± ${fmt(r.ciB.halfwidth)} ${esc(unit)}</td></tr></tbody></table>
    ${verdict}${crn}`;
}

/* ---- V&V loop: experimentation adequacy + sensitivity prompts ---- */
function renderVV(cards) {
  const host = $('vvSection'); if (!host) return;
  const unit = timeUnit();
  const target = lastOpts.target;
  const cutoffTime = lastResult.grid[cutoffIndex];
  const allMeet = cards.length > 0 && cards.every((c) => c.prec && c.prec.achieved);
  const worst = cards.filter((c) => c.prec && !c.prec.achieved).sort((a, b) => (b.prec.more || 0) - (a.prec.more || 0))[0];
  const steady = studyType === 'steady';
  const warmOK = !steady ? null : !!(welch && welch.converged && cutoffIndex > 0);
  const runLenOK = !steady ? null : !!(welch && welch.converged);

  const item = (ok, label, detail) => {
    const cls = ok === true ? 'ok' : ok === false ? 'bad' : 'na';
    const mark = ok === true ? '✓' : ok === false ? '!' : '–';
    return `<li class="vv-item ${cls}"><span class="vv-mark">${mark}</span><span><strong>${label}.</strong> ${detail}</span></li>`;
  };

  const repsDetail = allMeet
    ? `All responses meet ±${(target * 100).toFixed(0)}% at ${lastOpts.reps} replications.`
    : (worst ? `The least-precise response (${esc(worst.label)}, ±${pct(worst.rel)}) needs about ${worst.prec.needed_n} replications for ±${(target * 100).toFixed(0)}%.` : 'Run the model to assess.');
  const warmDetail = !steady
    ? 'Terminating study — no warm-up needed; the run ends at its natural event.'
    : (warmOK ? `Deleting the first ${fmt(cutoffTime)} ${esc(unit)}; the WIP curve has settled before the analysis window.`
      : (welch && welch.converged ? 'Cut-off is at 0 — set a warm-up if the WIP curve climbs at the start.' : "The WIP curve hasn't settled — increase the run length, or treat this as a terminating study."));
  const runDetail = !steady
    ? 'Set by the natural end event of the terminating study.'
    : (runLenOK ? 'Long enough for the WIP curve to reach a steady plateau.' : 'Too short to reach steady state — increase the run length.');

  const cAss = (project.assumptions || []).filter((a) => a.data === 'C' || a.sensitivity);
  const factors = comparableFactors();
  let sens = '';
  if (cAss.length) {
    sens = `<h3 style="margin-top:var(--s-4);">Test your uncertain assumptions</h3>
      <p class="cap">These assumptions are flagged category-C (no data) or for sensitivity. Vary each as a
      factor and watch whether the response confidence intervals shift — if the answer barely moves, the
      assumption is safe; if it swings, your decision depends on getting that input right.</p>
      <ul class="not-measured">${cAss.map((a) => `<li>${esc(a.description || '(assumption)')}${a.data === 'C' ? ' <span class="faint">[category C]</span>' : ''} — ${factors.length ? 'use <em>Compare two scenarios</em> above to vary the related factor.' : 'declare a related study factor, then compare its levels above.'}</li>`).join('')}</ul>`;
  }

  const evDone = ((project.vv && project.vv.checklist) || []).find((c) => c.id === 'ev');
  const adequacyAll = (steady ? (warmOK && runLenOK) : true) && allMeet;
  const evBtn = `<div class="row" style="margin-top:var(--s-3);">
    <button class="btn btn-ghost" id="vvMark"${evDone && evDone.done ? ' disabled' : ''}>${evDone && evDone.done ? 'Experimentation validation ✓ marked' : 'Mark experimentation validation done'}</button>
    ${adequacyAll ? '' : '<span class="small faint">— resolve the flags above first for an honest tick.</span>'}</div>`;

  host.innerHTML = `<div class="chart-card" style="margin-top:var(--s-6);">
    <h3>Experimentation validation</h3>
    <p class="cap">Robinson's experimentation validation asks whether the way you ran the model is sound —
    are the warm-up, run length and number of replications adequate? Read from this run:</p>
    <ul class="vv-list">
      ${item(allMeet, 'Replications', repsDetail)}
      ${item(warmOK, 'Warm-up', warmDetail)}
      ${item(runLenOK, 'Run length', runDetail)}
    </ul>
    ${sens}
    ${evBtn}
    <p class="small faint" style="margin-top:var(--s-4);">All of this builds <strong>confidence</strong>, never
    proof. A model is never valid in general — V&amp;V only fails to find it wrong (Robinson).</p>
  </div>`;
  const mb = $('vvMark');
  if (mb && !(evDone && evDone.done)) mb.addEventListener('click', () => {
    const ev = ((project.vv && project.vv.checklist) || []).find((c) => c.id === 'ev');
    if (ev) { ev.done = true; save(project); renderVV(cards); }
  });
}

/* ---- study-type control ---- */
const STUDY_HELP = {
  steady: 'No natural end — the system runs indefinitely. Delete a warm-up period so the empty start does not bias steady-state results.',
  terminating: 'A natural end event (a shift, a finite order book). Initial conditions are part of the model — analyse the whole run, no warm-up.',
};
function setStudyType(v) {
  studyType = v;
  for (const b of $('studyType').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  $('studyTypeHelp').textContent = STUDY_HELP[v];
  if (lastResult) { applyCutoffDefault(); renderResults(); }
}

/* ---- wire up ---- */
function syncCaptions() {
  const reps = Math.max(2, Math.min(200, parseInt($('reps').value, 10) || 10));
  $('seedRange').textContent = `1…${reps}`;
}
if (renderStudyBar()) {
  $('controls').hidden = false;
  $('timeUnit').textContent = timeUnit();
  syncCaptions();
  $('studyTypeHelp').textContent = STUDY_HELP.steady;
  $('reps').addEventListener('input', syncCaptions);
  $('runBtn').addEventListener('click', run);
  for (const b of $('studyType').querySelectorAll('button')) b.addEventListener('click', () => setStudyType(b.dataset.v));
}
