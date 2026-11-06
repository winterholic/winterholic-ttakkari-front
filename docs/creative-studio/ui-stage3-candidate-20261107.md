# Creative Studio Stage3 UI candidate (2026-11-07)

## 범위와 출처

- 기준 source/HEAD: `front-creative-production-20261107`, `31de7817313636331f9e414cb5400a2afa5baeb4`.
- 시작 시 기존 Creative UI WIP 6개 추적 파일(`src/App.tsx`, `src/api/creativeV2.ts`, `CreativePlanPage.tsx`, 해당 테스트, CSS, `vite.config.ts`)과 `docs/creative-studio/`의 기존 evidence/compatibility 문서를 확인하고 보존했다. 저장소/상위 작업 위치에서 `AGENTS.md`는 발견되지 않았다.
- **Stage3 구현 Run 출처 정정:** 구현 Run은 `c98013e2-738c-45a1-b7cf-d7a383b7eaf4`이며 실제 profile은 `회사 코덱스 ai2 (ai2@hyperez.io)`다. 이전 기록은 runs 목록이 오래된 순서로 반환됐는데 첫 항목 `257a80aa-4399-4a99-a12d-02233088fd52`를 현재 Run으로 읽은 순서 오류다. `257a80aa`는 과거 실행이며 Stage3 구현 Run이 아니다.
- 이 출처 정정과 원격 통합을 기록한 별도 integration Run은 `c9be07d1-d0a8-419c-a130-ccfb20131a53`이다. 이 Run은 구현 Run `c98013e2-738c-45a1-b7cf-d7a383b7eaf4`와 구분한다.
- 읽기 전용 backend source: `docs/creative-studio/core-stage3-20261107.md` §5, `src/ttakkari/creative/v2/storyboard.py`, `storyboard_runs.py`, `src/ttakkari/api/creative_v2.py`의 `/storyboard/runs` route들.
- 직전 UI 근거는 [`ui-integration-evidence-20261107.md`](ui-integration-evidence-20261107.md), 최소 API/Stage2 호환 근거는 [`ui-core-compatibility-20261107.md`](ui-core-compatibility-20261107.md). 기존 Stage2 caption repair → `applied_needs_approval` → 별도 승인 → 원래 `caption_mode` dispatch/render, revision/result/SHA 링크의 제약은 이번 변경에서 완화하지 않았다.

## 변경한 기본 경로

- `/creative`와 `/creative/plan`의 첫 제작 동작을 `POST /api/creative/v2/storyboard/runs` (`engine: "codex"`)로 연결했다. 기존 `/plans` 직접 구조화 생성은 `구조화 계획 입력 (보조 경로)` 안에 남겼다.
- payload는 서버 schema에 맞춰 `brief`, `sources`, `engine`만 보낸다. 기본 source는 locator가 `사용자 요청`인 brief 원문이다. 고급 펼침에서 사용자가 직접 적은 source 본문/locator만 추가하며 자동 검색은 하지 않는다. `model`은 생략한다. duration, aspect, attachment, quality objective는 request에 넣지 않았다.
- start의 `Idempotency-Key`는 같은 편집 내용의 네트워크/응답 재시도 동안 재사용한다. 입력이 바뀌면 새 key를 발급한다. resume도 별도 key를 만들어 해당 재시도에 유지한다.
- queued/running 상태를 1.5초 간격으로 읽고, `completed_needs_review`, `invalid_output`, failed/cancelled/interrupted를 서버 phase/status에서 구분한다. 취소는 서버에 요청하고 서버가 반환한 결과를 다시 읽는다. terminal 상태에서는 같은 storyboard context로 resume한다.
- 검토 화면은 서버 sources와 quote/application, summary, 장면, 초 단위 길이, 선택 전략·근거, shot action/layers/capabilities, 대안을 표시한다. source 본문을 전문가 검색 결과라고 부르지 않는다.
- 사용자가 출력 SHA 및 구성 검토를 체크하면 현재 `output_sha256`만 accept body의 `reviewed_output_sha256`로 전달한다. stale 409/422는 확인 체크를 해제하고 최신 결과를 다시 읽는다. accept 성공 후 미승인 plan 상세로 이동하며 이 경로에서 approve/dispatch/render는 호출하지 않는다.
- 신규 storyboard materialize 계획은 backend 고정 계약대로 16:9이고 모델 장면 길이 합만 표시한다. 원하는 길이를 보장한다고 하지 않는다. 상세의 렌더 안내는 v1 slideshow 단정 대신 서버가 현재 반환한 production engine/asset-generation engine을 보여준다.

