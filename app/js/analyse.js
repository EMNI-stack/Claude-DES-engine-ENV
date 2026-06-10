/* Run & Analyse — Phase 4.1 (replications + confidence).
   Loads the study model, runs N independent replications (distinct seeds) through
   the SAME engine the floor uses (via the shared run-model transform), and reports
   every declared response as a mean with a 95% confidence interval / half-width —
   never a bare point. A "how many replications for this precision?" helper tells the
   student how much more running a tighter interval would cost.
   Robinson's vocabulary; the statistics follow theory-notes §3 (Law ch 9). */

import { load, save } from './project.js';
import { buildRunModel } from './run-model.js';
import { replicate, responsesAtCutoff } from '../../src/analysis/replicate.js';
import { confidenceInterval, repsForPrecision } from '../../src/analysis/output_analysis.js';

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

/* ---- number formatting (mono, sensible precision) ---- */
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

/* ---- render: study bar ---- */
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

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---- the run ---- */
let lastResult = null;
function run() {
  const reps = Math.max(2, Math.min(200, parseInt($('reps').value, 10) || 10));
  const horizon = Math.max(1, parseFloat($('horizon').value) || 480);
  const target = parseFloat($('precision').value) || 0.15;
  const btn = $('runBtn');
  btn.textContent = 'Running…';
  $('controls').classList.add('running');

  // yield once so the "Running…" state paints before the synchronous sweep
  setTimeout(() => {
    let result;
    try {
      const runModel = buildRunModel(model);
      result = replicate(runModel, { reps, horizon, gridPoints: 200, baseSeed: 1 });
    } catch (e) {
      $('results').hidden = false;
      $('results').innerHTML = `<div class="notice"><p class="section-label">Could not run</p>
        <p class="small">${esc(e.message || String(e))}</p></div>`;
      btn.textContent = 'Run replications';
      $('controls').classList.remove('running');
      return;
    }
    lastResult = result;
    renderResults(result, { reps, horizon, target });
    btn.textContent = 'Run replications';
    $('controls').classList.remove('running');
  }, 30);
}

function ci(rows, key) { return confidenceInterval(rows.map((r) => r[key]), ALPHA); }

