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
from des_analysis import load_results, metrics, output_analysis as oa, characteristic as ch, compare as cmp  # noqa: E402
from des_analysis.exporters import export_tidy  # noqa: E402
from des_analysis.ingest import Dataset, read_json  # noqa: E402

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
    return read_json(path)  # raw dict; may be des-analysis/v1 OR sweep-v1


def resolve_raw() -> dict | None:
    st.sidebar.header("Data source")
    samples = sorted(SAMPLE_DIR.glob("*.json")) if SAMPLE_DIR.exists() else []
    mode = st.sidebar.radio("Load from", ["Sample data", "Upload JSON"], index=0)
    if mode == "Upload JSON":
        up = st.sidebar.file_uploader("results JSON (run or CONWIP sweep)", type="json")
        if up is None:
            st.info("Upload a results JSON exported from the simulator, or switch to sample data.")
            return None
        import json
        return json.loads(up.getvalue().decode("utf-8"))
    if not samples:
        st.warning("No sample data found. Run:  `node analysis/run_sim.mjs`")
        return None
    names = [p.name for p in samples]
    default = "advanced_factory.json" if "advanced_factory.json" in names else names[0]
    choice = st.sidebar.selectbox("Sample dataset", names, index=names.index(default))
    p = SAMPLE_DIR / choice
    return _load_path(str(p), p.stat().st_mtime)


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
    c1, c2 = st.columns([2, 1])
    metric = c1.selectbox("Metric over time", ["wip", "fg", "completed"], index=0,
                          format_func=lambda m: {"wip": "Work in process", "fg": "Finished-goods inventory",
                                                 "completed": "Cumulative output"}[m])
    npts = ds.timeseries["t"].nunique() or 100
    window = c2.slider("Welch smoothing window (half-width)", 1, max(2, min(80, npts // 4)),
                       value=max(1, min(npts // 10, 50)))
    w = oa.welch_warmup(ds.timeseries, metric, window=window)
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


def _flow_sankey(ds: Dataset, bottleneck_name: str | None):
    flow = metrics.routing_flow(ds)
    if not flow:
        return
    nodes = flow["nodes"]
    def ncolor(n):
        if n in ("Start", "Purchased"):
            return FAINT
        if n == "Finished":
            return "#7aa2ff"
        return AMBER if n == bottleneck_name else TEAL
    fig = go.Figure(go.Sankey(
        arrangement="snap",
        node=dict(label=nodes, pad=18, thickness=16,
                  color=[ncolor(n) for n in nodes],
                  line=dict(color=BG, width=1)),
        link=dict(source=[l["source"] for l in flow["links"]],
                  target=[l["target"] for l in flow["links"]],
                  value=[l["value"] for l in flow["links"]],
                  color="rgba(54,224,200,0.22)",
                  hovertemplate="%{source.label} → %{target.label}<br>flow %{value:.3f}/time<extra></extra>")))
    st.plotly_chart(plotly_layout(fig, 360, "Material flow through the factory (arc width = parts/time)"),
                    use_container_width=True)
    st.caption("Where material moves and at what rate: components are made (Start → workcenter), feed the "
               "assembly that consumes them (BOM), and demand products exit to Finished. The "
               "bottleneck workcenter is amber — it caps how fast the whole flow can run.")


def view_resources(ds: Dataset):
    u = metrics.utilization_summary(ds)
    if u.empty:
        st.info("No resource data.")
        return
    bn = metrics.bottleneck(ds)
    if ds.is_advanced:
        _flow_sankey(ds, bn.get("name"))
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


def view_congestion(ds: Dataset):
    ff = metrics.flow_factor(ds)
    c = metrics.congestion_by_resource(ds)
    cols = st.columns(4)
    if ff["raw_process_time"] is not None:
        kpi(cols[0], "Flow factor", fmt(ff["flow_factor"], 2), "cycle time ÷ process time", "warn")
        kpi(cols[1], "Raw process time T₀", fmt(ff["raw_process_time"], 2), "value-added time")
        kpi(cols[2], "Value-added", fmt(ff.get("value_added_fraction"), pct=True), "of cycle time", "accent")
        kpi(cols[3], "Waiting / blocking", fmt(ff.get("queue_fraction"), pct=True), "of cycle time")
    else:
        kpi(cols[0], "Avg cycle time", fmt(ff["cycle_time"], 2), "across all parts", "accent")
        kpi(cols[1], "System T₀", "—", "routings differ — see per-part")
        kpi(cols[2], "Workcenters", str(len(c)) if not c.empty else "—", "")
        kpi(cols[3], "Bottleneck u", fmt(c["utilization"].max() if not c.empty else None, pct=True), "busiest resource", "warn")
    st.caption("Flow factor (cycle-time efficiency) is how many times a job's raw process time it actually "
               "spends in the system — the rest is queueing and blocking. Closer to 1 is leaner flow.")
    if c.empty:
        return

    c1, c2 = st.columns(2)
    # (1) where cycle time accrues: process vs wait, stacked per resource
    with c1:
        cc = c.sort_values("ct_station")
        fig = go.Figure()
        fig.add_trace(go.Bar(y=cc["name"], x=cc["t_e"], orientation="h", name="process time",
                             marker=dict(color=TEAL), text=[f"{v:.1f}" for v in cc["t_e"]], textposition="inside"))
        fig.add_trace(go.Bar(y=cc["name"], x=cc["wq_measured"], orientation="h", name="waiting (queue)",
                             marker=dict(color=AMBER)))
        fig.update_layout(barmode="stack")
        fig.update_xaxes(title="time per visit (process + wait)")
        st.plotly_chart(plotly_layout(fig, 360, "Where cycle time accrues, by resource"), use_container_width=True)
    # (2) VUT congestion curve: u/(1-u) blow-up with measured stations overlaid
    with c2:
        ug = np.linspace(0.0, 0.97, 120)
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=ug, y=ug / (1 - ug), mode="lines",
                                 line=dict(color=FAINT, dash="dash"),
                                 name="M/M/1 (c²=1)"))
        norm = c["wq_measured"] / c["t_e"].where(c["t_e"] > 0, np.nan)
        fig.add_trace(go.Scatter(x=c["utilization"], y=norm, mode="markers+text",
                                 marker=dict(color=TEAL, size=11, line=dict(color=BG, width=1)),
                                 text=c["name"], textposition="top center", textfont=dict(size=9, color=FAINT),
                                 name="simulated"))
        fig.update_xaxes(title="utilization u", range=[0, 1.0])
        fig.update_yaxes(title="wait ÷ process time (queue factor)", range=[0, float(np.nanmax([norm.max() * 1.2, 6]))])
        st.plotly_chart(plotly_layout(fig, 360, "Congestion vs utilization (VUT)"), use_container_width=True)
    st.caption("The dashed curve is the M/M/1 reference u/(1−u): queueing explodes as utilization → 1. "
               "A station **above** the curve has more variability than exponential (bursty arrivals or service); "
               "**below** it means smoother, lower-variability flow. `implied V` in the table is measured ÷ reference.")
    show = c[["name", "t_e", "utilization", "avg_queue", "wq_measured", "wq_mm1", "implied_v", "ct_station"]]
    st.dataframe(show.style.format({"t_e": "{:.2f}", "utilization": "{:.1%}", "avg_queue": "{:.2f}",
                                    "wq_measured": "{:.2f}", "wq_mm1": "{:.2f}", "implied_v": "{:.2f}",
                                    "ct_station": "{:.2f}"}),
                 use_container_width=True, hide_index=True)

    pf = metrics.part_flow_factor(ds)
    if not pf.empty:
        st.markdown("##### Per-part flow factor")
        pf = pf.sort_values("flow_factor", ascending=True)
        fig = go.Figure(go.Bar(y=pf["name"], x=pf["flow_factor"], orientation="h",
                               marker=dict(color=[AMBER if v >= 5 else TEAL for v in pf["flow_factor"]]),
                               text=[f"{v:.1f}×" for v in pf["flow_factor"]], textposition="outside"))
        fig.add_vline(x=1, line=dict(color=FAINT, dash="dot"), annotation_text="ideal (1×)", annotation_font_color=FAINT)
        fig.update_xaxes(title="flow factor (CT ÷ routing process time)")
        st.plotly_chart(plotly_layout(fig, 60 + 38 * len(pf), "Flow factor by part"), use_container_width=True)
        st.caption("Parts routed through congested resources carry a high flow factor — a direct pointer to which "
                   "product the bottleneck is hurting most.")

    vp = metrics.variability_propagation(ds)
    if not vp.empty:
        st.markdown("##### Variability propagation along the line")
        names = list(vp["name"])
        fig = go.Figure()
        # each station's own service variability
        fig.add_trace(go.Bar(x=names, y=vp["ce2"], name="service c²ₑ",
                             marker=dict(color="#2f3b46"), width=0.5))
        # the propagating flow variability: arrival into each station, departure out
        fig.add_trace(go.Scatter(x=names, y=vp["ca2"], mode="lines+markers", name="arrival c²ₐ",
                                 line=dict(color="#7aa2ff", width=2), marker=dict(size=9)))
        fig.add_trace(go.Scatter(x=names, y=vp["cd2"], mode="lines+markers", name="departure c²_d",
                                 line=dict(color=TEAL, width=2.4), marker=dict(size=9, symbol="diamond")))
        fig.add_hline(y=1.0, line=dict(color=AMBER, dash="dot"),
                      annotation_text="exponential (c²=1)", annotation_font_color=AMBER)
        fig.update_yaxes(title="squared CV (variability)", rangemode="tozero")
        st.plotly_chart(plotly_layout(fig, 360, "How variability flows station to station"), use_container_width=True)
        entry = "service SCV of stage 1 (saturated source under limitless supply)" if bool(vp.iloc[0]["entry_assumed"]) \
            else f"external arrivals (c²ₐ = {vp.iloc[0]['ca2']:.2f})"
        trend = "dampens" if vp.iloc[-1]["cd2"] < vp.iloc[0]["ca2"] else "amplifies"
        st.caption(
            f"Each station's departures feed the next station's arrivals (linking equation "
            f"c²_d = 1 + (1−u²)(c²ₐ−1) + (u²/√m)(c²ₑ−1)). The chain starts from {entry}. "
            f"Here the line **{trend}** variability overall. Low-variability stations far from saturation "
            "smooth flow; a heavily-loaded station passes its arrival variability straight through, so taming "
            "the entry/bottleneck variability is what calms the whole line.")


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


def view_steady_state(ds: Dataset):
    st.markdown("##### Steady-state estimate from a single long run (batch means)")
    st.caption("Browser exports are one replication, so the i.i.d. replication CI does not apply. "
               "Batch means splits one post-warm-up run into ≈independent batches and builds a t-interval — "
               "the standard single-run method.")
    w = oa.welch_warmup(ds.timeseries, "wip")
    reps = sorted(ds.timeseries["rep"].unique().tolist())
    c1, c2 = st.columns(2)
    rep = c1.selectbox("Replication", reps, index=0)
    n_batches = c2.slider("Number of batches", 5, 40, value=20)
    sub = ds.timeseries[ds.timeseries["rep"] == rep].sort_values("t")
    cutoff_t = w["cutoff_time"] if w["converged"] else 0.0
    kept = sub[sub["t"] >= cutoff_t]["wip"].astype(float).values
    if kept.size < n_batches * 2:
        kept = sub["wip"].astype(float).values
        cutoff_t = 0.0
    bm = oa.batch_means(kept, n_batches=n_batches, warmup=0)
    ms = oa.mser5(sub["wip"].astype(float).values)
    cols = st.columns(4)
    kpi(cols[0], "WIP estimate", fmt(bm["mean"], 2), "post-warm-up mean", "accent")
    kpi(cols[1], "95% CI half-width", fmt(bm["halfwidth"], 3), f"± on the mean")
    kpi(cols[2], "Warm-up dropped", fmt(cutoff_t, 0), "Welch cutoff (time)")
    kpi(cols[3], "MSER-5 cutoff", fmt(ms.get("obs_index", 0), 0), "alt. truncation (index)")
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=sub["t"], y=sub["wip"], mode="lines", line=dict(color=FAINT, width=0.8), name="WIP"))
    if cutoff_t > 0:
        fig.add_vrect(x0=0, x1=cutoff_t, fillcolor=AMBER, opacity=0.10, line_width=0,
                      annotation_text="warm-up (dropped)", annotation_position="top left", annotation_font_color=AMBER)
    fig.add_hline(y=bm["mean"], line=dict(color=TEAL, width=1.5), annotation_text=f"mean {bm['mean']:.2f}", annotation_font_color=TEAL)
    if np.isfinite(bm.get("halfwidth", float("nan"))):
        fig.add_hrect(y0=bm["mean"] - bm["halfwidth"], y1=bm["mean"] + bm["halfwidth"],
                      fillcolor=TEAL, opacity=0.12, line_width=0)
    fig.update_xaxes(title="simulation clock"); fig.update_yaxes(title="WIP")
    st.plotly_chart(plotly_layout(fig, 360, f"Replication {rep}: WIP with batch-means 95% CI"), use_container_width=True)
    st.caption(f"{bm.get('n_batches','?')} batches × {bm.get('batch_size','?')} obs each. "
               "If the half-width is wide relative to the mean, run longer or use more replications.")


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


# ---------------------------------------------------------------- characteristic curve (sweep)
def render_sweep(raw: dict):
    cfg = raw.get("config", {})
    T0, rb, W0 = cfg.get("T0"), cfg.get("rb"), cfg.get("W0")
    st.markdown(f"#### {cfg.get('summary', 'CONWIP sweep')}")
    st.caption(f"source: {raw.get('generatedBy','?')} · {raw.get('reps','?')} reps per WIP level · "
               f"bottleneck: {cfg.get('bottleneck','?')}")
    cols = st.columns(4)
    kpi(cols[0], "Raw process time T₀", fmt(T0, 2), "Σ mean op times", "accent")
    kpi(cols[1], "Bottleneck rate r_b", fmt(rb, 3), "max sustainable TH")
    kpi(cols[2], "Critical WIP W₀", fmt(W0, 2), "= r_b · T₀")
    kpi(cols[3], "Bottleneck", cfg.get("bottleneck", "—"), "highest utilization", "warn")

    pts = ch.measured_points(raw)
    wmax = float(pts["wip_cap"].max()) if not pts.empty else 16
    wgrid = np.linspace(0.8, wmax + 1, 120)
    ref = ch.reference_curves(T0, rb, W0, wgrid)

    def curve_fig(measured_y, hw, best_y, pwc_y, worst_y, ytitle, title):
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=ref["w"], y=worst_y, mode="lines", name="worst case",
                                 line=dict(color="#7a3b3b", width=1.4, dash="dot")))
        fig.add_trace(go.Scatter(x=ref["w"], y=pwc_y, mode="lines", name="practical worst case",
                                 line=dict(color=AMBER, width=1.8, dash="dash")))
        fig.add_trace(go.Scatter(x=ref["w"], y=best_y, mode="lines", name="best case",
                                 line=dict(color="#7aa2ff", width=1.8)))
        fig.add_trace(go.Scatter(x=pts["wip_mean"], y=measured_y, mode="markers",
                                 error_y=dict(type="data", array=hw, color=TEAL, thickness=1.3, width=5),
                                 marker=dict(color=TEAL, size=9, line=dict(color=BG, width=1)),
                                 name="simulated"))
        fig.add_vline(x=W0, line=dict(color=FAINT, dash="dot"),
                      annotation_text=f"W₀={W0:.1f}", annotation_position="top", annotation_font_color=FAINT)
        fig.update_xaxes(title="WIP (jobs)"); fig.update_yaxes(title=ytitle)
        return plotly_layout(fig, 380, title)

    c1, c2 = st.columns(2)
    with c1:
        f = curve_fig(pts["th_mean"], pts["th_hw"], ref["best_th"], ref["pwc_th"], ref["worst_th"],
                      "throughput", "Throughput vs WIP")
        f.add_hline(y=rb, line=dict(color="#7aa2ff", dash="dot"),
                    annotation_text=f"r_b={rb:.2f}", annotation_font_color="#7aa2ff")
        st.plotly_chart(f, use_container_width=True)
    with c2:
        st.plotly_chart(curve_fig(pts["ct_mean"], pts["ct_hw"], ref["best_ct"], ref["pwc_ct"], ref["worst_ct"],
                                  "cycle time", "Cycle time vs WIP"), use_container_width=True)
    st.markdown(
        "A flow needs WIP to reach full throughput — TH climbs from `w/T₀` toward the bottleneck rate `r_b`, "
        "and cycle time grows past `T₀` once WIP exceeds the critical level `W₀`. The simulated line should sit "
        "**between best and worst case**; sitting near or above the practical-worst-case line marks a well-behaved, "
        "low-variability line. Pushing WIP far past `W₀` buys little extra throughput but inflates cycle time.")
    st.dataframe(pts.style.format(precision=3), use_container_width=True, hide_index=True)