## 검증 및 실패 교정

- TDD 첫 RED: 새 flow 테스트를 먼저 추가했고 첫 실행은 `Failed to resolve import "./StoryboardCreateFlow"`로 실패했다. 컴포넌트/API를 추가한 뒤 관련 테스트 묶음은 통과했다.
- 최종 관련 회귀: `pnpm exec vitest --run src/pages/creative/StoryboardCreateFlow.test.tsx src/pages/creative/CreativePlanPage.test.tsx src/pages/CreativePage.test.tsx --reporter=dot` → `Test Files 3 passed (3); Tests 39 passed (39)`. 기본 경로, 지원 request와 header, SHA accept, approve/render 미호출, stale SHA 재확인, 404/503 입력 보존, cancel/resume/invalid output, 기존 구조화 보조 경로 및 Stage2 page 동작을 포함한다.
- 타입: `pnpm exec tsc --noEmit` → exit 0, 진단 없음.
- 빌드: `pnpm build` → 최종 Vite build 완료(`✓ built in 325ms`, PWA 95 entries 생성). 기존 대형 bundle 경고(최대 index 857.77 kB 및 PDF worker 1,264.34 kB)는 남았다.
- diff 형식: `git diff --check` → exit 0.
- 승인된 `ttakkari_browser`는 Vite 화면의 임시 fixture entry에 연결했다. 최초 proxy 설정에서 브라우저가 `127.0.0.1:8787`을 직접 호출해 CORS preflight `ERR_FAILED`가 났다. 이는 fixture setup 실패였고 API POST가 전달되지 않았다. `VITE_API_BASE=`와 격리 fixture `127.0.0.1:8789` same-origin proxy로 다시 열어 이후 상호작용을 완료했다.
- Browser fixture 관측: start 202(queued) → GET running → GET completed_needs_review → SHA 체크 → `/accept` 200 → MemoryRouter의 미승인 plan 경로. 별도 fixture 입력에서 running → cancel 200 → cancelled → resume 202 → invalid_output과 schema error를 보였다. HTTP 404 fixture는 `이 서버에는 storyboard API가 배포되지 않았습니다 (HTTP 404)`를 표시하고 입력을 보존했다. Fixture 데이터는 실제 model/backend run이 아니다.
- fixture 캡처는 현 Run outbox에 공유했다: happy/review+accept `8a57be8f-0283-4b66-bd06-a2581456ed10`, cancel/resume/invalid `041b629e-0236-4d83-b468-9b47bf71fad1`, 404/input preservation `0d6e947b-803b-4fcd-a028-10507e31d09a`.

## 남은 범위

- 현재 deployed backend의 Stage3 API/authenticated UI 여정은 호출하지 않았다. 로컬 source의 신규 route와 404/503 fixture는 운영 배포 상태의 대체 증거가 아니다.
- 실제 모델 Run, accept된 실제 계획, approve/dispatch/render, 원격 consumer는 수행하지 않았다.
- 원격 source 소비, 첨부, 임의 품질 목표, 자연어 수정, 전체 복원, 독립 평가도 이 후보의 완료가 아니다.
- Stage2 QA fixture 계측/전체 화면 재계측은 반복하지 않았다. 기존 handoff evidence를 유지하고, 변경 페이지 테스트와 기존 Stage2 관련 테스트를 함께 실행했다.

## 최종 source fingerprint

`shasum -a 256`을 후보 고정 전 실행했다. 아래 파일은 후보 커밋의 추적 대상 코드이며, 이 문서 자체와 기존 Stage2 evidence 문서의 hash는 self-reference를 피하려고 생략했다.

