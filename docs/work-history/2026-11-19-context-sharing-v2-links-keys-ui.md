# Context Sharing v2 링크·재사용 키 UI 구현

## 범위와 변경

- 검증 기준 HEAD: `f6dfe5b553552cfabddd4749e74f2c47332488ec`. 구현/문서 변경은 이 revision 위의 미커밋 worktree 상태에서 확인했다.
- `src/pages/ContextSharingPage.tsx`, `src/api/contextSharing.ts`, `src/api/contextSharingTypes.ts`에 프로젝트 상세의 링크 발급/목록/개별 폐기 Private API와 reusable API v2 발급 설정을 연결했다.
- `src/features/context-sharing/ShareLinkPanel.tsx`를 추가해 이름, 1/3/7/30일(3일 기본), pinned/latest 선택, export 권한, 원문 URL 1회 표시·복사 후 제거, 만료/마지막 사용/폐기 상태를 제공한다.
- `ProjectApiKeyPanel.tsx`를 프로젝트 상세의 주 액션으로 노출하고 1/3/7/30일, read/search/export, pinned/latest, 1회 원문 key 표시·복사 후 제거, 재사용 키 목록/폐기와 REST/MCP 연결 예시를 제공한다. 게시·갱신 흐름은 접고 `?draft`에서 열리게 했다.
- 프로젝트 요약은 `active_link_count`/`last_published_at`을 사용하며 응답 필드가 없으면 0으로 단정하지 않고 확인 불가로 표시한다. `work_sharing_policy_required`, `revoking`, `usage_status: unavailable` 상태를 각각 표현한다.
- 원문 링크/key는 mutation 응답 캐시에 저장하지 않고 React 컴포넌트 메모리에만 둔다. 복사 성공/실패와 닫기/이동 시 지우며 재조회 기능은 추가하지 않았다.
- 기존 게시·철회, 운영 설정, 단일 사용(v1) key 동작과 기존 테스트를 보존했다. 폐기 상태 라벨 assertion은 `폐기`에서 `폐기 처리 중`/`폐기됨` 등 실제 API 의미를 구분하는 표현으로 바꿨다.

## TDD 및 로컬 검증

- RED: 프로젝트 상세에 사람용 링크 주 액션이 없어 신규 UI assertion이 실패하는 것을 확인하고 패널을 구현했다. `work_sharing_policy_required` 테스트도 처음에는 일반 오류 설명을 반환해 실패했고 전용 설명을 추가해 GREEN으로 만들었다.
- 집중 회귀: `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts src/features/context-sharing/errors.test.ts --reporter=dot` → `Test Files 3 passed (3)`, `Tests 88 passed (88)`.
- Build/typecheck: `pnpm build` → `tsc -b` 및 Vite build 통과, `3138 modules transformed`, PWA 산출 완료.
- 변경 TypeScript 경로 lint: 변경한 API/types/pages/features TS·TSX 파일에 `pnpm exec eslint ...` → exit 0.
- 저장소 UI lint: `node scripts/ui-lint.mjs` → exit 1, 변경하지 않은 범위 밖 파일 4곳에서 총 20개 위반을 보고했다. `src/features/accounts/usage.css`(1), `src/features/chat/thread.css`(1), `src/pages/creative/creativePlan.css`(6), `src/pages/reverse.css`(12)이며 출력 기준선은 각각 0이었다. 이번 변경 `context-sharing.css`는 결과에 없으며 이 범위 밖 파일은 수정하지 않았다.
- 기존 집중 테스트 81개를 새 7개 동작 검증 등을 더해 88개로 실행했다. 테스트/fixture는 삭제하거나 완화하지 않았다.

## 합성 브라우저 검증

