// Node.js test file — no external dependencies, uses built-in node:test + node:assert
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim, station } from '../src/engine.js';
import { newDist } from '../src/distributions.js';

/* ---- helpers ---- */
function mmcConfig(lambda, mu, c) {
  return {
    type: 'server',
    source: newDist('exp', { mean: 1 / lambda }),
    stations: [station('S', c, false, Infinity, newDist('exp', { mean: 1 / mu }))],
  };
}

function runTo(sim, targetEvents) {
  for (let i = 0; i < targetEvents && sim.fel.length; i++) sim.step();
}

// Erlang-C formula: P(waiting) and mean queue length for M/M/c
function erlangC(lambda, mu, c) {
  const rho = lambda / mu;          // total offered load
  const a = rho / c;                // per-server utilisation
  if (a >= 1) return { util: a, Lq: Infinity, Wq: Infinity, C: 1 };

  // P0 via standard formula
  let sum = 0;
  for (let n = 0; n < c; n++) {
    let term = Math.pow(rho, n);
    let fact = 1; for (let k = 1; k <= n; k++) fact *= k;
    sum += term / fact;
  }
  let factC = 1; for (let k = 1; k <= c; k++) factC *= k;
  const lastTerm = Math.pow(rho, c) / factC * (1 / (1 - a));
  const P0 = 1 / (sum + lastTerm);
  const C = lastTerm * P0;           // Erlang-C probability (P(wait))
  const Lq = C * a / (1 - a);       // mean number waiting
  const Wq = Lq / lambda;           // mean wait time
  return { util: a, Lq, Wq, C, P0 };
}

/* ================================================================
   1. M/M/c utilization and throughput match Erlang-C within 2%
   ================================================================ */
test('M/M/c utilization matches Erlang-C theory within 2%', () => {
  const lambda = 2.4, mu = 1.0, c = 3;
  const theory = erlangC(lambda, mu, c);

  const sim = new Sim(mmcConfig(lambda, mu, c), 9999);
  runTo(sim, 120_000);

  const T = sim.now;
  const st = sim.stations[0];
  const simUtil = st.aBusy / (c * T);   // fraction of total machine-time busy

  assert.ok(
    Math.abs(simUtil - theory.util) / theory.util < 0.02,
    `utilization: sim=${simUtil.toFixed(4)} theory=${theory.util.toFixed(4)} (>${(2).toFixed(0)}% off)`
  );
});

test('M/M/c throughput matches arrival rate within 2%', () => {
  const lambda = 2.4, mu = 1.0, c = 3;
  const sim = new Sim(mmcConfig(lambda, mu, c), 7777);
  runTo(sim, 120_000);

  const T = sim.now;
  const simThru = sim.completed / T;
  // In stable M/M/c all arrivals complete (no finite buffer), throughput ≈ lambda
  assert.ok(
    Math.abs(simThru - lambda) / lambda < 0.02,
    `throughput: sim=${simThru.toFixed(4)} expected≈${lambda} (>${(2).toFixed(0)}% off)`
  );
});

/* ================================================================
   2. Tandem line per-station utilization
      Two stations in series; bottleneck util ≥ non-bottleneck util.
      Station 1: 1 machine, mean=0.8 → ρ1=0.8
      Station 2: 1 machine, mean=0.4 → ρ2=0.4
      Arrival rate: 1.0 (mean IAT = 1.0)
   ================================================================ */
