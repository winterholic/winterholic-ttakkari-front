# Context Gateway Private UI

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