- `scripts/ui-sweep/stub.mjs` 흐름을 재사용하는 합성 API stub과 `VITE_API_BASE=http://127.0.0.1:8788` 로컬 Vite 서버를 띄워, configured `ttakkari_browser`에서 실제 React Router `/context-sharing?project=entity-demo`를 열었다. 운영 인증, 실제 API, 문서, key는 사용하지 않았다.
- 1280px 실제 라우트에서 상세/링크/키와 접힌 게시·갱신 레이아웃을 확인했다. 합성 링크 발급·복사·개별 폐기 후 `폐기 처리 중`, 재사용 key 발급·복사 후 원문 제거·폐기 후 `폐기 처리 중`을 확인했다.
- 390×844 접근성 snapshot에서 상세·패널 주요 컨테이너가 x=12, width=366, 오른쪽 끝 378px로 390px 안에 위치하며, 입력/버튼도 x=25, width=340로 화면 안에 있었다. 실제 route의 full-page 캡처: 1280px `outbox/browser/page-2026-11-19T09-45-40-856Z.png`, 390px `outbox/browser/page-2026-11-19T09-46-05-172Z.png`.
- 브라우저 콘솔에 2개 오류가 남았다. Vite 개발 서버 로그에서 stub의 `/sw.js` 요청이 HTML로 응답해 service worker 등록 MIME 검사에 실패한 것을 관찰했다. 합성 라우트 상호작용은 계속 동작했으나 service worker 동작은 검증되지 않았다. configured browser를 닫고 두 로컬 서버를 중지했다.

## 계약 비교와 검증 경계

- 확정 계약은 `docs/context-sharing-v2-contract.md`의 `/links`, 확장 `/keys`, `connect.project_id`, TTL 및 pinned/latest 정책을 기준으로 구현했다. 프런트는 `connect.project_id`가 없는 응답에서 project ID를 임의로 보충하지 않고 연결 안내를 제한한다.
- 최초 구현 시점의 관측(현재 상태는 아래 통합 수락 참조): 다른 worker의 Private 구현에서 링크 라우트/주요 응답은 합의된 shape와 맞았지만 `POST /keys`의 `connect` 객체가 `{url, note}`만 반환하고 계약 필수 `project_id`를 누락했다. 이 구체 차이 때문에 실제 발급 후 연결 안내의 `connect.project_id` 연동은 미검증이며 backend 소유자에게 전달해야 한다. backend/Gateway는 수정하지 않았다.
- Gateway 코드의 REST context 경로와 `/mcp` mount를 확인했고, Claude Code 공식 문서 <https://code.claude.com/docs/en/mcp>에서 HTTP transport, Authorization header, `${ENV_VAR}` 치환 방식을 확인했다. UI 예시는 설정된 `public_url`, `connect.project_id`, REST `/api/v1/projects/{project_id}/context`, MCP `/mcp`를 사용하며 원문 key를 URL/설정 예시에 넣지 않는다. `list_projects`는 없는 read 권한 예시를 기본 실행하지 않는다.
- 확인하지 않은 항목: Private API에 대한 실제 key/link 발급·사용·폐기 및 end-to-end Gateway 연결. 운영 호출 금지에 따라 하지 않았다.
- 공개 share Reader 구현, backend/Gateway 수정, 공개 게시, commit/push/deploy는 범위 밖이라 하지 않았다.

## 후속 상태·원문 수명주기 교정

