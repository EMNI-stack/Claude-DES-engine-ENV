import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadResults } from '../src/analysis/ingest.js';
import * as cmp from '../src/analysis/compare.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, '..', 'analysis', 'sample_data');
const load = (f) => loadResults(readFileSync(join(SAMPLES, `${f}.json`), 'utf8'));

function datasets() {
  return [{ name: 'push', ds: load('advanced_factory') }, { name: 'pull', ds: load('advanced_pull') }];
}

test('compareKpis yields a row per (scenario, metric) with bracketing CIs', () => {
  const k = cmp.compareKpis(datasets());
  const th = k.filter((r) => r.metric === 'throughput');
  assert.deepEqual(th.map((r) => r.scenario).sort(), ['pull', 'push']);
  for (const r of k) {
    assert.ok(r.ci_low <= r.mean + 1e-9);
    assert.ok(r.ci_high >= r.mean - 1e-9);
  }
});

test('bestScenario respects higher/lower-is-better', () => {
  const k = cmp.compareKpis(datasets());
  const th = k.filter((r) => r.metric === 'throughput');
  const wipWin = cmp.bestScenario(k, 'avgWIP');
  const thWin = cmp.bestScenario(k, 'throughput');
  // throughput: max wins
  assert.equal(thWin, th.reduce((a, b) => (b.mean > a.mean ? b : a)).scenario);
  // avgWIP: min wins → pull has lower WIP in these samples
  const wip = k.filter((r) => r.metric === 'avgWIP');
  assert.equal(wipWin, wip.reduce((a, b) => (b.mean < a.mean ? b : a)).scenario);
});

test('compareUtilization is tidy long with fractions in [0,1]', () => {
  const u = cmp.compareUtilization(datasets());
  assert.ok(u.length > 0);
  for (const r of u) assert.ok(r.utilization >= 0 && r.utilization <= 1.0001);
});

test('compareFlowFactor returns one row per scenario', () => {
  const ff = cmp.compareFlowFactor(datasets());
  assert.deepEqual(ff.map((r) => r.scenario).sort(), ['pull', 'push']);
});

test('bestScenario returns null for unknown metric', () => {
  assert.equal(cmp.bestScenario([], 'nope'), null);
});
