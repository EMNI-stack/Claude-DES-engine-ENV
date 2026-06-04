"""DES factory — analysis dashboard (Streamlit + Plotly).

Load a des-analysis/v1 results JSON (sidebar upload, sample picker, or
`-- --path FILE`) and explore it: KPI header, flow-over-time with a Welch
warm-up cutoff shaded, cycle-time distribution, utilization with the bottleneck
highlighted, per-resource / per-part tables, and a replications view with
confidence intervals. Export tidy CSV/Excel from the Export tab.

Run:  streamlit run analysis/dashboard.py
      streamlit run analysis/dashboard.py -- --path analysis/sample_data/advanced_factory.json
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from des_analysis import load_results, metrics, output_analysis as oa  # noqa: E402
from des_analysis.exporters import export_tidy  # noqa: E402
from des_analysis.ingest import Dataset  # noqa: E402

# ---------------------------------------------------------------- palette / theme
BG = "#0c1015"
PANEL = "#141a21"
GRID = "#26303a"
TEXT = "#c8d2dc"
FAINT = "#6b7a88"
TEAL = "#36e0c8"
AMBER = "#f2b13c"
SERIES = ["#36e0c8", "#f2b13c", "#ff8753", "#c792ea", "#8fb3c4", "#7aa2ff", "#ff6b9d", "#9ce26b"]
HERE = Path(__file__).resolve().parent
SAMPLE_DIR = HERE / "sample_data"
EXPORT_DIR = HERE / "exports"


def plotly_layout(fig: go.Figure, height: int = 320, title: str | None = None) -> go.Figure:
    fig.update_layout(
        template="plotly_dark", paper_bgcolor=BG, plot_bgcolor=PANEL,
        font=dict(family="JetBrains Mono, ui-monospace, monospace", color=TEXT, size=12),
        margin=dict(l=56, r=20, t=40 if title else 16, b=40), height=height,
        title=dict(text=title, font=dict(size=14, color=TEXT)) if title else None,
        legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(size=11)),
        hoverlabel=dict(bgcolor=PANEL, font_size=12),
    )
    fig.update_xaxes(gridcolor=GRID, zerolinecolor=GRID, linecolor=GRID)
    fig.update_yaxes(gridcolor=GRID, zerolinecolor=GRID, linecolor=GRID)
    return fig


def inject_css():
    st.markdown(f"""
    <style>
      .stApp {{ background:{BG}; }}
      .block-container {{ padding-top: 2.2rem; max-width: 1280px; }}
      h1,h2,h3 {{ font-family:'JetBrains Mono',ui-monospace,monospace; letter-spacing:-.3px; }}
      .kpi {{ background:linear-gradient(180deg,{PANEL},#10161d); border:1px solid {GRID};
              border-radius:14px; padding:14px 16px; height:100%; }}
      .kpi .lab {{ color:{FAINT}; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }}
      .kpi .val {{ color:{TEXT}; font-size:26px; font-weight:700; font-family:'JetBrains Mono',monospace; }}
      .kpi .sub {{ color:{FAINT}; font-size:11px; }}
      .kpi.accent .val {{ color:{TEAL}; }}
      .kpi.warn .val {{ color:{AMBER}; }}
      .badge {{ display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px;
                border:1px solid {GRID}; color:{FAINT}; margin-right:6px; }}
      .stTabs [data-baseweb="tab-list"] {{ gap:4px; }}
      .stTabs [data-baseweb="tab"] {{ background:{PANEL}; border-radius:8px 8px 0 0; padding:6px 14px; }}
    </style>""", unsafe_allow_html=True)


def kpi(col, label, value, sub="", kind=""):
    col.markdown(
        f'<div class="kpi {kind}"><div class="lab">{label}</div>'
        f'<div class="val">{value}</div><div class="sub">{sub}</div></div>',
        unsafe_allow_html=True)


def fmt(x, nd=2, pct=False):
    if x is None or (isinstance(x, float) and not np.isfinite(x)):
        return "—"
    return f"{100 * x:.1f}%" if pct else f"{x:.{nd}f}"


# ---------------------------------------------------------------- data source
@st.cache_data(show_spinner=False)
def _load_path(path: str, mtime: float):
    return load_results(path).raw  # cache the raw dict (Dataset isn't hashable)


def resolve_dataset() -> Dataset | None:
    st.sidebar.header("Data source")
    samples = sorted(SAMPLE_DIR.glob("*.json")) if SAMPLE_DIR.exists() else []
    mode = st.sidebar.radio("Load from", ["Sample data", "Upload JSON"], index=0)
    if mode == "Upload JSON":
        up = st.sidebar.file_uploader("des-analysis/v1 results file", type="json")
        if up is None:
            st.info("Upload a results JSON exported from the simulator, or switch to sample data.")
            return None
        import json
        return load_results(json.loads(up.getvalue().decode("utf-8")))
    if not samples:
        st.warning("No sample data found. Run:  `node analysis/run_sim.mjs`")
        return None
    names = [p.name for p in samples]
    choice = st.sidebar.selectbox("Sample dataset", names,
                                  index=names.index("advanced_factory.json") if "advanced_factory.json" in names else 0)
    p = SAMPLE_DIR / choice
    return Dataset(_load_path(str(p), p.stat().st_mtime))


# ---------------------------------------------------------------- views
def kpi_header(ds: Dataset):
    q = metrics.quality_summary(ds)
    bn = metrics.bottleneck(ds)
    cols = st.columns(5)
    kpi(cols[0], "Throughput", fmt(q["throughput"], 3), "parts / time-unit", "accent")
    kpi(cols[1], "Avg WIP", fmt(q["avg_wip"], 1), "jobs in system")
    kpi(cols[2], "Avg cycle time", fmt(q["avg_cycle_time"], 2), "release → exit")
    kpi(cols[3], "Fill rate", fmt(q.get("fill_rate"), pct=True), "demand met from stock")
    kpi(cols[4], "Bottleneck", bn.get("name", "—"),
        f"u = {fmt(bn.get('utilization'), pct=True)}", "warn")


def view_overview(ds: Dataset):
    ll = metrics.littles_law(ds)
    c1, c2 = st.columns([2, 3])
    with c1:
        st.markdown("##### Little's Law consistency")
        rel = float(ll["rel_error"].mean()) if not ll.empty else float("nan")
        fig = go.Figure(go.Indicator(
            mode="gauge+number", value=100 * rel,
            number={"suffix": "%", "font": {"color": TEAL if rel < 0.05 else AMBER}},
            gauge={"axis": {"range": [0, 20], "tickcolor": FAINT},
                   "bar": {"color": TEAL if rel < 0.05 else AMBER},
                   "bgcolor": PANEL, "bordercolor": GRID,
                   "steps": [{"range": [0, 5], "color": "#16323a"},
                             {"range": [5, 20], "color": "#2a2533"}]},
            title={"text": "mean |WIP − TH·CT| / WIP", "font": {"size": 12, "color": FAINT}}))
        st.plotly_chart(plotly_layout(fig, 260), use_container_width=True)
        st.caption("WIP = TH × CT is a conservation law; a small gap confirms the run is internally consistent.")
    with c2:
        st.markdown("##### Per-replication WIP vs TH·CT")
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=ll["th_ct"], y=ll["wip"], mode="markers",
                                 marker=dict(color=TEAL, size=9, line=dict(color=BG, width=1)), name="reps"))
        lim = float(np.nanmax([ll["wip"].max(), ll["th_ct"].max()])) * 1.1 if not ll.empty else 1
        fig.add_trace(go.Scatter(x=[0, lim], y=[0, lim], mode="lines",
                                 line=dict(color=FAINT, dash="dash"), name="y = x"))
        fig.update_xaxes(title="TH × CT"); fig.update_yaxes(title="measured avg WIP")
        st.plotly_chart(plotly_layout(fig, 260), use_container_width=True)
    q = metrics.quality_summary(ds)
    st.markdown(
        f'<span class="badge">control: {ds.config.get("control","?")}</span>'
        f'<span class="badge">supply: {ds.config.get("supply","?")}</span>'
        f'<span class="badge">demand: {ds.config.get("demandMode","?")}</span>'
        f'<span class="badge">yield: {fmt(q.get("yield"),pct=True)}</span>'
        f'<span class="badge">{ds.n_reps} replications</span>'
        f'<span class="badge">run length: {fmt(ds.run_length,0)}</span>', unsafe_allow_html=True)


def view_flow(ds: Dataset):
    metric = st.selectbox("Metric over time", ["wip", "fg", "completed"], index=0,
                          format_func=lambda m: {"wip": "Work in process", "fg": "Finished-goods inventory",
                                                 "completed": "Cumulative output"}[m])
    w = oa.welch_warmup(ds.timeseries, metric)
    fig = go.Figure()
    # faint individual replications
    for r, sub in ds.timeseries.groupby("rep"):
        fig.add_trace(go.Scatter(x=sub["t"], y=sub[metric], mode="lines",
                                 line=dict(color=FAINT, width=0.6), opacity=0.35,
                                 showlegend=False, hoverinfo="skip"))
    # Welch across-rep mean + smoothed
    if w["t"].size:
        fig.add_trace(go.Scatter(x=w["t"], y=w["ybar"], mode="lines",
                                 line=dict(color=TEAL, width=1.6), name="mean across reps"))
        fig.add_trace(go.Scatter(x=w["t"], y=w["smoothed"], mode="lines",
                                 line=dict(color=AMBER, width=2.2), name=f"Welch MA (w={w['window']})"))
        if w["converged"] and w["cutoff_time"] > 0:
            fig.add_vrect(x0=0, x1=w["cutoff_time"], fillcolor=AMBER, opacity=0.10, line_width=0,
                          annotation_text=f"warm-up ≈ {w['cutoff_time']:.0f}", annotation_position="top left",
                          annotation_font_color=AMBER)
    fig.update_xaxes(title="simulation clock"); fig.update_yaxes(title=metric)
    st.plotly_chart(plotly_layout(fig, 420, "Flow over time (Welch initialization-bias view)"), use_container_width=True)
    if metric == "wip":
        if w.get("converged"):
            st.success(f"Welch warm-up estimate ≈ **{w['cutoff_time']:.0f}** time units "
                       f"(plateau ≈ {w['plateau']:.1f}). Discard observations before this for steady-state stats.")
        else:
            st.warning("No clear plateau — the WIP curve keeps drifting. The system may be near "
                       "saturation (utilization → 1) or genuinely unstable; steady-state means are unreliable here.")


def view_cycle(ds: Dataset):
    cs = ds.cycle_samples
    if cs.empty:
        st.info("No cycle-time samples in this dataset.")
        return
    parts = ["ALL"] + sorted(cs["part"].unique().tolist())
    sel = st.selectbox("Part", parts, index=0)
    data = cs if sel == "ALL" else cs[cs["part"] == sel]
    ct = data["ct"].astype(float)
    fig = go.Figure()
    fig.add_trace(go.Histogram(x=ct, nbinsx=50, marker=dict(color=TEAL, line=dict(color=BG, width=0.5)),
                               opacity=0.85, name="cycle time"))
    pcts = {"p50": ct.quantile(.5), "p90": ct.quantile(.9), "p95": ct.quantile(.95)}
    for (lab, v), col in zip(pcts.items(), [TEXT, AMBER, "#ff6b9d"]):
        fig.add_vline(x=v, line=dict(color=col, dash="dash"),
                      annotation_text=f"{lab} {v:.1f}", annotation_position="top",
                      annotation_font_color=col)
    fig.update_xaxes(title="cycle time"); fig.update_yaxes(title="count")
    st.plotly_chart(plotly_layout(fig, 380, f"Cycle-time distribution — {sel}"), use_container_width=True)
    stats = metrics.cycle_time_stats(ds)
    st.dataframe(stats.style.format(precision=2), use_container_width=True, hide_index=True)
    st.caption("SCV (c² = var/mean²) is the dimensionless variability the queueing formulas use: "
               "≈1 is exponential, <1 is low-variability, >1 is bursty.")


def view_resources(ds: Dataset):
    u = metrics.utilization_summary(ds)
    if u.empty:
        st.info("No resource data.")
        return
    bn = metrics.bottleneck(ds)
    u = u.sort_values("utilization")
    colors = [AMBER if n == bn.get("name") else TEAL for n in u["name"]]
    fig = go.Figure()
    fig.add_trace(go.Bar(y=u["name"], x=u["utilization"], orientation="h",
                         marker=dict(color=colors), name="utilization",
                         text=[f"{v*100:.0f}%" for v in u["utilization"]], textposition="outside"))
    if "down" in u:
        fig.add_trace(go.Bar(y=u["name"], x=u["down"], orientation="h",
                             marker=dict(color="#7a3b3b"), name="down"))
    fig.update_layout(barmode="overlay")
    fig.update_xaxes(title="fraction of capacity", range=[0, 1.08])
    st.plotly_chart(plotly_layout(fig, 320, "Utilization by resource (bottleneck in amber)"), use_container_width=True)
    st.caption(f"Bottleneck: **{bn.get('name','—')}** at u = {fmt(bn.get('utilization'), pct=True)} "
               f"(margin over next: {fmt(bn.get('margin_over_next'), pct=True)}). "
               "Queueing time grows sharply as utilization approaches 100%.")
    st.dataframe(u.style.format({"utilization": "{:.1%}", "utilization_sd": "{:.1%}",
                                 "blocked": "{:.1%}", "down": "{:.1%}", "avg_queue": "{:.2f}",
                                 "throughput": "{:.3f}"}),
                 use_container_width=True, hide_index=True)
    if ds.is_advanced and not ds.parts.empty:
        st.markdown("##### Per-part summary (mean across replications)")
        pp = (ds.parts.groupby(["id", "name"], sort=False)
              .agg(created=("created", "mean"), completed=("completed", "mean"),
                   scrapped=("scrapped", "mean"), wip=("wip", "mean"),
                   avg_cycle_time=("avgCycleTime", "mean")).reset_index())
        st.dataframe(pp.style.format(precision=2), use_container_width=True, hide_index=True)


def view_replications(ds: Dataset):
    summ = oa.summarize_replications(ds.scalars)
    show = st.multiselect("Metrics", summ["metric"].tolist(),
                          default=[m for m in ["throughput", "avgWIP", "avgCycleTime", "fillRate", "yield"]
                                   if m in summ["metric"].values])
    sub = summ[summ["metric"].isin(show)] if show else summ
    fig = go.Figure()
    for i, (_, row) in enumerate(sub.iterrows()):
        fig.add_trace(go.Scatter(
            x=[row["metric"]], y=[row["mean"]],
            error_y=dict(type="data", array=[row["halfwidth"]], color=SERIES[i % len(SERIES)], thickness=2, width=10),
            mode="markers", marker=dict(color=SERIES[i % len(SERIES)], size=12),
            name=row["metric"], showlegend=False))
    fig.update_yaxes(title="mean ± 95% CI")
    st.plotly_chart(plotly_layout(fig, 340,
                    f"Replication means with 95% confidence intervals (n={ds.n_reps})"), use_container_width=True)
    st.dataframe(summ.style.format({"mean": "{:.4g}", "sd": "{:.4g}", "ci_low": "{:.4g}",
                                    "ci_high": "{:.4g}", "halfwidth": "{:.4g}", "rel_halfwidth": "{:.1%}"}),
                 use_container_width=True, hide_index=True)
    st.caption("Replications use independent seeds, so the means are i.i.d. and a Student-t interval applies. "
               "A wide relative half-width means more replications (or longer runs) are needed for that metric.")


def view_export(ds: Dataset):
    st.markdown("##### Export tidy data")
    st.write(f"Writes labeled CSVs and a multi-sheet Excel workbook to `{EXPORT_DIR}`.")
    c1, c2 = st.columns(2)
    do_csv = c1.checkbox("CSV files", value=True)
    do_xlsx = c2.checkbox("Excel workbook", value=True)
    if st.button("Export now", type="primary"):
        written = export_tidy(ds, EXPORT_DIR, csv=do_csv, excel=do_xlsx)
        st.success(f"Wrote {len(written)} file(s) to {EXPORT_DIR}")
        st.json(written)
        # also offer a direct download of the Excel workbook if produced
        if "excel" in written:
            with open(written["excel"], "rb") as fh:
                st.download_button("⬇ Download Excel workbook", fh.read(),
                                   file_name=Path(written["excel"]).name,
                                   mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    st.markdown("##### One-page summary")
    st.dataframe(oa.summarize_replications(ds.scalars), use_container_width=True, hide_index=True)


# ---------------------------------------------------------------- main
def main():
    st.set_page_config(page_title="DES factory — analysis", page_icon="🏭", layout="wide")
    inject_css()
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default=None)
    args, _ = parser.parse_known_args()

    st.markdown("# 🏭 DES factory — analysis dashboard")

    ds = None
    if args.path:
        p = Path(args.path)
        if p.exists():
            ds = Dataset(_load_path(str(p), p.stat().st_mtime))
    if ds is None:
        ds = resolve_dataset()
    if ds is None:
        return

    st.markdown(f"#### {ds.summary}")
    st.caption(f"source: {ds.generated_by} · kind: {ds.kind} · {ds.n_reps} replications")
    kpi_header(ds)
    st.write("")

    tabs = st.tabs(["Overview", "Flow over time", "Cycle time", "Resources", "Replications", "Export"])
    with tabs[0]: view_overview(ds)
    with tabs[1]: view_flow(ds)
    with tabs[2]: view_cycle(ds)
    with tabs[3]: view_resources(ds)
    with tabs[4]: view_replications(ds)
    with tabs[5]: view_export(ds)


if __name__ == "__main__":
    main()
