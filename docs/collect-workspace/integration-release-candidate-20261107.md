# 수집 통합 게시 후보 — 2026-11-07

## 현재 revision과 기준선

- 원본 수집 branch: `refactor/collect-workspace-20261107`, 현재 관측 HEAD `a028be2f9a447bbc09f9300468be01d43b8d1a18`. 제품 수집 리팩터링 기준 HEAD는 `d1b1719ad2559104acf2905b1da9447d885f4eee`; 이후 원본 branch의 커밋은 UI 감사/evidence 문서 변경이다.
- fetch한 `origin/main`: `a86544548c006c41bb4a9a49ab0cd0ab8a09713e`.
- merge-base: `31de7817313636331f9e414cb5400a2afa5baeb4`; `origin/main...원본 HEAD`는 `10 21` (main 전용 10, 원본 전용 21).
- 격리 후보 branch: `release/collect-workspace-20261107`. 이 기록 작성 전 후보 snapshot `122ea29d276a4101ad476c22e9412a313ebc91b0`; 최종 기록 commit은 문서만 추가하는 후속 commit이다.
- 후보는 최신 `origin/main`을 포함하며 `origin/main...후보`는 `0 25`. 원본 HEAD도 후보 조상에 포함된다. 기존 checkout은 수정하지 않았다. 원본에는 감사자 소유의 미추적 evidence와 `__pycache__`가 남아 있고 이 후보에 복사·삭제·stage하지 않았다.

기준 확인 명령과 결과:

```text
git fetch origin
origin/main = a86544548c006c41bb4a9a49ab0cd0ab8a09713e
source HEAD = a028be2f9a447bbc09f9300468be01d43b8d1a18
merge-base = 31de7817313636331f9e414cb5400a2afa5baeb4
origin/main...source = 10 21
origin/main...candidate = 0 25
```

## 통합 및 충돌 해결

후보는 `origin/main`에서 분기해 원본 제품 커밋을 합쳤고, 다시 최신 main을 병합했다. 주요 merge commit은 `68c9a22c2fb9b4dba1488f3677ddb48d490ca66d` (수집 refactor), `6d9fc8aa6a53a8009823c55f5fc968640ea9e185` (최신 main)이다. 최신 main은 Artcraft job mode 타입 한 줄 교정(`a865445`)을 포함했다.

충돌 파일과 해결 근거:

| 파일 | 원인 | 해결 |
|---|---|---|
| `src/features/collector/Missions.tsx` | main의 topic/history 및 pagination 변경과 원본의 project list/filter/error/quality/precision 흐름이 같은 화면을 수정 | 프로젝트·topic·history 화면과 plan 이동을 함께 유지했다. `topic_key` 그룹화, history mode mutation 차단, source `request_key`와 main `reuse_existing: true`를 모두 보존했다. optional `plan.coverage`는 누락된 저장 shape에서도 project 목록이 렌더되도록 처리했다. |
| `src/features/collector/collector.css` | 두 브랜치가 같은 탭·상세·목록 스타일을 별도로 추가 | project 표와 topic/history 스타일을 각각 유지하고 heading modifier를 분리했다. |
| `src/pages/CollectPage.test.tsx` | 원본 첫 화면·생성 흐름과 main URL/history 동작 검증이 같은 테스트를 수정 | 두 흐름의 검증을 유지하고 create 요청의 idempotency/reuse 계약을 함께 확인하도록 합쳤다. |

추가 collector 변경 `missionProjects.ts`는 `lastActivity` 누락값을 빈 문자열로 정렬하고 `coverage` 누락을 검색에서 안전하게 처리한다. 회귀 테스트는 `missionProjects.test.ts`에 추가했다. 충돌에서 어느 한쪽 기능이나 기존 계약을 버리지 않았다.

후보 제품 diff에는 collector 통합 외 최신 main 변경이 포함된다. collector 외 upstream 파일은 Artcraft (`src/api/artcraftTypes.ts`, `src/api/client.ts`, `src/features/artcraft/**`, `src/pages/Artcraft*`), notifications/push (`src/api/notificationTypes.ts`, `src/api/notifications.test.ts`, `src/features/push/**`, `src/pages/NotificationsPage.tsx`), weather (`src/pages/WeatherPage.tsx`와 test)다. 의존성 manifest/lockfile 변경은 없다.

## 검증

`e070bc0` 독립 검증의 9 files / 79 tests / build 결과는 `independent-final-verification-20261107.md`에 기록된 기존 증거로 재사용했다. 통합 후 제품 검증은 코드 후보 `6d9fc8aa6a53a8009823c55f5fc968640ea9e185`에서 수행했다. 그 뒤 `6effe4e`와 `122ea29`는 docs/evidence-only 병합이다. 후보의 현재 코드와 의존성이 이 검증 시점과 같은지 확인한 결과 `git diff 6d9fc8a..122ea29 -- src package.json pnpm-lock.yaml`은 비어 있다.