| 파일 | SHA-256 |
|---|---|
| `src/App.tsx` | `3edb2d43b349b18b12769108b99f1a0776ce628bc3ce1b0ae43cc5dc1b360d51` |
| `src/api/creativeV2.ts` | `8ce76eb7aeb40d93482dc760b05c67ec848b90135a10b63d7b77203698b37c52` |
| `src/pages/creative/CreativePlanPage.tsx` | `9f90ee7a9745af45e7d8912d4ac63427e9145e4902d1945b21550a841458e781` |
| `src/pages/creative/CreativePlanPage.test.tsx` | `e080f95770a50813f680d92bb15b5b3b5700108f63e27182a19d204442a5d5c9` |
| `src/pages/creative/StoryboardCreateFlow.tsx` | `f4bb3cb7777515143715c0b3dd642f22bdef0e6dbcdf7f1ca136e1347025e701` |
| `src/pages/creative/StoryboardCreateFlow.test.tsx` | `fde74acaa7d7b8f56442e8c31fa0240beb410189185028fd816d6fd70e2daefd` |
| `src/pages/creative/creativePlan.css` | `a5e3b1264d2cd996a0a382a9550e86529baebe48351ff49bea043eb5d816aa76` |
| `vite.config.ts` | `9bfcf190e827c128907f3a1d712e0d4278151606370e089b48251dddb29dcde4` |

## 통합 회귀 보정 기록

- 현재 Run `309d0682-7b69-424b-bd26-35b596fdbe9d`의 profile은 `회사 코덱스 ai2 (ai2@hyperez.io)`다. 실제 작업 경로는 `/private/tmp/front-creative-integrate-ff45e98-c49233c2`, 시작 브랜치는 `feat/creative-text-sources-quality-20261107`, 시작 후보 full SHA는 `dd8f17adee48a66a69977dd0a59cef914f08c5e9`다. 시작 후보의 부모는 `a3b2b51ee88e1c37a0a44f60e8eac3cfdf8ed71d`; 후속 커밋 부모는 시작 후보 SHA다. 두 원 커밋은 수정하지 않았다.
- 변경 경로는 `src/pages/creative/CreativePlanPage.late-review.test.tsx`와 이 문서다. 제품 source는 바꾸지 않았다.
- 기존 단독 회귀는 `node_modules/.bin/vitest run src/pages/creative/CreativePlanPage.late-review.test.tsx`에서 실패했다. 기대 placeholder `/주제, 분위기/`가 실제 문구 `주제, 전달할 내용, 분위기와 원하는 장면을 자유롭게 적어 주세요.`와 맞지 않았다. 화면 경로를 확인하니 기본 입력은 `StoryboardCreateFlow`, 보조 구조화 계획 입력은 `CreativePlanNewPage`의 접힌 `<details>`였다. 이 후보에는 예전 `/intent/validate` 수동 의도 편집 UI가 없어 placeholder만 고치면 테스트가 다른 입력을 사용할 수 있었다.
- 테스트는 기본 `.storyboard-create` 영역으로 scope해 텍스트 입력과 품질 목표를 검사하고, 지연 storyboard start 응답 뒤에도 두 초안과 미확정 상태가 유지되는지 확인한다. 결과: `node_modules/.bin/vitest run src/pages/creative/CreativePlanPage.late-review.test.tsx` → 1 file / 1 test passed. `node_modules/.bin/vitest run src/pages/creative` → 6 files / 76 tests passed.
- 범위 한계: 이 보정은 현재 UI의 지연 storyboard start를 검증한다. 과거 intent validation 요청과 그에 대한 편집 경합은 현 후보에 해당 UI가 없어 이 후보에서 직접 재검증하지 않았다.
- 상속 증거: Run `8f449b4e`에서 기존 13검사 통과, `tsc --noEmit` exit 0, 환경 변수 off build exit 0을 기록했다. 이번 변경에는 제품 source가 없으므로 타입·build를 재실행하지 않았다.
- 브라우저 파일 선택은 미검증이다. 설정된 브라우저에 파일 업로드 도구가 없다는 기존 관측을 보존했고 로컬 브라우저를 실행하지 않았다. 모바일도 미검증이다. 남은 미디어 입력은 이미지·영상·음악·PDF이며 현재 UI의 파일 입력은 `.txt`/`.md` 텍스트 문서만 읽는다.

## 후속 후보 허용 한도 제출 회귀

