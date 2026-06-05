"""Tests for scenario comparison helpers."""
from pathlib import Path

import pandas as pd
import pytest

from des_analysis import load_results, compare as cmp

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "sample_data"


def _datasets():
    files = ["advanced_factory.json", "advanced_pull.json"]
    paths = [SAMPLE_DIR / f for f in files]
    if not all(p.exists() for p in paths):
        pytest.skip("comparison samples not generated")
    return {p.stem: load_results(p) for p in paths}


def test_compare_kpis_has_row_per_scenario_metric():
    ds = _datasets()
    k = cmp.compare_kpis(ds)
    assert {"scenario", "metric", "mean", "halfwidth", "higher_is_better"}.issubset(k.columns)
    # throughput present for both scenarios
    th = k[k["metric"] == "throughput"]
    assert set(th["scenario"]) == set(ds.keys())
    # CI bounds bracket the mean
    assert (k["ci_low"] <= k["mean"] + 1e-9).all()
    assert (k["ci_high"] >= k["mean"] - 1e-9).all()


def test_best_scenario_respects_direction():
    ds = _datasets()
    k = cmp.compare_kpis(ds)
    # throughput: higher is better → winner has the max mean
    th = k[k["metric"] == "throughput"]
    assert cmp.best_scenario(k, "throughput") == th.loc[th["mean"].idxmax(), "scenario"]
    # avgWIP: lower is better → winner has the min mean
    wip = k[k["metric"] == "avgWIP"]
    if not wip.empty:
        assert cmp.best_scenario(k, "avgWIP") == wip.loc[wip["mean"].idxmin(), "scenario"]


def test_compare_utilization_is_tidy_long():
    ds = _datasets()
    u = cmp.compare_utilization(ds)
    assert {"scenario", "resource", "utilization"}.issubset(u.columns)
    assert (u["utilization"].between(0, 1.0001)).all()


def test_compare_flow_factor_one_row_per_scenario():
    ds = _datasets()
    ff = cmp.compare_flow_factor(ds)
    assert set(ff["scenario"]) == set(ds.keys())
    assert "flow_factor" in ff.columns


def test_best_scenario_none_for_unknown_metric():
    assert cmp.best_scenario(pd.DataFrame(columns=["metric", "mean", "higher_is_better", "scenario"]), "nope") is None
