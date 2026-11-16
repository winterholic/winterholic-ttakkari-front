# Context Gateway Private UI

> ⚠️ 아래 최초 구현 기록은 기준 커밋 `e5f7fbe` 시점이다. 원본 대조를 게시 필수로 적은 내용과 인증 browser 미검증 상태는 아래 2026-11-16 추가 기록으로 갱신됐다.

## 범위와 기준

- 대상: `front-context-gateway-20261116`, 브랜치 `feat/context-gateway-20261116`.
- 목표: 인증된 Private 앱에서 프로젝트 문서를 골라 초안 작성·수정·검토·게시 승인, 1시간 키 발급·폐기, 공유 철회를 다룬다.
- 백엔드 기준은 별도 checkout의 `src/ttakkari/api/context_sharing.py`, `src/ttakkari/context_sharing/service.py`와 `docs/context-sharing-private-contract.md`다. 백엔드와 운영 설정은 수정하지 않았다.
- 프로젝트/키 응답을 포함해 테스트 서버 응답은 합성 값이다. 운영 또는 실제 backend 연동 검증은 미실행이다.

## 구현

- `/context-sharing` 인증 라우트 및 부가 기능 메뉴 진입을 추가하고, 맥락 도서관 헤더에서 공유 화면으로 갈 수 있게 했다.
- 프로젝트·출처·문서 선택은 소유자 GET API를 사용한다. 꺼진 출처, 500개 잘림, 빈 목록, 로딩·오류·재시도 및 회사(work) 범위 사전 확인을 처리한다.
- 초안 생성·목록·상세·편집·문서 제외를 계약에 맞게 연결했다. `expected_digest`가 다른 저장/승인은 재검토 안내를 하고, 원본 대조 확인 시각과 게시 승인 확인은 분리했다. 문서 내용을 바꾸면 대조 확인은 풀리고, 사용자가 다시 명시적으로 확인해야 한다.
- 정규식 탐지 결과·고위험 차단·탐지 한계를 보여 준다. 게시 전 별도 확인과 저장 완료, 모든 문서 원본 대조, 위험 항목 제거를 요구한다.
- 원문 키는 발급 응답 직후 컴포넌트 메모리에서 한 번만 보여 준다. 복사 외 브라우저 저장소·URL·쿼리/뮤테이션 캐시에 저장하지 않는다. 이동/닫기 때 지운다. 발급 키는 상태만 목록에 보여 준다.
- 키 폐기와 프로젝트 공유 철회는 키보드 포커스를 가두는 기존 `Dialog`로 확인을 받고, 실패·부분 실패는 성공으로 표시하지 않는다.
- `ApiError.extra`의 계약 필드를 보존해 digest mismatch, verification_required, sensitive_content_blocked, Gateway 미설정·불가용·계약 불완전 안내에 사용한다.

## 검증

- TDD: 작업 재개 전 해당 페이지 및 API 테스트가 구현 부재로 실패했던 결과를 전달받았다(페이지 import resolve 실패, 네비게이션/도서관 진입 RED). 구현 후 관련 테스트 104개 통과(화면·API·기존 진입점 95개, 오류 안내 9개). 새 내용 편집 후 원본 대조를 다시 선택한 경우 `owner_verified: true`가 요청되는 회귀 테스트는 구현 전 실패, 수정 뒤 통과했다.
- `npx vitest run src/api/contextSharing.test.ts src/pages/ContextSharingPage.test.tsx src/pages/ContextLibraryPage.test.tsx src/shell/AppShell.test.tsx --reporter=dot` — `Test Files 4 passed`, `Tests 95 passed`.
- `npx vitest run src/features/context-sharing/errors.test.ts --reporter=dot` — `Tests 9 passed`.
- `npm run build` — `tsc -b`, Vite production build 및 PWA precache 생성 성공.
- 변경 파일 지정 ESLint — 통과. `design-lint.py` — 2개 파일, 검출 없음.
- `npm run lint` 전체는 기존 `src/pages/creative/StoryboardCreateFlow.tsx:100`의 `react-hooks/set-state-in-effect` 오류로 실패했다. 그 파일은 범위 밖이며 수정하지 않았다. 기존 경고 2건은 `Reverse` 화면에 있었다.
- 설정된 browser MCP에서 로컬 `/context-sharing`을 열었지만 격리 브라우저에 로그인 세션이 없어 `/login?next=%2Fcontext-sharing`로 리다이렉트됐다. 화면 폭·키보드 브라우저 검증과 화면 캡처는 미실행이며, 로그아웃 페이지에서 도구 브라우저를 닫았다.

## 남은 확인

- 실제 서버에 연결해 Gateway 설정 상태, 실제 프로젝트/출처 shape, 게시와 키 발급·철회를 확인해야 한다.
- 인증 세션을 가진 브라우저에서 390px/데스크톱 및 키보드 흐름을 확인해야 한다.
- 전체 lint를 통과시키려면 별도 범위의 `StoryboardCreateFlow.tsx` lint 오류를 수정하거나 해결해야 한다.

