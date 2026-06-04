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