```text
TTAKKARI_NO_ENV_FILE=1 pnpm exec vitest run src/features/collector/Collector.test.tsx src/pages/CollectPage.test.tsx src/features/collector/Missions.test.tsx src/features/collector/ResearchPanel.test.tsx src/features/collector/ReviewWorkspace.test.tsx src/features/collector/ReviewIndependentAudit.test.tsx src/features/collector/CollectWorkspaceBoundaryAudit.test.tsx src/features/collector/missionProjects.test.ts src/api/collectionMissions.test.ts --reporter=dot
Test Files 9 passed (9)
Tests 86 passed (86)

TTAKKARI_NO_ENV_FILE=1 pnpm build
✓ built; 95 PWA entries
warning: index chunk 870.23 kB (gzip 247.95 kB), above 500 kB advisory

node scripts/ui-lint.mjs
ui-lint ok · 위반 138건(기준선 138건 이하, 신규 증가 없음)

git diff --check origin/main...HEAD
(clean; no output)
```

통합 이후 main merge와 UI 감사 evidence 추가는 docs/image-only다. 최종 코드/build 재실행은 하지 않았고, 코드·의존성 diff가 없음을 확인해 위 검증을 재사용했다. 브라우저 UI 감사는 별도 감사자의 소유라 이 작업에서 브라우저를 실행하지 않았다.

## 보존한 감사 evidence와 제외 항목

후보에는 `baseline-contract.md`, `evidence/README.md`, `live-aggregate.json`, `replay-fixture.json`, `scenario-matrix.md`, `replay-completion.md`와 해당 비식별 fixture, screenshot manifest 및 필요한 mobile PNG를 명시적으로 선별했다. `completion_replay_mock.py`는 저장 fixture를 local replay하는 감사용 mock이어서 포함했다. 증거에는 실제 owner-authenticated GET 관측, synthetic mock shape/default와 plan preview, screenshot 시점, 미검증/미완료 경계를 각각 유지했다. 로컬 통합 과정에서 수집 API GET이나 mutation을 실행하지 않았다.

UUID 형식 ID는 안정적인 `anon-*` 별칭으로 치환했고 URL/제목/문맥/본문 등은 evidence README의 범위대로 제거·대체했다. 후보의 collect-workspace Markdown/JSON/Python evidence에서 UUID 형태 문자열은 `0`건이다. 원본 `read_live.py`, `make_replay_fixture.py`, raw logs, 누적 집계 중 불필요 자료, `__pycache__`는 포함하지 않았다.

화면 확인 결과 계정명이 보이는 desktop 캡처는 보존하지 않았다. 기준의 8 PNG 중 계정명이 노출된 desktop 4장은 후보에서 빼고, 식별자가 보이지 않는 mobile 4장만 남겼다. 794 감사 desktop 3장과 e070 감사 desktop 5장도 같은 이유로 제외하고 각각의 mobile 캡처만 보존했다. 제외 내역은 manifest와 감사 문서에 적었다. 원본 audit 관측과 partial 판정은 유지했으며 제외한 PNG를 보존 화면 근거로 인용하지 않았다. 원본 worktree에 남은 미추적 e070 PNG 중 한 장은 아직 반입하지 않았다.

원본 source branch에 이미 추적되던 이전 screenshot corpus는 이번 baseline 반입과 별도이며 삭제·수정하지 않았다.

## Vercel 읽기 확인

Vercel 공식 MCP 연결 도구는 현재 사용할 수 없었다. 설치된 Vercel CLI `63.1.2`의 read-only `vercel project ls --yes`는 기존 로그인 인증이 없어 OAuth device flow를 제시했고, 인증을 진행하지 않고 중단했다. env 목록 명령은 값을 노출할 수 있어 실행하지 않았다. 토큰이나 환경변수 값은 출력·저장하지 않았다.

저장소의 `vercel.json`에서 확인 가능한 범위는 `framework=vite`, `pnpm install --frozen-lockfile`, `pnpm build`, `dist` 출력 및 SPA rewrite다. 저장소에는 `.vercel/project.json`이 없다. README는 local dev용 `VITE_API_BASE` 설정 예시만 제공한다. production Vercel project, main 연동, `VITE_API_BASE` 존재/target, 현재 production revision은 미검증이다. `vercel.json`은 프로젝트 연결이나 env target의 증거가 아니다.

## UI 감사 중간 상태 snapshot