## 2026-11-16 추가 검증 · 승인과 provenance 분리

### 변경

- 미대조 문서의 게시 차단을 프런트에서 제거했다. 게시 전에 현재 내용을 읽고 외부 공유를 승인하는 별도 체크는 계속 필수다. 미대조 문서는 `verified_at: null`로 게시될 것임을 경고하며, 원본 대조 체크는 자동으로 선택하지 않는다.
- 문서 편집은 원본 대조 체크를 해제한다. 저장 요청은 다시 대조했다고 사용자가 명시하지 않으면 `owner_verified`를 보내지 않는다.
- backend `KeyIn`에는 만료 입력이 없고 서버 TTL이 1시간으로 고정되어 있어 프런트 `KeyIssueIn`과 실제 요청에서 `ttl_seconds`를 제거했다.

### 실제 로컬 Private API 확인

- 최종 대상 backend checkout HEAD: `185ea8bdb708f8a4cdf11739b930ea9abba86c7e`. 이 SHA로 서버를 재기동해 HTTP와 browser 검증을 반복했다. 해당 checkout의 나머지 파일은 변경 중이었지만 이 시점 Private `api/context_sharing.py`·`context_sharing/service.py`에는 미검증 guard가 남아 있었다. backend는 수정하지 않았다.
- 전용 DB `test_cg_owner_26e27c56`에 합성 프로젝트·문서와 테스트 전용 인증만 만들었다. 운영 DB·개인/회사 문서는 사용하지 않았다.
- 실제 HTTP 로컬 서버(`127.0.0.1:18787`)에 테스트 전용 비밀번호로 로그인하고 프로젝트/출처/초안 생성·상세·편집·키 요청·철회 요청을 확인했다. 상태: 로그인 200, projects/sources 200, draft 201, detail/patch 200. 편집 응답은 `source_revision`, `generated_at`을 포함하고 `verified_at:null`, `verified_by:null`을 유지했다.
- 키 발급 요청에서 `ttl_seconds`를 빼면 validation을 통과해 미게시 프로젝트 오류 409를 받았다. 키/프로젝트 철회도 미게시 프로젝트라 각각 409 `project_not_published`까지 확인했다. 실제 키 발급·폐기·프로젝트 철회는 하지 않았다.
- 미검증 초안 게시 요청은 현재 backend에서 422 `verification_required`다. 실제 browser UI에서도 별도 게시 승인 후 버튼이 활성화되고 요청까지 나갔지만, 같은 응답으로 차단됐다. 즉 프런트는 요청 결정을 구현했으나 backend 게이트 제거는 이 checkout에서 아직 반영되지 않아 기준 3의 게시 계약은 미완이다. 운영 게시·Gateway 연결은 시도하지 않았다.

### 인증 browser 검증

- configured browser MCP로 로컬 프런트와 위 시험 서버를 열었다. 보호된 토큰/계정 파일을 읽지 않고 시험 DB의 테스트 전용 로그인으로 인증해 합성 프로젝트와 미대조 provenance 경고를 확인했다.
- 읽기·공유 승인 체크만 한 상태에서 게시 버튼이 활성화됨을 확인하고 실제 합성 요청을 보냈다. 응답은 위의 `422 verification_required`; 이를 성공으로 간주하지 않았다. browser는 작업 종료 후 닫았다.

### 회귀·빌드

- 새 회귀는 null provenance 안내와 원본 대조 미선택 상태에서 별도 승인 후 publish 호출을 검사한다. 구현 전 `verified_at: null` 안내 부재로 실패했고, 수정 뒤 게시 회귀와 편집 시 대조 해제 회귀가 통과했다.
- 관련 Vitest: `npm test -- --run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts` → 2 files, 62 tests passed.
- Build: `npm run build` → `tsc -b`, Vite build, PWA precache 생성 성공.
- push/merge/deploy는 하지 않았다. 최종 commit은 이 frontend checkout에서 수정한 파일만 포함한다.
- 시험 종료 후 전용 DB를 삭제했다(`pg_database` 확인 결과 0행). 임시 서버/HTTP probe 스크립트도 제거했다.

## 2026-11-16 추가 검증 · 최신 Private와 실제 Gateway 연결

### 범위와 실행 기준

