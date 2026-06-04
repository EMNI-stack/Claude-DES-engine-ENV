"""Tidy-data exporters: write clean, well-labeled CSV + a multi-sheet Excel
workbook (and a one-page summary-stats table) from a :class:`Dataset`."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from .ingest import Dataset
from . import metrics, output_analysis as oa


def summary_table(ds: Dataset, alpha: float = 0.05) -> pd.DataFrame:
    """One-page summary: per-metric mean + t-CI across replications."""
    return oa.summarize_replications(ds.scalars, alpha=alpha)


def _frames(ds: Dataset, alpha: float) -> dict[str, pd.DataFrame]:
    frames = {
        "summary_stats": summary_table(ds, alpha),
        "scalars": ds.scalars,
        "resources": ds.resources,
        "utilization": metrics.utilization_summary(ds),
        "littles_law": metrics.littles_law(ds),
        "cycle_time_stats": metrics.cycle_time_stats(ds),
        "timeseries": ds.timeseries,
        "cycle_samples": ds.cycle_samples,
    }
    if ds.is_advanced:
        frames["parts"] = ds.parts
        frames["demand"] = ds.demand
    return {k: v for k, v in frames.items() if v is not None and not v.empty}


def export_tidy(ds: Dataset, outdir: str | Path, alpha: float = 0.05,
                basename: str | None = None, csv: bool = True, excel: bool = True) -> dict[str, str]:
    """Write tidy CSVs and/or an Excel workbook to `outdir`. Returns written paths."""
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    base = basename or f"des_{ds.kind}"
    frames = _frames(ds, alpha)
    written: dict[str, str] = {}

    if csv:
        for name, df in frames.items():
            p = outdir / f"{base}__{name}.csv"
            df.to_csv(p, index=False)
            written[f"csv:{name}"] = str(p)

    if excel:
        xlsx = outdir / f"{base}.xlsx"
        # Excel sheet names: <=31 chars, no special chars
        with pd.ExcelWriter(xlsx, engine="openpyxl") as xl:
            for name, df in frames.items():
                df.to_excel(xl, sheet_name=name[:31], index=False)
        written["excel"] = str(xlsx)

    return written
