#!/usr/bin/env python3
"""Read collection GET contracts and print only redacted shape/count evidence."""
from __future__ import annotations

import datetime as dt
import json
import subprocess
from zoneinfo import ZoneInfo


BASE = "/api/assistant/collect"


def get(path: str) -> dict:
    result = subprocess.run(["ttk", "get", path], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(f"GET {path.split('?')[0]} failed: exit {result.returncode}")
    return json.loads(result.stdout)


def main() -> None:
    now = dt.datetime.now(dt.timezone.utc)
    review = get(f"{BASE}/review?offset=0")
    missions = get(f"{BASE}/missions?limit=20&offset=0")
    summary = get(f"{BASE}/summary")
    rows = review.get("items", [])
    items = missions.get("items", [])
    precise = [(m.get("triage") or {}).get("precise_eval") for m in items]
    precise = [p for p in precise if isinstance(p, dict)]
    print(f"observed_utc={now.isoformat()} observed_kst={now.astimezone(ZoneInfo('Asia/Seoul')).isoformat()}")
    print(
        "review: "
        f"items={len(rows)} total={review.get('total')} "
        f"accepted+can={sum(i.get('status') == 'accepted' and i.get('can_reprocess') is True for i in rows)} "
        f"held+can={sum(i.get('status') == 'held' and i.get('can_reprocess') is True for i in rows)}"
    )
    print(
        "missions: "
        f"items={len(items)} has_more={missions.get('has_more')} precise_eval={len(precise)} "
        f"engines={sorted({str(p.get('engine')) for p in precise})} "
        f"pending_zero={sum(p.get('pending') == 0 for p in precise)} "
        f"processing_zero={sum(p.get('processing') == 0 for p in precise)} "
        f"unresolved_zero={sum(p.get('unresolved') == 0 for p in precise)}"
    )
    print("summary_keys=" + ",".join(sorted(summary)))

    if precise:
        mission = next(m for m in items if isinstance((m.get("triage") or {}).get("precise_eval"), dict))
        detail = get(f"{BASE}/missions/{mission['id']}")
        p = (detail.get("triage") or {}).get("precise_eval") or {}
        print("detail precise_eval=" + json.dumps({k: p.get(k) for k in ("engine", "pending", "processing", "unresolved")}))

    duplicate = next((i for i in rows if any("duplicate" in str(r).lower() for r in i.get("reason_codes", []))), None)
    if duplicate:
        detail = get(f"{BASE}/items/{duplicate['id']}")
        dedupe = detail.get("dedupe") or {}
        kinds = {key: ("missing" if key not in dedupe else "null" if dedupe[key] is None else type(dedupe[key]).__name__)
                 for key in ("exact_of", "cluster_id", "canonical_candidate", "canonical_status", "algorithm_version")}
        print("dedupe_field_types=" + json.dumps(kinds, sort_keys=True))
        print("decision_shape=" + json.dumps({"present": "decision" in detail, "status": "status" in detail,
                                               "reason_codes": "reason_codes" in detail}))

    fixture = json.load(open("docs/collect-workspace/evidence/replay-fixture.json", encoding="utf-8"))["mission_list"]["items"]
    counts_only = [m for m in fixture if not (m.get("triage") or {}).get("precise_eval")]
    waiting = [m.get("counts", {}).get("precise_waiting") for m in counts_only]
    unresolved = [m.get("counts", {}).get("precise_unresolved") for m in counts_only]
    print(
        "anonymous_legacy_fixture: "
        f"missions={len(counts_only)} precise_waiting_present={sum(v is not None for v in waiting)} "
        f"waiting_nonzero={sum(isinstance(v, (int, float)) and v > 0 for v in waiting)} "
        f"waiting_zero={sum(v == 0 for v in waiting)} unresolved_present={sum(v is not None for v in unresolved)}"
    )


if __name__ == "__main__":
    main()
