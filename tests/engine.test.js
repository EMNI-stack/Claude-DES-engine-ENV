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

/* ================================================================
   6. Instant demand mode reproduces classic push behavior exactly
      Same seed, with and without explicit buffers + instant demand,
      must give identical event streams (completed, scrapped, clock).
   ================================================================ */
test('instant demand mode reproduces prior push behavior exactly', () => {
  const mk = (extra) => ({
    type: 'production',
    source: newDist('exp', { mean: 0.9 }),
    stations: [
      station('A', 1, true, 4, newDist('exp', { mean: 0.7 }), 0.05, false),
      station('B', 2, true, 3, newDist('exp', { mean: 0.6 }), 0, false),
    ],
    ...extra,
  });
  const legacy = new Sim(mk({}), 3131);
  const explicit = new Sim(mk({
    buffers: [
      { finite: true, cap: 4, init: 0 },
      { finite: true, cap: 3, init: 0 },
      { finite: false, cap: 12, init: 0 },
    ],
    demand: { mode: 'instant', dist: newDist('exp', { mean: 2.5 }) },
  }), 3131);
  runTo(legacy, 60_000); runTo(explicit, 60_000);

  assert.equal(explicit.completed, legacy.completed, 'completed counts diverged');
  assert.equal(explicit.scrapped, legacy.scrapped, 'scrap counts diverged');
  assert.equal(explicit.rejected, legacy.rejected, 'rejection counts diverged');
  assert.equal(explicit.now, legacy.now, 'simulation clocks diverged');
});

/* ================================================================
   7. Demand conservation: demanded = fulfilled + stockouts
      (and entity conservation still holds with a demand stream)
   ================================================================ */
test('demand conservation: demanded = fulfilled + stockouts', () => {
  const cfg = {
    type: 'production',
    source: newDist('exp', { mean: 1.2 }),
    stations: [station('A', 2, true, 5, newDist('exp', { mean: 0.9 }), 0, false)],
    buffers: [
      { finite: true, cap: 5, init: 0 },
      { finite: true, cap: 8, init: 3 },
    ],
    demand: { mode: 'stream', dist: newDist('exp', { mean: 1.0 }) },
  };
  const sim = new Sim(cfg, 8888);
  runTo(sim, 80_000);

  assert.ok(sim.demanded > 1000, 'not enough demand events for a reliable check');
  assert.equal(sim.demanded, sim.fulfilled + sim.stockouts,
    `demanded=${sim.demanded} != fulfilled(${sim.fulfilled})+stockouts(${sim.stockouts})`);
  const fr = sim.fulfilled / sim.demanded;
  assert.ok(fr > 0 && fr <= 1, `fill rate ${fr} out of range`);
  // parts: entered = completed + scrapped + rejected + WIP (FG units are completed)
  assert.equal(sim.entered, sim.completed + sim.scrapped + sim.rejected + sim.WIP());
});

/* ================================================================
   8. Initial finished-goods inventory serves demand before stockouts
      Production effectively never starts (huge interarrival), FG
      seeded with 10 units, deterministic demand every 1 min:
      first 10 demands fulfilled, the rest are stockouts.
   ================================================================ */
test('initial FG inventory serves demand before stockouts', () => {
  const cfg = {
    type: 'production',
    source: newDist('const', { value: 1e7 }),
    stations: [station('A', 1, false, 5, newDist('const', { value: 1 }))],
    buffers: [
      { finite: false, cap: 5, init: 0 },
      { finite: true, cap: 20, init: 10 },
    ],
    demand: { mode: 'stream', dist: newDist('const', { value: 1 }) },
  };
  const sim = new Sim(cfg, 123);
  for (let i = 0; i < 15; i++) sim.step();   // 15 demand events at t=1..15

  assert.equal(sim.demanded, 15);
  assert.equal(sim.fulfilled, 10);
  assert.equal(sim.stockouts, 5);
  assert.equal(sim.fg, 0);
});

/* ================================================================
   9. Finite FG buffer blocks the line; throughput tracks demand rate
      Line capacity 2.5/min >> demand 1.0/min, FG cap 2 → completions
      are pulled by demand, so throughput ≈ demand rate.
   ================================================================ */
test('full FG buffer blocks last station; throughput tracks demand rate', () => {
  const cfg = {
    type: 'production',
    source: newDist('exp', { mean: 0.5 }),   // flood the line with work
    stations: [station('A', 1, false, 99, newDist('exp', { mean: 0.4 }))],
    buffers: [
      { finite: false, cap: 99, init: 0 },
      { finite: true, cap: 2, init: 0 },
    ],
    demand: { mode: 'stream', dist: newDist('exp', { mean: 1.0 }) },
  };
  const sim = new Sim(cfg, 4444);
  runTo(sim, 120_000);

  const thru = sim.completed / sim.now;
  assert.ok(Math.abs(thru - 1.0) < 0.05,
    `throughput ${thru.toFixed(3)}/min should track demand rate 1.0/min`);
  // the machine must actually have spent time blocked on the FG buffer
  assert.ok(sim.stations[0].aBlk > 0, 'last station never blocked on full FG buffer');
});
