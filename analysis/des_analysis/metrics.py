"""Factory-Physics metrics over the tidy DataFrames from :mod:`des_analysis.ingest`.

Definitions paraphrased from the project's Reference/ material (Factory Physics;
the theory-notes.md distilled in this repo):

* Little's Law:  WIP = TH x CT  (a conservation identity, holds system-wide).
* Utilization:   fraction of capacity-time a resource is busy; queueing time
  grows without bound as utilization -> 1.
* SCV:           c^2 = var/mean^2, the dimensionless variability the queueing
  formulas run on (exponential -> 1, constant -> 0).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .ingest import Dataset


# ---------------------------------------------------------------- Little's Law
def littles_law(ds: Dataset) -> pd.DataFrame:
    """Per-replication Little's-Law check: compare measured avgWIP against TH x CT.

    Returns columns: rep, wip, throughput, cycle_time, th_ct, abs_error, rel_error.
    rel_error near 0 means the run satisfies the identity (small bias from
    warm-up, in-system jobs, and scrap is expected on short runs).
    """
    s = ds.scalars
    out = pd.DataFrame({
        "rep": s["rep"],
        "wip": s["avgWIP"].astype(float),
        "throughput": s["throughput"].astype(float),
        "cycle_time": s["avgCycleTime"].astype(float),
    })
    out["th_ct"] = out["throughput"] * out["cycle_time"]
    out["abs_error"] = (out["wip"] - out["th_ct"]).abs()
    out["rel_error"] = out["abs_error"] / out["wip"].where(out["wip"] != 0, np.nan)
    return out


# ---------------------------------------------------------------- utilization / bottleneck
def utilization_summary(ds: Dataset) -> pd.DataFrame:
    """Mean utilization (and blocked/down/queue) per resource, averaged across reps."""
    r = ds.resources
    if r.empty:
        return pd.DataFrame()
    agg = (r.groupby(["id", "name"], sort=False)
            .agg(utilization=("utilization", "mean"),
                 utilization_sd=("utilization", "std"),
                 blocked=("blocked", "mean"),
                 down=("down", "mean"),
                 avg_queue=("avgQueue", "mean"),
                 throughput=("throughput", "mean"))
            .reset_index())
    return agg.sort_values("utilization", ascending=False).reset_index(drop=True)


def bottleneck(ds: Dataset) -> dict:
    """The resource with the highest mean utilization — the bottleneck candidate."""
    u = utilization_summary(ds)
    if u.empty:
        return {}
    top = u.iloc[0]
    return {
        "id": top["id"], "name": top["name"],
        "utilization": float(top["utilization"]),
        "margin_over_next": float(top["utilization"] - u.iloc[1]["utilization"]) if len(u) > 1 else float("nan"),
    }


# ---------------------------------------------------------------- variability
def scv(values) -> float:
    """Squared coefficient of variation, c^2 = var/mean^2 (sample variance, ddof=1)."""
    a = np.asarray([v for v in values if v is not None and np.isfinite(v)], dtype=float)
    if a.size < 2:
        return float("nan")
    m = a.mean()
    if m == 0:
        return float("nan")
    return float(a.var(ddof=1) / (m * m))


def cycle_time_stats(ds: Dataset, quantiles=(0.5, 0.9, 0.95)) -> pd.DataFrame:
    """Per-part (and overall) cycle-time mean, SCV and requested percentiles."""
    cs = ds.cycle_samples
    if cs.empty:
        return pd.DataFrame()
    rows = []

    def _row(label, sub):
        ct = sub["ct"].astype(float)
        rec = {"part": label, "n": int(ct.size), "mean": float(ct.mean()),
               "std": float(ct.std(ddof=1)) if ct.size > 1 else float("nan"),
               "scv": scv(ct.values)}
        for q in quantiles:
            rec[f"p{int(q * 100)}"] = float(ct.quantile(q))
        return rec

    for part, sub in cs.groupby("part", sort=False):
        rows.append(_row(str(part), sub))
    if cs["part"].nunique() > 1:
        rows.append(_row("ALL", cs))
    return pd.DataFrame(rows)


# ---------------------------------------------------------------- yield / fill rate
def quality_summary(ds: Dataset) -> dict:
    """Mean yield and fill rate across replications (ignoring missing values)."""
    s = ds.scalars
    return {
        "yield": float(s["yield"].dropna().mean()) if "yield" in s else float("nan"),
        "fill_rate": float(s["fillRate"].dropna().mean()) if "fillRate" in s else float("nan"),
        "throughput": float(s["throughput"].dropna().mean()),
        "avg_wip": float(s["avgWIP"].dropna().mean()),
        "avg_cycle_time": float(s["avgCycleTime"].dropna().mean()),
    }