- 현재 Run은 `0e3ad6c8-bd68-4d74-a48b-e16d23983fa2`, profile은 `회사 코덱스 ai2 (ai2@hyperez.io)`다. 시작 후보는 `a102d12205f8c46853bb4e93a9855da4b8bf85d2`였고 작업 트리는 clean이었다.
- `StoryboardCreateFlow.test.tsx`에 성공 제출 payload 경계 검사를 추가했다. 품질 목표 없이 정확히 6,000자인 brief가 1회 POST되어 brief와 `brief` source 양쪽에 동일한 6,000자 내용으로 전달되는지 확인한다.
- 12,000자 source 본문은 두 입력 경로를 각각 검사한다. 선택한 `.txt` 문서 경로는 브라우저에서 읽은 텍스트가 문서 locator 아래 요청 source에 전부 전달되는지 확인한다. 추가 출처 본문 경로는 직접 입력한 본문이 해당 locator의 요청 source에 전부 전달되는지 확인한다. 두 검사는 각 경로의 ASCII 12,000자 fixture만 보장하며, 다른 파일 형식이나 서버 저장·소비까지 증명하지 않는다.
- 사용자의 brief source 1개와 선택 문서 9개를 제출해 POST 1회 및 요청 source 정확히 10개, 각 locator와 본문 보존을 확인한다. 기존 한도 테스트는 6,001자 brief와 목표 결합 초과, 12,001자 파일, 출처 위치 501자 및 brief 1개 + 추가 source 1개 + 문서 9개(총 11 source) 입력의 차단을 유지한다.
- 검증: `node_modules/.bin/vitest run src/pages/creative/StoryboardCreateFlow.test.tsx` → 1 file / 15 tests passed. `node_modules/.bin/vitest run src/pages/creative` → 6 files / 79 tests passed. 기존 타입·build는 제품 source가 변경되지 않아 재실행하지 않았다.
- 이 검사는 UI 컴포넌트의 mock fetch 경계까지 확인한다. 운영 서버 schema 검증, 모델 호출·실제 제작, 브라우저 UI, 모바일, 품질 결과는 미검증이다.

## 후속 Run 재이관 기록

- 총괄의 source 대조와 현재 Run `2a95f0bd-d441-4e13-8816-1d10ce5e0a01` 상세에서 같은 회사 Codex ai2 profile을 확인했다. 시작 HEAD는 `ae0e32dc5e833d869eb1df58d50f7f74448bf8ef`이며, 새 후속 커밋의 부모다. 작업 경로와 feat 브랜치는 위와 같다.
- `CreativePlanNewPage` (`CreativePlanPage.tsx:1029–1110`)는 `StoryboardCreateFlow`와 보조 `planCreate`만 렌더한다. 제품 화면 검색에서 `직접 의도 작성`, `근거 문구`, `의도 검증 후 확인`은 발견되지 않아 과거 intent validation UI 경로가 제거된 것을 확인했다. 이를 되살리거나 해당 문구에 대한 의미 없는 assertion을 유지하지 않았다.
- 이전 보정의 지연 start 검사는 `freezes the brief, quality goal and file selector while the request is starting` (`StoryboardCreateFlow.test.tsx:138`)의 기존 계약과 중복되므로 제거했다. 이 13검사 중 요청 동결 계약은 그대로 두고 수정하지 않았다.
- 대응하는 도달 가능한 계약 두 개를 `StoryboardCreateFlow.late-review.test.tsx`로 이관했다. 지연 파일 읽기 후 제거된 문서가 최신 brief 제출에 되살아나지 않는지, 완료 결과가 사용자 확인 전에는 미승인인지 함께 검사한다. stale accept/409 뒤 새 SHA가 오면 이전 확인을 해제하고 새 확인 전 accept를 비활성화하는 회귀도 이 파일로 옮겨 강화했다.
- 검증: `node_modules/.bin/vitest run src/pages/creative/StoryboardCreateFlow.late-review.test.tsx` → 1 file / 2 tests passed. `node_modules/.bin/vitest run src/pages/creative` → 6 files / 75 tests passed. `git diff --check` → exit 0. 제품 source 변경 없음; 타입/build는 Run `8f449b4e`의 source 동일 증거를 재사용한다.
- 이 재이관은 과거 `/intent/validate` 경합을 같은 API 계약으로 검증한 것은 아니다. 대신 현 제품에서 도달 가능한 최신 입력 보존과 미승인/재검토 계약으로 옮겼다. 과거 intent validation UI 전용 경합은 현재 제품에 없어 별도 미충족 계약으로 남긴다.

## 원격 통합·배포 후속 (2026-11-07)