- 이번 실행은 이전 `test_cg_owner_26e27c56`을 재사용하지 않고 Private `test_cg_owner_2c861cfc`, Gateway `test_cg_owner_gateway_2c861cfc`만 사용했다. 두 DB 모두 실행 전 이름·소유자·합성 전용 comment를 확인했고, Private DB에는 합성 프로젝트 1개·출처 1개·문서 2개만 준비했다. 원본 문서/운영 DB는 사용하지 않았다. DB는 삭제하지 않았다.
- owner 게시/철회와 후철회 HTTP 요청을 처리한 Private 서버의 시작 revision은 `11bbe4f5847a8f079608a29f00762ae847932f85`였다. agent MCP용으로 Private를 재시작한 뒤에는 checkout HEAD `4ad5ca30b8fc7cec547a07dbdf9c386b49b96f19`에서 실행했다. `git merge-base --is-ancestor 11bbe4f... HEAD`는 종료 코드 0으로 11bbe가 4ad5의 조상임을 확인했다. 따라서 두 서버 모두 목표 commit 이후 코드다. 초기 dirty scope는 `tests/test_context_sharing_api.py` 수정과 discovery/progress 문서 2개 미추적이었고, 최종 backend dirty scope는 미추적 문서 2개뿐이었다. backend 제품 소스는 수정하지 않았다. 프런트 시작 revision은 `43adb346b14641b6c099addff7ca02c513846ef1`이다.
- 실제 ASGI 서버는 Private `127.0.0.1:19277`, Gateway control `127.0.0.1:19279`, Gateway public 및 빌드된 public UI `127.0.0.1:19278`, owner UI `127.0.0.1:19276`에서 실행했다. health/HTML은 각 200이었다. control 첫 시작은 `ModuleNotFoundError: context_gateway`였고 `PYTHONPATH=src`로 실행 경로를 바로잡았다. Private owner UI 서버는 agent MCP probe에 사용할 합성 JWT 서명을 맞추기 위해 같은 전용 DB로 재시작했다. 두 시작 revision 사이 코드 변경은 없었다.

### owner와 public UI 실제 여정

- 인증된 합성 owner가 두 문서를 골라 초안을 만들고 미리보기했다. 원본 대조 체크는 선택하지 않았고 미검증 경고와 `verified_at: null`을 확인했다. 현재 digest 공유 승인 체크를 별도로 선택한 뒤 실제 Private API → Gateway control HTTP 게시가 성공했고, owner 화면은 게시 완료를 표시했다. 이전 `verification_required` 422는 해결 전 이력으로 남기며, 이 checkout에서는 더 이상 재현되지 않았다.
- 실제 빌드 public UI는 발급 키를 교환한 세션으로 두 문서와 검색 결과를 보여 줬다. 화면에서 문서별 source refs/revision/generated time과 `미검증` 상태를 확인했다. 세션 표시 시간은 60분이었다. 이후 owner UI에서 키 폐기 확인을 실행하고 폐기 상태를 확인했다.
- 새 두 번째 snapshot도 owner UI에서 게시했다. 뒤이어 owner UI의 프로젝트 철회 확인을 실행했으며 화면 결과는 `스냅샷 2개·키 0개를 폐기했습니다.`였고 프로젝트는 철회됨 상태로 바뀌었다. 철회 후 owner API 키 재발급은 `409`, 기존 게시 초안의 같은 slug 재게시도 `409`였다.
- owner UI의 미검증 승인·게시 및 키/프로젝트 철회 화면을 390×844와 1280×900에서 확인하고 캡처했다. public UI 캡처에는 세션 상태와 미검증 metadata가 있지만 원문 key는 없다. key 원문 1회 화면 자체는 캡처/로그/보고서에 남기지 않았다.

### 실제 호출과 MCP

- gateway 공개 UI에서 프로젝트 목록, snapshot/context, 문서 상세 및 검색을 호출했다. Gateway가 내려준 각 문서의 `verified_at`은 `null`이었고 화면도 미검증을 유지했다. `POST /api/v1/auth/exchange`는 public UI에서 성공해 60분 세션이 생겼다. 키 재사용 응답의 HTTP 401, export 형식들, Gateway의 HTTP MCP 도구 호출, 그리고 철회된 기존 세션으로 철회 후 재호출하는 상태 코드는 별도로 캡처하지 못했다.
- 실제 agent MCP 등록 도구를 호출했다. 같은 합성 Private DB를 assert한 후 실제 HTTP로 `/api/agent/context-sharing/projects` 200, `/projects/{entity_id}/sources` 200(문서 2개), `/drafts` 201(`created_by=agent`, `status=draft`)을 확인했다. 등록된 공유 도구는 프로젝트/출처/초안 조회 4개와 초안 생성 1개뿐이며 publish/key/revoke 도구는 0개였다. 외부 LLM은 호출하지 않았다.
- 첫 agent 디스패치에서 시험 서버와 MCP 합성 JWT 서명값이 달라 실제 API가 401을 반환했다. 이 오류 뒤 별도 파일·다른 DB 없이 서버를 같은 합성 서명 설정으로 다시 띄워 실제 HTTP 200/201을 확인했다. `uv run`은 uv cache 권한 오류, 시스템 `python`/`python3`는 의존성 미설치였으며 프로젝트 `.venv/bin/python`으로 성공했다.