원본 `a028be2` UI 감사 재개 결과는 **부분**이다. completion fixture에서 21 missions, 200 sources, 20 jobs 및 8개 빈 job item page 등 실제/synthetic 경계를 기록했다. 가능 조치 filter keyboard 선택은 선택값 변경을 확인하지 못해 미통과로 남아 있고, 감사자의 미추적 mobile 상세 screenshot이 원본 worktree에 있다. 현재 profile 확인 기록은 `회사 코덱스 ai2`이며 이메일은 비식별 처리했다. 이 감사가 R1–R10 제품 승인이나 게시 승인을 뜻하지 않는다.

아직 하지 않은 단계:

- 당시 미완료: UI 감사자의 키보드 필터/질문 확인. 이후 `ui-integration-verification-20261107.md`의 좁은 후보 UI 결과와 `ui-independent-audit.md`의 8c0a286 native select 후속을 이양받아 아래 최종 UI 기록으로 갱신했다. 키보드 입력 자체는 여전히 미검증이다.
- 하지 않음: Vercel production project/main 연동 및 `VITE_API_BASE` target readback. CLI 인증을 사용할 수 없어서 미검증이다.
- 이 snapshot 시점에는 main push와 production deploy를 하지 않았다. 후속 게시 여부는 이 문서 뒤의 `최종 UI 문서 반영 및 게시`와 이번 Run 전달 보고서에 기록한다.

UI 감사 완료 후 동일 후보를 다시 확인할 첫 명령:

```sh
git -C /Users/winterholic/development/projects/winterholic-ttakkari/front-collect-workspace-20261107 status --short -- docs/collect-workspace/ui-independent-audit.md docs/collect-workspace/evidence/screenshots/manifest.md docs/collect-workspace/evidence/screenshots/ui-e070bc0-*.png
```

감사자가 확정한 증거/문서 변경만 검토해 이 후보에 반영하고, 후보 SHA·diff·검증을 다시 확인한다. UI 감사 및 Vercel readback을 마친 뒤 게시를 이어갈 경우 main 배포를 시작하는 정확한 명령은 다음이다. **이번 작업에서는 실행하지 않았다.**

```sh
git -C /Users/winterholic/development/projects/winterholic-ttakkari/front-collect-release-candidate-20261107 push origin release/collect-workspace-20261107:main
```

## 2026-11-07 후속 읽기 확인 — GitHub/Vercel 연결 metadata

### Run profile gate

현재 Run을 owner Run API로 먼저 조회했다. 민감한 Run 식별자는 기록하지 않고 allowlist 필드만 출력했다.

```text
ttk get /api/runs/<current-run-id> | python3 -c '... status, profile만 출력 ...'
{"status": "running", "profile": "회사 코덱스 ai2 (이메일 비식별)"}
```

profile은 요청된 회사 Codex ai2여서 metadata 확인을 계속했다. 계정 토글은 하지 않았다.

### origin/main의 배포 연결

현재 fetch 기준 origin/main은 `a86544548c006c41bb4a9a49ab0cd0ab8a09713e`; 격리 후보는 `1fa18fd9ebc42caa4e90c4a03125883e264bb03e`다. 후보는 main을 포함하고 `origin/main...candidate = 0 26`, merge-base는 `a86544548c006c41bb4a9a49ab0cd0ab8a09713e`다. 충돌 해결 제품 범위는 위 통합 표와 같으며 후보는 collector 5개 파일(Missions, CSS, missionProjects, 그 test, CollectPage test)을 main과 통합했다. 그 외 Artcraft, notifications/push, weather 변경은 origin/main에서 온 항목이다. 후보 제품·의존성은 앞서 검증한 `6d9fc8a` 이후 변경되지 않았다.

저장소 `winterholic/winterholic-ttakkari-front`에서 현재 main commit metadata를 읽었다. CLI 인증 부재와 달리 GitHub API는 `winterholic` 계정별 읽기 인증으로 조회했다. API 출력은 필요한 metadata만 남기고 URL은 host만 출력했다.

```text
GET /repos/winterholic/winterholic-ttakkari-front/commits/a86544548c006c41bb4a9a49ab0cd0ab8a09713e/check-runs
{"total_count":0,"checks":[]}

GET /repos/winterholic/winterholic-ttakkari-front/commits/a86544548c006c41bb4a9a49ab0cd0ab8a09713e/status
{"state":"success","statuses":[{"context":"Vercel","state":"success","created_at":"2026-11-06T17:09:26Z","target_host":"vercel.com"}]}

GET /repos/winterholic/winterholic-ttakkari-front/deployments?sha=a86544548c006c41bb4a9a49ab0cd0ab8a09713e
[{"id":7606079686,"environment":"Production","ref":"a86544548c006c41bb4a9a49ab0cd0ab8a09713e","creator":"vercel[bot]","created_at":"2026-11-06T17:09:26Z"}]

GET /repos/winterholic/winterholic-ttakkari-front/deployments/7606079686/statuses
[{"environment":"Production","state":"success","created_at":"2026-11-06T17:09:27Z","environment_host":"ttakkari-q28uuif3p-winterholics-projects.vercel.app"}]
```

