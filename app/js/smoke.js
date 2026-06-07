/* Engine smoke test.
   Purpose: prove the NEW app can drive the EXISTING, unmodified engine.
   It imports src/engine.js + src/distributions.js, runs a tiny simulation
   headlessly, and reports a few resulting numbers. No new simulation UI. */

import { Sim, station } from '../../src/engine.js';
import { newDist } from '../../src/distributions.js';

const SEED = 42;
const HORIZON = 2000;          // simulated time units
const EVENT_CAP = 1_000_000;   // safety bound on the event loop

// A small, stable two-station serial line (arrival rate below both service rates).
function buildConfig() {
  return {
    control: 'push',
    supply: 'stream',
    source: newDist('exp', { mean: 1.6 }),
    stations: [
      station('Press',   1, false, Infinity, newDist('exp', { mean: 1.2 })),
      station('Inspect', 1, false, Infinity, newDist('exp', { mean: 1.0 })),
    ],
    demand: { mode: 'instant' },
  };
}

function run() {
  const cfg = buildConfig();
  const sim = new Sim(cfg, SEED);
  let evs = 0;
  while (sim.fel.length && sim.now < HORIZON && evs < EVENT_CAP) { sim.step(); evs++; }

  const T = sim.now || 1;
  const throughput = sim.completed / T;
  const avgWIP = sim.areaWIP / T;
  const avgCT = sim.completed ? sim.sumCycle / sim.completed : 0;
  const util = sim.stations.map((st) => ({
    name: st.cfg.name,
    u: st.aBusy / (st.cfg.machines * T),
  }));
  const littleLHS = avgWIP;
  const littleRHS = throughput * avgCT;

  return { sim, evs, T, throughput, avgWIP, avgCT, util, littleLHS, littleRHS };
}

const f = (x, d = 3) => Number.isFinite(x) ? x.toFixed(d) : '—';

function render(r) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('k-th', f(r.throughput));
  set('k-wip', f(r.avgWIP, 2));
  set('k-ct', f(r.avgCT, 2));
  set('m-seed', String(SEED));
  set('m-time', f(r.T, 1));
  set('m-events', r.evs.toLocaleString('en-US'));
  set('m-entered', String(r.sim.entered));
  set('m-completed', String(r.sim.completed));
  set('m-little-lhs', f(r.littleLHS, 2));
  set('m-little-rhs', f(r.littleRHS, 2));

  const rows = r.util.map((s) =>
    `<tr><td>${s.name}</td><td class="num">${(s.u * 100).toFixed(1)}%</td></tr>`).join('');
  const tbody = document.getElementById('util-body');
  if (tbody) tbody.innerHTML = rows;

  const status = document.getElementById('status');
  if (status) {
    status.innerHTML = '<span class="badge badge--busy">engine ok</span> ' +
      'imported <span class="mono">src/engine.js</span> and ran headlessly.';
  }
}

function fail(err) {
  const status = document.getElementById('status');
  if (status) status.innerHTML =
    '<span class="badge badge--down">engine error</span> ' + String(err && err.message || err);
  console.error(err);
}

function go() { try { render(run()); } catch (e) { fail(e); } }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', go);
} else { go(); }
