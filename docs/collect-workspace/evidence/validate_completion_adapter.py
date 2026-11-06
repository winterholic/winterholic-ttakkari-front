#!/usr/bin/env python3
"""Offline assertions for completion evidence and safe replay joins."""
from __future__ import annotations

import json
from pathlib import Path

from adapt_completion_fixture import BASELINE, COMPLETION, build_adapter
from make_completion_fixture import anon, safe_dedupe


def main() -> None:
    baseline_before = BASELINE.read_bytes()
    completion_before = COMPLETION.read_bytes()
    base = json.loads(baseline_before)
    completion = json.loads(completion_before)
    adapted = build_adapter(base, completion)

    assert len(adapted["mission_list"]["items"]) == 21
    assert adapted["selected_mission_id"] == adapted["mission_detail"]["id"]
    assert adapted["selected_mission_id"] == adapted["mission_trace"]["id"]
    titles = [row["title"] for row in adapted["mission_list"]["items"]]
    frequencies = sorted((titles.count(title) for title in set(titles)), reverse=True)
    assert frequencies == [12, 3, 3, 3], frequencies
    assert len(adapted["sources"]["items"]) == 200
    assert len(adapted["jobs"]["jobs"]) == 20
    assert len(adapted["job_item_pages"]) == 8
    assert all(page["response"] == {"items": [], "total": 0,
                                    "limit": page["response"]["limit"],
                                    "offset": page["response"]["offset"]}
               for page in adapted["job_item_pages"])
    assert len(adapted["completion_item_details"]) == 10

    # Completion details must be selected only by a matching review alias.
    completion_review_ids = {row["id"] for row in completion["review"]["items"]}
    assert all(row["id"] in completion_review_ids for row in adapted["completion_item_details"])
    assert adapted["item_detail"] is None or adapted["item_detail"]["id"] in {
        row["id"] for row in adapted["review"]["items"]
    }
    assert adapted["observations"]["baseline_observed_at"] != adapted["observations"]["completion_observed_at"]
    serialized = json.dumps(adapted, ensure_ascii=False)
    for mission in base["mission_list"]["items"]:
        if mission.get("id"):
            assert mission["id"] not in serialized
    assert base["selected_mission_id"] not in serialized
    assert base["item_detail"]["id"] not in serialized

    evidence = completion["evidence"]
    assert evidence["row_counts"]["sources_response"] == evidence["row_counts"]["sources_preserved"] == 200
    assert evidence["row_counts"]["jobs_response"] == evidence["row_counts"]["jobs_preserved"] == 20
    assert evidence["source_response_keys_observed"] == ["items", "ml_spending_enabled", "runtime_enabled"]
    assert "ml_spending_enabled" in evidence["source_response_value_not_saved"]
    assert set(adapted["sources"]) >= {"items", "runtime_enabled"}
    budget = evidence["item_detail_budget"]
    assert budget["limit_total"] == 10 and budget["actual_total"] == 30 and budget["exceeded"] is True
    assert evidence["dedupe_relation_status"] == "unconfirmed"
    assert safe_dedupe({"canonical_candidate": "stable-id"}) == {
        "canonical_candidate": anon("item", "stable-id")
    }
    assert safe_dedupe({"canonical_candidate": False}) == {"canonical_candidate": False}
    assert safe_dedupe({"canonical_candidate": None}) == {"canonical_candidate": None}
    assert safe_dedupe({}) == {}

    # No source fixture is edited by adapter construction.
    assert BASELINE.read_bytes() == baseline_before
    assert COMPLETION.read_bytes() == completion_before
    print("PASS: offline IDs, mission detail/trace boundary, title groups=12/3/3/3")
    print("PASS: sources=200, jobs=20, empty job item pages=8, item detail cap recorded exceeded=30/10")
    print("PASS: observation scopes retained, matching-only details, source fixtures unchanged")


if __name__ == "__main__":
    main()
