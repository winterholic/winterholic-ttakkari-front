# Context Sharing v2 관리 UI 프로젝트 중심 리팩토링

## 범위

- 기준: 현재 front `src/api/contextSharing.ts` / `contextSharingTypes.ts` 계약.
- `/context-sharing` 기본 화면을 프로젝트 목록으로 바꾸고, `?project`/`?draft` 상세 및 기존 게시·키·site 기능을 보존한다.
- backend/Gateway 계약, API types, 운영 문서/자격증명, 공개 게시, push/deploy는 이 단계에서 건드리지 않는다.

## 변경

- `src/pages/ContextSharingPage.tsx`: 프로젝트 목록/상세/게시/프로젝트 API Key UI를 조립한다. site 전체 운영과 전역 키 콘솔은 접힘 영역에 둔다.
- `src/features/context-sharing/ProjectListView.tsx`: 이름·범위·프로젝트 문서 수·게시 상태·활성 snapshot ID·활성 키 수·게시 시각 및 로딩/빈/오류 상태를 보여 준다. `publication.published_at`만 사용하고, status active인 경우에만 snapshot ID를 현재 snapshot으로 표시한다.
- `src/features/context-sharing/ProjectDetailView.tsx`: 현재 맥락, snapshot ID, 프로젝트 문서 수, 활성 키 수, 게시 시각과 목록 내비게이션.
- `src/features/context-sharing/PublicationFlow.tsx`: 기존 문서 선택 → 초안 편집 → 검토 → digest 승인 → 게시 흐름의 경계.
- `src/features/context-sharing/ProjectApiKeyPanel.tsx`: 기존 프로젝트별 API Key 발급/목록/개별 폐기/프로젝트 철회 접힘 패널. 미래 사람용 링크 패널은 이 API Key 패널의 sibling으로 둘 수 있게 컴포넌트 주석을 남겼으며 현재 fake link UI는 없다.
- `src/features/context-sharing/context-sharing.css`: 기존 Ttakkari token을 사용한 목록 포커스, 요약 grid 및 모바일 요약 2열.
- `src/pages/ContextSharingPage.test.tsx`: 프로젝트 첫 화면과 snapshot/키/게시 시각, 운영 접힘, 현재 snapshot 요약과 기존 project+draft query 유지 테스트 추가. 기존 key 원문 보안 assertions와 게시 승인/철회 테스트는 유지.
- `docs/context-sharing-v2-ui-analysis.md`: 구현 상태, 검증 출력, 현재 API 제약, 후속 링크 계약 작업 범위를 추가.

## TDD 및 검증

- RED: 새 프로젝트 중심 첫 화면/운영 접힘 테스트를 구현 전에 실행. 처음 기존 화면에 `공유 프로젝트` heading이 없다는 실패를 확인했고, 접힘 운영 기대도 실패했다. 구현 및 assertion selector 수정 후 새 테스트 통과.
- 의존성 준비: `pnpm exec vitest ...` 실행 시 lockfile 정책 검사 후 `615` packages 설치 완료.
- 집중 회귀: `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts src/features/context-sharing/errors.test.ts --reporter=dot` → `Test Files 3 passed (3)`, `Tests 81 passed (81)`.
- Build/typecheck: `pnpm build` → `tsc -b` 통과, Vite `3137 modules transformed`, production build 및 PWA 산출 완료.
- 변경 경로 ESLint: `pnpm exec eslint src/pages/ContextSharingPage.tsx src/pages/ContextSharingPage.test.tsx src/features/context-sharing/ProjectListView.tsx src/features/context-sharing/ProjectDetailView.tsx src/features/context-sharing/PublicationFlow.tsx src/features/context-sharing/ProjectApiKeyPanel.tsx` → exit 0.
- 저장소 UI lint: `node scripts/ui-lint.mjs` → 실패. 기준선 밖 위반 20건은 `src/features/accounts/usage.css` 1, `src/features/chat/thread.css` 1, `src/pages/creative/creativePlan.css` 6, `src/pages/reverse.css` 12. 이번 변경 CSS는 결과 목록에 없으며 범위 밖 파일/기준선은 고치지 않았다.
- Browser: configured browser를 열고 Vite local server로 합성 preview를 시도했다. `/public/context-sharing-preview.html` 요청 때 `@vitejs/plugin-react can't detect preamble` 오류가 났다. root html로 옮긴 다음 브라우저 navigation은 성공했지만 `No routes matched location "/context-sharing-preview.html"` warning, 화면의 빈 accessibility snapshot과 빈 screenshot을 확인했다. 두 번째 route 시도 후에도 같은 경고가 남아 visual 확인은 미검증으로 표시했다. 임시 preview 파일은 제거하고 Vite를 중지했으며 configured browser를 닫았다. 운영 로그인·API·게시·실제 키는 사용하지 않았다.

## 계약 및 후속 경계

- `src/api/contextSharing.ts`, `src/api/contextSharingTypes.ts` 변경 없음. Snapshot 목록 값은 현재 `publication`과 `active_key_count`만 표시한다.
- current contract에 링크 endpoint/type, 링크 수, last-used, 독립된 마지막 게시 이력, TTL 선택지가 없으므로 UI에서 추측하지 않았다.
- backend/Gateway 계약 확정 후 별도 단계에서 사람용 `ShareLinkPanel`, TTL, token URL 보안, 링크별 폐기, API response 타입을 연결한다. 그 전에는 기존 API Key의 1시간 계약을 변경하지 않는다.
- 운영 인증 브라우저, actual backend 응답, 실제 390/1280 px layout, publish/site/key 운영 호출: 하지 않음. 이번 단계의 검증 경계는 합성 API 단위 테스트, build, TS/TSX lint다.
- push/deploy하지 않았다.
