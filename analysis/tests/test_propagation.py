"""Tests for the variability-propagation (linking-equation) metric."""
import numpy as np
import pytest

from des_analysis import metrics as m
from des_analysis.ingest import Dataset


def _line(stations, arrival_scv, util):
    """stations: list of (name, capacity, serviceScv).  util: per-station u."""
    res_cfg = [{"id": f"s{i}", "name": n, "capacity": cap, "serviceScv": scv, "serviceMean": 1.0}
               for i, (n, cap, scv) in enumerate(stations)]
    res_rep = [{"id": f"s{i}", "name": n, "utilization": util[i],
                "avgQueue": 0.0, "throughput": 1.0, "blocked": 0.0, "down": 0.0}
               for i, (n, cap, scv) in enumerate(stations)]
    cfg = {"resources": res_cfg, "summary": "line"}
    if arrival_scv is not None:
        cfg["arrivalScv"] = arrival_scv
    return Dataset({
        "schema": "des-analysis/v1", "kind": "simple", "generatedBy": "test", "config": cfg,
        "runLength": 1000,
        "replications": [{"seed": 1, "scalars": {"avgCycleTime": 5.0, "throughput": 1.0},
                          "resources": res_rep}],
    })


def test_mm1_departures_stay_poisson():
    """Exponential arrivals through exponential single servers: c_d² stays 1
    at every station regardless of utilization (a known M/M/1 property)."""
    ds = _line([("A", 1, 1.0), ("B", 1, 1.0), ("C", 1, 1.0)], arrival_scv=1.0, util=[0.3, 0.7, 0.5])
    vp = m.variability_propagation(ds)
    np.testing.assert_allclose(vp["cd2"], 1.0, atol=1e-9)
    np.testing.assert_allclose(vp["ca2"], 1.0, atol=1e-9)


def test_saturated_constant_server_emits_regularly():
    """A constant-service server (c_e²=0) at full utilization produces perfectly
    regular departures (c_d² → 0)."""
    ds = _line([("A", 1, 0.0)], arrival_scv=1.0, util=[0.999])
    cd2 = m.variability_propagation(ds).iloc[0]["cd2"]
    assert cd2 == pytest.approx(0.0, abs=1e-2)


def test_departure_feeds_next_arrival():
    """Each station's c_d² becomes the next station's c_a²."""
    ds = _line([("A", 1, 0.25), ("B", 1, 0.5)], arrival_scv=2.0, util=[0.6, 0.8])
    vp = m.variability_propagation(ds)
    assert vp.iloc[1]["ca2"] == pytest.approx(vp.iloc[0]["cd2"])
    assert vp.iloc[0]["ca2"] == pytest.approx(2.0)


def test_low_variability_line_dampens_bursty_arrivals():
    """Bursty arrivals (c_a²>1) through low-variability stations get smoothed."""
    ds = _line([("A", 1, 0.1), ("B", 1, 0.1), ("C", 1, 0.1)], arrival_scv=4.0, util=[0.5, 0.5, 0.5])
    vp = m.variability_propagation(ds)
    assert vp.iloc[0]["ca2"] > vp.iloc[-1]["cd2"]   # variability decreases along the line


def test_limitless_supply_seeds_entry_from_service_and_flags_it():
    ds = _line([("A", 1, 0.3), ("B", 1, 0.2)], arrival_scv=None, util=[0.5, 0.5])
    vp = m.variability_propagation(ds)
    assert bool(vp.iloc[0]["entry_assumed"]) is True
    assert vp.iloc[0]["ca2"] == pytest.approx(0.3)   # seeded with station-0 service SCV
    assert bool(vp.iloc[1]["entry_assumed"]) is False


def test_empty_for_advanced_or_missing_scv():
    adv = Dataset({"schema": "des-analysis/v1", "kind": "advanced", "config": {}, "runLength": 1,
                   "replications": [{"resources": []}]})
    assert m.variability_propagation(adv).empty
    no_scv = Dataset({"schema": "des-analysis/v1", "kind": "simple",
                      "config": {"resources": [{"id": "s0", "name": "A", "capacity": 1}]},
                      "runLength": 1, "replications": [{"resources": []}]})
    assert m.variability_propagation(no_scv).empty
