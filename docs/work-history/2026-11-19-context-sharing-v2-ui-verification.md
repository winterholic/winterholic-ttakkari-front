# Context Sharing v2 관리 UI 독립 검증

## 범위

- 기준은 front `f6dfe5b` 및 backend `978cb5ac` 위의 기존 미커밋 작업 상태다. 제품 코드와 기존 테스트는 읽기 전용으로 두고, front의 `scripts/context-sharing-v2-ui-integration/`, 신규 `ShareLinkAcceptance.test.tsx`, 이 기록과 backend에 허용된 `scripts/context_sharing_v2_ui_fixture.py`만 추가했다.
- DB는 `test_cg_v2_ui_verify_20261119` 하나만 `127.0.0.1:5432`에 만들고 사용했다. Private 및 Gateway fixture가 동일 DB를 사용한다. 문서·프로젝트·인증은 모두 합성 데이터다.
- 실제 Private context-sharing 라우터/서비스와 실제 Gateway control/public ASGI 앱을 호출했다. 브라우저 껍데기의 `/api/auth/refresh`, `/api/auth/me`, `/api/health`만 합성 응답이며 `/api/context-sharing/*`, Gateway REST/auth/share 요청은 stub으로 대체하지 않았다.

## 완료 기준별 결과

1. **실제 관리 라우트 모바일·데스크톱 관찰:** configured `ttakkari_browser`에서 `/context-sharing?project=<합성 entity>`를 390×844 및 1280px로 열었다. 390px에서 본문 x=12, 너비 366(오른쪽 378), 주요 입력/버튼 x=25, 너비 340로 가로 넘침 없이 표시됐다. 발급 입력, 옵션, 주요 버튼, 발급 원문과 연결 예시 및 상태를 확인했다. 복사 후 캡처에는 원문이 남지 않았다. 문서 높이는 약 1491px.
2. **Private/Gateway 연동 발급·복사·폐기:** 브라우저에서 실제 API를 통해 기본 3일 링크와 재사용 키를 발급하고 복사 후 원문이 제거되는 것을 확인했다. 목록에는 상태·만료·scope 등 metadata만 남고 발급 원문은 없다. 두 종류 모두 화면에서 폐기했고 상태가 `폐기됨`으로 바뀌었다. 발급된 키의 `connect.project_id`가 실제 Gateway project UUID와 일치하고 연결 예시에 사용되는 것도 확인했다.
3. **실제 Gateway REST와 폐기 효력:** 합성 키로 `/api/v1/projects/{project_id}/context`를 3회 호출해 모두 200을 받았고 합성 문서 본문을 확인했다. 키 교환으로 만든 기존 세션과 원래 키 모두 키 폐기 후 REST에서 401이었다. 실제 링크 교환/컨텍스트 조회도 200이었고 링크 폐기 후 기존 공유 세션은 401이었다. 목록 응답에 키나 링크의 원문이 재노출되지 않았다.
4. **기존 edge 테스트 검토 및 누락 보강:** 기존 95 집중 테스트에서 키 중복 클릭, 발급 중 라우트 왕복 후 늦은 응답 차단, 링크 패널 unmount 이후 늦은 응답 차단, 키·링크 `revoking`, 사용 기록 `unavailable` 표현을 확인했다. 링크 중복 발급과 키·링크 각각의 클립보드 실패 뒤 원문 제거가 없어 신규 수락 테스트 3개를 추가했다. 이들은 링크 중복 발급 요청 억제, clipboard reject 후 키와 링크 원문/연결 공개 제거, 사용자 오류 표시를 확인한다.
5. **빌드·테스트·브라우저·정리:** 아래 실행 증거 참조. 브라우저 요청/콘솔을 관찰한 뒤 브라우저를 닫고 Vite 및 합성 API 서버를 중지했다. 전용 DB를 정리했다.

## 실행 증거

- 신규 edge 수락 테스트: `pnpm exec vitest run src/features/context-sharing/ShareLinkAcceptance.test.tsx --reporter=dot` → `Test Files 1 passed (1)`, `Tests 2 passed (2)`.
- 기존 집중 회귀: `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts src/features/context-sharing/errors.test.ts --reporter=dot` → `Test Files 3 passed (3)`, `Tests 95 passed (95)`.
- 전체 집중 회귀: `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts src/features/context-sharing/errors.test.ts src/features/context-sharing/ShareLinkAcceptance.test.tsx src/features/context-sharing/ApiKeyClipboardAcceptance.test.tsx --reporter=dot` → `Test Files 5 passed (5)`, `Tests 98 passed (98)`.
- 빌드: `pnpm build` → `tsc -b && vite build` 성공, Vite `3138 modules transformed`, PWA 산출 완료.
- 실제 Private/Gateway acceptance: `TTAKKARI_TEST_DB=postgresql+asyncpg://winterholic@127.0.0.1:5432/test_cg_v2_ui_verify_20261119 uv run --project . pytest scripts/context_sharing_v2_ui_fixture.py -q` (backend 저장소, disposable uv env/cache) → `1 passed in 3.08s`.
- diff whitespace: 각 front/backend 저장소에서 `git diff --check` → 출력 없음, exit 0.
- 브라우저 Network에서 Private의 links/keys 생성 POST 201, 목록 GET 200, 두 revoke POST 200을 확인했다. 프로젝트/인증 shell 요청도 성공했다. API/CORS 요청 실패는 수정 후 남지 않았다.
- 브라우저 콘솔 오류 2건은 Vite 개발 서버가 존재하지 않는 `/sw.js` 경로에 HTML을 반환해 service worker MIME 등록이 거부된 메시지였다. 관리 라우트·API 상호작용은 계속 동작했다. 서비스 worker 동작 자체는 확인하지 않았다.
- 브라우저 fixture 시작 시 테스트 프로젝트 인덱서가 합성 가상 경로를 열 수 없어 `FileNotFoundError`를 한 번 남겼다. Private 발급·Gateway 요청은 정상 완료했고 해당 인덱서는 이번 관리 여정의 API 경로가 아니다.
- 증거 이미지(브라우저 자동 outbox): 데스크톱 `browser/page-2026-11-19T10-17-22-131Z.png`, 모바일 전체 페이지 `browser/page-2026-11-19T10-17-33-843Z.png`. 발급 원문이 보이지 않는 캡처만 보관한다.

## 제한 및 범위 밖

- auth/session shell과 건강 확인만 합성 처리했다. 실제 사용자/운영 인증, 문서 또는 운영 API는 사용하지 않았다.
- 공개 Reader UI는 다른 작업 단위가 구현 중이므로 수정하지 않았고 브라우저 검증도 하지 않았다.
- 216f3ccb Private ASGI/CLI 검수와 1ec1cc4b 코어 보안 검수의 전체 회귀를 중복 수행하지 않았다.
- push, 배포, 서비스 재시작, 외부 게시 및 공개 활성화는 하지 않았다.