- 현재 통합 Run `3d808fe3-0baa-44f9-a547-b4e622bcb540`은 `ttk get /api/runs/3d808fe3-0baa-44f9-a547-b4e622bcb540`에서 profile `회사 코덱스 ai2 (ai2@hyperez.io)`로 확인했다. 시작 HEAD는 `6b2f1f372b98e161e9c909ad9f738b3554ad0053`, 부모는 `a102d12205f8c46853bb4e93a9855da4b8bf85d2`, 시작 트리는 clean이었다.
- `github_accounts` 결과는 `winterholic` active/success, `daeseon-dev` inactive/success다. 토글은 바꾸지 않았으며 fetch/push는 `winterholic` per-command credential만 사용한다.
- `git fetch origin main:refs/remotes/origin/main` 결과 `origin/main=a3b2b51ee88e1c37a0a44f60e8eac3cfdf8ed71d`. `git merge-base origin/main HEAD`도 같은 SHA이고 `git rev-list --left-right --count origin/main...HEAD`는 `0 4`; 따라서 후보는 원격 main의 fast-forward 후보다. 공통 조상 이후 `origin/main` 경로 delta는 0개다. 신규 원격 기능 delta가 없어 격리 재검증 분기에는 해당하지 않는다.
- 후보는 `origin/main` 대비 4개 커밋 앞서며 4개 경로를 추가/변경한다: 이 후보 문서, `src/pages/creative/StoryboardCreateFlow.tsx`, `src/pages/creative/StoryboardCreateFlow.test.tsx`, `src/pages/creative/StoryboardCreateFlow.late-review.test.tsx` (이전 late-review 테스트 경로 1개는 제거). 79검사에는 구현79 run의 전체 Creative 79 passed가 포함되고, 독립 75검사 및 별도 허용 경계4검사는 lead handoff의 실제 이벤트 대조 기록을 재사용한다.
- source 지문 표의 `StoryboardCreateFlow.tsx=f4bb…`는 최초 구현 SHA `048f20d205e6086b4d713b9fa893b46c2830bcf8`의 역사적 지문이다. 후속 feature commit `dd8f17adee48a66a69977dd0a59cef914f08c5e9`부터 현재 후보까지 실제 파일 SHA-256은 `5ce098cb24a03a2bc83afee4397a5c009ad5dae03953c7b01e5116f01f653e15`로 동일하다. 현재 구현79 전체검사 이후 제품 소스, `package.json`, `pnpm-lock.yaml`은 변경되지 않았다. 타입/build는 후속 Run `8f449b4e`에 기록된 동일 source 근거를 재사용하며 이번에는 중복 실행하지 않는다.
- 배포 전 증거: `git merge-base --is-ancestor origin/main HEAD` exit 0; `git status --short --branch`는 `## feat/creative-text-sources-quality-20261107`만 출력; `git diff --check` exit 0. 이 시점 push는 아직 실행하지 않았다.
- 최종 통합 커밋은 `950d1207e33a4bdcdb8d37d724162a12f52c19b0` (부모 `6b2f1f372b98e161e9c909ad9f738b3554ad0053`)이며, 일반 `git push origin HEAD:main`은 `a3b2b51..950d120` fast-forward로 성공했다. 직후 fetch에서 `origin/main` full SHA가 `950d1207e33a4bdcdb8d37d724162a12f52c19b0`로 확인됐고, 작업 트리는 clean이었다.
- 전체 SHA `950d1207e33a4bdcdb8d37d724162a12f52c19b0`의 GitHub commit status는 최초 `Vercel/pending` (`Vercel is deploying your app`) 뒤 `Vercel/success` (`Deployment has completed`)로 바뀌었다. Vercel 상태 링크의 deployment 식별자는 `6WNYYJH8rdfgVEVZqXPjhjsCeaf8`; 이는 해당 커밋의 표준 배포 완료를 확인한다.
- 공개 `ttakkari.winterholic.net/creative`가 이 deployment ID/SHA를 가리키는지는 직접 검증하지 않았다. 이 Run에서는 브라우저 인증과 실제 제작을 수행하지 않았다. 기존 handoff의 공개 경로 `200 → 제품 로그인`은 이전 관측이며 이 후보 SHA의 도메인 연결이나 로그인 뒤 제작 성공을 입증하지 않는다.
- deployment 상태를 기록하기 위해 이 문서에 후속 보고 전용 커밋을 추가한다. 그러므로 제품 통합 SHA 및 deployment 판정은 위에 고정한 `950d120…` 기준이며, 보고 커밋의 원격 SHA와 작업 트리 상태는 별도로 최종 확인한다.
