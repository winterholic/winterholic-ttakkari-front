# KB v3 프론트 실연동 검증 도구

백엔드 `back-kb-v3-api`(읽기 전용)의 실제 앱을 이 Run 전용 임시 PostgreSQL 위에 띄우고, 프론트를 실제 브라우저로 붙여 본다.
공유 DB(`TTAKKARI_TEST_DB`), 운영 DB, `.env`, 운영 로그인 비밀값은 쓰지 않는다. 로그인은 백엔드 `tests/conftest.py` 가 공개한 시험용 비밀번호다.

| 파일 | 역할 |
|---|---|
| `serve_backend.py` | 임시 PG 클러스터(`/tmp/ttakkari-test-<pid>-…`) + 스키마 + 시험 계정 + 실제 FastAPI(uvicorn) + `fixtures/` 시드(실제 ingest·register API). 종료하면 클러스터가 지워진다. |
| `fixtures/` | 시드 자료. `manifest.json` 순서대로 올린다(마크다운 5, HTML 1, 버전 2개, 구형 xls=보류, 깨진 pdf·사설망 URL=실패, 중복). |
| `capture.mjs` | 같은 서버에 요청을 보내 응답을 `src/features/kb/liveFixtures/recorded.json` 으로 기록한다(토큰은 저장하지 않는다). |
| `e2e_flows.mjs` | Playwright 로 핵심 플로우 13단계를 데스크톱(1280)·모바일(390) 두 크기, Chrome 또는 WebKit 으로 돈다. |

## 실행 순서

```bash
cd front-kb-v3
# 1) 백엔드: 시드까지 끝나면 READY 한 줄을 찍는다(약 40초). 바이트코드는 만들지 않는다.
PYTHONDONTWRITEBYTECODE=1 ../back-kb-v3-api/.venv/bin/python scripts/kb-live/serve_backend.py --port 8799 --origin http://127.0.0.1:5199 --report /tmp/kb-live-report.json &
# 2) 프론트(개발 서버): 실제 백엔드로 붙인다.
TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:8799 npx vite --port 5199 --strictPort --host 127.0.0.1 &
# 3) 응답 기록(테스트용 고정 자료). 깨끗한 백엔드에서 한 번만 기록하는 것을 권한다.
node scripts/kb-live/capture.mjs --out src/features/kb/liveFixtures/recorded.json
# 4) 브라우저 E2E. PLAYWRIGHT_CORE 는 playwright-core/index.mjs 경로다(ui-sweep 과 같은 관례).
PLAYWRIGHT_CORE=<경로>/playwright-core/index.mjs node scripts/kb-live/e2e_flows.mjs --front http://127.0.0.1:5199 --out /tmp/kb-e2e [--engine webkit]
# 종료: 백엔드 프로세스에 SIGTERM(임시 클러스터 정리), vite 종료
```

## 알아 둘 것

- `e2e_flows.mjs` 는 같은 서버에 여러 번 돌려도 되게 올리는 값에 실행 시각을 섞고, 이미 해결된 충돌은 결과만 확인한다. 그래도 서버 상태(문서 수, 해결된 충돌)는 누적된다. 깨끗한 상태가 필요하면 백엔드를 다시 띄운다.
- vite 개발 서버에는 `sw.js` 가 없어 service worker 등록 오류가 난다. 앱 결함이 아니라 개발 서버 특성이라 E2E 의 콘솔 오류 집계에서 뺐다.
- 시드 환경은 L2(AI 심층 추출)가 꺼져 있어 모든 작업이 `degraded`(`l2_disabled`)로 끝난다. `ready` 와 `failed` 작업은 이 환경에서 만들어지지 않는다(단위 시험의 목업으로만 확인).
- 의미 검색은 해시 임베딩이다. 엉뚱한 질의에도 결과가 나오고 coverage 가 `weak` 로 온다. 운영 e5 모델의 검색 품질을 말해 주지 않는다.
- 백엔드를 고치지 않는다. 백엔드 쪽 문제는 `docs/work-history/2026-10-25-kb-v3-live-contract.md` 의 "백엔드에 넘길 발견"에 적었다.