test('tandem line: bottleneck has higher utilization than downstream', () => {
  const cfg = {
    type: 'server',
    source: newDist('exp', { mean: 1.0 }),
    stations: [
      station('Fast', 1, false, Infinity, newDist('exp', { mean: 0.4 })),
      station('Slow', 1, false, Infinity, newDist('exp', { mean: 0.8 })),
    ],
  };
  const sim = new Sim(cfg, 4242);
  runTo(sim, 100_000);

  const T = sim.now;
  const util0 = sim.stations[0].aBusy / T;
  const util1 = sim.stations[1].aBusy / T;

  assert.ok(util1 > util0, `bottleneck util ${util1.toFixed(3)} should exceed ${util0.toFixed(3)}`);

  // Both utilizations should be within 5% of theory (rho = lambda * mean)
  assert.ok(Math.abs(util0 - 0.4) / 0.4 < 0.05, `station0 util ${util0.toFixed(3)} expected≈0.4`);
  assert.ok(Math.abs(util1 - 0.8) / 0.8 < 0.05, `station1 util ${util1.toFixed(3)} expected≈0.8`);
});

/* ================================================================
   3. Entity conservation: entered = completed + scrapped + rejected + WIP
   ================================================================ */
test('entity conservation holds', () => {
  const cfg = {
    type: 'production',
    source: newDist('exp', { mean: 0.8 }),
    stations: [
      station('A', 1, true, 4, newDist('exp', { mean: 0.7 }), 0.05, false),
      station('B', 2, true, 3, newDist('exp', { mean: 0.6 }), 0.03, false),
    ],
  };
  const sim = new Sim(cfg, 1111);
  runTo(sim, 50_000);

  const wip = sim.WIP();
  const total = sim.completed + sim.scrapped + sim.rejected + wip;
  assert.equal(sim.entered, total,
    `entered=${sim.entered} != completed(${sim.completed})+scrapped(${sim.scrapped})+rejected(${sim.rejected})+wip(${wip})`
  );
});

/* ================================================================
   4. Breakdown availability
      Mean availability = TTF / (TTF + TTR).
      With TTF=exp(mean=20), TTR=exp(mean=5): availability = 20/25 = 0.80
      Observed (1 - downFraction) should be within 3%.
   ================================================================ */
test('breakdown availability matches TTF/(TTF+TTR) within 3%', () => {
  const meanTTF = 20, meanTTR = 5;
  const theoreticalAvail = meanTTF / (meanTTF + meanTTR); // 0.80

  const cfg = {
    type: 'production',
    source: newDist('exp', { mean: 0.1 }), // flood with work so machine is never idle-starved
    stations: [
      station('M', 1, false, Infinity,
        newDist('exp', { mean: 0.5 }),
        0, true,
        newDist('exp', { mean: meanTTF }),
        newDist('exp', { mean: meanTTR })
      ),
    ],
  };
  const sim = new Sim(cfg, 5555);
  runTo(sim, 200_000);

  const T = sim.now;
  const st = sim.stations[0];
  const downFrac = st.aDown / T;
  const simAvail = 1 - downFrac;

  assert.ok(
    Math.abs(simAvail - theoreticalAvail) / theoreticalAvail < 0.03,
    `availability: sim=${simAvail.toFixed(4)} theory=${theoreticalAvail.toFixed(4)} (>3% off)`
  );
});

/* ================================================================
   5. Scrap yield
      Single station with scrap=p. Expected yield = (1-p).
      Sim yield = completed / (completed + scrapped) should be within 2%.
   ================================================================ */
test('scrap yield matches 1-p within 2%', () => {
  const scrapP = 0.15;
  const expectedYield = 1 - scrapP;

  const cfg = {
    type: 'production',
    source: newDist('exp', { mean: 1.0 }),
    stations: [
      station('X', 2, false, Infinity, newDist('exp', { mean: 0.5 }), scrapP, false),
    ],
  };
  const sim = new Sim(cfg, 2222);
  runTo(sim, 80_000);

  const finished = sim.completed + sim.scrapped;
  assert.ok(finished > 1000, 'not enough completions for a reliable yield estimate');
  const simYield = sim.completed / finished;

  assert.ok(
    Math.abs(simYield - expectedYield) / expectedYield < 0.02,
    `yield: sim=${simYield.toFixed(4)} expected=${expectedYield.toFixed(4)} (>2% off)`
  );
});
