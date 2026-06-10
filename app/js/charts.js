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

/**
 * Characteristic curve — throughput vs WIP, with best / PWC / worst reference curves (dashed) and the
 * simulated operating point (with CI whiskers). Critical WIP W₀ marked. Above the PWC line = a lean
 * line; below = a fat line. (theory-notes §4.3)
 * @param {object} o  { curves:[{w,best_th,pwc_th,worst_th}], point:{w,th,wLow,wHigh,thLow,thHigh},
 *                      W0, rb, muted, width, height }
 */
export function characteristicPlot({ curves, point, W0, rb, muted = false, width = 720, height = 300 }) {
  const W = width, H = height, m = { l: 52, r: 64, t: 16, b: 36 };
  const x0 = m.l, x1 = W - m.r, y0 = H - m.b, y1 = m.t;
  if (!curves || !curves.length) return `<svg viewBox="0 0 ${W} ${H}" class="chart"></svg>`;
  const wMax = curves[curves.length - 1].w;
  const yMax = Math.max(rb || 0, ...curves.map((c) => c.best_th), point ? (point.thHigh || point.th) : 0) * 1.1 || 1;
  const sx = scale(0, wMax, x0, x1), sy = scale(0, yMax, y0, y1);
  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const yv = yMax * g / 4, yy = sy(yv);
    grid.push(`<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" class="chart-grid"/>`);
    grid.push(`<text x="${x0 - 6}" y="${(yy + 3).toFixed(1)}" class="chart-tick" text-anchor="end">${fmt(yv)}</text>`);
    const xv = wMax * g / 4, xx = sx(xv);
    grid.push(`<text x="${xx.toFixed(1)}" y="${y0 + 18}" class="chart-tick" text-anchor="${g === 0 ? 'start' : g === 4 ? 'end' : 'middle'}">${fmt(xv)}</text>`);
  }
  const line = (key, cls, label) => {
    const p = pathFrom(curves.map((c) => [sx(c.w), sy(c[key])]));
    const last = curves[curves.length - 1];
    return `<path d="${p}" class="${cls}"/><text x="${(x1 + 4).toFixed(1)}" y="${(sy(last[key]) + 3).toFixed(1)}" class="chart-tick">${label}</text>`;
  };
  const w0line = (Number.isFinite(W0) && W0 <= wMax)
    ? `<line x1="${sx(W0).toFixed(1)}" y1="${y1}" x2="${sx(W0).toFixed(1)}" y2="${y0}" class="chart-ref"/><text x="${(sx(W0) + 4).toFixed(1)}" y="${y1 + 11}" class="chart-tick">W₀=${fmt(W0)}</text>`
    : '';
  let pt = '';
  if (point && Number.isFinite(point.w) && Number.isFinite(point.th)) {
    const px = sx(point.w), py = sy(point.th);
    const wh = (Number.isFinite(point.wLow) && Number.isFinite(point.wHigh)) ? `<line x1="${sx(point.wLow).toFixed(1)}" y1="${py.toFixed(1)}" x2="${sx(point.wHigh).toFixed(1)}" y2="${py.toFixed(1)}" class="chart-whisker"/>` : '';
    const th = (Number.isFinite(point.thLow) && Number.isFinite(point.thHigh)) ? `<line x1="${px.toFixed(1)}" y1="${sy(point.thLow).toFixed(1)}" x2="${px.toFixed(1)}" y2="${sy(point.thHigh).toFixed(1)}" class="chart-whisker"/>` : '';
    pt = `${wh}${th}<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" class="chart-oppoint"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="chart${muted ? ' chart--muted' : ''}" role="img" aria-label="Characteristic curve: throughput vs WIP">
    ${grid.join('')}
    ${line('best_th', 'chart-ref-best', 'best')}
    ${line('pwc_th', 'chart-ref-pwc', 'PWC')}
    ${line('worst_th', 'chart-ref-worst', 'worst')}
    ${w0line}${pt}
    <text x="${x0}" y="${y1 - 4}" class="chart-axis-label">throughput</text>
    <text x="${x1}" y="${y1 - 4}" class="chart-axis-label" text-anchor="end">WIP (w)</text>
  </svg>`;
}

/**
 * VUT / Kingman queue-time curve (CTq vs utilisation), dashed, with the model's operating point and —
 * when the formula is exact — the measured queue time on it. y clipped for readability. (theory-notes §4.4)
 * @param {object} o { curve:[{u,ctq}], opU, opCtq, measuredCtq, unit, muted, width, height }
 */
export function vutPlot({ curve, opU, opCtq, measuredCtq, unit = 'min', muted = false, width = 720, height = 260 }) {
  const W = width, H = height, m = { l: 52, r: 16, t: 16, b: 36 };
  const x0 = m.l, x1 = W - m.r, y0 = H - m.b, y1 = m.t;
  if (!curve || !curve.length) return `<svg viewBox="0 0 ${W} ${H}" class="chart"></svg>`;
  // clip y so the asymptote near u→1 doesn't flatten everything else
  const ref = Math.max(opCtq || 0, Number.isFinite(measuredCtq) ? measuredCtq : 0);
  const yMax = Math.max(ref * 2.2, ...curve.filter((p) => p.u <= (opU || 0.9) + 0.1).map((p) => p.ctq)) || 1;
  const clip = (v) => Math.min(v, yMax);
  const sx = scale(0, 1, x0, x1), sy = scale(0, yMax, y0, y1);
  const grid = [];
  for (let g = 0; g <= 4; g++) {
    const yv = yMax * g / 4, yy = sy(yv);
    grid.push(`<line x1="${x0}" y1="${yy.toFixed(1)}" x2="${x1}" y2="${yy.toFixed(1)}" class="chart-grid"/>`);
    grid.push(`<text x="${x0 - 6}" y="${(yy + 3).toFixed(1)}" class="chart-tick" text-anchor="end">${fmt(yv)}</text>`);
    grid.push(`<text x="${sx(g / 4).toFixed(1)}" y="${y0 + 18}" class="chart-tick" text-anchor="${g === 0 ? 'start' : g === 4 ? 'end' : 'middle'}">${(g * 25)}%</text>`);
  }
  const path = pathFrom(curve.filter((p) => p.u < 1).map((p) => [sx(p.u), sy(clip(p.ctq))]));
  let pts = '';
  if (Number.isFinite(opU) && Number.isFinite(opCtq)) {
    pts += `<line x1="${sx(opU).toFixed(1)}" y1="${y1}" x2="${sx(opU).toFixed(1)}" y2="${y0}" class="chart-ref"/>`;
    pts += `<circle cx="${sx(opU).toFixed(1)}" cy="${sy(clip(opCtq)).toFixed(1)}" r="4" class="chart-ref-pt"/>`;
  }
  if (Number.isFinite(measuredCtq)) pts += `<circle cx="${sx(opU).toFixed(1)}" cy="${sy(clip(measuredCtq)).toFixed(1)}" r="4.5" class="chart-oppoint"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart${muted ? ' chart--muted' : ''}" role="img" aria-label="VUT queue time vs utilisation">
    ${grid.join('')}
    <path d="${path}" class="chart-ref-pwc"/>${pts}
    <text x="${x0}" y="${y1 - 4}" class="chart-axis-label">queue time (${esc(unit)})</text>
    <text x="${x1}" y="${y1 - 4}" class="chart-axis-label" text-anchor="end">utilisation</text>
  </svg>`;
}
