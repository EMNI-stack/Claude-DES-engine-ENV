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
import { confidenceInterval, repsForPrecision, welchWarmup } from '../../src/analysis/output_analysis.js';
import { welchPlot, repDotPlot, utilBars } from './charts.js';

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
    <div id="responseSection"></div>`;
  renderWarmup();
  renderResponses();
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
  persist(cards, bottleneck, cutoffTime);
}

/* ---- persist a compact results summary for the study export (Phase 4.5) ---- */
function persist(cards, bottleneck, cutoffTime) {
  try {
    project.results = {
      schema: 'des-results/v1',
      kind: 'replications',
      ran: new Date().toISOString(),
      studyType,
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
    };
    save(project);
  } catch (e) { /* non-fatal */ }
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
