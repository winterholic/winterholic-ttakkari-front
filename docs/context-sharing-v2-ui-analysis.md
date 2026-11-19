# Context Sharing v2 UI 분석

- 기준 저장소: `winterholic-ttakkari/front`
- 분석 worktree: `front-context-sharing-v2-20261119`
- 기준 커밋: `f6dfe5b` (`origin/main`)
- 분석일: 2026-11-19 (KST)
- 범위: 현재 관리 화면과 Gateway 공개 웹의 코드 흐름, 기존 UI 계약·보안 경계, 후속 UI 구현안
- 제외: 서비스 코드 변경, 운영 데이터 접근, 키 발급·게시·공개 활성화, push·배포

## 결정 요약

1. 관리 시작 화면을 **프로젝트 목록**으로 두고, 프로젝트 하나의 상세에서 현재 snapshot과 공유 수단을 다룬다. 현재 전역 사이트 운영/키 콘솔을 첫 화면으로 두는 구조는 뒤로 보낸다.
2. 프로젝트 상세의 공유 수단을 **사람용 공유 링크**와 **프로그램용 API Key**라는 별도 카드/목록/생성 흐름으로 분리한다. 링크를 API 키 입력 화면으로 보내거나 키 원문을 링크 URL에 넣지 않는다.
3. 기존 문서 선택 → 초안 편집 → 검토 → 승인 흐름은 상세 안의 게시 단계로 보존한다. UI 승인 절차 자체를 제거하지 않는다. 프로젝트 공유 철회와 키 개별 폐기도 각각 명시적으로 확인한다.
4. 현재 Gateway 공개 웹은 API 키를 받아야 하는 교환형 Reader다. 링크는 반복 열람 시마다 사용자 입력을 요구하지 않도록 별도 capability 링크 흐름이 필요하다. token URL과 그 제거·교환 방식은 서버 계약과 함께 확정해야 한다.
5. TTL은 계약 충돌이다. 사용자 결정은 링크와 키 모두 기본 3일, 1/3/7/30일 선택이지만, 현재 Private/Gateway 계약은 API 키 1시간 고정이며 링크 API가 없다. 구현 전에 계약 변경/불변 필드를 확정해야 한다.

## 현재 구조와 흐름

### 관리 front

`src/pages/ContextSharingPage.tsx` 한 파일이 사이트 운영, 프로젝트/문서 조회, 초안 생성·편집·검토·게시, 키 발급·복사·개별 폐기, 프로젝트 철회를 함께 담당한다.

- `/context-sharing`에서 먼저 `GET /site`, `GET /projects`, `GET /keys`를 호출한다. 화면은 “Context Gateway 운영” 제목과 전역 공유 사이트 상태/닫기, 전체 키 발급·관리로 시작한다.
- 프로젝트 목록은 `<details>` 안에 있다. 항목에는 이름, 범위, 문서 수, 게시 상태, 활성 키 수는 보이지만 최신 snapshot과 마지막 게시 시각은 현재 `ShareProject` 응답/목록 UI에 없다.
- 프로젝트 상세는 `?project=<entity_id>`로 연다. 이때 사용 가능한 출처/문서를 선택하고 제목·요약을 넣어 초안을 만든다. 최대 50개 선택, 꺼진 출처 제외, 출처 문서 500개 초과 시 잘림을 알린다. 회사(work) 범위는 외부 공유 의도 확인이 필요하다.
- `?draft=<id>`가 추가되면 문서 내용/제목 편집, 문서 제외, 원본 대조 표시, 위험 탐지 결과, digest 기반 게시 승인이 나온다. 저장된 초안은 게시된 뒤 읽기 전용이다.
- 현재 화면은 프로젝트 중심의 “공유 운영”을 전혀 제공하지 않는 것은 아니다. 프로젝트 목록/선택과 상세가 존재하지만 접혀 있고, site/API key 운영이 시각적·정보 구조상 우선이다.
- 키는 scope(`read/search/export`)만 선택하고 TTL 선택은 없다. UI는 “기본값 1시간”, API 요청도 `project_slug`, `label`, `scopes`만 보낸다. 발급 원문은 React state에 잠시 보이며 복사/닫기 후 지운다. route 변경 및 언마운트 때도 지운다.
- 인증은 `main.tsx`에서 `/share/*` 공개 회의 경로만 `AuthProvider` 밖에 두고 나머지 앱을 감싼다. `/context-sharing`은 일반 owner 세션이 필요한 관리 경로다. API 클라이언트는 access token을 메모리에만 두고 refresh 쿠키로 복구한다.

