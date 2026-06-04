"""Tests for warm-up detection and confidence-interval math."""
import numpy as np
import pandas as pd
import pytest

from des_analysis import output_analysis as oa


def test_confidence_interval_matches_t_formula():
    vals = [10, 12, 14, 11, 13]
    ci = oa.confidence_interval(vals, alpha=0.05)
    assert ci["mean"] == pytest.approx(12.0)
    assert ci["n"] == 5
    # known: sd of {10,12,14,11,13} = sqrt(2.5); t_{4,.975}=2.7764; hw = t*sd/sqrt(5)
    sd = np.std(vals, ddof=1)
    expected_hw = 2.7764451051977987 * sd / np.sqrt(5)
    assert ci["halfwidth"] == pytest.approx(expected_hw, rel=1e-4)
    assert ci["low"] == pytest.approx(12.0 - expected_hw)


def test_confidence_interval_single_value():
    ci = oa.confidence_interval([5.0])
    assert ci["mean"] == 5.0 and ci["n"] == 1 and np.isnan(ci["halfwidth"])


def test_confidence_interval_ignores_nonfinite():
    ci = oa.confidence_interval([1.0, 2.0, None, float("nan"), 3.0])
    assert ci["n"] == 3 and ci["mean"] == pytest.approx(2.0)


def test_moving_average_centered():
    y = np.array([0.0, 0.0, 9.0, 0.0, 0.0])
    sm = oa.moving_average(y, 1)
    assert sm[2] == pytest.approx(3.0)   # (0+9+0)/3
    assert sm[0] == pytest.approx(0.0)   # (0+0)/2 at the edge


def _transient_timeseries(n_reps=8, n=200, warm=40):
    """Each rep: a decaying transient settling onto a noisy plateau ~ 5."""
    rng = np.random.default_rng(7)
    frames = []
    for r in range(n_reps):
        i = np.arange(n)
        level = 5 + 20 * np.exp(-i / 12.0)          # transient high then settle to 5
        y = level + rng.normal(0, 0.2, size=n)
        frames.append(pd.DataFrame({"rep": r, "t": i.astype(float), "wip": y}))
    return pd.concat(frames, ignore_index=True), warm


def test_welch_average_aligns_and_means():
    ts, _ = _transient_timeseries()
    t, ybar = oa.welch_average(ts, "wip")
    assert t.size == 200
    assert ybar[0] > ybar[-1]          # transient decays
    assert ybar[-1] == pytest.approx(5.0, abs=0.5)


def test_welch_warmup_detects_transient_region():
    ts, _ = _transient_timeseries()
    res = oa.welch_warmup(ts, "wip", tol=0.05)
    # cutoff should land after the steep transient but well before the end
    assert 5 <= res["cutoff_index"] <= 120
    assert res["plateau"] == pytest.approx(5.0, abs=0.6)


def test_mser5_truncates_into_steady_state():
    rng = np.random.default_rng(1)
    n = 500
    i = np.arange(n)
    series = 5 + 30 * np.exp(-i / 8.0) + rng.normal(0, 0.3, size=n)
    res = oa.mser5(series)
    assert res["obs_index"] > 0          # it truncates some warm-up
    assert res["obs_index"] < n // 2     # but not most of the run


def test_batch_means_structure_and_point_estimate():
    rng = np.random.default_rng(2)
    series = rng.normal(10.0, 1.0, size=2000)
    res = oa.batch_means(series, n_batches=10, warmup=0)
    assert res["n_batches"] == 10 and res["batch_size"] == 200
    assert res["mean"] == pytest.approx(series.mean(), rel=1e-9)
    assert res["low"] < res["mean"] < res["high"]


def test_batch_means_ci_is_calibrated():
    """A 95% CI should cover the true mean close to 95% of the time."""
    rng = np.random.default_rng(0)
    trials, hits = 300, 0
    for _ in range(trials):
        series = rng.normal(10.0, 1.0, size=2000)
        res = oa.batch_means(series, n_batches=10, warmup=0, alpha=0.05)
        if res["low"] <= 10.0 <= res["high"]:
            hits += 1
    coverage = hits / trials
    assert 0.88 <= coverage <= 0.99, f"coverage {coverage:.3f} not near 0.95"