# ---------------------------------------------------------------- scenario comparison
def resolve_compare():
    """Sidebar multi-select of run samples → {name: Dataset}, or None if <2 chosen.
    CONWIP-sweep files are excluded (different schema)."""
    if not SAMPLE_DIR.exists():
        return None
    runs = []
    for p in sorted(SAMPLE_DIR.glob("*.json")):
        try:
            if read_json(str(p)).get("schema") == "des-analysis/v1":
                runs.append(p)
        except Exception:
            pass
    if len(runs) < 2:
        st.info("Need at least two run datasets in sample_data/ to compare.")
        return None
    names = [p.stem for p in runs]
    default = names[:2]
    chosen = st.sidebar.multiselect("Scenarios to compare", names, default=default)
    if len(chosen) < 2:
        st.info("Pick at least two scenarios in the sidebar to compare them.")
        return None
    out = {}
    for stem in chosen:
        p = SAMPLE_DIR / f"{stem}.json"
        out[stem] = Dataset(_load_path(str(p), p.stat().st_mtime))
    return out


def render_compare(datasets: dict):
    st.markdown("#### Scenario comparison")
    st.caption("Means across replications with 95% confidence intervals. Where intervals overlap, "
               "the difference is not statistically resolved at this replication count.")
    kdf = cmp.compare_kpis(datasets)
    if kdf.empty:
        st.warning("No comparable metrics across the selected scenarios.")
        return
    scen = list(datasets.keys())
    cmap = {s: SERIES[i % len(SERIES)] for i, s in enumerate(scen)}

    # winner badges per KPI
    metrics_present = [(k, lab) for k, lab, _ in cmp.KPIS if k in kdf["metric"].values]
    badges = []
    for key, lab in metrics_present:
        win = cmp.best_scenario(kdf, key)
        if win:
            badges.append(f'<span class="badge">best {lab}: <b style="color:{TEAL}">{win}</b></span>')
    st.markdown(" ".join(badges), unsafe_allow_html=True)

    # one grouped CI chart per KPI, laid out two-up
    cols = st.columns(2)
    for i, (key, lab) in enumerate(metrics_present):
        sub = kdf[kdf["metric"] == key]
        fig = go.Figure()
        fig.add_trace(go.Bar(
            x=sub["scenario"], y=sub["mean"],
            marker=dict(color=[cmap[s] for s in sub["scenario"]]),
            error_y=dict(type="data", array=sub["halfwidth"], color=FAINT, thickness=1.5, width=8),
            text=[f"{v:.3g}" for v in sub["mean"]], textposition="outside", showlegend=False))
        higher = bool(sub.iloc[0]["higher_is_better"])
        fig.update_yaxes(title=lab, rangemode="tozero")
        cols[i % 2].plotly_chart(plotly_layout(fig, 300,
                                 f"{lab}  ({'higher' if higher else 'lower'} is better)"),
                                 use_container_width=True)

    # utilization by resource, grouped across scenarios
    udf = cmp.compare_utilization(datasets)
    if not udf.empty:
        st.markdown("##### Utilization by resource")
        fig = go.Figure()
        for s in scen:
            ss = udf[udf["scenario"] == s]
            fig.add_trace(go.Bar(x=ss["resource"], y=ss["utilization"], name=s,
                                 marker=dict(color=cmap[s])))
        fig.update_layout(barmode="group")
        fig.update_yaxes(title="utilization", range=[0, 1.05], tickformat=".0%")
        st.plotly_chart(plotly_layout(fig, 340, "Where each policy loads the line"), use_container_width=True)

    # flow factor + raw KPI table
    ff = cmp.compare_flow_factor(datasets)
    if not ff["flow_factor"].isna().all():
        st.markdown("##### Flow factor")
        ff2 = ff.dropna(subset=["flow_factor"])
        fig = go.Figure(go.Bar(x=ff2["scenario"], y=ff2["flow_factor"],
                               marker=dict(color=[cmap[s] for s in ff2["scenario"]]),
                               text=[f"{v:.2f}×" for v in ff2["flow_factor"]], textposition="outside"))
        fig.add_hline(y=1, line=dict(color=FAINT, dash="dot"), annotation_text="ideal (1×)")
        fig.update_yaxes(title="flow factor", rangemode="tozero")
        st.plotly_chart(plotly_layout(fig, 300, "Cycle-time efficiency (lower is leaner)"), use_container_width=True)
    pivot = kdf.pivot(index="label", columns="scenario", values="mean")
    st.markdown("##### KPI table (means)")
    st.dataframe(pivot.style.format("{:.4g}"), use_container_width=True)