### Gateway 공개 웹

대상은 `back-context-gateway-20261116/context_gateway/web`의 별도 React SPA다. Ttakkari front의 `/share/:shareId` 공개 회의 페이지와 혼동하면 안 된다.

- 앱 진입 시 `SessionStore`는 signed-out 상태다. 사용자는 암호 입력 필드에 1회용 API Key를 직접 넣고 `POST /api/v1/auth/exchange`로 교환한다.
- 교환 후 프로젝트 목록, 최신/과거 snapshot 선택, 문서 목록·검색·상세 읽기, 출처/검증 표시, Markdown/JSON/ZIP 내보내기, curl/MCP 연결 안내를 보여 준다. viewer는 읽기 전용이다.
- 키와 교환 세션 토큰은 `SessionStore`/`GatewayClient` 메모리에만 있다. local/session storage, 쿠키, URL, 콘솔에는 쓰지 않는다. 새로고침 시 재입력해야 하며 만료/401/로그아웃 시 client와 Reader 트리가 폐기된다.
- 기본 문서 상세와 프로젝트 전체 맥락을 모두 읽을 수 있다. 스냅샷 selector는 각 snapshot 게시 시각·source revision·최신 여부·미검증 여부를 표시한다. 링크 기반 공개 진입점은 아직 없다.

## 권장 화면·파일 구조

현 디자인 시스템과 라우팅을 유지하며 이 페이지 범위에서 아래처럼 나눈다. API 호출/타입은 현재 패턴(`src/api/contextSharing.ts`, `contextSharingTypes.ts`)을 따른다. 실제 endpoint/type 이름은 backend 계약 확정 후 붙인다.

```text
src/pages/ContextSharingPage.tsx                 페이지 조립, 목록/상세 라우트 선택
src/features/context-sharing/ProjectListView.tsx 프로젝트 목록·검색·상태 요약
src/features/context-sharing/ProjectDetailView.tsx
                                                  프로젝트 요약·snapshot·공유 수단·게시 단계
src/features/context-sharing/ShareLinkPanel.tsx   사람용 링크 발급/목록/복사/즉시 폐기
src/features/context-sharing/ApiKeyPanel.tsx      프로그램용 키 scope/만료/REST·MCP 안내/폐기
src/features/context-sharing/PublicationFlow.tsx  선택·편집·검토·승인·갱신 기존 단계
src/features/context-sharing/ProjectApiKeyPanel.tsx 프로젝트 API Key 발급·목록·철회 영역
src/features/context-sharing/context-sharing.css 토큰 기반 목록/상세/모바일 레이아웃
src/api/contextSharing.ts                        링크/키/게시 API 함수 (계약 확정 뒤)
src/api/contextSharingTypes.ts                   link/key/project/publication 계약 타입
```

라우트 제안은 기존 URL 호환성을 우선해 `/context-sharing` 목록과 `/context-sharing?project=<id>` 상세를 유지한다. 상세 내 검토는 `?project=<id>&draft=<id>`를 유지해 기존 딥링크를 깨지 않는다. 신규 하위 페이지 라우트는 필요성이 확인된 뒤 결정한다.

### 화면 계층

**목록 `/context-sharing`**

- 제목: `공유 프로젝트`와 보조 설명. 전역 Gateway 연결/공개 상태는 페이지 상단의 낮은 위계 상태 요약으로 이동한다.
- 프로젝트 행/카드의 필드: 이름·범위·문서 수·게시 상태, 최신 snapshot(없음/시각/문서 수), 활성 공유 링크 수, 활성 API Key 수, 마지막 게시 시각.
- 검색/필터는 프로젝트 수가 많을 때만 제공. 빈 상태에는 맥락 도서관으로 가는 링크, 오류에는 재시도, Gateway 미설정은 원인과 초안 검토 가능 여부를 설명한다.
- 목록 읽기만으로 쓰기 API를 호출하지 않는 현재 불변 조건을 유지한다.

