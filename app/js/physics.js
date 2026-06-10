/* Factory Physics overlays — Phase 5.
   Lays closed-form Factory-Physics theory alongside the simulated responses and says, per comparison,
   whether the formula is EXACT, APPROXIMATE, or OUT-OF-RANGE for this model. Where they agree, both are
   validated; where they diverge, the formula has left its domain — which is why DES exists. No new
   simulation mechanics: it re-runs the Phase-4 driver and reads the run-model parameters. FP vocabulary
   for the numbers (theory-notes §4); FP-for-Managers language for the read-out (§6). */

import { load, save } from './project.js';
import { buildRunModel } from './run-model.js';
import { replicate, responsesAtCutoff } from '../../src/analysis/replicate.js';
import { confidenceInterval } from '../../src/analysis/output_analysis.js';
import {
  lineParams, modelFeatures, applicability, littlesLawCheck,
  vutQueueTime, vutCurve, propagateScv, referenceCurves, practicalWorstCase,
} from '../../src/analysis/factory_physics.js';
import { characteristicPlot, vutPlot, utilBars } from './charts.js';

const $ = (id) => document.getElementById(id);
const ALPHA = 0.05;
const project = load();
const model = project.model;

const fmt = (x) => { if (!Number.isFinite(x)) return '—'; const a = Math.abs(x); return a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : a >= 1 ? x.toFixed(2) : x.toFixed(3); };
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + '%' : '—');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const usable = (m) => m && Array.isArray(m.parts) && m.parts.some((p) => (p.route || []).length >= 2) && Array.isArray(m.nodes) && m.nodes.length >= 2;
const timeUnit = () => (model.units && model.units.time) || 'min';

// applicability chip
const chipClass = { exact: 'chip-exact', approximate: 'chip-approx', 'out-of-range': 'chip-out' };
const chip = (a) => `<span class="appl-chip ${chipClass[a.level]}">${a.level}</span> <span class="small faint">${esc(a.reason)}</span>`;

let lastResult = null;

function renderStudyBar() {
  const bar = $('studyBar');
  const title = (project.meta && project.meta.title) || 'Untitled study';
  if (!usable(model)) {
    bar.innerHTML = `<div class="notice"><p class="section-label">No model to compare</p>
      <h2>Build and run a model first</h2>
      <p class="small measure">This study has no runnable model yet. Build one on
      <a href="floor.html">Model &amp; Floor</a> and run it on <a href="analyse.html">Run &amp; Analyse</a>,
      then come here to compare it to Factory Physics theory.</p></div>`;
    $('controls').hidden = true; $('results').hidden = true;
    return false;
  }
  bar.innerHTML = `<div class="row" style="justify-content:space-between; align-items:baseline;">
    <div><p class="section-label">Study</p>
      <h2 class="panel__title" style="font-size:var(--fs-h2);">${esc(title)}</h2></div>
    <a class="btn btn-ghost" href="analyse.html">Run &amp; Analyse</a></div>`;
  return true;
}

function run() {
  const R = project.results || {};
  const reps = Math.max(2, Math.min(200, parseInt($('reps').value, 10) || R.reps || 12));
  const horizon = Math.max(1, parseFloat($('horizon').value) || R.horizon || 1000);
  const btn = $('runBtn'); btn.textContent = 'Running…'; $('controls').classList.add('running');
  setTimeout(() => {
    try {
      const runModel = buildRunModel(model);
      lastResult = replicate(runModel, { reps, horizon, gridPoints: 120, baseSeed: 1 });
      // honour a steady-state warm-up chosen on the analyse page, if any
      let cut = 0;
      if (R.studyType === 'steady' && R.warmupCutoff > 0) {
        const idx = lastResult.grid.findIndex((g) => g >= R.warmupCutoff - 1e-9);
        cut = Math.max(0, Math.min(idx < 0 ? 0 : idx, lastResult.grid.length - 2));
      }
      render(runModel, cut);
    } catch (e) {
      $('results').hidden = false;
      $('results').innerHTML = `<div class="notice"><p class="section-label">Could not run</p><p class="small">${esc(e.message || String(e))}</p></div>`;
    }
    btn.textContent = 'Compare to theory'; $('controls').classList.remove('running');
  }, 30);
}

