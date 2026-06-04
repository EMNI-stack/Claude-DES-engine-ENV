"""Simulation output analysis: warm-up detection and confidence intervals.

Methods paraphrased from the standard discrete-event simulation texts in
Reference/ (Law; Robinson):

* **Welch's procedure** for the warm-up / initialization-bias period: average a
  metric across replications at each time index to get a mean curve, smooth it
  with a moving average, and take the warm-up cutoff where the smoothed curve
  has settled (flattened).
* **MSER-5**: a single-run rule that picks the truncation point minimizing the
  marginal standard error of the retained mean (batches of 5 observations).
* **Replication confidence intervals**: i.i.d. replication means give a
  Student-t interval  mean +/- t_{n-1,1-a/2} * s/sqrt(n).
* **Batch means**: split one long post-warm-up run into ~independent batches
  and apply the t-interval to the batch means.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats


# ---------------------------------------------------------------- confidence intervals
def confidence_interval(values, alpha: float = 0.05) -> dict:
    """Student-t CI for the mean of `values` (i.i.d. assumed)."""
    a = np.asarray([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    n = a.size
    if n == 0:
        return {"mean": float("nan"), "halfwidth": float("nan"), "low": float("nan"),
                "high": float("nan"), "n": 0, "sd": float("nan")}
    mean = float(a.mean())
    if n == 1:
        return {"mean": mean, "halfwidth": float("nan"), "low": mean, "high": mean, "n": 1, "sd": float("nan")}
    sd = float(a.std(ddof=1))
    tcrit = float(stats.t.ppf(1 - alpha / 2, df=n - 1))
    hw = tcrit * sd / np.sqrt(n)
    return {"mean": mean, "halfwidth": hw, "low": mean - hw, "high": mean + hw, "n": n, "sd": sd}


def summarize_replications(scalars: pd.DataFrame, metrics=None, alpha: float = 0.05) -> pd.DataFrame:
    """Per-metric mean, sd, and t-CI across replications (one row per metric)."""
    if metrics is None:
        metrics = [c for c in scalars.columns
                   if c not in ("rep", "seed", "now", "events")
                   and pd.api.types.is_numeric_dtype(scalars[c])]
    rows = []
    for m in metrics:
        ci = confidence_interval(scalars[m].values, alpha=alpha)
        rel = (ci["halfwidth"] / abs(ci["mean"])) if (ci["mean"] and np.isfinite(ci["halfwidth"])) else float("nan")
        rows.append({"metric": m, "mean": ci["mean"], "sd": ci["sd"], "n": ci["n"],
                     "ci_low": ci["low"], "ci_high": ci["high"], "halfwidth": ci["halfwidth"],
                     "rel_halfwidth": rel})
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- Welch warm-up
def welch_average(timeseries: pd.DataFrame, metric: str = "wip") -> tuple[np.ndarray, np.ndarray]:
    """Average `metric` across replications at each aligned time index.

    Returns (t, ybar). Requires the harness's uniform per-rep grid; trims to the
    shortest replication so indices align.
    """
    if timeseries.empty:
        return np.array([]), np.array([])
    piv = timeseries.pivot_table(index="t", columns="rep", values=metric, aggfunc="mean").sort_index()
    piv = piv.dropna(how="any")  # keep only grid points present in every rep
    t = piv.index.to_numpy(dtype=float)
    ybar = piv.mean(axis=1).to_numpy(dtype=float)
    return t, ybar


def moving_average(y: np.ndarray, w: int) -> np.ndarray:
    """Centered moving average of half-width w (Welch). Window shrinks at the edges."""
    y = np.asarray(y, dtype=float)
    n = y.size
    out = np.empty(n)
    for i in range(n):
        lo, hi = max(0, i - w), min(n, i + w + 1)
        out[i] = y[lo:hi].mean()
    return out


def welch_warmup(timeseries: pd.DataFrame, metric: str = "wip", window: int | None = None,
                 tol: float = 0.05) -> dict:
    """Welch warm-up estimate.

    Smooths the across-replication mean curve and reports the first time index
    from which the smoothed curve stays within `tol` (relative to the plateau
    level estimated from the last third) of the plateau — a flattening cutoff.

    Returns dict with t, ybar, smoothed, window, cutoff_index, cutoff_time.
    """
    t, ybar = welch_average(timeseries, metric)
    n = ybar.size
    if n == 0:
        return {"t": t, "ybar": ybar, "smoothed": ybar, "window": 0, "cutoff_index": 0, "cutoff_time": 0.0}
    if window is None:
        window = max(1, min(n // 10, 50))
    sm = moving_average(ybar, window)
    plateau = float(np.mean(sm[-max(1, n // 3):]))  # steady-state level estimate
    scale = abs(plateau) if plateau != 0 else (np.max(np.abs(sm)) or 1.0)
    within = np.abs(sm - plateau) <= tol * scale
    cutoff = n - 1
    for i in range(n):
        if within[i:].all():       # first index from which it stays settled
            cutoff = i
            break
    # If the curve only "settles" at the very end, it never really reached a
    # plateau within the run — flag it rather than claiming the whole run is warm-up.
    converged = bool(cutoff < 0.6 * n)
    return {"t": t, "ybar": ybar, "smoothed": sm, "window": window,
            "cutoff_index": int(cutoff), "cutoff_time": float(t[cutoff]) if n else 0.0,
            "plateau": plateau, "converged": converged}


def mser5(series) -> dict:
    """MSER-5 truncation point on a single series (batches of 5).

    Returns dict with batch_index d* and the corresponding observation index.
    Minimizes  Var(retained)/len(retained)  over truncation points; robust and
    parameter-free.
    """
    a = np.asarray([v for v in series if v is not None and np.isfinite(v)], dtype=float)
    k = a.size // 5
    if k < 4:
        return {"batch_index": 0, "obs_index": 0, "n_batches": k}
    batches = a[:k * 5].reshape(k, 5).mean(axis=1)
    best_d, best_val = 0, np.inf
    # try truncating the first d batches; need >=2 retained to compute variance
    for d in range(0, k - 1):
        kept = batches[d:]
        m = kept.size
        val = kept.var(ddof=1) / m
        if val < best_val:
            best_val, best_d = val, d
    return {"batch_index": int(best_d), "obs_index": int(best_d * 5), "n_batches": k, "mser": float(best_val)}


# ---------------------------------------------------------------- batch means
def batch_means(series, n_batches: int = 10, warmup: int = 0, alpha: float = 0.05) -> dict:
    """Batch-means CI from a single long run.

    Discards the first `warmup` observations, splits the rest into `n_batches`
    contiguous batches, and applies a t-interval to the (approx-independent)
    batch means.
    """
    a = np.asarray([v for v in series if v is not None and np.isfinite(v)], dtype=float)
    a = a[warmup:]
    if a.size < n_batches * 2:
        n_batches = max(1, a.size // 2)
    if n_batches < 2:
        return {"mean": float(a.mean()) if a.size else float("nan"),
                "halfwidth": float("nan"), "low": float("nan"), "high": float("nan"),
                "n_batches": n_batches, "batch_size": a.size}
    bsize = a.size // n_batches
    trimmed = a[:bsize * n_batches].reshape(n_batches, bsize)
    means = trimmed.mean(axis=1)
    ci = confidence_interval(means, alpha=alpha)
    ci.update({"n_batches": n_batches, "batch_size": bsize})
    return ci