# ---------------------------------------------------------------- main
def main():
    st.set_page_config(page_title="DES factory — analysis", page_icon="🏭", layout="wide")
    inject_css()
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default=None)
    args, _ = parser.parse_known_args()

    st.markdown("# 🏭 DES factory — analysis dashboard")

    compare_mode = st.sidebar.toggle("Compare scenarios", value=False,
                                     help="Line several run datasets up side by side")
    if compare_mode:
        datasets = resolve_compare()
        if datasets:
            render_compare(datasets)
        return

    raw = None
    if args.path:
        p = Path(args.path)
        if p.exists():
            raw = _load_path(str(p), p.stat().st_mtime)
    if raw is None:
        raw = resolve_raw()
    if raw is None:
        return

    # CONWIP characteristic-curve sweeps use a different schema and a dedicated view.
    if ch.is_sweep(raw):
        render_sweep(raw)
        return

    ds = Dataset(raw)
    st.markdown(f"#### {ds.summary}")
    st.caption(f"source: {ds.generated_by} · kind: {ds.kind} · {ds.n_reps} replications")
    kpi_header(ds)
    st.write("")

    tabs = st.tabs(["Overview", "Flow over time", "Cycle time", "Resources",
                    "Congestion", "Replications", "Steady state", "Export"])
    with tabs[0]: view_overview(ds)
    with tabs[1]: view_flow(ds)
    with tabs[2]: view_cycle(ds)
    with tabs[3]: view_resources(ds)
    with tabs[4]: view_congestion(ds)
    with tabs[5]: view_replications(ds)
    with tabs[6]: view_steady_state(ds)
    with tabs[7]: view_export(ds)


if __name__ == "__main__":
    main()