**상세 `/context-sharing?project=<id>`**

1. 프로젝트 제목/범위/게시 상태와 최신 snapshot 요약: 게시 시각, 문서 수, 검증 상태, source revision 일부.
2. 1차 액션 `snapshot 갱신`은 기존 문서 선택→초안→검토→승인 흐름으로 연결한다. 게시 후 스냅샷은 불변이며 새 게시가 최신이 되고 이전 게시는 superseded 된다.
3. 두 개의 독립 섹션: `사람용 공유 링크` / `프로그램용 API Key`. 각각 이름과 만료 기간을 발급 폼의 초기에 보여 주고 기본값 3일·선택 1/3/7/30일을 표시한다.
4. 두 자격 증명 목록 모두 이름, 종류, 생성 시각, 만료 시각, 마지막 사용 시각(서버가 제공할 때), 상태, 즉시 폐기 액션을 갖는다. “마지막 사용 없음/기록 없음”과 실제 최근 사용을 구분한다.
5. 링크 발급 결과는 복사와 미리보기 열기만 제공한다. 링크는 반복 열람 가능한 사람용 URL이어야 하며 새 탭에서 인증/키 입력을 요구하지 않는다. API Key는 발급 응답에서만 원문을 한 번 표시하고 REST/MCP 사용 안내를 제공한다.
6. 폐기 영향은 다른 동작과 구별한다. 링크 폐기는 그 링크만, 키 폐기는 해당 API 자격 증명만, 프로젝트 철회는 전체 공개 snapshot/자격 증명 영향임을 확인 다이얼로그에서 분리한다. 전역 site 닫기는 별도 운영 설정으로 계속 제공할지 계약/제품 범위에서 재검토한다.

**게시 단계 상세**

기존 출처/문서 선택, 최대 선택 제한과 잘림 안내, work 범위 확인, 초안 편집/제외/원본 검토, 위험 항목 및 탐지 한계, 현재 digest 읽음 승인, 오류·재시도 흐름을 상세의 “게시” 단계로 둔다. 키/링크 관리와 같은 카드 안에 섞지 않는다. publish 성공 후 snapshot 요약과 링크 발급 가능 상태를 갱신한다.

## 2026-11-19 프로젝트 중심 UI 구조 리팩토링

이번 구현은 위 권장 구조 중 프로젝트 목록·상세·게시 흐름·프로젝트 API Key 경계를 현재 front 계약만으로 연결했다. 분석 당시 관찰한 기존 화면은 이전 상태를 설명하며, 실제 변경과 검증은 아래 결과가 최신이다.

- 기본 `/context-sharing`의 첫 영역은 `공유 프로젝트` 목록이다. 이름, 범위, 프로젝트 문서 수, 게시 상태, 현재 활성 snapshot ID(없으면 없음), 활성 키 수, API가 가진 게시 시각을 표시한다. revoked 프로젝트는 현재 snapshot 없음으로 두되 기존 `publication.published_at`은 게시 시각으로 보여 준다.
- `/context-sharing?project=<id>`는 프로젝트 제목과 현재 맥락 요약(snapshot ID, 프로젝트 문서 수, 활성 키 수, 게시 시각), 이어서 기존 문서 선택·초안 목록·편집·검토·digest 승인·게시 흐름을 보여 준다. `?draft=<id>`도 기존 project 파라미터와 함께 유지한다.
- 전체 사이트 일시중단/재개와 전역 키 관리는 `전체 사이트·기존 키 운영` 접힘 영역에 남겼다. 프로젝트별 키 발급·목록·개별 폐기·프로젝트 공유 철회는 상세의 `프로그램용 API Key 관리` 접힘 패널에 둔다.
- 화면 경계는 `ProjectListView`, `ProjectDetailView`, `PublicationFlow`, `ProjectApiKeyPanel`이다. 사람용 링크 패널은 별도 컴포넌트 경계를 `ProjectApiKeyPanel` 문서 주석으로 남겼다. 링크 UI·버튼은 아직 렌더링하지 않는다.
- API 타입이나 요청은 수정하지 않았다. 목록 링크 수, 마지막 사용 시각, 별도 “최근 게시 이력” 값, 새 TTL 선택은 현재 계약에서 읽을 수 없으므로 표시하거나 추측하지 않았다. 링크 endpoint/type, URL token 교환 정책, TTL은 backend/Gateway 계약이 확정된 뒤 별도 구현한다.
- 대기/오류/빈 상태는 목록 컴포넌트가 유지하고, 게시·키·사이트 조회 기존 로딩·오류·재시도와 파괴 동작 확인도 기존 흐름을 보존한다. 목록 링크는 키보드 포커스 표시를 갖고 목록/상세 요약은 기존 Ttakkari 토큰을 쓴다.

