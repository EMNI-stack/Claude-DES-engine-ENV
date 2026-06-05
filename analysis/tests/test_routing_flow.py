"""Tests for the BOM-aware process-flow (Sankey) builder."""
import pytest

from des_analysis import metrics as m
from des_analysis.ingest import Dataset


def _factory():
    """frame→Cutting and body→Welding feed widget assembled at Assembly→Quality;
    controller is purchased and also feeds Assembly. widget is the demand product."""
    cfg = {
        "summary": "f",
        "resources": [{"id": "cut", "name": "Cutting"}, {"id": "weld", "name": "Welding"},
                      {"id": "asm", "name": "Assembly"}, {"id": "qc", "name": "Quality"}],
        "parts": [
            {"id": "frame", "name": "Frame", "type": "produced", "bom": [], "route": ["cut"]},
            {"id": "body", "name": "Body", "type": "produced", "bom": [], "route": ["weld"]},
            {"id": "ctrl", "name": "Ctrl", "type": "purchased", "bom": [], "route": []},
            {"id": "widget", "name": "Widget", "type": "produced", "isDemand": True,
             "bom": [{"partId": "frame", "qty": 1}, {"partId": "body", "qty": 2},
                     {"partId": "ctrl", "qty": 1}], "route": ["asm", "qc"]},
        ],
    }
    rep = {"seed": 1, "scalars": {"avgCycleTime": 5.0, "throughput": 1.0},
           "resources": [], "parts": [
               {"id": "frame", "name": "Frame", "completed": 100},
               {"id": "body", "name": "Body", "completed": 200},
               {"id": "ctrl", "name": "Ctrl", "completed": 0},
               {"id": "widget", "name": "Widget", "completed": 100}]}
    return Dataset({"schema": "des-analysis/v1", "kind": "advanced", "config": cfg,
                    "runLength": 100, "replications": [rep]})


def test_flow_has_start_purchased_finished_nodes():
    f = m.routing_flow(_factory())
    assert "Start" in f["nodes"] and "Purchased" in f["nodes"] and "Finished" in f["nodes"]


def test_bom_links_component_exit_to_parent_entry():
    f = m.routing_flow(_factory())
    arcs = {(l["source_name"], l["target_name"]): l["value"] for l in f["links"]}
    # widget rate = 100/100 = 1.0; qty weights consumption
    assert arcs[("Cutting", "Assembly")] == pytest.approx(1.0)     # frame qty 1 × rate 1
    assert arcs[("Welding", "Assembly")] == pytest.approx(2.0)     # body qty 2 × rate 1
    assert arcs[("Purchased", "Assembly")] == pytest.approx(1.0)   # controller qty 1
    assert arcs[("Assembly", "Quality")] == pytest.approx(1.0)     # widget internal route
    assert arcs[("Quality", "Finished")] == pytest.approx(1.0)     # demand exit


def test_raw_produced_parts_enter_from_start():
    f = m.routing_flow(_factory())
    arcs = {(l["source_name"], l["target_name"]): l["value"] for l in f["links"]}
    assert arcs[("Start", "Cutting")] == pytest.approx(1.0)   # frame rate
    assert arcs[("Start", "Welding")] == pytest.approx(2.0)   # body rate (200/100)


def test_none_when_no_routing_or_not_advanced():
    simple = Dataset({"schema": "des-analysis/v1", "kind": "simple", "config": {}, "runLength": 1,
                      "replications": [{"resources": []}]})
    assert m.routing_flow(simple) is None
    no_route = Dataset({"schema": "des-analysis/v1", "kind": "advanced",
                        "config": {"resources": [{"id": "a", "name": "A"}],
                                   "parts": [{"id": "p", "name": "P", "route": []}]},
                        "runLength": 10, "replications": [{"parts": [{"id": "p", "completed": 5}]}]})
    assert m.routing_flow(no_route) is None