const ci = (rows, key) => confidenceInterval(rows.map((r) => r[key]), ALPHA);

function render(runModel, cut) {
  const { rows, resNames } = responsesAtCutoff(lastResult, cut);
  const unit = timeUnit();
  const lp = lineParams(runModel);
  const feats = modelFeatures(runModel);
  const app = applicability(feats);

  const wipCI = ci(rows, 'avgWIP'), thCI = ci(rows, 'throughput'), ctCI = ci(rows, 'cycleTime');
  const mWIP = wipCI.mean, mTH = thCI.mean, mCT = ctCI.mean;

  const h = [];
  h.push(`<p class="section-label">Theory vs simulation</p>
    <p class="small measure">Each comparison shows the closed-form Factory Physics prediction (dashed) next
    to the simulated result. The tag says whether the formula is <strong>exact</strong>,
    <strong>approximate</strong>, or <strong>out of range</strong> for this model — where it stops applying
    is exactly where the simulation earns its place.</p>`);

  // ---- Little's Law ----
  const ll = littlesLawCheck(mWIP, mTH, mCT);
  h.push(`<div class="chart-card"><h3>Little's Law — WIP = TH × CT</h3>
    <p class="appl-line">${chip(app.littlesLaw)}</p>
    <div class="ll-grid">
      <div><div class="resp__label">Measured WIP</div><div class="ll-num">${fmt(ll.wip)}</div></div>
      <div class="ll-eq">=</div>
      <div><div class="resp__label">TH × CT</div><div class="ll-num">${fmt(mTH)} × ${fmt(mCT)} = ${fmt(ll.thct)}</div></div>
      <div><div class="resp__label">Agreement</div><div class="ll-num ${ll.consistent ? 'ok' : 'bad'}">${ll.consistent ? '✓' : '✗'} ${pct(ll.relErr)} error</div></div>
    </div>
    <p class="cap">WIP, throughput and cycle time are each measured <em>independently</em> by the engine, so
    their agreement is a genuine consistency check — a white-box validation, not a tautology.</p></div>`);

  // ---- Characteristic curve ----
  const wMax = Math.max(Math.ceil((lp.W0 || 1) * 2), Math.ceil((mWIP || 1) * 1.4), 4);
  const ws = []; for (let w = 1; w <= wMax; w++) ws.push(w);
  const curves = (Number.isFinite(lp.T0) && Number.isFinite(lp.rb) && lp.T0 > 0) ? referenceCurves(lp.T0, lp.rb, lp.W0, ws) : [];
  const pwcTh = (Number.isFinite(mWIP) && curves.length) ? practicalWorstCase(mWIP, lp.T0, lp.rb, lp.W0).th : NaN;
  const lean = Number.isFinite(pwcTh) && mTH > pwcTh;
  const cplot = curves.length ? characteristicPlot({
    curves, W0: lp.W0, rb: lp.rb, muted: app.characteristic.level === 'approximate',
    point: { w: mWIP, th: mTH, wLow: wipCI.low, wHigh: wipCI.high, thLow: thCI.low, thHigh: thCI.high },
  }) : '<p class="small faint">Characteristic curve needs a single-line route with finite process times.</p>';
  h.push(`<div class="chart-card"><h3>Characteristic curve — best / practical-worst / worst</h3>
    <p class="appl-line">${chip(app.characteristic)}</p>
    ${cplot}
    <p class="cap">Critical WIP <span class="num">W₀ = r_b·T₀ = ${fmt(lp.W0)}</span>
    (r_b=${fmt(lp.rb)}, T₀=${fmt(lp.T0)} ${esc(unit)}). The dot is your line at its measured WIP.
    ${curves.length ? (lean
      ? '<strong>Above the practical-worst-case line → a lean line</strong> — it makes more throughput per unit of WIP than a maximally-random balanced line.'
      : '<strong>Below the practical-worst-case line → a fat line</strong> — too much WIP for the throughput; unbalance the line, add parallel machines, or cut variability.') : ''}</p></div>`);

  // ---- VUT / Kingman ----
  const bn = lp.bottleneck;
  if (bn) {
    const prop = propagateScv(lp.stations, lp.arrivalScv);
    const ca2 = (prop.find((p) => p.id === bn.id) || {}).ca2;
    const ca2v = Number.isFinite(ca2) ? ca2 : 1;
    const uMeasured = ci(rows, 'util:' + bn.id).mean;
    const opU = Number.isFinite(uMeasured) ? Math.min(uMeasured, 0.995) : bn.u;
    const opCtq = vutQueueTime({ ca2: ca2v, ce2: bn.ce2, u: opU, te: bn.te, m: bn.m });
    const us = []; for (let u = 0.02; u < 0.99; u += 0.02) us.push(u);
    const curve = vutCurve({ ca2: ca2v, ce2: bn.ce2, te: bn.te, m: bn.m }, us);
    const single = !feats.multiStation && !feats.timedTransport;
    const measuredCtq = (single && Number.isFinite(mCT)) ? mCT - lp.T0 : undefined;   // station queue only when single-station
    const muted = app.vut.level === 'out-of-range';
    const V = (ca2v + bn.ce2) / 2, U = opU / (1 - opU);
    h.push(`<div class="chart-card"><h3>VUT / Kingman — queue time at the bottleneck (${esc(bn.name)})</h3>
      <p class="appl-line">${chip(app.vut)}</p>
      ${vutPlot({ curve, opU, opCtq, measuredCtq, unit, muted })}
      <p class="cap">CT<sub>q</sub> ≈ <strong>V·U·T</strong> = <span class="num">${fmt(V)}</span> ·
      <span class="num">${fmt(U)}</span> · <span class="num">${fmt(bn.te)}</span> =
      <span class="num">${fmt(opCtq)}</span> ${esc(unit)} at u=${pct(opU)}
      (V=(c_a²+c_e²)/2, c_a²=${fmt(ca2v)}, c_e²=${fmt(bn.ce2)}; U=u/(1−u); T=t_e).
      The product structure is the lesson: high variability <em>and</em> high utilisation together are
      catastrophic; either alone is survivable.
      ${muted ? '<strong>The formula is out of range here</strong> — the dashed curve is shown only to mark how far the model has moved beyond a simple queue. Trust the simulation.' : ''}</p></div>`);
  }

  // ---- Utilisation predicted vs measured ----
  const urows = lp.stations.map((st) => {
    const c = ci(rows, 'util:' + st.id);
    return { name: st.name, predicted: st.u, measured: c.mean, hw: c.halfwidth };
  }).filter((r) => Number.isFinite(r.measured));
  if (urows.length) {
    h.push(`<div class="chart-card"><h3>Utilisation — measured vs r_a·t_e / m</h3>
      <p class="appl-line">${chip(app.utilisation)}</p>
      <table class="table"><thead><tr><th>Station</th><th class="num">Predicted u</th><th class="num">Measured u (95% CI)</th></tr></thead><tbody>
      ${urows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${pct(r.predicted)}</td><td class="num">${pct(r.measured)} ± ${pct(r.hw)}</td></tr>`).join('')}
      </tbody></table>
      <p class="cap">Predicted from arrival rate × effective process time ÷ machines. Agreement confirms
      flow conservation; a gap points to scrap, blocking, or a rate the formula doesn't see.</p></div>`);
  }

  $('results').hidden = false;
  $('results').innerHTML = h.join('');
}

// wire up
if (renderStudyBar()) {
  $('controls').hidden = false;
  const R = project.results || {};
  $('reps').value = R.reps || 12;
  $('horizon').value = R.horizon || 1000;
  $('timeUnit').textContent = timeUnit();
  $('runBtn').addEventListener('click', run);
  run();   // auto-run on load
}
