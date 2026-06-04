"""Ingest des-analysis/v1 JSON into tidy pandas DataFrames.

A :class:`Dataset` wraps one results file (from the Node harness or a browser
export) and exposes lazily-built, tidy frames. "Tidy" = one observation per row,
so downstream metric/CI code is just groupbys.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import cached_property
from pathlib import Path
from typing import Any

import pandas as pd

SCHEMA = "des-analysis/v1"


def read_json(source: str | Path | dict) -> dict:
    """Parse a results file to a raw dict without schema enforcement (lets
    callers branch between des-analysis/v1 and the sweep schema)."""
    if isinstance(source, dict):
        return source
    return json.loads(Path(source).read_text(encoding="utf-8"))


def load_results(source: str | Path | dict) -> "Dataset":
    """Load a results file (path or already-parsed dict) into a Dataset."""
    if isinstance(source, dict):
        raw = source
    else:
        raw = json.loads(Path(source).read_text(encoding="utf-8"))
    if raw.get("schema") != SCHEMA:
        raise ValueError(f"unexpected schema {raw.get('schema')!r}; expected {SCHEMA!r}")
    if raw.get("kind") not in ("simple", "advanced"):
        raise ValueError(f"unknown kind {raw.get('kind')!r}")
    if not raw.get("replications"):
        raise ValueError("results file has no replications")
    return Dataset(raw)


@dataclass
class Dataset:
    raw: dict[str, Any] = field(repr=False)

    # ---- top-level metadata ----
    @property
    def kind(self) -> str:
        return self.raw["kind"]

    @property
    def is_advanced(self) -> bool:
        return self.raw["kind"] == "advanced"

    @property
    def generated_by(self) -> str:
        return self.raw.get("generatedBy", "unknown")

    @property
    def run_length(self) -> float:
        return float(self.raw.get("runLength") or 0.0)

    @property
    def warmup_hint(self):
        return self.raw.get("warmupHint")

    @property
    def config(self) -> dict:
        return self.raw.get("config", {})

    @property
    def summary(self) -> str:
        return self.config.get("summary", self.kind)

    @property
    def n_reps(self) -> int:
        return len(self.raw["replications"])

    @property
    def replications(self) -> list[dict]:
        return self.raw["replications"]

    # ---- tidy frames (cached) ----
    @cached_property
    def scalars(self) -> pd.DataFrame:
        """One row per replication; columns are scalar KPIs + seed/now/events."""
        rows = []
        for i, rep in enumerate(self.replications):
            row = {"rep": i, "seed": rep.get("seed", i), "now": rep.get("now"), "events": rep.get("events")}
            row.update(rep.get("scalars", {}))
            rows.append(row)
        return pd.DataFrame(rows)

    @cached_property
    def resources(self) -> pd.DataFrame:
        """One row per (replication, resource)."""
        rows = []
        for i, rep in enumerate(self.replications):
            for r in rep.get("resources", []):
                rows.append({"rep": i, **r})
        return pd.DataFrame(rows)

    @cached_property
    def parts(self) -> pd.DataFrame:
        """One row per (replication, part) — advanced only (empty otherwise)."""
        rows = []
        for i, rep in enumerate(self.replications):
            for p in rep.get("parts", []):
                rows.append({"rep": i, **p})
        return pd.DataFrame(rows)

    @cached_property
    def demand(self) -> pd.DataFrame:
        """One row per (replication, demand product) — advanced only."""
        rows = []
        for i, rep in enumerate(self.replications):
            for d in rep.get("demand", []):
                rows.append({"rep": i, **d})
        return pd.DataFrame(rows)

    @cached_property
    def timeseries(self) -> pd.DataFrame:
        """Long time series: (rep, t, wip, fg, completed)."""
        frames = []
        for i, rep in enumerate(self.replications):
            ts = rep.get("timeseries", {})
            t = ts.get("t", [])
            if not t:
                continue
            df = pd.DataFrame({
                "rep": i,
                "t": t,
                "wip": ts.get("wip", [None] * len(t)),
                "fg": ts.get("fg", [None] * len(t)) or [None] * len(t),
                "completed": (ts.get("completed") or [None] * len(t))[:len(t)] or [None] * len(t),
            })
            # pad completed if shorter/empty
            if len(df["completed"]) != len(t):
                df["completed"] = [None] * len(t)
            frames.append(df)
        return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=["rep", "t", "wip", "fg", "completed"])

    @cached_property
    def cycle_samples(self) -> pd.DataFrame:
        """Cycle-time samples: (rep, part, ct)."""
        rows = []
        for i, rep in enumerate(self.replications):
            for c in rep.get("cycleSamples", []):
                rows.append({"rep": i, "part": c.get("part", "unit"), "ct": c.get("ct")})
        return pd.DataFrame(rows) if rows else pd.DataFrame(columns=["rep", "part", "ct"])

    # ---- convenience ----
    def resource_names(self) -> list[str]:
        if self.resources.empty:
            return []
        return list(self.resources.drop_duplicates("id")["name"])