function renderResults(result, { reps, horizon, target }) {
  const { rows, bottleneck, resNames } = responsesAtCutoff(result, 0);
  const unit = (model.units && model.units.time) || 'min';
  const deadlocked = result.reps.some((r) => r.deadlocked);

  // which responses to show: declared (matched) — else the standard set as a fallback
  const declared = (project.conceptual && project.conceptual.responses) || [];
  const measured = [];     // {label, unit, ci, rel, binding}
  const notMeasured = [];  // declared responses we can't map
  if (declared.length) {
    for (const r of declared) {
      const b = bindName(r.name);
      if (b) measured.push({ label: r.name || b.label, b, unit: r.unit || b.unit(unit) });
      else notMeasured.push(r.name || '(unnamed response)');
    }
  }
  let fallbackNote = '';
  if (!measured.length) {
    // nothing declared/bound — show the standard responses so the page is still useful
    for (const b of BINDINGS) measured.push({ label: b.label, b, unit: b.unit(unit) });
    fallbackNote = declared.length
      ? 'None of your declared responses matched a standard measure, so the standard set is shown.'
      : 'No responses were declared in the conceptual model, so the standard set is shown. Declare responses on the Methodology page to bind them here.';
  }

  // compute CI + precision for each measured response
  const cards = measured.map((m) => {
    const c = ci(rows, m.b.key);
    const rel = (c.mean && Number.isFinite(c.halfwidth)) ? c.halfwidth / Math.abs(c.mean) : NaN;
    const prec = repsForPrecision(rows.map((r) => r[m.b.key]), { alpha: ALPHA, target, kind: 'relative' });
    return { ...m, c, rel, prec };
  }).filter((m) => Number.isFinite(m.c.mean));

  // headline precision: the least-precise measured response drives the callout
  const worst = cards.filter((m) => Number.isFinite(m.rel))
    .reduce((w, m) => (!w || (m.prec.more || 0) > (w.prec.more || 0) || (!w.prec.more && m.rel > w.rel) ? m : w), null);

  const html = [];
  html.push(`<p class="section-label">Results</p>`);
  html.push(`<p class="small measure">Means over <span class="num">${reps}</span> independent
    replications (seeds <span class="num">1…${reps}</span>), each run for
    <span class="num">${fmt(horizon)}</span> ${esc(unit)}. Each figure is a 95% confidence interval —
    the half-width is how far the true mean could plausibly sit from this estimate.</p>`);

  if (deadlocked) {
    html.push(`<div class="notice" style="margin:var(--s-4) 0;"><p class="section-label" style="color:var(--down)">Warning</p>
      <p class="small">At least one replication <strong>deadlocked</strong> (the model jammed — e.g. a batch
      station that can never fill). Results below may be unrepresentative; check the model on the floor.</p></div>`);
  }

  // headline precision callout
  if (worst) {
    if (worst.prec.achieved && cards.every((m) => m.prec.achieved)) {
      html.push(`<div class="precision-call ok" style="margin:var(--s-4) 0;">All responses already meet
        &plusmn;${(target * 100).toFixed(0)}% at ${reps} replications. The intervals are tight enough to
        compare designs with confidence.</div>`);
    } else {
      html.push(`<div class="precision-call" style="margin:var(--s-4) 0;">To reach
        <strong>&plusmn;${(target * 100).toFixed(0)}%</strong> on the least-precise response
        (<strong>${esc(worst.label)}</strong>, now &plusmn;${pct(worst.rel)}), you'd need about
        <strong class="num">${worst.prec.needed_n}</strong> replications —
        <span class="num">${worst.prec.more}</span> more. Precision improves with &radic;N, so it gets
        slower to buy.</div>`);
    }
  }

  // response cards
  html.push(`<div class="resp-grid" style="margin-top:var(--s-4);">`);
  for (const m of cards) {
    const tight = Number.isFinite(m.rel) && m.rel <= target;
    const relStr = Number.isFinite(m.rel) ? `±${pct(m.rel)}` : '—';
    html.push(`
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
  html.push(`</div>`);
  if (fallbackNote) html.push(`<p class="small faint" style="margin-top:var(--s-3);">${esc(fallbackNote)}</p>`);

  if (notMeasured.length) {
    html.push(`<p class="not-measured" style="margin-top:var(--s-4);">Declared responses not auto-measured
      (no standard mapping): ${notMeasured.map((n) => `<em>${esc(n)}</em>`).join(', ')}.</p>`);
  }

  // always-collected: utilisation + bottleneck
  const resIds = Object.keys(resNames);
  if (resIds.length) {
    html.push(`<div class="panel panel--quiet" style="margin-top:var(--s-6);">
      <div class="panel__head"><p class="section-label">Resources</p>
      <h3 class="panel__title" style="font-size:17px;">Utilisation &amp; bottleneck</h3></div>`);
    if (bottleneck) {
      html.push(`<p class="bottleneck-line">Busiest resource: <strong>${esc(bottleneck.name)}</strong>
        at <span class="num">${pct(bottleneck.util)}</span> mean utilisation — the likely bottleneck.</p>`);
    }
    html.push(`<table class="table" style="margin-top:var(--s-3);"><thead><tr>
      <th>Resource</th><th class="num">Utilisation</th><th class="num">95% half-width</th></tr></thead><tbody>`);
    // sort by utilisation desc
    const utilRows = resIds.map((id) => ({ id, name: resNames[id], c: ci(rows, 'util:' + id) }))
      .sort((a, b) => (b.c.mean || 0) - (a.c.mean || 0));
    for (const u of utilRows) {
      html.push(`<tr><td>${esc(u.name)}</td><td class="num">${pct(u.c.mean)}</td>
        <td class="num">${Number.isFinite(u.c.halfwidth) ? '±' + pct(u.c.halfwidth) : '—'}</td></tr>`);
    }
    html.push(`</tbody></table></div>`);
  }

  html.push(`<p class="small faint" style="margin-top:var(--s-5);">A confidence interval bounds
    uncertainty from random variation across runs — it is <strong>not</strong> proof the model is right.
    That comes from verification &amp; validation. Next step: warm-up handling for steady-state studies.</p>`);

  $('results').hidden = false;
  $('results').innerHTML = html.join('');

  // persist a compact results summary for the study export (Phase 4.5)
  persist(result, { reps, horizon, target }, cards, bottleneck);
}

function persist(result, opts, cards, bottleneck) {
  try {
    project.results = {
      schema: 'des-results/v1',
      kind: 'replications',
      ran: new Date().toISOString(),
      reps: opts.reps, horizon: opts.horizon, alpha: ALPHA, precisionTarget: opts.target,
      seeds: result.reps.map((r) => r.seed),
      responses: cards.map((m) => ({
        label: m.label, unit: m.unit, key: m.b.key,
        mean: m.c.mean, halfwidth: m.c.halfwidth, ci_low: m.c.low, ci_high: m.c.high,
        n: m.c.n, rel_halfwidth: m.rel,
        meetsTarget: !!m.prec.achieved, repsForTarget: m.prec.needed_n,
      })),
      bottleneck: bottleneck ? { name: bottleneck.name, utilisation: bottleneck.util } : null,
    };
    save(project);
  } catch (e) { /* non-fatal (quota / private mode) */ }
}

/* ---- wire up ---- */
function syncCaptions() {
  const reps = Math.max(2, Math.min(200, parseInt($('reps').value, 10) || 10));
  $('seedRange').textContent = `1…${reps}`;
}
if (renderStudyBar()) {
  $('controls').hidden = false;
  $('timeUnit').textContent = (model.units && model.units.time) || 'min';
  syncCaptions();
  $('reps').addEventListener('input', syncCaptions);
  $('runBtn').addEventListener('click', run);
}
