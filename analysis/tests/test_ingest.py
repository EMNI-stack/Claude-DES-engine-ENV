"""Tests for JSON ingest into tidy DataFrames, using the committed sample data."""
from pathlib import Path

import pytest

from des_analysis import load_results
from des_analysis.ingest import Dataset

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "sample_data"


def test_rejects_bad_schema():
    with pytest.raises(ValueError):
        load_results({"schema": "nope", "kind": "simple", "replications": [{}]})


def test_rejects_empty_replications():
    with pytest.raises(ValueError):
        load_results({"schema": "des-analysis/v1", "kind": "simple", "replications": []})


@pytest.mark.parametrize("fname,kind", [("simple_line.json", "simple"), ("advanced_factory.json", "advanced")])
def test_sample_files_ingest(fname, kind):
    path = SAMPLE_DIR / fname
    if not path.exists():
        pytest.skip(f"sample file {fname} not generated yet")
    ds = load_results(path)
    assert ds.kind == kind
    assert ds.n_reps >= 1
    # scalars frame: one row per rep, has core KPIs
    s = ds.scalars
    assert len(s) == ds.n_reps
    for col in ("throughput", "avgWIP", "avgCycleTime"):
        assert col in s.columns
    # resources frame populated
    assert not ds.resources.empty
    for col in ("utilization", "name"):
        assert col in ds.resources.columns
    # time series aligned and non-empty
    assert not ds.timeseries.empty
    assert {"rep", "t", "wip"}.issubset(ds.timeseries.columns)
    # cycle samples present
    assert not ds.cycle_samples.empty
    if kind == "advanced":
        assert not ds.parts.empty
        assert not ds.demand.empty


def test_advanced_has_per_part_rows():
    path = SAMPLE_DIR / "advanced_factory.json"
    if not path.exists():
        pytest.skip("advanced sample not generated")
    ds = load_results(path)
    # default factory has 5 parts
    assert ds.parts["id"].nunique() == 5
