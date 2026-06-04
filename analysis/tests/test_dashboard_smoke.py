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


@pytest.mark.skipif(not SAMPLE.exists(), reason="sample data not generated")
def test_dashboard_simple_dataset_renders():
    from streamlit.testing.v1 import AppTest
    at = AppTest.from_file(str(DASH), default_timeout=60)
    at.run()
    # switch the sample selectbox to the simple line, if present
    for sb in at.selectbox:
        if any("simple_line.json" == o for o in (sb.options or [])):
            sb.set_value("simple_line.json").run()
            break
    assert at.exception == [], f"simple dataset raised: {[str(e) for e in at.exception]}"