### 미확인 및 보존

- 프로젝트 철회 후 실제 old session 토큰을 재사용해 context/document/search/export/MCP 각각의 차단 응답을 확인하지 못했다. 격리 browser의 기존 탭이 새로 열렸을 때 `about:blank`였고, 이미 영구 철회한 한 프로젝트에는 키를 다시 발급할 수 없었다. 그러므로 철회된 키/열린 세션의 Gateway 사후 차단과 키 재사용 401은 미확인이다. owner UI의 키 폐기/프로젝트 철회 상태만으로 해당 HTTP 응답을 추정하지 않는다.
- Gateway key 발급/세션/철회 전후 전체 API 행렬 중 context/document/search만 public UI에서 확인했다. export와 Gateway MCP 호출도 미실행으로 남긴다. 새 fixture를 더 만들거나 철회 상태를 되돌려 이 제약을 우회하지 않았다.
- UI 콘솔은 owner 페이지 3 errors, public 페이지 1 error를 보고했다. 원인을 조사하지 않았다. 캡처는 worker Run outbox에 저장했다.
- frontend 제품 코드는 변경하지 않았다. 이 기록만 프런트 checkout에 추가 커밋하며 push/deploy하지 않는다. 모든 시험 서버는 해당 Run이 연 실행 세션의 정상 종료 경로로 닫는다.

## 2026-11-16 후속 검증 · 공개 Gateway HTTP 경계

### 실행 기준

- 이전 섹션에서 미확인으로 남긴 공개 키 재사용, 철회 전 세션의 철회 후 차단, Gateway MCP와 export만 확인했다. 기존 철회 프로젝트는 재사용하지 않고 합성 slug `synthetic-gateway-owner-followup-2c861cfc`를 사용했다. 두 DB는 각 연결에서 `current_database()`가 지정 이름과 같은지 assert했고, 운영 DB는 사용하지 않았다.
- Gateway control/public은 backend checkout revision `4ad5ca30b8fc7cec547a07dbdf9c386b49b96f19`의 실제 HTTP 서버로 실행했다. Private owner router도 이 revision의 실제 `/api/context-sharing` 라우터를 썼다. Front UI 코드는 `43adb346b14641b6c099addff7ca02c513846ef1`이며 제품 파일 변경은 없다.
- Private 전체 앱을 시험 호스트로 띄운 첫 시도는 기동 중 오래된 시험 작업 복구가 별도 Run용 PostgreSQL `initdb`를 실행해 `shmget ... Operation not permitted`로 실패했다. initdb를 재시도하지 않고 제가 연 서버를 종료했다. 이후 Private 라우터와 owner JWT 검증을 쓰는 최소 시험 호스트로 전환했다. 로그인 경로만 합성 인증이고, 게시·키·철회는 Private 실제 router/service → 실제 Gateway control HTTP를 거쳤다.
- Private=`test_cg_owner_2c861cfc`, Gateway=`test_cg_owner_gateway_2c861cfc`. private 새 합성 프로젝트/문서 1개는 별도 source fixture로 추가했고, owner UI에서 문서를 읽은 뒤 게시 승인으로 게시했다. 원본 대조는 선택하지 않아 게시 문서의 provenance는 미검증이다.

### 공개 요청 결과

| 확인 | HTTP | 결과 |
|---|---:|---|
| owner UI에서 발급한 최종 1시간 키 첫 교환 | 200 | Gateway 읽기 세션 발급 |
| 같은 키 재교환 | 401 | 일회용 키 재사용 거부 |
| Gateway 프로젝트 목록 | 200 | 새 합성 프로젝트 1개 |
| `/mcp` `tools/list` | 200 | 도구 4개 응답 |
| `/mcp` `get_project_context` | 200 | 문맥 tool 응답 1개 |
| JSON export | 200 | 문서 1개, `verified_at: null` |
| Private 프로젝트 철회 | 200 | 같은 프로젝트와 키들을 Gateway에 철회 |
| 철회 전 발급된 Gateway 세션의 철회 후 context 요청 | 401 | 기존 세션도 거부 |

- Private 키 목록의 `ttl_seconds`는 `3600`; 교환된 세션 만료까지 확인 시점 기준 3,556초가 남았다. MCP `get_project_context`는 HTTP 200으로 응답했고, 문서별 null provenance는 JSON export 응답에서 확인했다. 키 원문과 Gateway 세션 토큰은 출력·기록하지 않았다.
- 첫 두 helper 실행은 각각 요청 전 로컬 `UnboundLocalError`, MCP 응답 이후 provenance 검사 예외로 끝났다. 각 일회성 키/세션은 재사용하지 않았고, 별도 UI 키로 최종 검증을 완료했다. 해당 프로젝트 철회가 남은 합성 키도 폐기했다.

실행 출력:

