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
