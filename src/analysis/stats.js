// Small statistics helpers for the in-browser analysis layer — the JS port of
// what scipy/numpy provided for the Python companion. Pure functions, no deps.

/** Finite numeric values only (drops null/undefined/NaN/Infinity). */
export function finite(values) {
  const out = [];
  for (const v of values) if (v != null && Number.isFinite(v)) out.push(v);
  return out;
}

export function mean(values) {
  const a = finite(values);
  if (!a.length) return NaN;
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

/** Sample variance (ddof=1) to match numpy's var(ddof=1). */
export function sampleVar(values) {
  const a = finite(values);
  if (a.length < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return s / (a.length - 1);
}

export function sampleStd(values) {
  const v = sampleVar(values);
  return Number.isNaN(v) ? NaN : Math.sqrt(v);
}

/** Linear-interpolation quantile (matches numpy/pandas default 'linear'). */
export function quantile(values, q) {
  const a = finite(values).slice().sort((x, y) => x - y);
  if (!a.length) return NaN;
  if (a.length === 1) return a[0];
  const pos = q * (a.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

// ---------------------------------------------------------------- Student-t quantile
// log-gamma (Lanczos), regularized incomplete beta, t-CDF, then invert by bisection.
export function gammaln(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betacf(a, b, x) {
  const FPMIN = 1e-300, EPS = 1e-12, MAXIT = 200;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a,b). */
export function betai(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(gammaln(a + b) - gammaln(a) - gammaln(b) +
    a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}

/** CDF of Student's t with df degrees of freedom. */
export function studentTcdf(t, df) {
  const x = df / (df + t * t);
  const ib = 0.5 * betai(df / 2, 0.5, x);
  return t > 0 ? 1 - ib : ib;
}

/** Inverse CDF (quantile) of Student's t. p in (0,1). Bisection — robust. */
export function studentTppf(p, df) {
  if (!(df > 0)) return NaN;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (Math.abs(p - 0.5) < 1e-15) return 0;
  const sign = p < 0.5 ? -1 : 1;
  const target = p < 0.5 ? 1 - p : p;     // work in the upper tail, mirror by sign
  let lo = 0, hi = 1e7;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (studentTcdf(mid, df) < target) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return sign * 0.5 * (lo + hi);
}

/** Student-t confidence interval for the mean of i.i.d. `values`. */
export function confidenceInterval(values, alpha = 0.05) {
  const a = finite(values);
  const n = a.length;
  if (n === 0) return { mean: NaN, halfwidth: NaN, low: NaN, high: NaN, n: 0, sd: NaN };
  const m = mean(a);
  if (n === 1) return { mean: m, halfwidth: NaN, low: m, high: m, n: 1, sd: NaN };
  const sd = sampleStd(a);
  const tcrit = studentTppf(1 - alpha / 2, n - 1);
  const hw = tcrit * sd / Math.sqrt(n);
  return { mean: m, halfwidth: hw, low: m - hw, high: m + hw, n, sd };
}
