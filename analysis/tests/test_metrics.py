"""Tests for the Factory-Physics metric math."""
import numpy as np
import pandas as pd
import pytest

from des_analysis import metrics
from des_analysis.ingest import Dataset


def _ds(replications, kind="advanced", config=None):
    return Dataset({"schema": "des-analysis/v1", "kind": kind, "generatedBy": "test",
                    "config": config or {"summary": "t"}, "runLength": 100, "warmupHint": None,
                    "replications": replications})


def test_scv_exponential_is_about_one():
    rng = np.random.default_rng(0)
    samples = rng.exponential(2.0, size=50_000)
    assert metrics.scv(samples) == pytest.approx(1.0, abs=0.05)


def test_scv_constant_is_zero():
    assert metrics.scv([3.0] * 100) == pytest.approx(0.0, abs=1e-9)


def test_scv_too_few_points_is_nan():
    assert np.isnan(metrics.scv([1.0]))


def test_littles_law_exact_when_wip_equals_th_times_ct():
    reps = [{"seed": s, "scalars": {"avgWIP": 6.0, "throughput": 0.5, "avgCycleTime": 12.0}}
            for s in range(3)]
    ll = metrics.littles_law(_ds(reps))
    assert (ll["rel_error"] < 1e-12).all()
    assert ll["th_ct"].iloc[0] == pytest.approx(6.0)


def test_littles_law_flags_discrepancy():
    reps = [{"seed": 0, "scalars": {"avgWIP": 10.0, "throughput": 0.5, "avgCycleTime": 12.0}}]
    ll = metrics.littles_law(_ds(reps))
    # TH*CT = 6 vs WIP 10 -> 40% off
    assert ll["rel_error"].iloc[0] == pytest.approx(0.4, abs=1e-9)


def test_bottleneck_picks_highest_utilization():
    reps = [{"seed": 0, "resources": [
        {"id": "a", "name": "A", "utilization": 0.4, "blocked": 0, "down": 0, "avgQueue": 1, "throughput": 1},
        {"id": "b", "name": "B", "utilization": 0.92, "blocked": 0, "down": 0, "avgQueue": 5, "throughput": 1},
        {"id": "c", "name": "C", "utilization": 0.7, "blocked": 0, "down": 0, "avgQueue": 2, "throughput": 1},
    ]}]
    bn = metrics.bottleneck(_ds(reps))
    assert bn["name"] == "B"
    assert bn["utilization"] == pytest.approx(0.92)
    assert bn["margin_over_next"] == pytest.approx(0.92 - 0.7)


def test_utilization_summary_averages_across_reps():
    reps = [
        {"seed": 0, "resources": [{"id": "a", "name": "A", "utilization": 0.5, "blocked": 0, "down": 0, "avgQueue": 1, "throughput": 1}]},
        {"seed": 1, "resources": [{"id": "a", "name": "A", "utilization": 0.7, "blocked": 0, "down": 0, "avgQueue": 3, "throughput": 1}]},
    ]
    u = metrics.utilization_summary(_ds(reps))
    assert u.loc[u["id"] == "a", "utilization"].iloc[0] == pytest.approx(0.6)


def test_cycle_time_stats_percentiles():
    cs = [{"part": "w", "ct": float(x)} for x in range(1, 101)]  # 1..100
    reps = [{"seed": 0, "cycleSamples": cs}]
    stats_df = metrics.cycle_time_stats(_ds(reps), quantiles=(0.5, 0.9))
    row = stats_df[stats_df["part"] == "w"].iloc[0]
    assert row["n"] == 100
    assert row["mean"] == pytest.approx(50.5)
    assert row["p50"] == pytest.approx(50.5, abs=1.0)
    assert row["p90"] == pytest.approx(90.5, abs=1.0)