```text
current_database=test_cg_owner_2c861cfc (asserted)
current_database=test_cg_owner_gateway_2c861cfc (asserted)
http_statuses={"context_after_revoke": 401, "exchange_first": 200, "exchange_reuse": 401, "export_json": 200, "mcp_get_project_context": 200, "mcp_tools_list": 200, "owner_login": 200, "owner_revoke": 200, "private_keys": 200, "private_projects": 200, "public_projects": 200}
owner_key_ttl_seconds=3600; session_expiry_remaining_seconds=3556; export_document_verified_at=[null]
```

- 세 UI 발급 화면의 자동 snapshot 파일은 raw key를 담을 수 있어 검증 직후 삭제했고, 세 파일 모두 부재를 확인했다. 브라우저는 닫았다. control/public/Private 서버는 정상 종료했다. 제품 코드·push·배포 변경은 없다.

## 2026-11-16 추가 구현 · 사이트 운영 콘솔

### 범위와 결정

- 사용자의 제품 의도에 맞춰 `/context-sharing` 첫 화면을 외부 사이트 상태·임시 닫기/재개·접근 키 발급과 목록 중심으로 재구성했다. 기존 프로젝트 문서 선택·미리보기·승인·공유 철회는 접을 수 있는 보조 상세로 유지했다.
- 운영 콘솔 안내문에 “이 프로젝트 맥락 공유해 줘”, “키 발급해 줘” 요청을 대화에서 따까리에게 맡길 수 있음을 적었다. 자연어 게시·키 도구는 별도 후속 단위라 이번 구현에서 동작한다고 주장하지 않는다.
- 새 owner API `GET /api/context-sharing/site` 및 `PATCH /api/context-sharing/site` body `{ enabled: boolean }` 연결과 확장 응답 필드 수용을 추가했다. 기존 `/status` 설정 진단을 실제 사이트 운영 상태와 분리했다. 키 API 계약은 기존 목록/발급/폐기 함수를 그대로 쓴다.
- 조회 실패는 별도의 오류·재시도를 제공하고 운영 상태를 추측하지 않는다. 변경 중에는 버튼을 잠그고 진행을 표시한다. 서버 응답 전 상태를 낙관 변경하지 않으며 실패 시 성공 안내를 띄우지 않는다.
- 닫기 확인에 열린 세션을 포함한 외부 조회 중단, 키·프로젝트 공유와 별개임, 재개 후 게시 데이터와 키별 원래 만료 시각 보존을 설명한다.

### 관찰·검증

- configured browser에서 기존 운영 `/context-sharing`은 `/login?next=%2Fcontext-sharing`로 리다이렉트됐다. 격리 브라우저에는 로그인 세션이 없어 실제 기존 페이지 렌더의 영역 점유를 직접 확인하지 못했다. 코드에서는 첫 화면이 프로젝트 문서 선택·출처 목록·체크박스·초안 입력·초안 목록이고, 게시 승인·키 관리가 프로젝트 선택 후 나타남을 확인했다. 인증은 시도하거나 우회하지 않았다.
- 운영 호출 대신 로컬 Vite와 fetch 합성 응답을 쓰는 임시 visual harness로 configured browser 확인 후 harness 파일을 삭제했다. 390×844 및 1280×900에서 운영 동선, 닫기 확인·닫힘·재개, 키 발급/원문 닫기·키 폐기 상태를 확인하고 browser와 Vite를 닫았다.
- 캡처(합성 데이터): 390px `/Volumes/Backup/ttakkari-data/outbox/d043b407-901c-49cc-8a60-3d94c2134728/browser/page-2026-11-16T07-01-29-532Z.png`; 1280px `/Volumes/Backup/ttakkari-data/outbox/d043b407-901c-49cc-8a60-3d94c2134728/browser/page-2026-11-16T07-01-43-909Z.png`.
- TDD RED에서 새 사이트 API/운영 화면 부재를 확인(신규 7개 실패, 기존 관련 62개 통과). 최종 `pnpm exec vitest run src/api/contextSharing.test.ts src/pages/ContextSharingPage.test.tsx --reporter=dot` 결과 `Test Files 2 passed`, `Tests 69 passed`.
- 변경 TS/TSX ESLint는 통과했다. 전체 `node scripts/ui-lint.mjs`는 이번 `context-sharing.css` 항목 없이 기존 범위 밖 `src/features/chat/thread.css`, `src/pages/creative/creativePlan.css`, `src/pages/reverse.css` 위반으로 실패했다. 최종 `pnpm build`는 `tsc -b`, Vite production build 및 PWA precache 생성을 통과했다.
- 미검증: 인증된 Private 실제 UI 브라우저, backend 실제 구현·응답 shape 연동, 운영 site PATCH, 운영 키 발급·폐기. 합성 브라우저의 1회성 synthetic-only-key만 사용했다.
- 이번 단위는 frontend 소유 변경 커밋까지이며 push·운영 배포는 하지 않는다.

