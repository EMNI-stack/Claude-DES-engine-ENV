"""Headless smoke test: execute the Streamlit script end-to-end and assert it
renders without raising (catches chart/layout/data-wiring regressions)."""
from pathlib import Path

import pytest

DASH = Path(__file__).resolve().parents[1] / "dashboard.py"
SAMPLE = Path(__file__).resolve().parents[1] / "sample_data" / "advanced_factory.json"


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample data not generated")
def test_dashboard_renders_without_exception():
    from streamlit.testing.v1 import AppTest
    at = AppTest.from_file(str(DASH), default_timeout=60).run()
    assert at.exception == [], f"dashboard raised: {[str(e) for e in at.exception]}"
    # KPI header + section headings rendered
    assert any("analysis dashboard" in (m.value or "").lower() for m in at.markdown)


SAMPLE_DIR = Path(__file__).resolve().parents[1] / "sample_data"
_SAMPLES = [p.name for p in sorted(SAMPLE_DIR.glob("*.json"))] if SAMPLE_DIR.exists() else []


@pytest.mark.skipif(not _SAMPLES, reason="no sample data generated")
@pytest.mark.parametrize("fname", _SAMPLES)
def test_every_committed_sample_renders(fname):
    """Each committed sample must render through all tabs without raising."""
    from streamlit.testing.v1 import AppTest
    at = AppTest.from_file(str(DASH), default_timeout=90)
    at.run()
    for sb in at.selectbox:
        if fname in (sb.options or []):
            sb.set_value(fname).run()
            break
    assert at.exception == [], f"{fname} raised: {[str(e) for e in at.exception]}"