따라서 main의 `a865445`가 Vercel `Production` deployment metadata에 연결되고 해당 배포 상태가 success인 것은 확인했다. GitHub check-runs endpoint는 0건이며 commit status context `Vercel`은 success다. 이 metadata는 연결과 배포 상태를 입증하지만, Vercel 프로젝트 내부 setting을 조회한 것은 아니다. 후보 `1fa18fd`는 push되지 않아 후보 자체의 GitHub deployment/check 결과는 아직 없다.

### `VITE_API_BASE`

`VITE_API_BASE`의 Vercel production 존재/target은 **미검증**으로 유지한다. 현재 도구 중 Vercel 환경변수 이름/target을 비밀 값 없이 읽는 지원 경로가 없다. 앞서 인증 부재가 확인된 Vercel CLI를 반복하지 않았고, local README 예시나 `vercel.json`으로 production env를 추정하지 않았다. 값은 읽거나 출력하지 않았다.

### 게시 후 확인 명령과 결과 경로

키보드 후속 감사가 완료되고 게시가 승인된 뒤 실행할 main 게시 명령은 이전 절과 같다. push 후 아래 GitHub API 경로에서 후보 commit의 `Vercel` commit status와 `Production` deployment를 조회할 수 있다. SHA는 현재 release branch tip에서 가져오며, `GH_TOKEN` 변수에는 값을 출력하지 않는다.

```sh
candidate_sha="$(git -C /Users/winterholic/development/projects/winterholic-ttakkari/front-collect-release-candidate-20261107 rev-parse release/collect-workspace-20261107)"
GH_TOKEN="$(gh auth token --hostname github.com --user winterholic)" gh api "repos/winterholic/winterholic-ttakkari-front/commits/${candidate_sha}/status" --jq '{state,statuses:[.statuses[]|{context,state,created_at}]}'
GH_TOKEN="$(gh auth token --hostname github.com --user winterholic)" gh api "repos/winterholic/winterholic-ttakkari-front/deployments?sha=${candidate_sha}&per_page=20" --jq '[.[]|select(.environment=="Production")|{id,sha,ref,environment,created_at}]'
```

Production 배포 ID가 반환되면 결과 상세는 `GET /repos/winterholic/winterholic-ttakkari-front/deployments/{id}/statuses`에서 `environment`, `state`, `created_at`, `environment_url` host만 출력해 읽는다. 배포는 확인하지 않은 채로 성공으로 간주하지 않는다. 이 후속에서도 main push나 production deploy를 실행하지 않았다.


## 최종 UI 문서 반영 및 게시 준비 — 2026-11-07

기획에서 최종 UI 좁은 검증을 수신했다. `ui-integration-verification-20261107.md`에 7번 질문 원문 `지금 무엇을 해야 하는가?`와 경로·가능 조치·표본 한계를 기록하고, 큐/50 loaded/468 audit sample의 구분은 보충 질문으로 분리했다. 최초 변경 전 기준은 원본 `e2d89e6` baseline 8장이고, `e070bc0` 화면은 중간 스냅샷임을 명시했다. UI-01 단위 표시 개선은 고정 `794d0e9`에서 두 viewport로 확인한 과거 결과로 연결했으며 이번 Run에서는 재검증하지 않았다.

원본 `8c0a286` native select 감사도 비식별 상태로 반영했다. Tab으로 select focus를 확인한 뒤 `ArrowDown`/`Enter`가 값을 바꾸지 않았고 browser tool fallback은 `reprocess`로 46/50을 보였지만, 이를 native keyboard 통과로 쓰지 않았다. 실제 `topic_key` 그룹 연결, 완료 후 부족 실표본, 실제 dedupe 관계 ID와 운영 쓰기는 미검증/미실행이다. 확인된 신규 제품 결함은 없다.

비공개 보충 ZIP `collect-workspace-baseline-comparison-20261107.zip`에는 최초 `e2d89e6` 기준 8 PNG와 저장소 screenshot 34 PNG, 출처 manifest 2종이 있다. 계정명이 있는 desktop PNG는 이 사용자 전달물에만 포함했으며 공개 후보에는 추가하지 않았다. 통합 후보 10 PNG ZIP은 이미 공유된 `collect-workspace-integration-evidence.zip` 링크를 참조하고 이 Run에서 읽거나 복사하지 않았다.

이 단계에서는 문서 변경만 stage하며, 제품/의존성은 기존 `86 tests`와 build 결과 이후 변경하지 않았다. UI 감사 결과 수신으로 기존 push 보류 사유가 해소되어 최신 `origin/main` 확인 후 일반 fast-forward push를 진행한다. VITE_API_BASE 존재/target은 미검증으로 남기고 설정 변경 없이 게시한다.