### 변경 파일

- `src/pages/ContextSharingPage.tsx`: 페이지 조립·query/action 상태를 유지하면서 목록/상세/게시/키 패널 경계로 분리하고 기본 제목과 순서를 바꿨다.
- `src/features/context-sharing/ProjectListView.tsx`: 프로젝트 요약, 현재 snapshot·키·게시 시각, loading/error/empty 상태.
- `src/features/context-sharing/ProjectDetailView.tsx`: 현재 맥락 요약과 상세 내비게이션.
- `src/features/context-sharing/PublicationFlow.tsx`: 기존 게시 단계의 named region 경계.
- `src/features/context-sharing/ProjectApiKeyPanel.tsx`: 프로젝트별 API Key 관리 접힘 경계; 링크 패널은 계약 이후 sibling으로 추가한다.
- `src/features/context-sharing/context-sharing.css`: 토큰 기반 목록 포커스, 요약 그리드, 모바일 2열 요약과 패널 간격.
- `src/pages/ContextSharingPage.test.tsx`: 프로젝트 중심 시작·현 snapshot/게시 시각·운영 접힘·project+draft 딥링크 동작 테스트 추가. 기존 보안 assertions는 삭제·완화하지 않았다.

### 이번 단계 검증

- TDD RED: 두 새 기본 화면 테스트를 구현 전 실행했다. 기존 화면에 `공유 프로젝트` 제목이 없어 실패했고, 운영 영역 접힘도 아직 없었다. 구현 후 새 동작 테스트를 통과시켰다.
- `pnpm exec vitest run src/pages/ContextSharingPage.test.tsx src/api/contextSharing.test.ts src/features/context-sharing/errors.test.ts --reporter=dot` → `Test Files 3 passed (3)`, `Tests 81 passed (81)`.
- `pnpm build` → `tsc -b` 및 Vite production build 성공, 3137 modules transformed.
- `pnpm exec eslint src/pages/ContextSharingPage.tsx src/pages/ContextSharingPage.test.tsx src/features/context-sharing/ProjectListView.tsx src/features/context-sharing/ProjectDetailView.tsx src/features/context-sharing/PublicationFlow.tsx src/features/context-sharing/ProjectApiKeyPanel.tsx` → 성공.
- `node scripts/ui-lint.mjs` → 실패. 수정한 CSS 경로의 지적은 없고 기존 범위 밖 `src/features/accounts/usage.css`, `src/features/chat/thread.css`, `src/pages/creative/creativePlan.css`, `src/pages/reverse.css`에서 기준선 밖 지적 20건을 냈다. baseline/범위 밖 파일은 수정하지 않았다.
- browser 실제 렌더 캡처는 미검증이다. configured browser와 Vite는 시작됐지만 임시 합성 preview route가 React에서 매칭되지 않아 빈 accessibility snapshot과 빈 화면을 반환했다(`No routes matched location "/context-sharing-preview.html"`). 초기 `public/` 미리보기 HTML은 React preamble 오류도 반환했다. 테스트 harness를 제거하고 Vite/browser를 닫았다. 390px/1280px 실제 레이아웃 시각 검증은 완료하지 않았다.

### 이후 연결 경계

