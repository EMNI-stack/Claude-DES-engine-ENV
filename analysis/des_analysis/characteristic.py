"""Characteristic-curve analysis for a CONWIP sweep (des-analysis/sweep-v1).

Reference curves are the Factory-Physics performance bounds for a line at WIP
level w, given raw process time T0, bottleneck rate rb, and critical WIP
W0 = rb*T0 (paraphrased from the theory-notes in Reference/):

* Best case (zero variability):   TH = min(w/T0, rb),   CT = max(T0, w/rb)
* Practical worst case (PWC):      TH = w/(W0 + w - 1) * rb,  CT = T0 + (w-1)/rb
* Worst case (max batching):       TH = 1/T0,            CT = w * T0

A real line sits between best and worst; above the PWC line it is a "good"
(low-variability) line, below it a "bad" one.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .output_analysis import confidence_interval


def best_case(w, T0, rb):
    w = np.asarray(w, dtype=float)
    return np.minimum(w / T0, rb), np.maximum(T0, w / rb)


def worst_case(w, T0):
    w = np.asarray(w, dtype=float)
    return np.full_like(w, 1.0 / T0), w * T0


def practical_worst_case(w, T0, rb, W0):
    w = np.asarray(w, dtype=float)
    th = w / (W0 + w - 1.0) * rb
    ct = T0 + (w - 1.0) / rb
    return th, ct


def reference_curves(T0, rb, W0, w) -> pd.DataFrame:
    """Tidy reference curves over WIP levels `w`."""
    w = np.asarray(w, dtype=float)
    bth, bct = best_case(w, T0, rb)
    pth, pct = practical_worst_case(w, T0, rb, W0)
    wth, wct = worst_case(w, T0)
    return pd.DataFrame({"w": w, "best_th": bth, "best_ct": bct,
                         "pwc_th": pth, "pwc_ct": pct, "worst_th": wth, "worst_ct": wct})


def measured_points(sweep: dict, alpha: float = 0.05) -> pd.DataFrame:
    """Per-WIP-cap measured WIP/TH/CT mean + CI half-width across replications."""
    rows = []
    for p in sweep.get("points", []):
        wip = confidence_interval(p.get("wip", []), alpha)
        th = confidence_interval(p.get("throughput", []), alpha)
        ct = confidence_interval([c for c in p.get("cycleTime", []) if c is not None], alpha)
        rows.append({
            "wip_cap": p["wipCap"],
            "wip_mean": wip["mean"], "wip_hw": wip["halfwidth"],
            "th_mean": th["mean"], "th_hw": th["halfwidth"],
            "ct_mean": ct["mean"], "ct_hw": ct["halfwidth"],
        })
    return pd.DataFrame(rows)


def is_sweep(raw: dict) -> bool:
    return isinstance(raw, dict) and raw.get("schema") == "des-analysis/sweep-v1"