- 관리 상세의 `active_link_count`가 빠졌을 때 기존 링크 패널은 `?? 0`으로 표시했다. `typeof value === "number"`일 때만 수량을 표시하고, 누락 또는 비정상 응답은 `확인 불가`로 표시한다. 프로젝트 목록·상세 요약도 계속 확인 불가를 사용한다.
- 링크 목록에 `issued_at`을 `생성`으로 표시한다. 생성 시각이 없으면 `기록 없음`이며, 만료·마지막 사용 시각과 별도다.
- 전체 사이트·기존 키 운영 목록은 키 상태를 `active`, `expired`, `revoking`, 완료 폐기로 나눠 표시한다. 프로젝트 키 목록도 `revoking`은 `폐기 처리 중`, 완료 상태는 `폐기됨`으로 표시한다.
- 기존 키 보안 문구의 보정: 원문은 쿼리/뮤테이션 캐시에 넣지 않고 한 번만 표시하지만, 라우트 변경 effect가 먼저 원문을 지운 뒤 발급 Promise가 완료되면 같은 컴포넌트의 `issued`에 원문을 다시 넣을 수 있었다. 프로젝트 키 발급과 전체 운영 키 발급은 라우트 세대 및 마운트 여부가 발급 시점과 같은 경우에만 결과·오류 상태를 갱신한다. 라우트를 떠났다가 같은 주소로 돌아온 경우도 이전 세대 응답은 거른다. 프로젝트 키 발급은 ref 잠금과 버튼 pending으로 중복 요청을 차단한다.
- 키·링크 원문 복사 성공/실패 응답은 발급 당시 라우트 세대가 여전히 유효할 때만 알림 상태를 바꾸고, 원문은 복사를 시작했던 객체가 아직 표시 중인 경우에만 제거한다. 링크 패널은 unmount 뒤 발급 성공/실패·복사·폐기 응답에서 컴포넌트 상태를 갱신하지 않는다. 합성 테스트는 링크 발급 Promise를 패널 unmount 뒤 resolve하고 목록 재조회가 추가로 발생하지 않는지 확인한다.
- RED 확인: 늦은 프로젝트 키 성공 응답의 라우트 세대 검사를 잠시 제거하고 `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx -t '상세 키 발급의 늦은 성공' --reporter=dot` 실행 시 실패했다. 관측된 실패는 왕복 후 화면에 `tkgw_RAWKEY_do_not_leak_0123456789`가 나타난 assertion이었다. 검사 복구 후 집중 회귀에서 해당 동작을 포함해 통과했다.
- 갱신 검증: `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts src/features/context-sharing/errors.test.ts --reporter=dot` → `Test Files 3 passed (3)`, `Tests 95 passed (95)`. 변경 TS/TSX `pnpm exec eslint src/pages/ContextSharingPage.tsx src/pages/ContextSharingPage.test.tsx src/features/context-sharing/ShareLinkPanel.tsx` → exit 0. `git diff --check` → exit 0.
- 이번 교정은 코드와 합성 테스트 검증이다. 실제 Private 키/링크 발급·사용·폐기 및 Gateway 연결은 운영 API 금지와 별도 Private 교정 담당 범위에 따라 하지 않았고, 실제 API 연동 주장은 하지 않는다. UI 전체 구현과 기존 worktree 변경은 보존했다.


## 통합 수락과 커밋 준비

- 최초 기록의 connect.project_id 누락은 Private 후속 교정에서 해결됐고, 기획은 실제 Private/Gateway 독립 통합과 관리 UI 독립 검수에서 UUID 일치를 수락했다. [관리 UI 독립 검수](2026-11-19-context-sharing-v2-ui-verification.md)는 합성 auth/health shell 및 실제 공유 API/ASGI 앱 범위를 명시한다. 운영 인증과 공개 Reader는 별도다.
- 기획 직접 집중 5파일 Vitest는 98 passed(4.19s), 최종 pnpm build는 tsc와 Vite 3138 modules 및 PWA 산출 성공이다. 변경 TS/TSX 15파일 ESLint는 출력 없이 exit 0이었다.
- node scripts/ui-lint.mjs는 관련 없는 기존 CSS 4파일의 규칙 6항목에서 실패했다. 동일 HEAD의 src와 검사기/기준선을 별도 임시 디렉터리에 git archive로 추출해 실행한 결과 현재 실패와 stderr가 정확히 같고 양쪽 exit 1이었다. 대상 4파일도 HEAD와 바이트가 일치한다. 기준선이나 무관한 CSS는 변경하지 않았으며 이 전체 검사를 통과했다고 보고하지 않는다.
- 기획이 이 기능의 경로만 지정해 로컬 커밋으로 보존한다. 원격 push와 운영 배포는 backend 및 Reader 최종 검수·통합과 분리한다.
