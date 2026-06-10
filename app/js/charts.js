/* Small, dependency-free SVG charts for the Run & Analyse view.
   On-brand per DESIGN-LANGUAGE §5: thin lines, faint gridlines, mono tick labels,
   confidence as quiet shaded bands / whiskers, grayscale-legible. Each function
   returns an SVG string; colours come from the design-system CSS variables so the
   charts inherit the palette and print well in grayscale. No animation. */

const NS = 'http://www.w3.org/2000/svg';

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// "nice" number formatting for tick labels / values
function fmt(x) {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a === 0) return '0';
  if (a >= 1000) return x.toFixed(0);
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  if (a >= 1) return x.toFixed(2);
  return x.toFixed(3);
}

// build a linear scale from [d0,d1] (data) to [r0,r1] (pixels)
function scale(d0, d1, r0, r1) {
  const span = (d1 - d0) || 1;
  return (v) => r0 + (v - d0) / span * (r1 - r0);
}

function pathFrom(pts) {
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
}

/**
 * Welch warm-up plot: the across-replication mean WIP(t) (raw, faint) with its
 * smoothed curve, the warm-up region shaded, and a cut-off line. Used to choose
 * how much of the start to delete in a steady-state study.
 * @param {object} welch  output of welchWarmup(): { t, ybar, smoothed, cutoff_time }
 * @param {object} opts   { cutoffTime, unit, width, height, plateau }
 */
