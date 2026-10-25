"""KB v3 프론트 실연동 검증용 전용 백엔드. 프론트 저장소에서 백엔드 소스를 읽기만 하고 백엔드 파일은 건드리지 않는다.

하는 일
1. 백엔드 tests/pg_sandbox.py 로 이 프로세스 전용 임시 PostgreSQL 클러스터(/tmp/ttakkari-test-<pid>-…)를 띄운다. 공유 DB(TTAKKARI_TEST_DB)와 운영 DB 는 쓰지 않는다.
2. 스키마를 만들고 테스트 계정(백엔드 conftest 의 공개 테스트 비밀번호)을 넣은 뒤 실제 FastAPI 앱을 uvicorn 으로 띄운다.
3. fixtures/ 의 자료를 실제 POST /api/assistant/kb/ingest 로 올리고, 앱의 백그라운드 파이프라인 워커가 처리를 끝낼 때까지 기다린다(L2 모델은 꺼져 있어 추출 단계는 degraded 가 정상이다).
4. 준비되면 한 줄 READY 를 찍고 종료 신호를 받을 때까지 서버를 유지한다. 종료하면 임시 클러스터는 지워진다.

사용(백엔드 가상환경 파이썬으로 실행한다. 바이트코드는 만들지 않는다):
  PYTHONDONTWRITEBYTECODE=1 ../back-kb-v3-api/.venv/bin/python scripts/kb-live/serve_backend.py --port 8799 --origin http://127.0.0.1:5199

사용하지 않는 것: 운영 로그인 비밀값, .env, 공유 DB, 외부 네트워크 모델. 로그인은 conftest 가 공개한 시험용 비밀번호를 쓴다.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import signal
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRONT = HERE.parents[1]
BACK = Path(os.environ.get("TTAKKARI_BACK", FRONT.parent / "back-kb-v3-api")).resolve()
sys.path[:0] = [str(BACK / "src"), str(BACK / "tests")]
sys.dont_write_bytecode = True

# backend tests/conftest.py 의 PASSWORD. 시험 전용 공개 값이고 운영 자격증명이 아니다.
TEST_PASSWORD = "correct-horse-battery"


def configure_env(db_url: str, origin: str, base: Path) -> None:
    home, allowed = base / "home", base / "allowed"
    for d in (home, allowed, allowed / "default-root", allowed / "default-docs", allowed / "games"):
        d.mkdir(parents=True, exist_ok=True)
    os.environ.update({
        "TTAKKARI_NO_ENV_FILE": "1",
        "TTAKKARI_ENV": "dev",
        "TTAKKARI_DATABASE_URL": db_url,
        "TTAKKARI_TEST_DB": db_url,
        "TTAKKARI_TEST_RUNNER": "1",
        "TTAKKARI_HOME": str(home),
        "TTAKKARI_ALLOWED_ROOTS": json.dumps([str(allowed)]),
        "TTAKKARI_DEFAULT_WORKSPACE_ROOT": str(allowed / "default-root"),
        "TTAKKARI_GAMES_ROOT": str(allowed / "games"),
        "TTAKKARI_GAME_AUTO_BUILD": "false",
        "TTAKKARI_REMINDER_SCAN_SECONDS": "0",
        "TTAKKARI_COLLECTOR_CONTROL_ENABLED": "false",
        # 해시 임베딩으로 의미 검색 경로까지 실제 pgvector 행으로 돌린다. 모델 서버는 부르지 않는다.
        "TTAKKARI_KB_SEMANTIC_ENABLED": "true",
        "TTAKKARI_CONTEXT_EMBEDDER": "hash",
        "TTAKKARI_KB_L2_ADAPTER": "disabled",
        "TTAKKARI_USAGE_POLL_SECONDS": "0",
        "TTAKKARI_QWEN_FLASH_POLL_SECONDS": "0",
        "TTAKKARI_RESOURCE_SAMPLE_SECONDS": "0",
        "TTAKKARI_LEAD_ARCHIVE_SCAN_SECONDS": "0",
        "TTAKKARI_OPS_LOG_SYNC_SECONDS": "0",
        "TTAKKARI_CLOVANOTE_POLL_SECONDS": "0",
        "TTAKKARI_LOCAL_STT_MODEL_PATH": str(allowed / "missing-test-model"),
        "TTAKKARI_CONTEXT_SOURCE_ROOTS": json.dumps([str(allowed)]),
        "TTAKKARI_DEFAULT_WRITABLE_ROOTS": json.dumps([str(allowed / "default-docs")]),
        "TTAKKARI_JWT_SECRET": "test-secret-test-secret-test-secret-0123456789",
        "TTAKKARI_ANTIGRAVITY_MODEL_PROBE": "false",
        "TTAKKARI_DESK_WARM_POOL": "false",
        "TTAKKARI_DESK_QWEN_ENABLED": "false",
        "TTAKKARI_CORS_ORIGINS": json.dumps([origin]),
    })


async def create_schema(db_url: str) -> None:
    from argon2 import PasswordHasher
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    import ttakkari.main  # noqa: F401  모든 모델 모듈(collector 의 kb_document_access 포함)을 먼저 불러와야 create_all 이 전부 만든다
    from ttakkari.models import Base, Credential
    from ttakkari.security import passwords
    from ttakkari.security.passwords import hash_password

    passwords._hasher = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)  # 시험 프로세스 안에서만 비용을 낮춘다
    eng = create_async_engine(db_url)
    async with eng.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.create_all)
    await eng.dispose()
    from ttakkari.db import sessionmaker

    async with sessionmaker()() as db:
        db.add(Credential(id=1, password_hash=hash_password(TEST_PASSWORD)))
        await db.commit()


async def seed(base_url: str, fixtures: Path, wait_seconds: float) -> dict:
    """fixtures/manifest.json 의 순서대로 실제 ingest API 에 올린다. 결과(항목 상태)와 처리 상태를 돌려준다."""
    import httpx

    manifest = json.loads((fixtures / "manifest.json").read_text())
    async with httpx.AsyncClient(base_url=base_url, timeout=60) as c:
        r = await c.post("/api/auth/login", json={"password": TEST_PASSWORD})
        r.raise_for_status()
        auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
        outcomes = []
        for step in manifest["steps"]:
            if "register" in step:
                reg = step["register"]
                body = {"title": reg["title"], "source_key": reg["source_key"], "lang": reg.get("lang"), "text": (fixtures / reg["text_path"]).read_text()}
                resp = await c.post("/api/assistant/kb/documents", headers=auth, json=body)
                outcomes.append({"step": step["id"], "http": resp.status_code, "body": resp.json()})
                await wait_idle(c, auth, wait_seconds)
                continue
            files = [("files[]", (f["name"], (fixtures / f["path"]).read_bytes(), f.get("type", "application/octet-stream"))) for f in step.get("files", [])]
            data = {k: v for k, v in step.items() if k in ("text", "title", "domain", "source_kind")}
            if step.get("urls"):
                data["urls[]"] = step["urls"]
            resp = await c.post("/api/assistant/kb/ingest", headers=auth, data=data, files=files or None) if files or "urls[]" in data \
                else await c.post("/api/assistant/kb/ingest", headers=auth, json=data)
            outcomes.append({"step": step["id"], "http": resp.status_code, "body": resp.json()})
            if step.get("settle", True):
                await wait_idle(c, auth, wait_seconds)
        await wait_idle(c, auth, wait_seconds)
        jobs = (await c.get("/api/assistant/kb/jobs", headers=auth, params={"limit": 100})).json()
        return {"outcomes": outcomes, "jobs": {j["document_title"]: j["status"] for j in jobs["items"]}}


async def wait_idle(c, auth: dict, wait_seconds: float) -> None:
    deadline = time.monotonic() + wait_seconds
    while time.monotonic() < deadline:
        r = await c.get("/api/assistant/kb/jobs", headers=auth, params={"status": "active", "limit": 1})
        if r.status_code == 200 and r.json()["total"] == 0:
            return
        await asyncio.sleep(0.5)
    raise TimeoutError("pipeline jobs did not settle")


async def main(args: argparse.Namespace) -> None:
    import pg_sandbox

    cluster = pg_sandbox.start_cluster()
    pg_sandbox.use_cluster_env(cluster)
    pg_sandbox.patch_asyncpg_for_cluster(cluster)
    db_url = cluster.create_database("ttakkari_kb_live")
    base = Path(tempfile.mkdtemp(prefix="ttk-kb-live-")).resolve()
    try:
        configure_env(db_url, args.origin, base)
        from ttakkari.config import get_settings

        get_settings.cache_clear()
        assert str(get_settings().database_url) == db_url
        await create_schema(db_url)

        import uvicorn

        from ttakkari.main import app

        server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=args.port, log_level="warning", lifespan="on"))
        serving = asyncio.create_task(server.serve())
        for _ in range(100):
            if server.started:
                break
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("backend did not start")
        report = {"base_url": f"http://127.0.0.1:{args.port}", "test_password": "backend tests/conftest.py PASSWORD (public test value)"}
        if not args.no_seed:
            report["seed"] = await seed(report["base_url"], HERE / "fixtures", args.wait)
        if args.report:
            Path(args.report).write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print("READY", report["base_url"], flush=True)
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, stop.set)
        await stop.wait()
        server.should_exit = True
        await serving
    finally:
        shutil.rmtree(base, ignore_errors=True)
        cluster.stop()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8799)
    ap.add_argument("--origin", default="http://127.0.0.1:5199", help="CORS 로 허용할 프론트 주소")
    ap.add_argument("--wait", type=float, default=120.0, help="파이프라인 처리 대기 상한(초)")
    ap.add_argument("--no-seed", action="store_true")
    ap.add_argument("--report", help="시드 결과를 JSON 으로 저장할 경로")
    asyncio.run(main(ap.parse_args()))