## 2026-11-16 후속 · 운영 콘솔 실제 API 독립 검증 시도

### 소스 대조

- frontend 대상 revision은 `90b2ba0` (`feat/context-sharing: add site operations console`)이다. `src/api/contextSharing.ts`는 owner 경로 `GET/PATCH /api/context-sharing/site`를 호출하고 PATCH body는 `{ enabled: boolean }`이다. `ShareSiteStatus`는 `enabled`, `public_url` 및 추가 필드를 허용한다. 페이지는 서버 성공 응답 뒤 query cache를 갱신하고 성공 문구를 표시한다. 키 목록·발급·폐기는 기존 owner API 함수를 재사용한다.
- backend 기준 HEAD는 `4aea5321538a20be3cc87d118970232ef80f6d3c`이며, 시험 시작 시 같은 checkout에 다른 작업자의 미커밋 수정이 있었다(`docs/context-sharing-private-contract.md`, work-history, `src/ttakkari/api/{assistant,context_sharing}.py`, `src/ttakkari/context_sharing/service.py`, `src/ttakkari/orchestrator/{mcp_server,tool_policy}.py`, `src/ttakkari/security/gate.py`, 관련 context sharing/orchestrator 테스트들). 이를 변경하지 않았다. 아래 backend 소스 shape 대조는 이 dirty working tree에 대한 정적 관찰이며, 기준 commit만의 동작 또는 실행된 API 응답으로 간주하지 않는다.
- 현재 소스에서 Private owner router는 `GET/PATCH /api/context-sharing/site`를 실제 `GatewayControl.site_status()` / `set_site_enabled()`에 연결하고 `{ enabled, public_url }`를 반환한다. 미설정은 503 `gateway_not_configured`, 연결 불가는 503 `gateway_unavailable`, 거절·잘못된 응답은 502 `gateway_rejected` / `gateway_bad_response`로 매핑한다. `HttpGatewayTransport`는 control bearer와 JSON 요청을 전송하고 redirect를 따르지 않는다. Gateway adapter는 boolean 응답을 검사하며 PATCH 응답 enabled가 요청값과 일치해야 성공 처리한다. 이는 코드 대조일 뿐 HTTP/auth/error 동작은 미검증이다.

### 격리 시험 준비와 차단

- 운영 설정·키·게시 데이터에는 접근하지 않았다. Private 전체 앱 lifespan은 실행하지 않는 최소 호스트 스크립트 `/private/tmp/context_site_host.py`를 구성했다. 이 호스트는 실제 owner/auth router만 마운트하고, 합성 Credential·프로젝트·문서, 별도 Gateway DB, Gateway 실제 control/public 앱, 실제 Private→Gateway HTTP 경로만 준비하도록 했다. 서버 기동 및 브라우저 검증 전 실패했으므로 스크립트는 검증에 사용되지 않았으며 현재 시험 서버는 없다.
- 실행 명령: backend checkout에서 `.venv/bin/python /private/tmp/context_site_host.py`. 첫 시도는 상속된 `TTAKKARI_TEST_DB`가 명시 외부 DB 모드로 들어가 `PG_CLUSTER`가 없는 사전 조건 오류(`AttributeError`)로 종료됐다. 해당 DB에는 연결하거나 쓰지 않았다. 스크립트에서 그 값을 제거해 프로세스 소유 임시 클러스터를 사용하도록 바꾼 다음 실행했다.
- 재실행은 Codex 명령 샌드박스의 PostgreSQL `initdb` 단계에서 실패했다. 실제 stderr: `FATAL: could not create shared memory segment: Operation not permitted`; `DETAIL: Failed system call was shmget(...)`. 환경 probe는 `spawn_process=available`, `network_loopback=available`이었으나 이 IPC 차단을 해소하지 않는다. 차단 확인 후 같은 IPC/DB 시작을 다른 명령·엔진으로 우회하지 않았다. 해당 환경이 Mac Studio 전체를 대표한다고 추정하지 않는다.

### 완료 기준별 결과

1. **실제 API 계약 대조:** 위 소스 수준 계약만 확인했다. GET/PATCH HTTP 상태·실제 auth 및 오류 응답 대조는 하지 않음 — 최소 서버가 DB 준비 단계에서 기동하지 못함.
2. **owner router→실제 Gateway control/public 및 화면 흐름:** 하지 않음 — 격리 PostgreSQL 생성이 `initdb`/`shmget`에서 차단되어 서버·fixture가 시작되지 않음. 사이트 조회·닫기·닫힘 확인·재개와 기존 public 세션 503/재개 후 데이터 조회 결과 없음.
3. **키 UI/API:** 하지 않음 — 실제 Gateway 키 목록·1시간 발급·폐기 API/UI 요청 없음. raw key와 세션 원문을 캡처하거나 로그에 남긴 것은 없음.
4. **390px·1280px configured browser:** 하지 않음 — 접근 가능한 시험 페이지가 준비되지 않아 browser를 시작하지 않음. 기존 운영 로그인 리다이렉트 관찰 한계는 위 이전 기록 그대로 유지.
5. **work-history:** 이 절에 frontend/backend revision, backend dirty 범위, 격리 호스트 설계, 정확한 명령과 관찰 오류 및 미검증 범위를 기록했다.

