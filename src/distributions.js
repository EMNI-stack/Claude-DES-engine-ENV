export function mulberry32(s) {
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function randn(rng) {
  let u = 0, v = 0;
  while (!u) u = rng();
  while (!v) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function gammaFn(z) {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z));
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

export const DISTS = {
  const:      { label: 'Constant',    f: [['value', 'value', 1]] },
  exp:        { label: 'Exponential', f: [['mean', 'mean', 1]] },
  uniform:    { label: 'Uniform',     f: [['min', 'min', 0.5], ['max', 'max', 1.5]] },
  normal:     { label: 'Normal',      f: [['mean', 'mean', 1], ['sd', 'std dev', 0.3]] },
  triangular: { label: 'Triangular',  f: [['min', 'min', 0.4], ['mode', 'mode', 1], ['max', 'max', 2]] },
  weibull:    { label: 'Weibull',     f: [['shape', 'shape k', 1.5], ['scale', 'scale λ', 1]] },
  lognormal:  { label: 'Lognormal',   f: [['mean', 'mean', 1], ['sd', 'std dev', 0.5]] },
};

export function newDist(type, params) {
  return { type, params: Object.assign({}, params), variability: 0 };
}

export function sample(d, rng) {
  const p = d.params; let v, u = rng();
  switch (d.type) {
    case 'const':      v = p.value; break;
    case 'exp':        v = -(p.mean) * Math.log(1 - u); break;
    case 'uniform':    v = p.min + (p.max - p.min) * u; break;
    case 'normal':     v = p.mean + p.sd * randn(rng); break;
    case 'triangular': {
      const { min, mode, max } = p, fc = (mode - min) / (max - min);
      v = u < fc ? min + Math.sqrt(u * (max - min) * (mode - min))
                 : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
      break;
    }
    case 'weibull':    v = p.scale * Math.pow(-Math.log(1 - u), 1 / p.shape); break;
    case 'lognormal': {
      const m = p.mean, s = p.sd, sig2 = Math.log(1 + (s * s) / (m * m)), mu = Math.log(m) - sig2 / 2;
      v = Math.exp(mu + Math.sqrt(sig2) * randn(rng));
      break;
    }
    default: v = 1;
  }
  if (d.variability > 0) v *= Math.max(0.05, 1 + d.variability * randn(rng));
  return Math.max(0, v);
}

export function distMean(d) {
  const p = d.params;
  switch (d.type) {
    case 'const':      return p.value;
    case 'exp':        return p.mean;
    case 'uniform':    return (p.min + p.max) / 2;
    case 'normal':     return p.mean;
    case 'triangular': return (p.min + p.mode + p.max) / 3;
    case 'weibull':    return p.scale * gammaFn(1 + 1 / p.shape);
    case 'lognormal':  return p.mean;
    default:           return 1;
  }
}

// Analytic variance of the base distribution (before any multiplicative
// `variability` jitter). Used to report service-time SCV for the
// variability-propagation (linking-equation) analysis.
export function distVar(d) {
  const p = d.params;
  switch (d.type) {
    case 'const':      return 0;
    case 'exp':        return p.mean * p.mean;                 // SCV = 1
    case 'uniform':    return (p.max - p.min) ** 2 / 12;
    case 'normal':     return p.sd * p.sd;
    case 'triangular': {
      const { min: a, mode: c, max: b } = p;
      return (a * a + b * b + c * c - a * b - a * c - b * c) / 18;
    }
    case 'weibull': {
      const g1 = gammaFn(1 + 1 / p.shape), g2 = gammaFn(1 + 2 / p.shape);
      return p.scale * p.scale * (g2 - g1 * g1);
    }
    case 'lognormal':  return p.sd * p.sd;                     // parameterised by real-space mean/sd
    default:           return 0;
  }
}

// Squared coefficient of variation c² = Var/Mean² (dimensionless variability).
// Includes the multiplicative `variability` jitter when present: a factor with
// mean 1 and sd = variability multiplies the base sample, so by the product
// rule for independent factors  c²_total = c²_base + c²_jitter + c²_base·c²_jitter.
export function distScv(d) {
  const m = distMean(d);
  if (!(m > 0)) return NaN;
  let scv = distVar(d) / (m * m);
  const j = d.variability || 0;
  if (j > 0) scv = scv + j * j + scv * j * j;
  return scv;
}
