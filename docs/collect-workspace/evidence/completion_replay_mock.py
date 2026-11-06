#!/usr/bin/env python3
"""Read-only local HTTP adapter for the saved completion and baseline fixtures."""
from __future__ import annotations

import copy
import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from adapt_completion_fixture import build_adapter


DATA = build_adapter()
BASELINE = json.loads((Path(__file__).resolve().parent / "replay-fixture.json").read_text(encoding="utf-8"))
SELECTED = DATA["selected_mission_id"]
JOB_PAGES = {row["job_id"]: row["response"] for row in DATA["job_item_pages"]}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "http://127.0.0.1:5195")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_json(204, {})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path == "/api/health":
            return self.send_json(200, {"status": "ok", "scope": "local_saved_fixture_only"})
        if path == "/api/tasks/active":
            return self.send_json(200, {"roots": [], "nodes": []})
        if path == "/api/assistant/collect/missions":
            # The saved list keeps title/run/time/counts but omits goal, plan,
            # results, jobs and gaps. The UI reads these list shapes without guards; add
            # empty shape defaults only, never topics/results/jobs or relations.
            # Each default is mock-only and logged, not an observed empty value.
            listing = copy.deepcopy(DATA["mission_list"])
            for row in listing["items"]:
                if row.get("plan") is None:
                    row["plan"] = {"coverage": []}
                    defaults = ["plan.coverage=[]"]
                    for field in ("results", "jobs", "gaps"):
                        if field not in row:
                            row[field] = []
                            defaults.append(f"{field}=[]")
                    if "goal" not in row:
                        row["goal"] = ""
                        defaults.append('goal=""')
                    print("SHAPE_DEFAULT", ",".join(defaults), row.get("id"), flush=True)
            return self.send_json(200, listing)
        match = re.fullmatch(r"/api/assistant/collect/missions/([^/]+)(/trace)?", path)
        if match:
            mission_id, suffix = match.groups()
            if mission_id != SELECTED:
                return self.send_json(404, {"code": "fixture_detail_not_joined", "message": "No matched saved detail"})
            key = "mission_trace" if suffix == "/trace" else "mission_detail"
            value = DATA.get(key)
            if value is None:
                return self.send_json(404, {"code": "fixture_detail_not_joined", "message": "No matched saved detail"})
            return self.send_json(200, value)
        if path == "/api/assistant/collect/sources":
            return self.send_json(200, copy.deepcopy(DATA["sources"]))
        if path == "/api/assistant/collect/jobs":
            return self.send_json(200, copy.deepcopy(DATA["jobs"]))
        if path == "/api/assistant/collect/review":
            offset = int(query.get("offset", ["0"])[0])
            limit = int(query.get("limit", ["50"])[0])
            fixture = BASELINE["review"]
            rows = copy.deepcopy(fixture["items"][offset : offset + limit])
            return self.send_json(200, {**fixture, "items": rows, "offset": offset, "limit": limit})
        if path == "/api/assistant/collect/review/audit":
            return self.send_json(200, copy.deepcopy(BASELINE["audit"]))
        job_match = re.fullmatch(r"/api/assistant/collect/jobs/([^/]+)/items", path)
        if job_match:
            response = JOB_PAGES.get(job_match.group(1))
            if response is None:
                return self.send_json(404, {"code": "fixture_page_not_saved", "message": "No saved item page for this job"})
            return self.send_json(200, copy.deepcopy(response))
        if path == "/api/auth/refresh":
            return self.send_json(200, {"access_token": "local-fixture-only", "token_type": "bearer", "expires_in": 900})
        return self.send_json(404, {"code": "local_fixture_route_missing", "message": "No saved fixture route", "path": path})

    def do_POST(self) -> None:
        # Auth refresh has no external effect. Every product mutation is rejected.
        path = urlparse(self.path).path
        if path == "/api/auth/refresh":
            self.send_json(200, {"access_token": "local-fixture-only", "token_type": "bearer", "expires_in": 900})
        else:
            self.send_json(405, {"code": "local_fixture_read_only", "message": "Product writes are disabled in this mock"})

    def do_PUT(self) -> None:
        self.send_json(405, {"code": "local_fixture_read_only", "message": "Product writes are disabled in this mock"})

    do_PATCH = do_PUT
    do_DELETE = do_PUT

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.command} {self.path} {args[1] if len(args) > 1 else ''}", flush=True)


if __name__ == "__main__":
    print(json.dumps({
        "adapter_revision": "e070bc080a2036e07930ca7856c2dfa7b76213c3",
        "baseline_observed_at": DATA["observations"]["baseline_observed_at"],
        "completion_observed_at": DATA["observations"]["completion_observed_at"],
        "mission_rows": len(DATA["mission_list"]["items"]),
        "sources": len(DATA["sources"]["items"]),
        "jobs": len(DATA["jobs"]["jobs"]),
        "empty_item_pages": len(JOB_PAGES),
        "selected_detail_joined": DATA["mission_detail_joined"],
        "selected_trace_joined": DATA["mission_trace_joined"],
    }, ensure_ascii=False), flush=True)
    HTTPServer(("127.0.0.1", 5196), Handler).serve_forever()