실행 출력 요약:

```text
.venv/bin/python /private/tmp/context_site_host.py
initdb: FATAL could not create shared memory segment: Operation not permitted
DETAIL: Failed system call was shmget(...); Private/Gateway/Vite servers started: 0; HTTP/UI checks: not run
```

- 제품 코드·운영 backend/frontend 설정·DB·키·게시 데이터는 수정하지 않았다. backend 작업자의 dirty 파일은 보존했다. 브라우저 시작 전 단계에서 중단했으므로 닫을 브라우저/서버가 없다. 남은 실제 API·UI 검증은 `initdb`가 허용되는 격리 실행 환경에서만 가능하다.

## 2026-11-16 후속 · 기존 PostgreSQL 격리 DB로 실제 연동 검증

### 실행 환경과 격리

- 앞선 `initdb/shmget` 경로는 다시 시도하지 않았다. 기존 local PostgreSQL `127.0.0.1:5432`의 `postgres` maintenance DB에서 먼저 고유 이름 부재를 확인한 뒤 아래 DB 두 개만 만들었다. `test_cg_metadata_29d22061`, `ttakkari` 및 다른 DB에는 접속하지 않았다.

```text
psql postgresql://winterholic@127.0.0.1:5432/postgres ... SELECT current_database() || ':' || current_user
postgres:winterholic
CREATE DATABASE test_cg_site_ui_private_20261116 -> CREATE DATABASE
CREATE DATABASE test_cg_site_ui_gateway_20261116 -> CREATE DATABASE
```

- Private host 실행 전에 `TTAKKARI_TEST_DB=postgresql+asyncpg://winterholic@127.0.0.1:5432/test_cg_site_ui_private_20261116`, `TTAKKARI_DATABASE_URL` 동일 URL, `TTAKKARI_NO_ENV_FILE=1`을 설정했다. Gateway 쪽은 `CONTEXT_GATEWAY_TEST_DATABASE_URL`과 `CONTEXT_GATEWAY_DATABASE_URL`을 모두 `test_cg_site_ui_gateway_20261116` URL로 설정했다. helper import 후 `conftest.TEST_DB == PRIVATE_URL`, `PG_CLUSTER` 부재를 assert했다. 두 엔진에서도 `SELECT current_database()` 결과를 각각 고유 DB명과 assert했다.
- 프론트 revision은 `90b2ba024cad023eda75ef26b65ee86ee007fe0a`. Private/Gateway 서버 프로세스는 2026-11-16 16:24 KST에 시작됐고 둘 다 코드 checkout HEAD `85cc587faa8ffe2f114796f7efe7668942b26374`에서 로드됐다. Git reflog에서 그 다음 `e85517ea` 커밋 시각은 16:24:37 KST였고 서버 시작 시각 뒤였다. Uvicorn reload는 켜지 않았다. 시작 직후 관측한 checkout dirty 범위는 `context_gateway/tests/test_rest_mcp_parity.py`, `docs/context-sharing-private-contract.md`, `docs/work-history/2026-11-16-context-gateway-progress.md`, `scripts/platform_v2_inventory.py`, `src/ttakkari/api/{assistant,context_sharing}.py`, `src/ttakkari/context_sharing/service.py`, `src/ttakkari/orchestrator/{mcp_server,tool_policy}.py`, `src/ttakkari/security/gate.py`, `tests/{test_context_sharing_api,test_context_sharing_mcp,test_context_sharing_real_gateway,test_orchestrator,test_route_inventory}.py`, `unit_tests/test_platform_v2_inventory.py`였다. Private `context_sharing.py`와 `service.py` 및 일부 기록/시험은 staged와 working diff가 함께 있었다. 이 파일들을 수정하거나 되돌리지 않았다.
- helper는 실제 owner/auth router만 가진 최소 Private host `127.0.0.1:19277`, Gateway control `:19279`, Gateway public `:19278`을 띄웠다. 실제 `HttpGatewayTransport`가 Private에서 control HTTP로 연결했다. 브라우저용 Vite는 `127.0.0.1:19276`; isolated browser는 API loopback 포트에 직접 연결할 수 없어 same-origin `VITE_API_BASE=/`와 Vite `/api` proxy target `http://127.0.0.1:19277`을 썼다. Private 전체 앱 lifespan은 시작하지 않았다.
- synthetic owner 로그인·합성 프로젝트/문서·게시 snapshot·1시간 seed key·기존 public session을 준비했다. 로그에는 raw key/session 값을 출력하지 않도록 helper/probe를 구성했다. Public session 만료는 DB에서 credential hash로 조회해 전후 값을 비교했다.

