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


# ---------------------------------------------------------------- flow factor / congestion (VUT)
def raw_process_time(ds: Dataset):
    """System raw process time T0 = Σ mean service time along a job's routing.

    Simple line: every job visits every station once, so T0 = Σ serviceMean.
    Advanced factory: routings differ by part, so a single system T0 is
    ill-defined → returns None (use :func:`part_flow_factor` instead).
    """
    res = ds.config.get("resources", [])
    if ds.kind == "simple" and res:
        vals = [r.get("serviceMean") for r in res if r.get("serviceMean")]
        return float(sum(vals)) if vals else None
    return None


def flow_factor(ds: Dataset) -> dict:
    """Flow factor (a.k.a. cycle-time efficiency) FF = CT / T0.

    FF = 1 is perfect flow (no waiting); FF = k means a job spends k× its raw
    process time in the system, the excess being queueing/blocking. The
    value-added fraction is 1/FF and the waiting fraction is 1 − 1/FF.
    """
    t0 = raw_process_time(ds)
    ct_series = ds.scalars["avgCycleTime"].dropna() if "avgCycleTime" in ds.scalars else pd.Series(dtype=float)
    ct = float(ct_series.mean()) if not ct_series.empty else float("nan")
    ff = ct / t0 if (t0 and np.isfinite(ct)) else float("nan")
    return {
        "raw_process_time": t0,
        "cycle_time": ct,
        "flow_factor": ff,
        "value_added_fraction": (1.0 / ff) if np.isfinite(ff) and ff > 0 else float("nan"),
        "queue_fraction": (1.0 - 1.0 / ff) if np.isfinite(ff) and ff > 0 else float("nan"),
    }


def part_flow_factor(ds: Dataset) -> pd.DataFrame:
    """Per-part flow factor (advanced only): part CT ÷ its routing process time.

    Purchased / zero-routing parts (no processing of their own) are dropped.
    """
    if not ds.is_advanced or ds.parts.empty:
        return pd.DataFrame()
    routing = {p["id"]: p.get("routingMean") for p in ds.config.get("parts", [])}
    g = (ds.parts.groupby(["id", "name"], sort=False)
         .agg(avg_cycle_time=("avgCycleTime", "mean")).reset_index())
    g["process_time"] = g["id"].map(routing).astype(float)
    g = g[g["process_time"].fillna(0) > 0].copy()
    g["flow_factor"] = g["avg_cycle_time"] / g["process_time"]
    return g.reset_index(drop=True)


def congestion_by_resource(ds: Dataset) -> pd.DataFrame:
    """Decompose each resource's contribution to cycle time (VUT view).

    Uses Little's Law at the queue (Wq = Lq / λ, with Lq = avgQueue and λ the
    measured throughput) for the *measured* wait, and the M/M/1 reference
    Wq = u/(1−u)·t_e (variability c²=1 at both arrival and service) as a
    yardstick. Measured well above the reference signals high variability;
    below it signals smoothing (low-variability arrivals/service).
    """
    u = utilization_summary(ds)
    if u.empty:
        return u
    te = {r["id"]: r.get("serviceMean") for r in ds.config.get("resources", [])}
    u = u.copy()
    u["t_e"] = u["id"].map(te).astype(float)
    lam = u["throughput"].where(u["throughput"] > 0, np.nan)
    u["wq_measured"] = u["avg_queue"] / lam
    rho = u["utilization"].clip(upper=0.999)
    u["congestion_mult"] = rho / (1.0 - rho)        # the U-factor of VUT
    u["wq_mm1"] = u["congestion_mult"] * u["t_e"]   # M/M/1 reference wait
    u["ct_station"] = u["t_e"] + u["wq_measured"]   # process + wait at this resource
    # implied (c_a²+c_e²)/2 from measured vs M/M/1 — the V-factor read-out
    u["implied_v"] = u["wq_measured"] / u["wq_mm1"].where(u["wq_mm1"] > 0, np.nan)
    return u.reset_index(drop=True)


# ---------------------------------------------------------------- variability propagation (linking equations)
def variability_propagation(ds: Dataset) -> pd.DataFrame:
    """Propagate squared-CV variability down a serial line (linking equations).

    Only meaningful for the simple line (a single serial route). For each
    single-/multi-machine station the departure SCV is (Factory-Physics /
    Sakasegawa):

        c_d² = 1 + (1 − u²)(c_a² − 1) + (u²/√m)(c_e² − 1)

    and that c_d² becomes the next station's arrival SCV c_a². The entry c_a²
    is the external interarrival SCV (config ``arrivalScv``); under limitless
    supply station 0 is never starved, so we seed it with its own service SCV
    and flag the row as ``entry_assumed``.

    Columns: idx, id, name, capacity, utilization, ca2, ce2, cd2, entry_assumed.
    Empty DataFrame if the file predates ``serviceScv`` or is not a simple line.
    """
    if ds.kind != "simple":
        return pd.DataFrame()
    res = ds.config.get("resources", [])
    if not res or any(r.get("serviceScv") is None for r in res):
        return pd.DataFrame()
    u_by_id = {row["id"]: float(row["utilization"]) for _, row in utilization_summary(ds).iterrows()}
    arrival = ds.config.get("arrivalScv")
    entry_assumed = arrival is None
    ca2 = float(arrival) if arrival is not None else float(res[0]["serviceScv"])
    rows = []
    for k, r in enumerate(res):
        ce2 = float(r["serviceScv"])
        m = max(1, int(r.get("capacity", 1)))
        u = u_by_id.get(r["id"], float("nan"))
        u = min(u, 0.999) if np.isfinite(u) else 0.0
        cd2 = 1.0 + (1.0 - u * u) * (ca2 - 1.0) + (u * u / np.sqrt(m)) * (ce2 - 1.0)
        cd2 = max(0.0, cd2)
        rows.append({"idx": k, "id": r["id"], "name": r["name"], "capacity": m,
                     "utilization": u, "ca2": ca2, "ce2": ce2, "cd2": cd2,
                     "entry_assumed": entry_assumed and k == 0})
        ca2 = cd2  # departures of this station are arrivals to the next
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
