"""Side-by-side comparison of several scenarios (datasets).

Each scenario is one :class:`Dataset` (a run of the line under some policy —
push vs pull, a CONWIP level, a supply mode). These helpers line the scenarios
up into tidy frames so the dashboard can draw grouped bars with confidence
intervals and spot which policy wins on throughput, WIP, cycle time, etc.
"""
from __future__ import annotations

import pandas as pd

from .ingest import Dataset
from . import metrics, output_analysis as oa

# KPIs worth comparing, with the human label and whether bigger is better.
KPIS = [
    ("throughput", "Throughput", True),
    ("avgWIP", "Avg WIP", False),
    ("avgCycleTime", "Avg cycle time", False),
    ("fillRate", "Fill rate", True),
    ("yield", "Yield", True),
]


def compare_kpis(datasets: dict[str, Dataset], alpha: float = 0.05) -> pd.DataFrame:
    """One row per (scenario, metric): mean + t-CI half-width across replications.

    Columns: scenario, metric, label, higher_is_better, mean, halfwidth,
    ci_low, ci_high, n_reps.
    """
    rows = []
    for name, ds in datasets.items():
        summ = oa.summarize_replications(ds.scalars, alpha=alpha).set_index("metric")
        for key, label, higher in KPIS:
            if key not in summ.index:
                continue
            r = summ.loc[key]
            if not pd.notna(r["mean"]):
                continue
            rows.append({
                "scenario": name, "metric": key, "label": label,
                "higher_is_better": higher,
                "mean": float(r["mean"]), "halfwidth": float(r["halfwidth"]),
                "ci_low": float(r["ci_low"]), "ci_high": float(r["ci_high"]),
                "n_reps": int(ds.n_reps),
            })
    return pd.DataFrame(rows)


def compare_utilization(datasets: dict[str, Dataset]) -> pd.DataFrame:
    """One row per (scenario, resource): mean utilization. Long/tidy for grouped bars."""
    rows = []
    for name, ds in datasets.items():
        u = metrics.utilization_summary(ds)
        for _, r in u.iterrows():
            rows.append({"scenario": name, "resource": r["name"],
                         "utilization": float(r["utilization"])})
    return pd.DataFrame(rows)


def compare_flow_factor(datasets: dict[str, Dataset]) -> pd.DataFrame:
    """One row per scenario: flow factor + value-added / waiting split (where defined)."""
    rows = []
    for name, ds in datasets.items():
        ff = metrics.flow_factor(ds)
        rows.append({"scenario": name, "flow_factor": ff["flow_factor"],
                     "cycle_time": ff["cycle_time"], "raw_process_time": ff["raw_process_time"],
                     "value_added_fraction": ff["value_added_fraction"],
                     "queue_fraction": ff["queue_fraction"]})
    return pd.DataFrame(rows)


def best_scenario(kpis: pd.DataFrame, metric: str) -> str | None:
    """Name of the winning scenario for one metric (respecting higher/lower-is-better)."""
    sub = kpis[kpis["metric"] == metric]
    if sub.empty:
        return None
    higher = bool(sub.iloc[0]["higher_is_better"])
    idx = sub["mean"].idxmax() if higher else sub["mean"].idxmin()
    return str(sub.loc[idx, "scenario"])
