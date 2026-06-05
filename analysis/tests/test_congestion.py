"""Tests for the flow-factor / VUT congestion metrics.

These check the analytic identities (flow factor = CT/T0, value-added + waiting
fractions sum to 1, Little's-Law wait Wq = Lq/λ, and the M/M/1 reference
Wq = u/(1−u)·t_e) on small synthetic datasets where the answer is known.
"""
import numpy as np
import pandas as pd
import pytest

from des_analysis import metrics as m
from des_analysis.ingest import Dataset


def _simple_ds(service_means, ct, util, avg_queue, throughput):
    """Build a minimal simple-line Dataset with one replication."""
    res_cfg = [{"id": f"s{i}", "name": f"S{i}", "serviceMean": sm}
               for i, sm in enumerate(service_means)]
    res_rep = [{"id": f"s{i}", "name": f"S{i}", "utilization": util[i],
                "avgQueue": avg_queue[i], "throughput": throughput[i],
                "blocked": 0.0, "down": 0.0}
               for i in range(len(service_means))]
    return Dataset({
        "schema": "des-analysis/v1", "kind": "simple", "generatedBy": "test",
        "config": {"resources": res_cfg, "summary": "test line"},
        "runLength": 1000,
        "replications": [{"seed": 1, "scalars": {"avgCycleTime": ct, "throughput": throughput[-1]},
                          "resources": res_rep}],
    })


def test_flow_factor_is_ct_over_t0():
    ds = _simple_ds([1.0, 2.0, 1.0], ct=8.0, util=[.5, .8, .4],
                    avg_queue=[.5, 3.0, .2], throughput=[1.0, 1.0, 1.0])
    ff = m.flow_factor(ds)
    assert ff["raw_process_time"] == pytest.approx(4.0)      # 1+2+1
    assert ff["flow_factor"] == pytest.approx(8.0 / 4.0)     # CT/T0 = 2
    assert ff["value_added_fraction"] == pytest.approx(0.5)
    assert ff["queue_fraction"] == pytest.approx(0.5)
    # value-added + waiting fractions partition the cycle time
    assert ff["value_added_fraction"] + ff["queue_fraction"] == pytest.approx(1.0)


def test_congestion_measured_wait_is_little_law_at_the_queue():
    # Wq = Lq / λ : queue of 3.0 jobs at λ=2.0 → wait 1.5
    ds = _simple_ds([1.0, 2.0], ct=6.0, util=[.5, .8],
                    avg_queue=[1.0, 3.0], throughput=[2.0, 2.0])
    c = m.congestion_by_resource(ds).set_index("name")
    assert c.loc["S1", "wq_measured"] == pytest.approx(3.0 / 2.0)
    assert c.loc["S0", "wq_measured"] == pytest.approx(1.0 / 2.0)
    # ct_station = process + wait
    assert c.loc["S1", "ct_station"] == pytest.approx(2.0 + 1.5)


def test_congestion_mm1_reference_and_implied_variability():
    # At u=0.8, t_e=2.0 the M/M/1 wait is u/(1-u)*t_e = 4*2 = 8.0
    ds = _simple_ds([2.0], ct=10.0, util=[0.8], avg_queue=[8.0], throughput=[2.0])
    row = m.congestion_by_resource(ds).iloc[0]
    assert row["congestion_mult"] == pytest.approx(0.8 / 0.2)
    assert row["wq_mm1"] == pytest.approx(8.0)
    # measured wait = 8/2 = 4.0, so implied V = measured/mm1 = 4/8 = 0.5 (low-variability)
    assert row["wq_measured"] == pytest.approx(4.0)
    assert row["implied_v"] == pytest.approx(0.5)


def test_advanced_has_no_system_t0_but_has_per_part_flow_factor():
    ds = Dataset({
        "schema": "des-analysis/v1", "kind": "advanced", "generatedBy": "test",
        "config": {"summary": "f", "resources": [{"id": "c", "name": "Cut", "serviceMean": 1.5}],
                   "parts": [{"id": "frame", "name": "Frame", "routingMean": 1.5},
                             {"id": "raw", "name": "Raw", "routingMean": 0.0}]},
        "runLength": 1000,
        "replications": [{"seed": 1, "scalars": {"avgCycleTime": 9.0, "throughput": 1.0},
                          "resources": [{"id": "c", "name": "Cut", "utilization": .9,
                                         "avgQueue": 5.0, "throughput": 1.0}],
                          "parts": [{"id": "frame", "name": "Frame", "avgCycleTime": 6.0},
                                    {"id": "raw", "name": "Raw", "avgCycleTime": 0.0}]}],
    })
    assert m.raw_process_time(ds) is None
    assert np.isnan(m.flow_factor(ds)["flow_factor"])
    pf = m.part_flow_factor(ds)
    assert list(pf["id"]) == ["frame"]                  # zero-routing 'raw' dropped
    assert pf.iloc[0]["flow_factor"] == pytest.approx(6.0 / 1.5)