- backend/Gateway 링크 계약 확정 후 `ProjectApiKeyPanel` 옆에 실제 `ShareLinkPanel`을 추가하고 API 호출·타입·token URL 처리·1회 노출·폐기 확인을 그 계약에 맞춘다. 지금은 링크 수나 링크 발급 기능을 노출하지 않는다.
- 링크/API Key TTL 기본값 및 선택지, last-used 필드, 게시 이력 필드는 계약이 정해진 뒤 연결한다. 기존 API Key 1시간 동작을 임의로 바꾸지 않는다.
- 브라우저 합성 데이터 렌더 검증은 후속 작업에서 실행할 수 있다. 운영 로그인·실제 자격증명·게시 데이터로 대체하지 않는다.

## 계약 차이와 작업 우선순위

| 항목 | 원하는 UI | 현재 확인된 계약/코드 | 후속 처리 |
|---|---|---|---|
| 사람용 링크 | 익명 반복 열람, 기간 선택, 이름/상태/사용일/즉시 철회 | Private 계약에 share link endpoint/type가 없음. Gateway public app은 일회용 API Key 수기 입력 후 교환 | 링크 생성·조회·폐기·권한 범위·사용시각·URL token 취급 API 확정 전 mock 계약을 임의로 만들지 않는다 |
| API Key TTL | 기본 3일, 1/3/7/30일 | Private 계약 `ttl_seconds`는 생략 또는 3600만 허용. Gateway control/API도 1시간 고정, TTL 필드는 없음 | 사용자 요구와 계약의 명시적 충돌. duration 선택을 UI에 넣으려면 Private 및 Gateway TTL 계약 변경 필요 |
| 생성/마지막 사용 | 둘 다 표시 | Key에는 `issued_at`, `expires_at`, `revoked_at`만 있음. last-used 없음 | `created_at`은 `issued_at`로 표시 가능. 마지막 사용 정보는 제공 불가 상태를 표시하고 계약 필드 추가 필요 |
| 프로젝트 요약 | latest snapshot·활성 링크/키·마지막 게시 | 프로젝트 타입에는 `publication`(published_at 포함), `active_key_count`는 있으나 latest snapshot 요약/링크 수/마지막 게시 별도 필드 없음 | 현재 publication이 active일 때는 게시 시각 재사용 가능. 철회/superseded 상태에서 “마지막 게시”를 보존하려면 계약 확장 필요 |
| 갱신 | 상세에서 명시적 snapshot refresh | owner 경로는 drafts 생성/수정/게시; agent 경로에 사용자 요청 기반 `POST /publish {entity_id}` 있음 | 관리 UI는 기존 검토 단계를 보존하므로 상세 CTA는 초안/문서 선택으로 이동. 직접 publish endpoint에 연결하지 않는다 |
| 공개 사이트 닫기 | 공개 전체 운영 | owner 계약의 GET/PATCH `/site`; 현재 상단 전역 운영 UI | 프로젝트 상세에서 제거하고 목록의 운영 메뉴/별도 접힘 영역으로 옮겨 프로젝트 단위 자격 증명과 혼동 방지 |

## 공개 Reader의 Markdown·외부 자원·보안 경계

### 현재 확인된 구현

- `SafeMarkdown`은 `react-markdown` + GFM을 쓰고 `rehype-raw`를 넣지 않는다. 원시 HTML은 실행 DOM이 아니라 텍스트로 남는다.
- 링크는 `http:`, `https:`, `mailto:`만 허용한다. HTTP(S)/mailto 링크는 새 탭으로 열고 `noopener noreferrer nofollow`를 지정한다. 지원하지 않는 scheme은 클릭 불가 텍스트가 된다.
- Markdown 이미지 노드는 외부 이미지를 가져오지 않고 대체 텍스트를 “외부 로드 차단” 문구로 렌더한다. 외부 폰트/CDN/분석 스크립트도 Gateway web에 없다.
- `GatewayClient`는 동일 origin 공개 REST 경로 allowlist만 호출하고 `Authorization` 헤더로 credential을 전달한다. `credentials: omit`, `cache: no-store`, `redirect: error`, `referrerPolicy: no-referrer`를 지정한다. export도 인증 fetch→Blob 저장으로 처리되어 URL query에 token이 없다.
- Gateway 정적 응답은 `no-store`, CSP(`default-src 'none'`, script/style/font/connect self, image self/data, base/form/object 차단, `frame-ancestors 'none'`), `no-referrer`, `nosniff`, `X-Frame-Options: DENY`를 지정한다. HTML에도 meta CSP/referrer/noindex가 있으나 `frame-ancestors`는 응답 헤더가 담당한다.
- API Key 원문은 gateway 서버에서 hash만 보관하고 발급 때 한 번 응답한다. 현재 발급 시간은 정확히 1시간이며 교환 session은 그 만료를 넘지 않는다. 공개 화면은 링크 대신 key를 암호 input으로 받는다.

