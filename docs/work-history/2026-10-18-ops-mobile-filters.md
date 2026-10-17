# 로그·이슈 모바일 필터 넘침 수정 (2026-10-18 KST)

- 사용자: 첨부 iPhone 화면에서 엔진 라우팅 필터가 좌우 본문 여백을 벗어나는 현상 수정 요청. Sentry의 방법·소스 참고 수준도 질문.
- origin/main 1699388에서 독립 worktree `front-ops-filter-mobile`를 만들었다. canonical front의 다른 작업 미커밋 변경·로컬 분기는 변경하지 않았다.
- `.ops-pills`가 `flex:none`으로 자연 폭을 유지하면서 부모 폭 제한이 없어 390px 화면의 본문 358px보다 14px 넓었다. box-sizing:border-box, min-width:0, max-width:100%로 패딩까지 본문 폭 안에 넣고 기존 flex-wrap이 작동하게 했다.
- 검색창은 column flex 안의 flex-basis:12rem 때문에 192px 높이였다. flex:none으로 기본 입력 높이 40px를 사용한다.

## 실행 근거

- configured ttakkari_browser MCP로 실제 production build + 합성 API 화면 `/logs`를 확인했다. 실제 계정·운영 데이터·비밀값은 사용하지 않았다.
- `browser_snapshot(boxes=true)` 320px: 본문/필터 x=16, width=288, 우측=304. 390px: 본문/필터 x=16, width=358, 우측=374. 두 화면 모두 엔진 라우팅은 다음 줄에 온전히 보인다.
- 1440px: 본문 x=332,width=1056,우측=1388. 필터 우측=1388, 한 줄 표시. 검색창 높이 모두 40px.
- `browser_click` 엔진 라우팅 선택 후 `pressed` 상태 확인.
- `TTAKKARI_NO_ENV_FILE=1 node ../front/node_modules/vitest/vitest.mjs run src/pages/OpsLogsPage.test.tsx`: 6 passed.
- `TTAKKARI_NO_ENV_FILE=1 node ../front/node_modules/typescript/bin/tsc -b`: exit 0.
- `TTAKKARI_NO_ENV_FILE=1 VITE_API_BASE=http://127.0.0.1:5408 node ../front/node_modules/vite/bin/vite.js build`: exit 0. 기존 번들 500kB 경고는 남는다.
- `node scripts/ui-lint.mjs`: ui-lint ok (138, baseline 139). `git diff --check`: exit 0.
- before/after screenshots와 snapshot: `/Users/winterholic/.ttakkari/data/outbox/a058da7c-a057-4cb3-b887-654cbc49b6e7/browser/`. after `page-2026-10-17T15-06-10-200Z.png`.
- 미실행: ui-refine quick.mjs는 자체 브라우저 실행 대신 승인된 browser MCP의 bounding-box 측정을 사용했다. iOS WebKit/실기기·운영 로그인 화면은 미검증.
- Vite dev server는 파일 변경 후 기존 변환 캐시를 반환해 수정 검증에 사용하지 않았다. production build 정적 서버로 전환해 빌드 CSS와 브라우저 좌표로 확인했다. test preview의 중복 chart key는 합성 timestamp를 각각 다르게 해 없앴다. 제품 차트 데이터 오류로 판단하지 않았다.

## Sentry 참고 수준

백엔드 ADR0033은 “Sentry 코드는 이식하지 않고 개념만 … 다시 만든다”고 명시한다. grouping·regression·release·breadcrumbs·scrubbing·sampling을 차용한 것으로 기록되어 있다. 이전 작업자가 원본 소스를 어디까지 읽었는지는 현재 자료로 입증하지 못했으므로 “최선의 방법·소스를 충분히 검토해 반영했다”고 보고하지 않는다.

이번 질문에 답하며 원본 `getsentry/sentry/src/sentry/grouping/strategies/newstyle.py`와 `getsentry/sentry-python/sentry_sdk/scrubber.py`를 조회했다. 원본 그룹핑은 플랫폼별 프레임 정규화 등 다양한 규칙을 포함하며, 따까리 ADR의 타입+앱 프레임 3개 기반 단순 규칙과 동등하다고 볼 근거가 없다. 이번 수정은 프론트 CSS만이며 백엔드 정책 변경·추가 이식은 하지 않았다.