### 실제 응답과 브라우저 경로

- Fixture setup HTTP: Private login `200`, draft `201`, owner verify `200`, publish `200`; 실제 Gateway control snapshot `201`; Private key 발급 `201`; public key exchange `200`; 시작 public site `200 enabled=true`; context `200`. setup 시 public snapshot ID와 세션 만료 시각을 기준값으로 보관했다.
- 실제 브라우저 UI에서 site `GET 200`, close `PATCH 200`, resume `PATCH 200`, key list `GET 200`, UI 키 발급 `POST 201`, 키 목록 재조회 `GET 200`, UI 키 폐기 `POST 200`, 폐기 뒤 재조회 `GET 200`을 확인했다. UI 원문 키는 발급 직후 닫았다. one-time key를 포함할 수 있는 browser 자동 accessibility snapshot 한 파일은 공유 전에 즉시 삭제했다. 공유한 최종 이미지는 둘 다 raw key/session을 포함하지 않는다.
- 브라우저와 별도 API probe 결과:

```text
owner unauth GET /api/context-sharing/site -> 401, WWW-Authenticate: Bearer
owner JWT GET /api/context-sharing/site -> 200 {enabled: true, public_url: "http://127.0.0.1:19278"}
closed: public GET /api/v1/site -> 200 enabled=false; prior session GET context -> 503 Retry-After: 60
resumed: public GET /api/v1/site -> 200 enabled=true; same session GET context -> 200, same snapshot=true
session_expiry_unchanged=true; list keys -> 200, ttl_seconds=3600; UI-issued key after revoke -> status=revoked
```

- 390×844 browser snapshot에서 `외부 공유 일시 중단`, 안내, `사이트 다시 열기`, 접근 키 입력 영역이 보였고 프로젝트 문서 상세는 하단 접힘 보조 영역이었다. 1280×900에서는 사이트 상태와 키 발급/목록이 첫 화면 중심이며 문서 승인 상세가 접혀 있었다. 최종 이미지: [390px 닫힘 화면](/Volumes/Backup/ttakkari-data/outbox/58dee2f2-bc22-486d-8139-d301a291ba86/browser/page-2026-11-16T07-28-08-750Z.png), [1280px 재개·키 폐기 화면](/Volumes/Backup/ttakkari-data/outbox/58dee2f2-bc22-486d-8139-d301a291ba86/browser/page-2026-11-16T07-30-35-298Z.png). 두 파일은 `share_file`했다.
- 두 이전 화면의 browser `Console`은 합성 minimal host에 포함하지 않은 `/api/health`, `/api/tasks/active`의 404와 Vite 개발환경 `/sw.js`의 HTML MIME 오류를 기록했다. 운영 콘솔의 site/key endpoint 실패가 아니라 최소 host 바깥 shell API 및 개발 SW 경로이므로 연동 판정에 쓰지 않았다. 이후 same-origin Vite proxy로 전환한 뒤 실제 대상 API들은 위 상태 코드로 완료됐다. 원인은 이 격리 구성에서 해당 경로를 제공하지 않은 데 있다고 판단한다.

### 정리와 잔여 항목

- Configured browser를 닫았고 추가로 열렸던 public 탭도 닫았다. 제가 연 Vite/Private/Gateway 포트 `19276`, `19277`, `19278`, `19279`의 loopback connect 확인은 모두 `closed`였다.
- 두 DB의 URL별 `SELECT current_database()`가 지정 이름과 일치하는 것을 확인한 후 `DROP DATABASE test_cg_site_ui_private_20261116` 및 `DROP DATABASE test_cg_site_ui_gateway_20261116` 모두 성공했다. 직후 maintenance DB에서 두 이름 조회 결과 0행이었다.
- Gateway가 만든 합성 snapshot 파일 2개(`.../documents/brief.md`, `.../manifest.json`)는 읽기 전용 디렉터리 권한으로 정리가 거부됐다. `brief.md` unlink는 `PermissionError: [Errno 13] Permission denied`, 두 파일의 `apply_patch Delete File`도 각각 `Failed to delete file`로 끝났다. 이 오류 뒤 같은 경로에 권한 변경이나 다른 방식으로 우회하지 않았다. 두 파일은 synthetic-only 문장/manifest이며 key/session 원문은 없다. Gateway DB와 해당 게시 데이터는 이미 삭제했고, read-only 파일 정리는 미완료로 남긴다.
- 기존 69개 unit test·build·원격 코드 확인은 재실행하지 않았다. 운영 endpoint·운영 설정/DB/key, 다른 작업자의 DB/process/파일은 사용하지 않았다.
