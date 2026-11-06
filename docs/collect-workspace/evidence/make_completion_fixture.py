#!/usr/bin/env python3
"""Fetch bounded owner GET samples and write an allowlist-only anonymized fixture."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

BASE = "/api/assistant/collect"
BACKEND_REVISION = "5f5cbd997addcb4ea084ab908790f8f6eec54122"
OUT = Path(__file__).with_name("replay-completion-fixture.json")


def anon(prefix: str, value: object) -> str | None:
    if value is None:
        return None
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}-{digest}"


def scalar_counts(value: object) -> dict[str, int | float | bool]:
    if not isinstance(value, dict):
        return {}
    return {str(k)[:64]: v for k, v in value.items()
            if isinstance(v, (int, float, bool)) and not isinstance(v, str)}


class Reader:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def get(self, path: str) -> dict:
        proc = subprocess.run(["ttk", "get", path], capture_output=True, text=True, check=False)
        safe_path = re.sub(r"/(jobs|items)/[^/?]+", r"/\1/{id}", path.split("?")[0])
        entry = {"method": "GET", "path": safe_path, "exit_code": proc.returncode}
        self.calls.append(entry)
        if proc.returncode:
            raise RuntimeError(f"GET {entry['path']} exit={proc.returncode}")
        try:
            body = json.loads(proc.stdout)
        except (ValueError, TypeError) as exc:
            raise RuntimeError(f"GET {entry['path']} returned invalid JSON ({type(exc).__name__})") from exc
        if not isinstance(body, dict):
            raise RuntimeError(f"GET {entry['path']} returned {type(body).__name__}, expected object")
        entry["response_keys"] = sorted(body.keys())
        return body


def alias_url(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    parsed = urlsplit(value)
    if not parsed.scheme or not parsed.netloc:
        return "https://source.example.test/resource/" + anon("u", value).split("-", 1)[1]
    host = anon("host", parsed.hostname or "source").split("-", 1)[1]
    path = anon("p", (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")).split("-", 1)[1]
    return f"https://{host}.example.test/resource/{path}"


def time_value(value: object) -> str | None:
    return value if isinstance(value, str) and len(value) <= 48 else None


def main() -> None:
    observed_at = dt.datetime.now(dt.timezone.utc).isoformat()
    reader = Reader()

    missions_raw = reader.get(BASE + "/missions?limit=50&offset=0")
    sources_raw = reader.get(BASE + "/sources")
    jobs_raw = reader.get(BASE + "/jobs?limit=20")
    review_raw = reader.get(BASE + "/review?limit=10&offset=0")

    mission_items = missions_raw.get("items")
    source_items = sources_raw.get("items")
    job_items = jobs_raw.get("jobs")
    review_items = review_raw.get("items")
    for name, rows in (("missions.items", mission_items), ("sources.items", source_items),
                       ("jobs.jobs", job_items), ("review.items", review_items)):
        if not isinstance(rows, list):
            raise RuntimeError(f"consumer field {name} missing or not an array")

    job_item_pages = []
    for row in job_items[:8]:
        if not isinstance(row, dict) or not isinstance(row.get("job_id"), str):
            continue
        page = reader.get(BASE + "/jobs/" + row["job_id"] + "/items?offset=0")
        rows = page.get("items") if isinstance(page.get("items"), list) else []
        job_item_pages.append({"job_id": anon("job", row["job_id"]), "response_keys": sorted(page.keys()),
                               "items": len(rows), "total": page.get("total"),
                               "limit": page.get("limit"), "offset": page.get("offset")})

    title_ids: dict[str, str] = {}
    safe_missions = []
    for row in mission_items:
        if not isinstance(row, dict):
            continue
        original_title = row.get("title")
        title_key = str(original_title) if original_title is not None else "[missing-title]"
        if title_key not in title_ids:
            title_ids[title_key] = f"익명 임무 {len(title_ids) + 1:02d}"
        runs = []
        for run in row.get("runs") or []:
            if isinstance(run, dict):
                runs.append({k: ("[익명화]" if k == "trigger" and run.get(k) is not None else run.get(k))
                             for k in ("run_seq", "started_at", "trigger", "page_budget", "pages_used",
                                       "collected", "unchanged", "imported", "in_progress") if k in run})
        safe_missions.append({
            "id": anon("mission", row.get("id")), "title": title_ids[title_key],
            "status": row.get("status"), "run_seq": row.get("run_seq"), "runs": runs,
            "counts": scalar_counts(row.get("counts")),
            "created_at": time_value(row.get("created_at")), "updated_at": time_value(row.get("updated_at")),
        })

    safe_sources = []
    for row in source_items:
        if not isinstance(row, dict):
            continue
        policy = row.get("policy") if isinstance(row.get("policy"), dict) else {}
        permissions = policy.get("permissions") if isinstance(policy.get("permissions"), dict) else {}
        seeds = row.get("seeds") if isinstance(row.get("seeds"), list) else []
        request = row.get("request") if isinstance(row.get("request"), dict) else {}
        request_seeds = request.get("seeds") if isinstance(request.get("seeds"), list) else []
        license_id = policy.get("license_id")
        if isinstance(license_id, str) and not re.fullmatch(r"[A-Za-z0-9 ._-]{1,64}", license_id):
            license_id = "[익명화]"
        safe_sources.append({
            "id": anon("source", row.get("id")), "source_key": anon("sourcekey", row.get("source_key")),
            "title": f"익명 출처 {len(safe_sources) + 1:03d}",
            "seeds": [alias_url(url) for url in seeds if isinstance(url, str)],
            "enabled": row.get("enabled"), "auto_import": row.get("auto_import"),
            "interval_minutes": row.get("interval_minutes"), "next_run_at": time_value(row.get("next_run_at")),
            "last_job_id": anon("job", row.get("last_job_id")), "version": row.get("version"),
            "request": {"seeds": [alias_url(url) for url in request_seeds if isinstance(url, str)],
                        "profile": "[익명화]" if request.get("profile") is not None else None,
                        "max_pages": request.get("max_pages") if isinstance(request.get("max_pages"), (int, float)) else None,
                        "max_depth": request.get("max_depth") if isinstance(request.get("max_depth"), (int, float)) else None},
            "policy": {"permissions": {str(k): v for k, v in permissions.items()
                                         if isinstance(v, (str, int, float, bool, type(None)))},
                       "license_id": license_id, "policy_url": alias_url(policy.get("policy_url")), "basis": "[익명화]",
                       "checked_at": time_value(policy.get("checked_at"))},
            "last_error": None,
        })

    safe_jobs = []
    for row in job_items:
        if not isinstance(row, dict):
            continue
        cursor = row.get("cursor") if isinstance(row.get("cursor"), dict) else {}
        error = row.get("last_error") if isinstance(row.get("last_error"), dict) else None
        safe_jobs.append({
            "job_id": anon("job", row.get("job_id")), "source_key": anon("sourcekey", row.get("source_key")),
            "status": row.get("status"), "stage": row.get("stage"),
            "created_at": time_value(row.get("created_at")), "attempts": row.get("attempts"),
            "cancel_requested": row.get("cancel_requested"),
            "last_error": ({"code": error.get("code"), "detail": "[익명화]"} if error else None),
            "cursor": {"counts": scalar_counts(cursor.get("counts")),
                       "processed": cursor.get("processed") if isinstance(cursor.get("processed"), (int, float)) else None},
        })

    safe_review = []
    for row in review_items:
        if not isinstance(row, dict):
            continue
        safe_review.append({
            "id": anon("item", row.get("id")), "url": alias_url(row.get("url")),
            "source_key": anon("sourcekey", row.get("source_key")), "status": row.get("status"),
            "reason_codes": [x for x in row.get("reason_codes", []) if isinstance(x, str) and len(x) <= 64],
            "language": row.get("language"), "text_chars": row.get("text_chars"),
            "preview": "[본문 익명화]", "can_reprocess": row.get("can_reprocess"), "signals": {},
        })

    details = []
    for row in review_items[:10]:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            continue
        raw = reader.get(BASE + "/items/" + row["id"])
        dedupe = raw.get("dedupe") if isinstance(raw.get("dedupe"), dict) else None
        safe_dedupe = None
        if dedupe is not None:
            safe_dedupe = {}
            for field in ("exact_of", "cluster_id"):
                if field in dedupe and dedupe[field] is not None:
                    safe_dedupe[field] = anon("item" if field == "exact_of" else "cluster", dedupe[field])
            for field in ("canonical_candidate", "canonical_status", "algorithm_version"):
                if field in dedupe and isinstance(dedupe[field], (str, int, float, bool, type(None))):
                    safe_dedupe[field] = dedupe[field]
        details.append({
            "id": anon("item", raw.get("id", row["id"])), "status": raw.get("status"),
            "stage": raw.get("stage"), "dedupe": safe_dedupe,
        })

    fixture = {
        "observed_at": observed_at,
        "evidence": {
            "client": "ttk get (owner-authenticated)", "backend_source_revision": BACKEND_REVISION,
            "frontend_revision": subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                                                   text=True, check=True).stdout.strip(),
            "scope": "GET only; one missions page, one sources page, one jobs page, one review page; up to 10 item detail GETs",
            "calls": reader.calls,
            "row_counts": {
                "missions_response": len(mission_items), "missions_preserved": len(safe_missions),
                "sources_response": len(source_items), "sources_preserved": len(safe_sources),
                "jobs_response": len(job_items), "jobs_preserved": len(safe_jobs),
                "review_response": len(review_items), "item_details_read": len(details),
                "item_details_with_dedupe": sum(1 for d in details if d["dedupe"] is not None),
                "job_item_pages_read": len(job_item_pages),
                "job_item_rows_total": sum(p["items"] for p in job_item_pages),
            },
        },
        "missions": {"items": safe_missions, "limit": missions_raw.get("limit"),
                     "offset": missions_raw.get("offset"), "has_more": missions_raw.get("has_more")},
        "sources": {"items": safe_sources, "runtime_enabled": sources_raw.get("runtime_enabled")},
        "jobs": {"jobs": safe_jobs, "next_cursor": "[익명 커서]" if jobs_raw.get("next_cursor") else None},
        "job_item_pages": job_item_pages,
        "review": {"items": safe_review, "total": review_raw.get("total"),
                   "limit": review_raw.get("limit"), "offset": review_raw.get("offset")},
        "item_details": details,
    }
    OUT.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"written": OUT.name, "observed_at": observed_at,
                      "counts": fixture["evidence"]["row_counts"],
                      "same_title_groups": len(title_ids)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