### 로그인 없는 링크를 만들 때 지켜야 할 경계

- 사람용 링크는 bearer capability다. 생성 응답에서만 원문을 노출하고 목록/일반 로그/분석에 재노출하지 않는다. 이름·발급/만료·폐기와 실제 사용시각은 가능한 범위에서 별도 메타로 관리한다.
- token을 API query parameter나 페이지의 일반 query에 넣으면 서버/proxy/access log, 브라우저 기록, 복사된 referrer로 새어 나갈 수 있다. token URL 방식은 계약에서 fragment 교환, 짧은 부트스트랩 후 `history.replaceState`, 또는 경로 token을 유지할 때의 로그 마스킹/브라우저 정책을 명시적으로 선택한다. URL 표면만 바꾸는 것으로 보안이 해결됐다고 간주하지 않는다.
- capability 링크를 새 탭으로 열고 반복 사용하는 시나리오와 메모리 전용 세션/새로고침 시 재접속이 필요한 경계를 함께 설계한다. 링크 URL을 통한 최초 진입 자체에는 owner 로그인이나 API Key 재입력을 요구하지 않는다.
- 외부 문서 링크는 사용자 클릭 시 외부 navigation만 허용하고, 원격 이미지/iframe/HTML 실행/임의 scheme fetch는 계속 차단한다. 복사·내보내기는 해당 snapshot과 link/key grant 권한을 서버가 확인해야 한다. UI의 버튼 숨김만 권한으로 간주하지 않는다.
- REST/MCP API Key는 사람용 URL과 완전히 독립적으로 발급한다. key 원문·session token은 URL, clipboard 외 자동 복사, local/session storage, React Query cache, 오류 메시지, telemetry에 저장하지 않는다. 한 번 표시한 원문을 잃으면 재조회 대신 재발급한다.

## 기존 UI 결함/갭

### 지금 설계에서 처리할 것

- 첫 화면이 `Context Gateway 운영`/사이트 열기·닫기와 전체 키 발급이고 프로젝트가 접혀 있어 프로젝트 중심 요구와 위계가 반대다.
- 하나의 “키” UI가 외부 연결 수단의 유일한 형태다. 사람용 반복 공유 링크와 프로그램 키의 개념/상태/TTL/사용처를 현재 UI 및 타입에서 표현할 수 없다.
- 요구된 기본 3일·기간 선택, 링크 생성/폐기 목록, 생성일, last-used, 링크 수, 최신 snapshot 카드가 타입·API·UI에 없다. 이는 UI만으로 보완할 수 없는 backend contract gap이다.
- 공개 Reader 진입은 API Key 수기 입력/1회 교환이 필수라 링크 클릭만으로 반복 열람이라는 새 요구에 맞지 않는다.

### 계약 확정 후 처리할 것

- 3일/1·3·7·30일 선택과 현재 Gateway 고정 1시간 TTL의 충돌.
- 마지막 사용 시각 및 링크 활성 개수·게시 시각 보존 여부와 데이터 소스.
- 링크가 어느 snapshot을 고정할지(latest 고정 vs 생성 시 선택)와 새 게시 후 기존 링크가 새 latest로 이동할지의 정책. 기존 API Key grant는 project ACL 단위로 동작하므로 링크의 snapshot 고정 정책을 그대로 유추할 수 없다.
- 링크 폐기·프로젝트 전체 철회·site 닫기 간 상태/영향/복구 UX. 프로젝트 철회는 Gateway 계약상 비가역이며 새 identity가 필요하다.

