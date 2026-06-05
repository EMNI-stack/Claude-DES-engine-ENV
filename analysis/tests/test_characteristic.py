"""Unit tests for the CONWIP characteristic-curve module.

The three Factory-Physics reference curves (best / practical-worst / worst) are
exact analytic forms, so they admit sharp invariants — most importantly that
each satisfies Little's Law TH·CT = w identically at every WIP level.
"""
import numpy as np
import pandas as pd
import pytest

from des_analysis import characteristic as ch

# A representative line: three single-capacity ops, bottleneck = the 1.3 op.
T0 = 1.0 + 1.3 + 0.9          # raw process time = 3.2
RB = 1.0 / 1.3                # bottleneck rate ≈ 0.769
W0 = RB * T0                  # critical WIP ≈ 2.46
WGRID = np.arange(1, 21, dtype=float)


def test_littles_law_holds_on_every_reference_curve():
    """WIP = TH × CT must hold exactly on best/PWC/worst curves."""
    ref = ch.reference_curves(T0, RB, W0, WGRID)
    for th, ct in [("best_th", "best_ct"), ("pwc_th", "pwc_ct"), ("worst_th", "worst_ct")]:
        np.testing.assert_allclose(ref[th] * ref[ct], ref["w"], rtol=1e-9)


def test_all_curves_coincide_at_w_equals_one():
    """At a single job in the line every case degenerates to TH=1/T0, CT=T0."""
    ref = ch.reference_curves(T0, RB, W0, [1.0])
    for th in ("best_th", "pwc_th", "worst_th"):
        assert ref[th].iloc[0] == pytest.approx(1.0 / T0, rel=1e-9)
    for ct in ("best_ct", "pwc_ct", "worst_ct"):
        assert ref[ct].iloc[0] == pytest.approx(T0, rel=1e-9)


def test_best_case_throughput_caps_at_bottleneck_rate():
    """Best-case TH rises linearly then saturates at r_b for w ≥ W0."""
    th, ct = ch.best_case(WGRID, T0, RB)
    assert th.max() == pytest.approx(RB, rel=1e-9)
    # below the critical WIP, TH grows with w; at/above W0 it is pinned at r_b.
    assert th[WGRID >= W0] == pytest.approx(RB, rel=1e-9)
    # cycle time never dips below the raw process time.
    assert (ct >= T0 - 1e-9).all()


def test_ordering_best_dominates_pwc_dominates_worst():
    """For w>1: best TH ≥ PWC TH ≥ worst TH, and the cycle times reverse."""
    ref = ch.reference_curves(T0, RB, W0, WGRID)
    hi = ref["w"] > 1.0
    assert (ref["best_th"][hi] >= ref["pwc_th"][hi] - 1e-9).all()
    assert (ref["pwc_th"][hi] >= ref["worst_th"][hi] - 1e-9).all()
    assert (ref["best_ct"][hi] <= ref["pwc_ct"][hi] + 1e-9).all()
    assert (ref["pwc_ct"][hi] <= ref["worst_ct"][hi] + 1e-9).all()


def test_pwc_throughput_approaches_but_never_reaches_rb():
    """PWC TH → r_b as w grows but stays strictly below it (the W0-1 penalty)."""
    th, _ = ch.practical_worst_case(WGRID, T0, RB, W0)
    assert (th < RB).all()
    assert np.all(np.diff(th) > 0)                 # strictly increasing toward r_b
    big, _ = ch.practical_worst_case([1e6], T0, RB, W0)
    assert big[0] == pytest.approx(RB, rel=1e-3)   # converges in the limit


def test_measured_points_aggregates_replications_with_ci():
    sweep = {
        "schema": "des-analysis/sweep-v1",
        "points": [
            {"wipCap": 1, "wip": [0.9, 1.1, 1.0], "throughput": [0.30, 0.31, 0.29],
             "cycleTime": [3.2, 3.3, 3.1]},
            {"wipCap": 2, "wip": [1.8, 2.0, 1.9], "throughput": [0.45, 0.46, 0.44],
             "cycleTime": [4.0, 4.1, None]},  # None samples are dropped
        ],
    }
    pts = ch.measured_points(sweep)
    assert list(pts["wip_cap"]) == [1, 2]
    assert pts.loc[0, "th_mean"] == pytest.approx(np.mean([0.30, 0.31, 0.29]))
    assert pts.loc[1, "ct_mean"] == pytest.approx(np.mean([4.0, 4.1]))  # None excluded
    assert (pts["wip_hw"] >= 0).all()  # CI half-widths are non-negative


def test_is_sweep_discriminates_schema():
    assert ch.is_sweep({"schema": "des-analysis/sweep-v1"})
    assert not ch.is_sweep({"schema": "des-analysis/v1"})
    assert not ch.is_sweep({})
    assert not ch.is_sweep(None)
