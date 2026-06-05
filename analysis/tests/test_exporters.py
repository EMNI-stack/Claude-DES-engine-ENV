"""Tests for tidy CSV/Excel export."""
from pathlib import Path

import pandas as pd
import pytest

from des_analysis import load_results
from des_analysis.exporters import export_tidy, summary_table

SAMPLE_DIR = Path(__file__).resolve().parents[1] / "sample_data"


def _ds():
    p = SAMPLE_DIR / "advanced_factory.json"
    if not p.exists():
        pytest.skip("advanced sample not generated")
    return load_results(p)


def test_summary_table_has_core_metrics():
    s = summary_table(_ds())
    assert {"metric", "mean", "ci_low", "ci_high", "halfwidth"}.issubset(s.columns)
    assert "throughput" in s["metric"].values


def test_export_writes_csv_and_excel(tmp_path):
    ds = _ds()
    written = export_tidy(ds, tmp_path, csv=True, excel=True)
    assert "excel" in written and Path(written["excel"]).exists()
    # core CSVs present and non-empty
    assert any(k == "csv:scalars" for k in written)
    scal = pd.read_csv(written["csv:scalars"])
    assert len(scal) == ds.n_reps
    # excel workbook opens and has the summary sheet
    xls = pd.ExcelFile(written["excel"])
    assert "summary_stats" in xls.sheet_names
    assert "parts" in xls.sheet_names  # advanced


def test_export_csv_only(tmp_path):
    written = export_tidy(_ds(), tmp_path, csv=True, excel=False)
    assert "excel" not in written
    assert all(Path(p).exists() for k, p in written.items())


def test_export_includes_analysis_sheets(tmp_path):
    """The new flow-factor / congestion / per-part analyses are exported too."""
    written = export_tidy(_ds(), tmp_path, csv=True, excel=True)
    xls = pd.ExcelFile(written["excel"])
    for sheet in ("flow_factor", "congestion", "part_flow_factor"):
        assert sheet in xls.sheet_names, f"missing sheet {sheet}"


def test_simple_export_has_variability_propagation(tmp_path):
    p = SAMPLE_DIR / "stream_line.json"
    if not p.exists():
        pytest.skip("stream_line sample not generated")
    written = export_tidy(load_results(p), tmp_path, csv=True, excel=True)
    xls = pd.ExcelFile(written["excel"])
    assert "variability_propagation" in xls.sheet_names