## 디자인 시스템 및 폭별 구성 기준

- 관리 front CSS는 `src/vendor/ttakkari/{tokens,typography,components,prose}.css` 순서의 Ttakkari 디자인시스템을 쓴다. 현재 공유 화면 CSS도 `--tk-space-*`, `--tk-color-*`, `--tk-radius-*`, `--tk-size-touch-target-min` 토큰을 사용한다. 새 색·간격 값을 만들지 말고 기존 token을 재사용한다.
- public Gateway web은 `src/styles/tokens.css`에 같은 Ttakkari token subset을 생성해 사용하며 기본은 모바일 목록→본문 전환, 768px부터 문서 탐색과 본문 2열, 767px 이하에선 한 화면 보기다. 관리 front 공유 CSS는 640px 이하에서 목록/키 행·폼을 한 열로 쌓고 터치 타깃 토큰을 적용한다.
- **390px / 1280px 실제 렌더 계측: 미실행.** configured browser에서 `http://localhost:5173/context-sharing` navigation은 `net::ERR_CONNECTION_REFUSED`; 새 worktree에 `node_modules`가 없어 Vite를 올릴 수 없었다. 격리 브라우저에는 운영 로그인 상태가 공유되지 않고, 운영 데이터 사용은 범위 밖이라 라이브 화면으로 대체하지 않았다. 위 폭별 설명은 코드/CSS 정적 확인이며 실측 결과가 아니다.

## 기존 테스트·명령과 후속 UI 확인 계획

### 확인한 의존성/명령

- 관리 front: React 19, TypeScript 6, React Router 8, TanStack Query 5, Vite 8, Vitest 5, Testing Library/jsdom. `package.json`: `pnpm test --run`, `pnpm build`, `pnpm lint` (`eslint . && node scripts/ui-lint.mjs`). front `README.md`는 개발용 `pnpm install`, `pnpm dev`를 안내한다.
- Gateway web: React 19, TypeScript 7, Vite 8, Vitest 5, Testing Library. `package.json`: `npm test`(script가 `vitest run`을 실행), `npm run typecheck`, `npm run build`.
- 관련 기존 테스트 파일: 관리 `src/pages/ContextSharingPage.test.tsx`, `src/api/contextSharing.test.ts`, `src/features/context-sharing/errors.test.ts`; Gateway `src/App.test.tsx`, `src/live.app.test.tsx`, `src/markdown/SafeMarkdown.test.tsx`, `src/api/client.test.ts`, `src/api/adapters.test.ts`, `src/download.test.ts`, `src/clipboard.test.ts`, `src/guide.test.ts`.
- 테스트는 실행하지 않았다. 이 작업은 UI 분석/설계이며, 이번 검증 요청은 테스트/의존성 명령을 확인하도록 되어 있다. 새 테스트나 구현 코드는 만들지 않았다.

### 후속 시나리오 A/B/C

- **A · 프로젝트 운영:** 합성 fixtures로 목록의 게시 상태/latest/링크 수/키 수/마지막 게시를 확인하고, 상세 진입→문서 선택→초안→편집/검토→승인→snapshot 갱신 후 최신순/이전 상태를 검증한다. empty/loading/error/Gateway 미설정/work 확인도 포함한다.
- **B · 사람용 링크:** 합성 발급 응답으로 이름·3일 기본/1·3·7·30일 선택·만료·복사 1회·반복 새 탭 진입·snapshot 선택·즉시 폐기/만료/철회 상태를 확인한다. URL token은 주소/네트워크 query·storage·로그에 남지 않는 negative assertion을 둔다. 실제 link token/운영 공유는 사용하지 않는다.
- **C · API Key:** 합성 응답으로 링크와 분리된 scope(`read/search/export`), TTL 선택, key 원문 1회 표시 후 복사·닫기·이동 시 제거, 재조회 불가, REST/MCP 설정 안내, 개별 즉시 폐기와 서버 오류 재시도를 확인한다. raw key는 fake 값만 쓴다.
- 시각 확인은 구현 뒤 configured browser에서 390px/1280px를 각각 캡처한다. 목록/상세의 우선순위, 좁은 폭에서 link와 key 액션의 혼동, 긴 프로젝트명·문서명 overflow, 게시/만료 상태의 색 외 표현, 외부 Reader에서 본문·출처·내보내기까지 확인한다. 캡처는 합성 데이터 화면이라고 표기한다.

