"""des_analysis — output analysis for the DES factory simulator.

Pure, testable functions over the ``des-analysis/v1`` JSON schema (see
analysis/NOTES.md). Three layers:

* :mod:`des_analysis.ingest`         — JSON → tidy pandas DataFrames.
* :mod:`des_analysis.metrics`        — Factory-Physics metrics (throughput,
  utilization, bottleneck, Little's Law, yield, fill rate, SCV).
* :mod:`des_analysis.output_analysis`— simulation output analysis (Welch
  warm-up, MSER-5, t-confidence-intervals, batch means).
"""
from .ingest import Dataset, load_results, read_json
from . import metrics, output_analysis, characteristic, exporters

__all__ = ["Dataset", "load_results", "read_json", "metrics",
           "output_analysis", "characteristic", "exporters"]
__version__ = "0.1.0"
