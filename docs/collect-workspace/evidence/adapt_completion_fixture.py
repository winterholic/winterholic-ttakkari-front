#!/usr/bin/env python3
"""Build a non-destructive, offline replay supplement from saved fixtures."""
from __future__ import annotations

import copy
import json
from pathlib import Path

from make_completion_fixture import anon

HERE = Path(__file__).resolve().parent
BASELINE = HERE / "replay-fixture.json"
COMPLETION = HERE / "replay-completion-fixture.json"


def _read(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain an object")
    return value


def _anonymize_references(value):
    """Replace any retained baseline identifier value before emitting the overlay."""
    if isinstance(value, list):
        return [_anonymize_references(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        if (key == "id" or key.endswith("_id") or key == "source_key") and isinstance(item, str):
            result[key] = anon("ref", item)
        else:
            result[key] = _anonymize_references(item)
    return result


def _anonymous_baseline_review(baseline: dict) -> tuple[list[dict], dict | None]:
    rows = []
    for source in baseline.get("review", {}).get("items", []):
        if not isinstance(source, dict):
            continue
        original_id = source.get("id")
        row = _anonymize_references(source)
        if original_id is not None:
            row["id"] = anon("item", original_id)
        rows.append(row)

    detail_source = baseline.get("item_detail")
    detail = _anonymize_references(detail_source) if isinstance(detail_source, dict) else None
    if detail:
        original_id = detail_source.get("id")
        if original_id is not None:
            detail["id"] = anon("item", original_id)
        data = detail.get("data")
        original_data = detail_source.get("data") if isinstance(detail_source.get("data"), dict) else {}
        if isinstance(data, dict) and original_data.get("id") is not None:
            data["id"] = anon("item", original_data["id"])
        # Preserve only a real review-to-detail match from the baseline snapshot.
        if original_id not in [x.get("id") for x in baseline.get("review", {}).get("items", []) if isinstance(x, dict)]:
            detail = None
    return rows, detail


def build_adapter(baseline: dict | None = None, completion: dict | None = None) -> dict:
    """Return an overlay; never modify either source fixture on disk."""
    baseline = copy.deepcopy(baseline if baseline is not None else _read(BASELINE))
    completion = copy.deepcopy(completion if completion is not None else _read(COMPLETION))

    baseline_rows = baseline.get("mission_list", {}).get("items", [])
    baseline_selected = baseline.get("selected_mission_id")
    selected_alias = anon("mission", baseline_selected)
    completion_rows = completion.get("missions", {}).get("items", [])
    mission_by_alias = {row.get("id"): row for row in completion_rows if isinstance(row, dict)}
    selected_exists = selected_alias in mission_by_alias

    # Convert the baseline list IDs with the same anon function used by its maker,
    # then retain completion's shared title aliases and richer run/count fields.
    baseline_aliases = {anon("mission", row.get("id")) for row in baseline_rows
                        if isinstance(row, dict) and row.get("id") is not None}
    completion_aliases = set(mission_by_alias)
    joined_missions = [copy.deepcopy(row) for row in completion_rows
                       if isinstance(row, dict) and row.get("id") in baseline_aliases]

    mission_detail = None
    mission_trace = None
    if selected_exists:
        detail_source = baseline.get("mission_detail")
        trace_source = baseline.get("mission_trace")
        mission_detail = _anonymize_references(detail_source)
        mission_trace = _anonymize_references(trace_source)
        if isinstance(mission_detail, dict) and isinstance(detail_source, dict) and detail_source.get("id") == baseline_selected:
            mission_detail["id"] = selected_alias
        if isinstance(mission_trace, dict) and isinstance(trace_source, dict) and trace_source.get("id") == baseline_selected:
            mission_trace["id"] = selected_alias
        if not isinstance(mission_detail, dict) or mission_detail.get("id") != selected_alias:
            mission_detail = None
        if not isinstance(mission_trace, dict) or mission_trace.get("id") != selected_alias:
            mission_trace = None

    review_rows, baseline_item_detail = _anonymous_baseline_review(baseline)
    completion_review_ids = {row.get("id") for row in completion.get("review", {}).get("items", [])
                             if isinstance(row, dict)}
    completion_details = [copy.deepcopy(row) for row in completion.get("item_details", [])
                          if isinstance(row, dict) and row.get("id") in completion_review_ids]

    # Completion endpoint shapes are preserved exactly for the UI consumers.
    sources = copy.deepcopy(completion.get("sources", {"items": []}))
    jobs = copy.deepcopy(completion.get("jobs", {"jobs": [], "next_cursor": None}))
    job_item_pages = []
    for page in completion.get("job_item_pages", []):
        if not isinstance(page, dict):
            continue
        job_item_pages.append({
            "job_id": page.get("job_id"),
            "response": {
                "items": [],
                "total": page.get("total", 0),
                "limit": page.get("limit"),
                "offset": page.get("offset"),
            },
        })

    return {
        "offline_adapter_version": 1,
        "observations": {
            "baseline_observed_at": baseline.get("observed_at"),
            "completion_observed_at": completion.get("observed_at"),
            "baseline_source": "replay-fixture.json",
            "completion_source": "replay-completion-fixture.json",
        },
        "mission_list": {
            "items": joined_missions,
            "limit": completion.get("missions", {}).get("limit"),
            "offset": completion.get("missions", {}).get("offset"),
            "has_more": completion.get("missions", {}).get("has_more"),
        },
        "selected_mission_id": selected_alias if selected_exists else None,
        "mission_detail": mission_detail,
        "mission_trace": mission_trace,
        "mission_detail_joined": bool(mission_detail),
        "mission_trace_joined": bool(mission_trace),
        "unmatched_baseline_mission_aliases": sorted(baseline_aliases - completion_aliases),
        "review": {"items": review_rows},
        "item_detail": baseline_item_detail,
        "completion_review": copy.deepcopy(completion.get("review", {"items": []})),
        "completion_item_details": completion_details,
        "sources": sources,
        "jobs": jobs,
        "job_item_pages": job_item_pages,
        "join_notes": {
            "mission_detail_trace": "Only selected mission IDs with a matching completion mission alias are connected.",
            "baseline_review_detail": "Included only when baseline item_detail ID is present in baseline review items.",
            "completion_review_detail": "Joined only by stable item alias within the completion observation.",
            "job_items": "Eight successful item pages are real empty pages; no items were synthesized.",
            "unmatched_detail": "No cross-observation item detail match is fabricated.",
        },
    }


if __name__ == "__main__":
    print(json.dumps(build_adapter(), ensure_ascii=False, indent=2))