## 확인 근거 파일

- 관리 페이지/API/types: `src/pages/ContextSharingPage.tsx`, `src/pages/ContextSharingPage.test.tsx`, `src/api/contextSharing.ts`, `src/api/contextSharingTypes.ts`, `src/api/contextSharing.test.ts`, `src/features/context-sharing/context-sharing.css`, `src/features/context-sharing/errors.ts`.
- 라우팅/인증/토큰: `src/main.tsx`, `src/App.tsx`, `src/auth.tsx`, `src/api/client.ts`.
- 공개 웹: `context_gateway/web/src/App.tsx`, `src/auth/sessionStore.ts`, `src/api/client.ts`, `src/api/paths.ts`, `src/ui/{LoginScreen,Viewer,ProjectView,DocList,Reader,SearchPanel,ExportBar,ConnectGuide,Provenance}.tsx`, `src/markdown/SafeMarkdown.tsx`, `src/download.ts`, `src/clipboard.ts`, `src/styles/{tokens,app}.css`, `vite.config.ts`, `index.html`.
- 보안 헤더 구현: `context_gateway/src/context_gateway/web_serving.py`; 공개 REST/TTL 계약: `docs/context-gateway-contract.md`; Private 계약: `back-context-gateway-20261116/docs/context-sharing-private-contract.md`.

## 2026-11-19 Context Sharing v2 링크·재사용 키 후속 구현

아래 구현·검증 항목은 앞의 분석 및 “프로젝트 중심 UI 구조 리팩토링” 섹션에서 계획/미실행으로 적은 부분을 갱신한다. 당시의 관찰과 결과는 이력으로 보존한다. 세부 파일·명령·한계는 [`docs/work-history/2026-11-19-context-sharing-v2-links-keys-ui.md`](work-history/2026-11-19-context-sharing-v2-links-keys-ui.md)를 기준으로 한다.

- 프로젝트 상세에 사람용 링크와 reusable API Key를 별도 주 액션으로 연결했다. 게시·갱신은 접고 `?draft` 경로에서는 열린다. 프로젝트별 링크 수·마지막 게시 시각도 실제 제공 필드를 사용한다.
- 링크와 키의 합성 발급/복사 후 지우기/개별 폐기를 실제 `/context-sharing` route에서 확인했다. configured browser 1280px/390px 합성 화면을 캡처했고 390px 주요 레이아웃 상자가 viewport 안에 들어왔다.
- 집중 테스트 88개, `pnpm build`, 변경 TS/TSX lint, `git diff --check`가 통과했다. 전체 `node scripts/ui-lint.mjs`는 변경 범위 밖 CSS 위반 20건으로 실패했다.
- Private key 발급 응답은 계약상 필수 `connect.project_id`가 빠져 있었다. 연결 예시는 해당 ID를 임의로 채우지 않으며, 실제 Private/Gateway 연동 및 연결 안내는 미검증이다. UI는 계약 기반 합성 응답으로만 확인했다.
- 브라우저 콘솔의 2개 오류는 합성 stub의 `/sw.js`가 HTML을 반환한 service worker MIME 오류였다. 라우트 렌더/상호작용은 진행됐으나 service worker 자체는 확인하지 않았다.


## 후속 구현·검증 상태

위 preview 라우트 실패 및 Private connect.project_id 누락은 당시 조사 이력이다. 후속 구현과 Private 교정 이후 실제 관리 라우트의 390/1280px 및 실제 Private/Gateway API 검수를 진행했고 기획이 집중 98 tests를 재현해 수락했다. 현재 근거는 [관리 UI 독립 검수](work-history/2026-11-19-context-sharing-v2-ui-verification.md)와 [링크/키 구현 기록](work-history/2026-11-19-context-sharing-v2-links-keys-ui.md)의 통합 수락 절을 따른다. 운영 인증·배포·공개 Reader의 수락을 의미하지 않는다.