export function welchPlot(welch, { cutoffTime = 0, unit = 'min', width = 720, height = 260, plateau = null } = {}) {
  const t = welch.t, ybar = welch.ybar, sm = welch.smoothed;
  const W = width, H = height;
  const m = { l: 48, r: 16, t: 16, b: 36 };
  const x0 = m.l, x1 = W - m.r, y0 = H - m.b, y1 = m.t;
  if (!t.length) return `<svg viewBox="0 0 ${W} ${H}" class="chart"></svg>`;
  const tmin = t[0], tmax = t[t.length - 1];
  const ymax = Math.max(...ybar, ...sm) * 1.1 || 1;
  const sx = scale(tmin, tmax, x0, x1);
  const sy = scale(0, ymax, y0, y1);

  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const yv = ymax * g / 4, yy = sy(yv);
    grid.push(`<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" class="chart-grid"/>`);
    grid.push(`<text x="${x0 - 6}" y="${(yy + 3).toFixed(1)}" class="chart-tick" text-anchor="end">${fmt(yv)}</text>`);
  }
  for (let g = 0; g <= 4; g++) {
    const tv = tmin + (tmax - tmin) * g / 4, xx = sx(tv);
    grid.push(`<text x="${xx.toFixed(1)}" y="${y0 + 18}" class="chart-tick" text-anchor="middle">${fmt(tv)}</text>`);
  }

  const rawPath = pathFrom(t.map((tt, i) => [sx(tt), sy(ybar[i])]));
  const smPath = pathFrom(t.map((tt, i) => [sx(tt), sy(sm[i])]));
  const cx = sx(Math.max(tmin, Math.min(tmax, cutoffTime)));
  const shade = cutoffTime > tmin
    ? `<rect x="${x0}" y="${y1}" width="${(cx - x0).toFixed(1)}" height="${(y0 - y1).toFixed(1)}" class="chart-warmup"/>`
    : '';
  const plat = (plateau != null && Number.isFinite(plateau))
    ? `<line x1="${x0}" y1="${sy(plateau).toFixed(1)}" x2="${x1}" y2="${sy(plateau).toFixed(1)}" class="chart-ref"/>`
    : '';

  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Average WIP over time with warm-up region">
    ${grid.join('')}
    ${shade}
    ${plat}
    <path d="${rawPath}" class="chart-line-faint"/>
    <path d="${smPath}" class="chart-line"/>
    <line x1="${cx.toFixed(1)}" y1="${y1}" x2="${cx.toFixed(1)}" y2="${y0}" class="chart-cutoff"/>
    ${cutoffTime > tmin ? `<text x="${((cx > x0 + (x1 - x0) * 0.62 ? cx - 5 : cx + 5)).toFixed(1)}" y="${y1 + 12}" class="chart-tick" fill="var(--accent)" text-anchor="${cx > x0 + (x1 - x0) * 0.62 ? 'end' : 'start'}">warm-up cut-off</text>` : ''}
    <text x="${x0}" y="${y1 - 4}" class="chart-axis-label">avg WIP (jobs)</text>
    <text x="${x1}" y="${y1 - 4}" class="chart-axis-label" text-anchor="end">time (${esc(unit)})</text>
  </svg>`;
}

/**
 * Replication dot plot: each replication's value as a dot, with the mean line and
 * the 95% CI as a shaded band — the honest picture of "every run gives a different
 * answer, here is the spread the interval summarises".
 * @param {number[]} values per-rep values
 * @param {object} ci  { mean, low, high }
 * @param {object} opts { unit, width, height }
 */
export function repDotPlot(values, ci, { unit = '', width = 720, height = 92 } = {}) {
  const v = values.filter((x) => Number.isFinite(x));
  const W = width, H = height;
  const m = { l: 16, r: 16, t: 14, b: 26 };
  const x0 = m.l, x1 = W - m.r, yMid = (m.t + (H - m.b)) / 2;
  if (!v.length) return `<svg viewBox="0 0 ${W} ${H}" class="chart"></svg>`;
  let lo = Math.min(...v, ci.low), hi = Math.max(...v, ci.high);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.08 || 1;
  lo -= pad; hi += pad;
  const sx = scale(lo, hi, x0, x1);
  const band = Number.isFinite(ci.low) && Number.isFinite(ci.high)
    ? `<rect x="${sx(ci.low).toFixed(1)}" y="${m.t}" width="${(sx(ci.high) - sx(ci.low)).toFixed(1)}" height="${(H - m.b - m.t).toFixed(1)}" class="chart-ciband"/>`
    : '';
  const meanLine = `<line x1="${sx(ci.mean).toFixed(1)}" y1="${m.t - 2}" x2="${sx(ci.mean).toFixed(1)}" y2="${H - m.b + 2}" class="chart-mean"/>`;
  const dots = v.map((x) => `<circle cx="${sx(x).toFixed(1)}" cy="${yMid.toFixed(1)}" r="3.5" class="chart-dot"/>`).join('');
  // ticks anchored inward at the ends (no edge clip) and de-duplicated when the range is tiny
  const tvals = [{ v: lo + pad, x: x0, a: 'start' }, { v: (lo + hi) / 2, x: (x0 + x1) / 2, a: 'middle' }, { v: hi - pad, x: x1, a: 'end' }];
  const seen = new Set();
  const ticks = tvals.filter((t) => { const s = fmt(t.v); if (seen.has(s)) return false; seen.add(s); return true; })
    .map((t) => `<text x="${t.x.toFixed(1)}" y="${H - 8}" class="chart-tick" text-anchor="${t.a}">${fmt(t.v)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Replication values with mean and confidence band">
    ${band}${meanLine}<line x1="${x0}" y1="${yMid.toFixed(1)}" x2="${x1}" y2="${yMid.toFixed(1)}" class="chart-axis"/>${dots}${ticks}
    <text x="${x1}" y="${m.t}" class="chart-tick" text-anchor="end">${esc(unit)}</text>
  </svg>`;
}

/**
 * Horizontal utilisation bars with a 95% half-width whisker, sorted desc; the
 * bottleneck (highest mean) is highlighted. Values are fractions in [0,1].
 * @param {Array} rows  [{ name, mean, halfwidth }]
 * @param {object} opts { width, rowH, bottleneckName }
 */
export function utilBars(rows, { width = 720, rowH = 30, bottleneckName = null } = {}) {
  const W = width;
  const m = { l: 120, r: 56, t: 8, b: 22 };
  const H = m.t + m.b + rows.length * rowH;
  const x0 = m.l, x1 = W - m.r;
  const sx = scale(0, 1, x0, x1);
  const grid = [];
  for (const gv of [0, 0.25, 0.5, 0.75, 1]) {
    const xx = sx(gv);
    grid.push(`<line x1="${xx.toFixed(1)}" y1="${m.t}" x2="${xx.toFixed(1)}" y2="${H - m.b}" class="chart-grid"/>`);
    grid.push(`<text x="${xx.toFixed(1)}" y="${H - 6}" class="chart-tick" text-anchor="middle">${(gv * 100).toFixed(0)}%</text>`);
  }
  const bars = rows.map((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    const isBn = bottleneckName && r.name === bottleneckName;
    const barEnd = sx(Math.min(1, r.mean));
    const w = Math.max(0, barEnd - x0);
    const whisker = Number.isFinite(r.halfwidth)
      ? `<line x1="${sx(Math.max(0, r.mean - r.halfwidth)).toFixed(1)}" y1="${y.toFixed(1)}" x2="${sx(Math.min(1, r.mean + r.halfwidth)).toFixed(1)}" y2="${y.toFixed(1)}" class="chart-whisker"/>`
      : '';
    // long bars (near 100%): put the % label INSIDE the bar end (right-aligned) so it never overflows
    // the right margin; short bars label just to the right. The bottleneck is shown by bar colour.
    const long = r.mean > 0.78;
    const labelX = long ? barEnd - 6 : barEnd + 6;
    const label = `<text x="${labelX.toFixed(1)}" y="${(y + 3).toFixed(1)}" class="chart-tick${long ? ' chart-tick--inbar' : ''}" text-anchor="${long ? 'end' : 'start'}">${(r.mean * 100).toFixed(1)}%</text>`;
    return `<g>
      <text x="${x0 - 8}" y="${(y + 3).toFixed(1)}" class="chart-tick" text-anchor="end">${esc(r.name)}</text>
      <rect x="${x0}" y="${(y - 7).toFixed(1)}" width="${w.toFixed(1)}" height="14" class="chart-bar${isBn ? ' chart-bar--bn' : ''}"/>
      ${whisker}${label}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Resource utilisation">${grid.join('')}${bars}</svg>`;
}
